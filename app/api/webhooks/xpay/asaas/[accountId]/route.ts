import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

import { createSupabaseAdmin } from "@/lib/server/supabase-admin";

type WebhookPayload = { id?: string; event?: string; payment?: Record<string, unknown> };

export async function POST(request: Request, context: { params: Promise<{ accountId: string }> }) {
  const expected = process.env.XPAY_ASAAS_WEBHOOK_TOKEN ?? "";
  const received = request.headers.get("asaas-access-token") ?? "";
  if (!isSameToken(expected, received)) return NextResponse.json({ success: false }, { status: 401 });

  try {
    const { accountId } = await context.params;
    const payload = (await request.json()) as WebhookPayload;
    if (!payload.id || !payload.event) return NextResponse.json({ success: false }, { status: 400 });

    const admin = createSupabaseAdmin();
    const { data: account, error: accountError } = await admin.from("xpace_payment_accounts").select("id").eq("id", accountId).maybeSingle();
    if (accountError) throw accountError;
    if (!account) return NextResponse.json({ success: false }, { status: 404 });

    const { error } = await admin.from("xpace_payment_webhook_events").upsert({ payment_account_id: account.id, provider_event_id: payload.id, event_name: payload.event, payload }, { onConflict: "payment_account_id,provider_event_id", ignoreDuplicates: true });
    if (error) throw error;
    await syncChargeFromPayment(admin, payload);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("XPAY ASAAS WEBHOOK ERROR", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

async function syncChargeFromPayment(admin: ReturnType<typeof createSupabaseAdmin>, payload: WebhookPayload) {
  const payment = payload.payment ?? {};
  const paymentId = typeof payment.id === "string" ? payment.id : "";
  if (!paymentId) return;
  const providerStatus = typeof payment.status === "string" ? payment.status : payload.event ?? "";
  const received = ["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"].includes(payload.event ?? "") || ["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"].includes(providerStatus);
  const value = Number(payment.value ?? payment.netValue ?? 0);
  const now = new Date().toISOString();
  const { data: charge, error } = await admin.from("xpace_contract_charges").update({ provider_status: providerStatus, status: received ? "RECEBIDO" : "ABERTO", paid_amount_cents: received && Number.isFinite(value) ? Math.round(value * 100) : 0, paid_at: received ? now : null, sent_at: now, provider_error: null, updated_at: now }).eq("provider_payment_id", paymentId).select("tenant_company_id,contract_id").maybeSingle();
  if (error) throw error;
  if (!received || !charge) return;
  const { data: overdueCharges, error: overdueError } = await admin.from("xpace_contract_charges").select("id").eq("tenant_company_id", charge.tenant_company_id).eq("contract_id", charge.contract_id).eq("status", "ABERTO").lte("due_on", addDays(todayIso(), -4)).limit(1);
  if (overdueError) throw overdueError;
  if (overdueCharges?.length) return;
  const { data: contract, error: contractError } = await admin.from("xpace_student_contracts").select("payment_access_blocked").eq("tenant_company_id", charge.tenant_company_id).eq("id", charge.contract_id).maybeSingle();
  if (contractError) throw contractError;
  if (!contract?.payment_access_blocked) return;
  const { error: unblockError } = await admin.from("xpace_student_contracts").update({ payment_access_blocked: false, payment_access_blocked_at: null, updated_at: now }).eq("tenant_company_id", charge.tenant_company_id).eq("id", charge.contract_id);
  if (unblockError) throw unblockError;
  const { error: eventError } = await admin.from("xpace_contract_events").insert({ tenant_company_id: charge.tenant_company_id, contract_id: charge.contract_id, event_type: "ACESSO_LIBERADO_PAGAMENTO", note: "ACESSO LIBERADO AUTOMATICAMENTE APÓS A CONFIRMAÇÃO DO PAGAMENTO.", created_by: null });
  if (eventError) throw eventError;
}

function isSameToken(expected: string, received: string) {
  if (!expected || expected.length !== received.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}
function todayIso() { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()); }
function addDays(value: string, days: number) { const date = new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }

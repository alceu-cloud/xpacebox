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
  const { error } = await admin.from("xpace_contract_charges").update({ provider_status: providerStatus, status: received ? "RECEBIDO" : "ABERTO", paid_amount_cents: received && Number.isFinite(value) ? Math.round(value * 100) : 0, paid_at: received ? new Date().toISOString() : null, sent_at: new Date().toISOString(), provider_error: null, updated_at: new Date().toISOString() }).eq("provider_payment_id", paymentId);
  if (error) throw error;
}

function isSameToken(expected: string, received: string) {
  if (!expected || expected.length !== received.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

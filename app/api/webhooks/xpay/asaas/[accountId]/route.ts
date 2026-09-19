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
    const { error: syncError } = await admin.rpc("xpace_sync_payment", { p_account: account.id, p_payment: payload.payment ?? {}, p_event: payload.event });
    if (syncError) throw syncError;
    const { error: processedError } = await admin.from("xpace_payment_webhook_events").update({ processed_at: new Date().toISOString() }).eq("payment_account_id", account.id).eq("provider_event_id", payload.id);
    if (processedError) throw processedError;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("XPAY ASAAS WEBHOOK ERROR", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

function isSameToken(expected: string, received: string) {
  if (!expected || expected.length !== received.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}
function todayIso() { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()); }
function addDays(value: string, days: number) { const date = new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }

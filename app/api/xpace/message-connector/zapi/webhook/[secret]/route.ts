import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/server/supabase-admin";
import { parseZapiEvent } from "@/lib/server/zapi-client";
import { recipientHash } from "@/lib/server/xpace-zapi";

export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ secret: string }> }) {
  const reply = (status: number, success: boolean) => NextResponse.json({ success }, { status, headers: { "Cache-Control": "no-store" } });
  const { secret } = await context.params;
  if (!/^[A-Za-z0-9_-]{43}$/.test(secret)) return reply(401, false);
  const admin = createSupabaseAdmin();
  const { data: connection, error } = await admin.from("xpace_zapi_connections").select("connector_id,instance_id").eq("webhook_secret_hash", createHash("sha256").update(secret).digest("hex")).maybeSingle();
  if (error) return reply(503, false);
  if (!connection) return reply(401, false);
  // Bounded parsing; do not retain raw payload (phone or chat content).
  const raw = await request.text();
  if (raw.length > 65_536) return reply(413, false);
  let payload: Record<string, unknown>;
  try { payload = JSON.parse(raw); } catch { return reply(400, false); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return reply(400, false);
  const event = parseZapiEvent(payload, connection.instance_id);
  if (!event) return reply(200, true);
  const { error: storeError } = await admin.from("xpace_zapi_events").upsert(event.ids.map(id => ({ connector_id: connection.connector_id, provider_id: id, recipient_hash: recipientHash(event.phone), state: event.state, occurred_at: event.occurredAt, error_code: event.errorCode })), { onConflict: "connector_id,provider_id,state,occurred_at", ignoreDuplicates: true });
  if (storeError) return reply(503, false);
  // Events can precede the HTTP send response. Persist them first, then reconcile again after RESULT/cron.
  const { error: applyError } = await admin.rpc("xpace_reconcile_zapi_events", { p_connector: connection.connector_id });
  return reply(applyError ? 503 : 200, !applyError);
}

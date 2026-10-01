import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/server/supabase-admin";
import { checkCloudConnection, cloudCredentials, dispatchCloudQueue, reconcileCloudEvents, type CloudConnection } from "@/lib/server/xpace-zapi";
import { createZapiClient } from "@/lib/server/zapi-client";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  const actual = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const allowed = Boolean(expected && Buffer.byteLength(actual) === Buffer.byteLength(expected) && timingSafeEqual(Buffer.from(actual), Buffer.from(expected)));
  const admin = createSupabaseAdmin();
  if (!allowed) {
    if (!/^[A-Za-z0-9_-]{40,100}$/.test(actual)) return NextResponse.json({ success: false }, { status: 401 });
    const { data: authorized, error: authError } = await admin.rpc("xpace_authorize_zapi_scheduler", { p_secret: actual });
    if (authError || authorized !== true) return NextResponse.json({ success: false }, { status: 401 });
  }
  const { data, error } = await admin.from("xpace_zapi_connections").select("*").order("last_checked_at", { ascending: true, nullsFirst: true }).limit(1);
  if (error) {
    await admin.rpc("xpace_record_zapi_scheduler_tick", { p_success: false });
    return NextResponse.json({ success: false, code: "ZAPI_CONFIGURATION_LOOKUP_FAILED" }, { status: 503 });
  }
  const states: object[] = [];
  let success = true;
  // One message per connector per tick: bounded runtime, durable queue, no browser or school PC required.
  for (const connection of (data ?? []).slice(0, 1) as CloudConnection[]) {
    try {
      await reconcileCloudEvents(admin, connection);
      if (!connection.enabled || connection.paused) {
        const connected = await checkCloudConnection(admin, connection);
        // Diagnose preparation without claiming, sending, modifying provider settings or exposing secrets.
        const credentials = cloudCredentials(connection);
        const receipts = connected ? await createZapiClient(credentials).receiptConfiguration(credentials.webhookSecret) : null;
        states.push({ paused: true, connected, receipts });
      } else states.push(await dispatchCloudQueue(admin, connection));
    }
    catch { success = false; states.push({ code: "ZAPI_DISPATCH_UNCONFIRMED_NO_RETRY" }); }
  }
  const { error: tickError } = await admin.rpc("xpace_record_zapi_scheduler_tick", { p_success: success });
  return NextResponse.json({ success: success && !tickError, states }, { status: success && !tickError ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}

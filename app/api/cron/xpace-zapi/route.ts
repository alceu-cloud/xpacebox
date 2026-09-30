import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/server/supabase-admin";
import { dispatchCloudQueue, type CloudConnection } from "@/lib/server/xpace-zapi";

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
  const { data, error } = await admin.from("xpace_zapi_connections").select("*").eq("enabled", true);
  if (error) return NextResponse.json({ success: false, code: "ZAPI_CONFIGURATION_LOOKUP_FAILED" }, { status: 503 });
  const states: object[] = [];
  // One message per connector per tick: bounded runtime, durable queue, no browser or school PC required.
  for (const connection of (data ?? []).slice(0, 1) as CloudConnection[]) {
    try { states.push(await dispatchCloudQueue(admin, connection)); }
    catch { states.push({ code: "ZAPI_DISPATCH_UNCONFIRMED_NO_RETRY" }); }
  }
  return NextResponse.json({ success: true, states }, { headers: { "Cache-Control": "no-store" } });
}

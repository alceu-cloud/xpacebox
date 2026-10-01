import { NextResponse } from "next/server";

import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  try {
    const access = await requireCompanyAccess(request, "xpace");
    const { data: connector, error } = await access.admin
      .from("xpace_message_connectors")
      .select("status,last_seen_at")
      .eq("tenant_company_id", access.company.id)
      .maybeSingle();
    if (error) throw error;

    const { data: cloud, error: cloudError } = await access.admin.from("xpace_zapi_connections")
      .select("enabled,paused,connected,last_checked_at").eq("tenant_company_id", access.company.id).maybeSingle();
    if (cloudError) throw cloudError;
    if (cloud) {
      const { data: schedulerReady, error: schedulerError } = cloud.enabled ? await access.admin.rpc("xpace_zapi_scheduler_ready") : { data: false, error: null };
      if (schedulerError) throw schedulerError;
      const fresh = Boolean(cloud.last_checked_at && Date.now() - Date.parse(cloud.last_checked_at) < 180_000);
      const status = !cloud.enabled ? "PREPARING" : cloud.paused ? "PAUSED" : !fresh || !cloud.connected ? "OFFLINE" : schedulerReady !== true ? "SCHEDULER_ERROR" : "CONNECTED";
      return NextResponse.json({ success: true, configured: true, provider: "ZAPI", status, lastSeenAt: cloud.last_checked_at }, { headers: noStore });
    }

    const lastSeen = connector?.last_seen_at ? Date.parse(connector.last_seen_at) : NaN;
    const heartbeatFresh = Number.isFinite(lastSeen) && Date.now() - lastSeen < 60_000;
    return NextResponse.json({
      success: true,
      configured: Boolean(connector),
      status: !connector ? "NOT_CONFIGURED" : heartbeatFresh ? connector.status : "OFFLINE",
      lastSeenAt: connector?.last_seen_at ?? null,
    }, { headers: noStore });
  } catch (error) {
    if (error instanceof AccessError) return NextResponse.json({ success: false, message: error.message }, { status: error.status, headers: noStore });
    console.error("XPACE_CONNECTOR_STATUS_FAILED");
    return NextResponse.json({ success: false, message: "NÃO FOI POSSÍVEL VERIFICAR O CONECTOR." }, { status: 500, headers: noStore });
  }
}

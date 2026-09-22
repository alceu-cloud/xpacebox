import { NextResponse } from "next/server";

import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";
import { endpointHash, pushConfiguration, validApplePushEndpoint } from "@/lib/server/xpace-web-push";

export const runtime = "nodejs";

type SubscriptionBody = { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
const keyPattern = /^[A-Za-z0-9_-]+$/;

export async function GET(request: Request) {
  try {
    await requireCompanyAccess(request, "xpace");
    const config = pushConfiguration();
    if (!config) return NextResponse.json({ success: true, enabled: false });
    return NextResponse.json({ success: true, enabled: true, publicKey: config.publicKey });
  } catch (error) { return handleError(error); }
}

export async function POST(request: Request) {
  try {
    const access = await requireCompanyAccess(request, "xpace");
    if (!pushConfiguration()) return NextResponse.json({ success: false, message: "Notificações ainda não estão configuradas." }, { status: 503 });
    const body = await request.json() as SubscriptionBody;
    const endpoint = body.endpoint;
    const p256dh = body.keys?.p256dh;
    const auth = body.keys?.auth;
    if (!validApplePushEndpoint(endpoint) || typeof p256dh !== "string" || p256dh.length < 40 || p256dh.length > 200 || !keyPattern.test(p256dh) || typeof auth !== "string" || auth.length < 16 || auth.length > 100 || !keyPattern.test(auth)) {
      return NextResponse.json({ success: false, message: "Inscrição de notificações inválida para este iPhone." }, { status: 400 });
    }
    const stamp = new Date().toISOString();
    const { error } = await access.admin.from("xpace_web_push_subscriptions").upsert({
      tenant_company_id: access.company.id, profile_id: access.profile.id,
      endpoint_hash: endpointHash(endpoint), endpoint, p256dh, auth_secret: auth, updated_at: stamp,
    }, { onConflict: "endpoint_hash" });
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) { return handleError(error); }
}

export async function DELETE(request: Request) {
  try {
    const access = await requireCompanyAccess(request, "xpace");
    const body = await request.json() as { endpoint?: unknown };
    if (typeof body.endpoint !== "string" || body.endpoint.length > 2048) return NextResponse.json({ success: false, message: "Inscrição inválida." }, { status: 400 });
    const { error } = await access.admin.from("xpace_web_push_subscriptions").delete().eq("tenant_company_id", access.company.id).eq("profile_id", access.profile.id).eq("endpoint_hash", endpointHash(body.endpoint));
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) { return handleError(error); }
}

function handleError(error: unknown) {
  if (error instanceof AccessError) return NextResponse.json({ success: false, message: error.message }, { status: error.status });
  console.error("XPACE WEB PUSH SUBSCRIPTION ERROR", error);
  return NextResponse.json({ success: false, message: "Não foi possível configurar as notificações." }, { status: 500 });
}

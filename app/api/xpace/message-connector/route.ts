import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";

const companySlug = "xpace";
const noStore = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  try {
    const access = await requireCompanyAccess(request, companySlug);
    requireManager(access.profile.platform_role);
    const { data: connector, error } = await access.admin.from("xpace_message_connectors").select("id,status,phone,qr_data_url,qr_updated_at,last_seen_at,last_error,disconnect_requested,created_at").eq("tenant_company_id", access.company.id).maybeSingle();
    if (error) throw error;
    const { data: messages, error: messagesError } = await access.admin.from("xpace_message_outbox").select("id,kind,contact_name,destination_phone,status,error_message,created_at,scheduled_at,sent_at").eq("tenant_company_id", access.company.id).order("created_at", { ascending: false }).limit(100);
    if (messagesError) throw messagesError;
    const online = Boolean(connector?.last_seen_at && Date.now() - Date.parse(connector.last_seen_at) < 60_000);
    const qrFresh = Boolean(online && connector?.qr_updated_at && Date.now() - Date.parse(connector.qr_updated_at) < 60_000);
    const recent = (messages ?? []).filter((item) => Date.now() - Date.parse(item.created_at) < 7 * 86_400_000);
    const failures = recent.filter((item) => ["FAILED", "UNKNOWN"].includes(item.status)).length;
    const oldQueue = recent.filter((item) => item.status === "QUEUED" && Date.now() - Date.parse(item.scheduled_at) > 86_400_000).length;
    const score = connector ? Math.max(0, 100 - (online && connector.status === "CONNECTED" ? 0 : 25) - failures * 15 - oldQueue * 5) : null;
    return NextResponse.json({ success: true, connector: connector ? { configured: true, status: online ? connector.status : "OFFLINE", phone: connector.phone ?? "", qrDataUrl: qrFresh ? connector.qr_data_url ?? "" : "", lastSeenAt: connector.last_seen_at, lastError: connector.last_error ?? "", disconnectRequested: connector.disconnect_requested } : { configured: false, status: "NOT_CONFIGURED", phone: "", qrDataUrl: "", lastSeenAt: null, lastError: "", disconnectRequested: false }, messages: messages ?? [], score, scoreDetails: { failures, oldQueue, windowDays: 7 } }, { headers: noStore });
  } catch (error) { return handleError(error); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { action?: string; messageId?: string };
    const access = await requireCompanyAccess(request, companySlug);
    requireManager(access.profile.platform_role);
    if (body.action === "GENERATE_TOKEN") {
      const token = randomBytes(32).toString("base64url");
      const tokenHash = createHash("sha256").update(token).digest("hex");
      const now = new Date().toISOString();
      const { data: current, error: lookupError } = await access.admin.from("xpace_message_connectors").select("id").eq("tenant_company_id", access.company.id).maybeSingle();
      if (lookupError) throw lookupError;
      if (current) {
        const { error } = await access.admin.from("xpace_message_connectors").update({ token_hash: tokenHash, status: "OFFLINE", phone: null, qr_data_url: null, qr_updated_at: null, last_seen_at: null, last_error: null, disconnect_requested: false, updated_at: now }).eq("id", current.id).eq("tenant_company_id", access.company.id);
        if (error) throw error;
      } else {
        const { error } = await access.admin.from("xpace_message_connectors").insert({ tenant_company_id: access.company.id, token_hash: tokenHash, created_by: access.user.id });
        if (error) throw error;
      }
      return NextResponse.json({ success: true, token }, { headers: noStore });
    }
    if (body.action === "DISCONNECT") {
      const { error } = await access.admin.from("xpace_message_connectors").update({ disconnect_requested: true, updated_at: new Date().toISOString() }).eq("tenant_company_id", access.company.id);
      if (error) throw error;
      return NextResponse.json({ success: true }, { headers: noStore });
    }
    if (body.action === "CANCEL_MESSAGE" && body.messageId) {
      const { data, error } = await access.admin.from("xpace_message_outbox").update({ status: "CANCELLED", updated_at: new Date().toISOString() }).eq("id", body.messageId).eq("tenant_company_id", access.company.id).eq("status", "QUEUED").select("id").maybeSingle();
      if (error) throw error;
      if (!data) return failure("APENAS MENSAGENS AINDA NA FILA PODEM SER CANCELADAS.", 409);
      return NextResponse.json({ success: true }, { headers: noStore });
    }
    return failure("AÇÃO INVÁLIDA.", 400);
  } catch (error) { return handleError(error); }
}

function requireManager(role: string) {
  if (role !== "platform_owner" && role !== "company_manager") throw new AccessError("APENAS GESTORES PODEM GERENCIAR O CONECTOR.", 403);
}
function failure(message: string, status: number) { return NextResponse.json({ success: false, message }, { status, headers: noStore }); }
function handleError(error: unknown) {
  if (error instanceof AccessError) return failure(error.message, error.status);
  console.error("XPACE MESSAGE CONNECTOR ERROR", error);
  return failure("NÃO FOI POSSÍVEL CARREGAR O CONECTOR DE MENSAGENS.", 500);
}

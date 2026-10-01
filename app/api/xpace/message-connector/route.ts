import { NextResponse } from "next/server";

import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";
import { trialInstructorContexts } from "@/lib/server/xpace-trial-instructors";

const companySlug = "xpace";
const noStore = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  try {
    const access = await requireCompanyAccess(request, companySlug);
    requireManager(access.profile.platform_role);
    const params = new URL(request.url).searchParams;
    const search = (params.get("search") ?? "").trim().slice(0, 100);
    const status = params.get("status") ?? "TODOS";
    const page = Number(params.get("page") ?? "0");
    const scope = params.get("scope") ?? "LEADS";
    if (!["LEADS", "NOTIFICATIONS"].includes(scope)) return failure("ABA INVÁLIDA.", 400);
    if (!["TODOS", "QUEUED", "SENDING", "SENT", "FAILED", "UNKNOWN", "CANCELLED"].includes(status) || !Number.isSafeInteger(page) || page < 0 || page > 100000) return failure("FILTRO INVÁLIDO.", 400);
    const { data: control, error: controlError } = await access.admin.rpc("xpace_message_control_scoped_page", { p_tenant: access.company.id, p_search: search, p_status: status, p_page: page, p_scope: scope });
    if (controlError) throw controlError;
    const { data: connector, error } = await access.admin.from("xpace_message_connectors").select("id,phone,last_seen_at,status").eq("tenant_company_id", access.company.id).maybeSingle();
    if (error) throw error;
    const { data: messages, error: messagesError } = control.messageIds.length ? await access.admin.from("xpace_message_outbox").select("id,kind,body,lead_id,appointment_id,appointment_scheduled_on,appointment_starts_at,contact_name,destination_phone,status,error_message,created_at,scheduled_at,sent_at,delivered_at,read_at,manually_confirmed_at,manual_confirmation_note").eq("tenant_company_id", access.company.id).neq("kind", "TESTE").in("id", control.messageIds).order("created_at", { ascending: false }) : { data: [], error: null };
    if (messagesError) throw messagesError;
    const appointmentIds = [...new Set((messages ?? []).flatMap((item) => item.appointment_id ? [item.appointment_id] : []))];
    const instructors = await trialInstructorContexts(access.admin, access.company.id, appointmentIds);
    const leadIds = [...new Set((messages ?? []).map((item) => item.lead_id).filter((id): id is string => Boolean(id)))];
    const leadContacts = new Map<string, { name: string; phone: string }>();
    if (leadIds.length) {
      const { data: leads, error: leadsError } = await access.admin.from("xpace_leads").select("id,full_name,mobile")
        .eq("tenant_company_id", access.company.id).in("id", leadIds);
      if (leadsError) throw leadsError;
      for (const lead of leads ?? []) leadContacts.set(lead.id, { name: lead.full_name, phone: lead.mobile ?? "" });
    }
    const { data: cloud, error: cloudError } = await access.admin.from("xpace_zapi_connections").select("enabled,paused,connected,last_checked_at,last_error").eq("tenant_company_id", access.company.id).maybeSingle();
    if (cloudError) throw cloudError;
    const { data: schedulerReady, error: schedulerError } = cloud?.enabled ? await access.admin.rpc("xpace_zapi_scheduler_ready") : { data: false, error: null };
    if (schedulerError) throw schedulerError;
    const online = cloud?.enabled ? Boolean(cloud.last_checked_at && Date.now() - Date.parse(cloud.last_checked_at) < 180_000 && cloud.connected) : Boolean(connector?.last_seen_at && Date.now() - Date.parse(connector.last_seen_at) < 60_000);
    const { failures, oldQueue } = control.summary;
    const healthy = cloud?.enabled ? online && schedulerReady === true && !cloud.paused : online && connector?.status === "CONNECTED";
    const score = connector ? Math.max(0, 100 - (healthy ? 0 : 25) - failures * 15 - oldQueue * 5) : null;
    return NextResponse.json({ success: true, connector: cloud ? { configured: true, provider: "ZAPI", paused: cloud.paused, status: !cloud.enabled ? "PREPARING" : cloud.paused ? "PAUSED" : !online ? "OFFLINE" : schedulerReady !== true ? "SCHEDULER_ERROR" : "CONNECTED", phone: connector?.phone ?? "", qrDataUrl: "", lastSeenAt: cloud.last_checked_at, lastError: cloud.last_error ?? "", disconnectRequested: false } : { configured: false, status: "NOT_CONFIGURED", phone: "", qrDataUrl: "", lastSeenAt: null, lastError: "", disconnectRequested: false }, messages: (messages ?? []).map((item) => ({ ...item, student_name: item.lead_id ? leadContacts.get(item.lead_id)?.name ?? "" : "", student_phone: item.lead_id ? leadContacts.get(item.lead_id)?.phone ?? "" : "", instructor_name: item.appointment_id ? instructors.get(item.appointment_id)?.name ?? "" : "", instructor_phone: item.appointment_id ? instructors.get(item.appointment_id)?.phone ?? "" : "", instructor_missing_reason: item.appointment_id ? instructors.get(item.appointment_id)?.missingReason ?? "" : "" })), pagination: { page: control.page, pageSize: 5, total: control.total }, summary: control.summary, schedulerReady: schedulerReady === true, score, scoreDetails: { failures, oldQueue, windowDays: 7 } }, { headers: noStore });
  } catch (error) { return handleError(error); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { action?: string; messageId?: string };
    const access = await requireCompanyAccess(request, companySlug);
    requireManager(access.profile.platform_role);
    if (["GENERATE_TOKEN", "DISCONNECT"].includes(body.action ?? "")) {
      return failure("O CONECTOR LOCAL FOI DESCONTINUADO. USE A CONFIGURAÇÃO Z-API.", 410);
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

import { NextResponse } from "next/server";

import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";

const postponementPrefix = "AGENDA_ADIADA:";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { slug?: string; clientId?: string; activityId?: string };
    const slug = body.slug?.trim() ?? "";
    const clientId = body.clientId?.trim() ?? "";
    const activityId = body.activityId?.trim() ?? "";
    if (!slug || !clientId) return failure("CLIENTE NAO INFORMADO.", 400);

    const { admin, company, profile: currentProfile, user } = await requireCompanyAccess(request, slug);
    const { data: profile, error: profileError } = await admin
      .from("crm_customer_profiles")
      .select("next_contact_at,owner_profile_id")
      .eq("tenant_company_id", company.id)
      .eq("client_id", clientId)
      .maybeSingle();
    if (profileError) throw profileError;

    const agendaQuery = admin
      .from("crm_activities")
      .select("id,opportunity_id,representative_profile_id,next_action_type,next_action_at")
      .eq("tenant_company_id", company.id)
      .eq("client_id", clientId)
      .not("next_action_at", "is", null);
    const { data: agenda, error: agendaError } = activityId
      ? await agendaQuery.eq("id", activityId).maybeSingle()
      : await agendaQuery.eq("next_action_at", profile?.next_contact_at || "").order("occurred_at", { ascending: false }).limit(1).maybeSingle();
    if (agendaError) throw agendaError;
    if (!agenda) return failure("A AGENDA DESTE CLIENTE NAO FOI ENCONTRADA.", 404);
    if (agenda.representative_profile_id && agenda.representative_profile_id !== currentProfile.id) {
      return failure("ESTA AGENDA PERTENCE A OUTRO REPRESENTANTE.", 403);
    }
    const currentActionAt = agenda.next_action_at || "";
    if (!currentActionAt) return failure("NAO HA UMA AGENDA EM ABERTO PARA ADIAR.", 400);
    if (currentActionAt.slice(0, 10) >= saoPauloDate()) return failure("ESTA AGENDA NAO ESTA ATRASADA.", 400);
    if (activityId && !sameInstant(profile?.next_contact_at || "", currentActionAt)) {
      return failure("ESTA AGENDA JA FOI SUBSTITUIDA POR UMA ACAO MAIS RECENTE.", 409);
    }

    const postponementSubject = `${postponementPrefix}${agenda.id}`;
    const { count, error: countError } = await admin
      .from("crm_activities")
      .select("id", { count: "exact", head: true })
      .eq("tenant_company_id", company.id)
      .eq("client_id", clientId)
      .eq("subject", postponementSubject);
    if (countError) throw countError;
    if (Number(count || 0) >= 3) {
      return failure("ESTE CLIENTE JA FOI ADIADO 3 VEZES NESTA AGENDA. ATENDA O CONTATO ANTES DE ADIAR NOVAMENTE.", 409);
    }

    const nextActionAt = nextBusinessMorning();
    const now = new Date().toISOString();
    const { error: updateAgendaError } = await admin
      .from("crm_activities")
      .update({ next_action_at: nextActionAt, next_action_type: agenda.next_action_type || "FOLLOW_UP" })
      .eq("id", agenda.id)
      .eq("tenant_company_id", company.id);
    if (updateAgendaError) throw updateAgendaError;

    if (sameInstant(profile?.next_contact_at || "", currentActionAt)) {
      const { error: updateProfileError } = await admin
        .from("crm_customer_profiles")
        .update({ next_contact_at: nextActionAt, updated_at: now })
        .eq("tenant_company_id", company.id)
        .eq("client_id", clientId);
      if (updateProfileError) throw updateProfileError;
    }

    const { error: historyError } = await admin.from("crm_activities").insert({
      tenant_company_id: company.id,
      client_id: clientId,
      opportunity_id: agenda.opportunity_id || null,
      representative_profile_id: agenda.representative_profile_id || profile?.owner_profile_id || user.id,
      activity_type: "NOTE",
      outcome: "FOLLOW_UP",
      subject: postponementSubject,
      notes: `AGENDA ADIADA DE ${displayDate(currentActionAt)} PARA ${displayDate(nextActionAt)}. ADIAMENTO ${Number(count || 0) + 1} DE 3.`,
      occurred_at: now,
      next_action_type: null,
      next_action_at: null,
      created_by: user.id,
    });
    if (historyError) throw historyError;

    return NextResponse.json({ success: true, nextActionAt, postponementCount: Number(count || 0) + 1 });
  } catch (error) {
    return handleError(error);
  }
}

function saoPauloDate() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function nextBusinessMorning() {
  const [year, month, day] = saoPauloDate().split("-").map(Number);
  const cursor = new Date(Date.UTC(year, month - 1, day + 1, 12));
  while (cursor.getUTCDay() === 0 || cursor.getUTCDay() === 6) cursor.setUTCDate(cursor.getUTCDate() + 1);
  return cursor.toISOString();
}

function displayDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function sameInstant(first: string, second: string) {
  return Boolean(first && second) && new Date(first).getTime() === new Date(second).getTime();
}

function failure(message: string, status: number) { return NextResponse.json({ success: false, message }, { status }); }
function handleError(error: unknown) {
  if (error instanceof AccessError) return failure(error.message, error.status);
  console.error("CRM AGENDA POSTPONE ERROR", error);
  return failure("NAO FOI POSSIVEL ADIAR A AGENDA.", 500);
}

import { NextResponse } from "next/server";

import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";

const postponementPrefix = "AGENDA_ADIADA:";

export async function GET(request: Request) {
  try {
    const slug = new URL(request.url).searchParams.get("slug")?.trim() ?? "";
    if (!slug) return failure("EMPRESA NAO INFORMADA.", 400);

    const { admin, company, profile } = await requireCompanyAccess(request, slug);
    const { data: agenda, error: agendaError } = await admin
      .from("crm_activities")
      .select("id,client_id,opportunity_id,next_action_type,next_action_at")
      .eq("tenant_company_id", company.id)
      .eq("representative_profile_id", profile.id)
      .not("next_action_at", "is", null)
      .lt("next_action_at", startOfSaoPauloDay())
      .order("next_action_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (agendaError) throw agendaError;

    if (!agenda) return NextResponse.json({ success: true, lock: null });

    const postponementSubject = `${postponementPrefix}${agenda.id}`;
    const [{ count: postponementCount, error: postponementError }, { data: client, error: clientError }, { data: opportunity, error: opportunityError }] = await Promise.all([
      admin
        .from("crm_activities")
        .select("id", { count: "exact", head: true })
        .eq("tenant_company_id", company.id)
        .eq("client_id", agenda.client_id)
        .eq("subject", postponementSubject),
      admin
        .from("clients")
        .select("legal_name,trade_name")
        .eq("tenant_company_id", company.id)
        .eq("id", agenda.client_id)
        .maybeSingle(),
      agenda.opportunity_id
        ? admin
            .from("crm_opportunities")
            .select("title")
            .eq("tenant_company_id", company.id)
            .eq("id", agenda.opportunity_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (postponementError) throw postponementError;
    if (clientError) throw clientError;
    if (opportunityError) throw opportunityError;

    const count = Number(postponementCount || 0);
    return NextResponse.json({
      success: true,
      lock: {
        activityId: agenda.id,
        clientId: agenda.client_id,
        clientName: client?.trade_name || client?.legal_name || "CLIENTE",
        representativeProfileId: profile.id,
        opportunityId: agenda.opportunity_id || "",
        opportunityTitle: opportunity?.title || "",
        nextActionType: agenda.next_action_type || "",
        nextActionAt: agenda.next_action_at,
        postponementCount: count,
        canPostpone: count < 3,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}

function startOfSaoPauloDay() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T00:00:00.000-03:00`;
}

function failure(message: string, status: number) {
  return NextResponse.json({ success: false, message }, { status });
}

function handleError(error: unknown) {
  if (error instanceof AccessError) return failure(error.message, error.status);
  console.error("CRM OPERATIONAL LOCK ERROR", error);
  return failure("NAO FOI POSSIVEL VERIFICAR AS PENDENCIAS DA AGENDA.", 500);
}

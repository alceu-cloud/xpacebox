import { NextResponse } from "next/server";

import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";

const postponementPrefix = "AGENDA_ADIADA:";

export async function GET(request: Request) {
  try {
    const slug = new URL(request.url).searchParams.get("slug")?.trim() ?? "";
    if (!slug) return failure("EMPRESA NAO INFORMADA.", 400);

    const { admin, company, profile } = await requireCompanyAccess(request, slug);
    // The profile is the source of truth for the client's current agenda.
    // Older activity rows are CRM history and must never lock the user again.
    const { data: customerProfile, error: profileError } = await admin
      .from("crm_customer_profiles")
      .select("client_id,next_contact_at")
      .eq("tenant_company_id", company.id)
      .eq("owner_profile_id", profile.id)
      .not("next_contact_at", "is", null)
      .lt("next_contact_at", startOfSaoPauloDay())
      .order("next_contact_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (profileError) throw profileError;

    if (!customerProfile?.next_contact_at) return NextResponse.json({ success: true, lock: null });

    const { data: agenda, error: agendaError } = await admin
      .from("crm_activities")
      .select("id,client_id,opportunity_id,next_action_type,next_action_at")
      .eq("tenant_company_id", company.id)
      .eq("client_id", customerProfile.client_id)
      .eq("representative_profile_id", profile.id)
      .eq("next_action_at", customerProfile.next_contact_at)
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (agendaError) throw agendaError;

    // A stale profile without a matching activity is not actionable. Do not trap
    // the user in a gate that cannot be resolved from the CRM screen.
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

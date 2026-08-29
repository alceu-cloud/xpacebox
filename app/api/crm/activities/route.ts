import { NextResponse } from "next/server";

import { AccessError, requireCompanyAccess, requireCompanyProfile } from "@/lib/server/company-access";
import type { CrmActivityInput } from "@/types/crm";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { slug?: string; activity?: CrmActivityInput };
    const slug = body.slug?.trim() ?? "";
    const input = body.activity;
    if (!slug || !input?.clientId || !input.activityType || !input.outcome) return failure("PREENCHA OS DADOS DO CONTATO.", 400);

    const { admin, company, user } = await requireCompanyAccess(request, slug);
    const { data: client } = await admin.from("clients").select("id").eq("id", input.clientId).eq("tenant_company_id", company.id).eq("active", true).maybeSingle();
    if (!client) return failure("CLIENTE NAO ENCONTRADO.", 404);

    const representativeId = input.representativeProfileId || user.id;
    const representative = await requireCompanyProfile(admin, company.id, representativeId);
    const occurredAt = input.occurredAt || new Date().toISOString();
    const nextActionAt = input.nextActionAt || null;
    const { data: activeOpportunities, error: activeOpportunitiesError } = await admin
      .from("crm_opportunities")
      .select("id")
      .eq("tenant_company_id", company.id)
      .eq("client_id", input.clientId)
      .not("stage", "in", "(WON,LOST)");
    if (activeOpportunitiesError) throw activeOpportunitiesError;
    const opportunityId = activeOpportunities?.length === 1 ? activeOpportunities[0].id : null;

    const { error: clearDirectAgendaError } = await admin
      .from("crm_activities")
      .update({ next_action_type: null, next_action_at: null })
      .eq("tenant_company_id", company.id)
      .eq("client_id", input.clientId)
      .is("opportunity_id", null)
      .not("next_action_at", "is", null);
    if (clearDirectAgendaError) throw clearDirectAgendaError;
    if (opportunityId) {
      const { error: clearOpportunityAgendaError } = await admin
        .from("crm_activities")
        .update({ next_action_type: null, next_action_at: null })
        .eq("tenant_company_id", company.id)
        .eq("opportunity_id", opportunityId)
        .not("next_action_at", "is", null);
      if (clearOpportunityAgendaError) throw clearOpportunityAgendaError;
    }

    const { data, error } = await admin.from("crm_activities").insert({
      tenant_company_id: company.id,
      client_id: input.clientId,
      opportunity_id: opportunityId,
      representative_profile_id: representativeId,
      activity_type: input.activityType,
      outcome: input.outcome,
      subject: upper(input.subject) || null,
      notes: upper(input.notes) || null,
      occurred_at: occurredAt,
      next_action_type: input.nextActionType || null,
      next_action_at: nextActionAt,
      created_by: user.id,
    }).select("*").single();
    if (error) throw error;

    const { error: profileError } = await admin.from("crm_customer_profiles").upsert({
      tenant_company_id: company.id,
      client_id: input.clientId,
      owner_profile_id: representativeId,
      next_contact_at: nextActionAt,
      created_by: user.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: "tenant_company_id,client_id" });
    if (profileError) throw profileError;

    return NextResponse.json({
      success: true,
      activity: {
        id: data.id,
        clientId: data.client_id,
        opportunityId: data.opportunity_id || "",
        representativeProfileId: representativeId,
        representativeName: representative.full_name || representative.email || "USUARIO",
        activityType: data.activity_type,
        outcome: data.outcome,
        subject: data.subject || "",
        notes: data.notes || "",
        occurredAt: data.occurred_at,
        nextActionType: data.next_action_type || "",
        nextActionAt: data.next_action_at || "",
      },
    }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}

function upper(value: string) { return (value || "").trim().toLocaleUpperCase("pt-BR"); }
function failure(message: string, status: number) { return NextResponse.json({ success: false, message }, { status }); }
function handleError(error: unknown) {
  if (error instanceof AccessError) return failure(error.message, error.status);
  console.error("CRM ACTIVITY ERROR", error);
  return failure("NAO FOI POSSIVEL REGISTRAR O CONTATO.", 500);
}

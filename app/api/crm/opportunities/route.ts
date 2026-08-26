import { NextResponse } from "next/server";

import { AccessError, requireCompanyAccess, requireCompanyProfile } from "@/lib/server/company-access";
import type { CrmOpportunityInput } from "@/types/crm";

export async function POST(request: Request) { return save(request, false); }
export async function PATCH(request: Request) { return save(request, true); }

async function save(request: Request, editing: boolean) {
  try {
    const body = (await request.json()) as { slug?: string; opportunity?: CrmOpportunityInput };
    const slug = body.slug?.trim() ?? "";
    const input = body.opportunity;
    if (!slug || !input?.title || (editing && !input.id)) return failure("PREENCHA OS DADOS DA OPORTUNIDADE.", 400);

    const { admin, company, user } = await requireCompanyAccess(request, slug);
    if (!input.clientId && !editing) return failure("SELECIONE UM CLIENTE PARA CRIAR A OPORTUNIDADE.", 400);
    if (input.clientId) {
      const { data: client } = await admin
        .from("clients")
        .select("id")
        .eq("id", input.clientId)
        .eq("tenant_company_id", company.id)
        .eq("active", true)
        .maybeSingle();
      if (!client) return failure("CLIENTE NAO ENCONTRADO.", 404);
    }

    const representativeId = input.representativeProfileId || user.id;
    await requireCompanyProfile(admin, company.id, representativeId);
    let previousStage = "";
    if (editing) {
      const { data: currentOpportunity, error: currentOpportunityError } = await admin
        .from("crm_opportunities")
        .select("stage")
        .eq("id", input.id)
        .eq("tenant_company_id", company.id)
        .single();
      if (currentOpportunityError) throw currentOpportunityError;
      previousStage = currentOpportunity.stage || "";
    }

    const base = {
      client_id: input.clientId || null,
      representative_profile_id: representativeId,
      title: upper(input.title),
      stage: input.stage,
      estimated_value: Math.max(0, Number(input.estimatedValue || 0)),
      expected_close_date: input.expectedCloseDate || null,
      notes: upper(input.notes) || null,
      lost_reason: input.stage === "LOST" ? upper(input.lostReason) || null : null,
      updated_at: new Date().toISOString(),
    };

    const query = editing
      ? admin.from("crm_opportunities").update(base).eq("id", input.id).eq("tenant_company_id", company.id)
      : admin.from("crm_opportunities").insert({ ...base, tenant_company_id: company.id, created_by: user.id });
    const { data, error } = await query.select("*").single();
    if (error) throw error;

    let cycleScheduled = false;
    let previousCycleCancelled = false;
    if (!editing && input.clientId) {
      previousCycleCancelled = await activateOpportunityCycle({
        admin,
        companyId: company.id,
        clientId: input.clientId,
        opportunityTitle: base.title,
        representativeId,
        userId: user.id,
      });
    }
    if (editing && input.clientId && isClosedStage(input.stage) && !isClosedStage(previousStage)) {
      cycleScheduled = await scheduleNextCommercialCycle({
        admin,
        companyId: company.id,
        clientId: input.clientId,
        opportunityTitle: base.title,
        representativeId,
        stage: input.stage,
        userId: user.id,
      });
    }

    return NextResponse.json(
      { success: true, opportunity: data, cycleScheduled, previousCycleCancelled },
      { status: editing ? 200 : 201 }
    );
  } catch (error) {
    return handleError(error);
  }
}

async function activateOpportunityCycle({
  admin,
  companyId,
  clientId,
  opportunityTitle,
  representativeId,
  userId,
}: {
  admin: Awaited<ReturnType<typeof requireCompanyAccess>>["admin"];
  companyId: string;
  clientId: string;
  opportunityTitle: string;
  representativeId: string;
  userId: string;
}) {
  const { data: profile, error: profileError } = await admin
    .from("crm_customer_profiles")
    .select("next_purchase_at,next_contact_at")
    .eq("tenant_company_id", companyId)
    .eq("client_id", clientId)
    .maybeSingle();
  if (profileError) throw profileError;

  const hadScheduledCycle = Boolean(profile?.next_purchase_at || profile?.next_contact_at);
  const now = new Date().toISOString();
  const { error: updateProfileError } = await admin
    .from("crm_customer_profiles")
    .update({ next_purchase_at: null, next_contact_at: null, updated_at: now })
    .eq("tenant_company_id", companyId)
    .eq("client_id", clientId);
  if (updateProfileError) throw updateProfileError;

  const { error: updateActivitiesError } = await admin
    .from("crm_activities")
    .update({ next_action_type: null, next_action_at: null })
    .eq("tenant_company_id", companyId)
    .eq("client_id", clientId)
    .eq("subject", "PROXIMO CICLO COMERCIAL AGENDADO")
    .not("next_action_at", "is", null);
  if (updateActivitiesError) throw updateActivitiesError;

  if (hadScheduledCycle) {
    const { error: activityError } = await admin.from("crm_activities").insert({
      tenant_company_id: companyId,
      client_id: clientId,
      representative_profile_id: representativeId,
      activity_type: "NOTE",
      outcome: "FOLLOW_UP",
      subject: "CICLO COMERCIAL INICIADO",
      notes: `NOVA OPORTUNIDADE ABERTA: ${opportunityTitle}. O AGENDAMENTO AUTOMATICO ANTERIOR FOI ENCERRADO.`,
      occurred_at: now,
      next_action_type: null,
      next_action_at: null,
      created_by: userId,
    });
    if (activityError) throw activityError;
  }

  return hadScheduledCycle;
}

async function scheduleNextCommercialCycle({
  admin,
  companyId,
  clientId,
  opportunityTitle,
  representativeId,
  stage,
  userId,
}: {
  admin: Awaited<ReturnType<typeof requireCompanyAccess>>["admin"];
  companyId: string;
  clientId: string;
  opportunityTitle: string;
  representativeId: string;
  stage: CrmOpportunityInput["stage"];
  userId: string;
}) {
  const { data: profile, error: profileError } = await admin
    .from("crm_customer_profiles")
    .select("purchase_frequency_days")
    .eq("tenant_company_id", companyId)
    .eq("client_id", clientId)
    .maybeSingle();
  if (profileError) throw profileError;

  const frequencyDays = Number(profile?.purchase_frequency_days || 0);
  if (!Number.isFinite(frequencyDays) || frequencyDays <= 0) return false;

  const today = saoPauloDate();
  const nextCycleDate = addDays(today, Math.trunc(frequencyDays));
  const nextActionAt = `${nextCycleDate}T12:00:00.000Z`;
  const profileUpdate: Record<string, string> = {
    next_purchase_at: nextCycleDate,
    next_contact_at: nextActionAt,
    updated_at: new Date().toISOString(),
  };
  if (stage === "WON") profileUpdate.last_purchase_at = today;

  const { error: updateError } = await admin
    .from("crm_customer_profiles")
    .update(profileUpdate)
    .eq("tenant_company_id", companyId)
    .eq("client_id", clientId);
  if (updateError) throw updateError;

  const outcome = stage === "WON" ? "PURCHASE_EXPECTED" : "FOLLOW_UP";
  const resultLabel = stage === "WON" ? "GANHA" : "PERDIDA";
  const { error: activityError } = await admin.from("crm_activities").insert({
    tenant_company_id: companyId,
    client_id: clientId,
    representative_profile_id: representativeId,
    activity_type: "NOTE",
    outcome,
    subject: "PROXIMO CICLO COMERCIAL AGENDADO",
    notes: `OPORTUNIDADE ${resultLabel}: ${opportunityTitle}. NOVO CONTATO PROGRAMADO CONFORME A FREQUENCIA DE COMPRA DO CLIENTE.`,
    occurred_at: new Date().toISOString(),
    next_action_type: "FOLLOW_UP",
    next_action_at: nextActionAt,
    created_by: userId,
  });
  if (activityError) throw activityError;
  return true;
}

function isClosedStage(stage: string) {
  return stage === "WON" || stage === "LOST";
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

function addDays(dateValue: string, days: number) {
  const [year, month, day] = dateValue.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function upper(value: string) { return (value || "").trim().toLocaleUpperCase("pt-BR"); }
function failure(message: string, status: number) { return NextResponse.json({ success: false, message }, { status }); }
function handleError(error: unknown) {
  if (error instanceof AccessError) return failure(error.message, error.status);
  console.error("CRM OPPORTUNITY ERROR", error);
  return failure("NAO FOI POSSIVEL SALVAR A OPORTUNIDADE.", 500);
}

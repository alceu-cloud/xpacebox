import { NextResponse } from "next/server";

import { AccessError, requireCompanyAccess, requireCompanyProfile } from "@/lib/server/company-access";
import { saoPauloDate as currentSaoPauloDate, scheduleCommercialCycle } from "@/lib/server/commercial-cycle";
import type { ProductFicha } from "@/types/gerenciador";
import type { CrmOpportunityInput } from "@/types/crm";

const purchaseAverageAlertThreshold = 0.3;

export async function POST(request: Request) { return save(request, false); }
export async function PATCH(request: Request) { return save(request, true); }

async function save(request: Request, editing: boolean) {
  try {
    const body = (await request.json()) as { slug?: string; opportunity?: CrmOpportunityInput };
    const slug = body.slug?.trim() ?? "";
    const input = body.opportunity;
    if (!slug || !input?.title || (editing && !input.id)) return failure("PREENCHA OS DADOS DA OPORTUNIDADE.", 400);

    const { admin, company, user } = await requireCompanyAccess(request, slug);
    if (input.stage === "LOST" && !input.lostReason?.trim()) return failure("INFORME O MOTIVO DA PERDA.", 400);
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
    let previousClientId = "";
    let existingProduct: { id: string; reference: string; quantity: number; unitPrice: number; total: number } | null = null;
    let existingClosedAt = "";
    if (editing) {
      const { data: currentOpportunity, error: currentOpportunityError } = await admin
        .from("crm_opportunities")
        .select("stage,client_id,product_ficha_id,product_reference,product_quantity,product_unit_price,estimated_value,closed_at")
        .eq("id", input.id)
        .eq("tenant_company_id", company.id)
        .single();
      if (currentOpportunityError) throw currentOpportunityError;
      previousStage = currentOpportunity.stage || "";
      previousClientId = currentOpportunity.client_id || "";
      existingClosedAt = currentOpportunity.closed_at || "";
      if (currentOpportunity.product_ficha_id) {
        existingProduct = {
          id: currentOpportunity.product_ficha_id,
          reference: currentOpportunity.product_reference || "",
          quantity: Number(currentOpportunity.product_quantity || 0),
          unitPrice: Number(currentOpportunity.product_unit_price || 0),
          total: Number(currentOpportunity.estimated_value || 0),
        };
      }
    }

    const product = editing ? existingProduct : await resolveOpportunityProduct(admin, company.id, input);
    const closesNow = editing && isClosedStage(input.stage) && !isClosedStage(previousStage);
    const closedAt = input.closedAt || currentSaoPauloDate();
    const base = {
      client_id: input.clientId || null,
      representative_profile_id: representativeId,
      title: upper(input.title),
      product_ficha_id: product?.id || null,
      product_reference: product?.reference || null,
      product_quantity: product?.quantity || null,
      product_unit_price: product?.unitPrice || null,
      stage: input.stage,
      estimated_value: product?.total ?? Math.max(0, Number(input.estimatedValue || 0)),
      expected_close_date: input.expectedCloseDate || null,
      notes: upper(input.notes) || null,
      lost_reason: input.stage === "LOST" ? upper(input.lostReason) || null : null,
      closed_at: isClosedStage(input.stage) ? (closesNow ? closedAt : existingClosedAt || closedAt) : null,
      updated_at: new Date().toISOString(),
    };

    const query = editing
      ? admin.from("crm_opportunities").update(base).eq("id", input.id).eq("tenant_company_id", company.id)
      : admin.from("crm_opportunities").insert({ ...base, tenant_company_id: company.id, created_by: user.id });
    const { data, error } = await query.select("*").single();
    if (error) throw error;

    let cycleScheduled = false;
    const cycleSkippedBecauseActiveOpportunity = false;
    const previousCycleCancelled = false;
    let agendaLinked = false;
    const startsOpportunityCycle = Boolean(input.clientId && (!editing || !previousClientId) && !isClosedStage(input.stage));
    if (startsOpportunityCycle && input.clientId) {
      agendaLinked = await scheduleOpportunityAgenda({
        admin,
        companyId: company.id,
        clientId: input.clientId,
        opportunityId: data.id,
        representativeId,
        userId: user.id,
        title: base.title,
        linkedActivityId: input.linkedActivityId || "",
        nextActionType: input.nextActionType || "FOLLOW_UP",
        nextActionAt: input.nextActionAt || nextBusinessMorning(),
      });
    } else if (editing && input.clientId && input.linkedActivityId && input.reuseExistingAgenda) {
      agendaLinked = await scheduleOpportunityAgenda({
        admin,
        companyId: company.id,
        clientId: input.clientId,
        opportunityId: data.id,
        representativeId,
        userId: user.id,
        title: base.title,
        linkedActivityId: input.linkedActivityId,
        nextActionType: input.nextActionType || "FOLLOW_UP",
        nextActionAt: input.nextActionAt || nextBusinessMorning(),
      });
    } else if (editing && input.clientId && !isClosedStage(input.stage) && input.nextActionAt) {
      await scheduleOpportunityAgenda({
        admin,
        companyId: company.id,
        clientId: input.clientId,
        opportunityId: data.id,
        representativeId,
        userId: user.id,
        title: base.title,
        linkedActivityId: "",
        nextActionType: input.nextActionType || "FOLLOW_UP",
        nextActionAt: input.nextActionAt,
      });
    }
    if (editing && input.clientId && closesNow) {
      const ownsCycleAgenda = await opportunityOwnsCycleAgenda(admin, company.id, data.id);
      await clearOpportunityAgenda(admin, company.id, data.id);
      if (input.stage === "WON" || ownsCycleAgenda) {
        const cycle = await scheduleCommercialCycle({
          admin,
          companyId: company.id,
          clientId: input.clientId,
          representativeId,
          userId: user.id,
          baseDate: closedAt,
          purchaseRecorded: input.stage === "WON",
          title: base.title,
        });
        cycleScheduled = cycle.scheduled;
      }
    }

    if (!editing && input.clientId && input.stage === "WON") {
      const cycle = await scheduleCommercialCycle({
        admin,
        companyId: company.id,
        clientId: input.clientId,
        representativeId,
        userId: user.id,
        baseDate: closedAt,
        purchaseRecorded: true,
        title: base.title,
      });
      cycleScheduled = cycle.scheduled;
    }

    if (input.clientId && input.stage === "WON" && (!editing || previousStage !== "WON")) {
      await registerPurchaseAverageAlert({
        admin,
        companyId: company.id,
        clientId: input.clientId,
        opportunityId: data.id,
        representativeId,
        userId: user.id,
        opportunityTitle: base.title,
        opportunityValue: Number(data.estimated_value || 0),
      });
    }

    return NextResponse.json(
      { success: true, opportunity: data, cycleScheduled, cycleSkippedBecauseActiveOpportunity, previousCycleCancelled, agendaLinked },
      { status: editing ? 200 : 201 }
    );
  } catch (error) {
    return handleError(error);
  }
}

async function registerPurchaseAverageAlert({
  admin,
  companyId,
  clientId,
  opportunityId,
  representativeId,
  userId,
  opportunityTitle,
  opportunityValue,
}: {
  admin: Awaited<ReturnType<typeof requireCompanyAccess>>["admin"];
  companyId: string;
  clientId: string;
  opportunityId: string;
  representativeId: string;
  userId: string;
  opportunityTitle: string;
  opportunityValue: number;
}) {
  const { data: profile, error: profileError } = await admin
    .from("crm_customer_profiles")
    .select("average_purchase_value")
    .eq("tenant_company_id", companyId)
    .eq("client_id", clientId)
    .maybeSingle();
  if (profileError) throw profileError;

  const averageValue = Number(profile?.average_purchase_value || 0);
  if (averageValue <= 0) return;
  const differencePercent = Math.abs(opportunityValue - averageValue) / averageValue;
  if (differencePercent < purchaseAverageAlertThreshold) return;

  const subject = "SISTEMA: ORCAMENTO FORA DO PADRAO";
  const { data: existingAlert, error: existingAlertError } = await admin
    .from("crm_activities")
    .select("id")
    .eq("tenant_company_id", companyId)
    .eq("opportunity_id", opportunityId)
    .eq("subject", subject)
    .maybeSingle();
  if (existingAlertError) throw existingAlertError;
  if (existingAlert) return;

  const direction = opportunityValue > averageValue ? "MAIOR" : "MENOR";
  const { error: activityError } = await admin.from("crm_activities").insert({
    tenant_company_id: companyId,
    client_id: clientId,
    opportunity_id: opportunityId,
    representative_profile_id: representativeId,
    activity_type: "NOTE",
    outcome: "OTHER",
    subject,
    notes: `ORCAMENTO GANHO: ${opportunityTitle}. VALOR ${Math.round(differencePercent * 100)}% ${direction} QUE A COMPRA MEDIA DO CLIENTE. ORCAMENTO: ${formatCurrency(opportunityValue)}. COMPRA MEDIA: ${formatCurrency(averageValue)}.`,
    occurred_at: new Date().toISOString(),
    created_by: userId,
  });
  if (activityError) throw activityError;
}

async function resolveOpportunityProduct(
  admin: Awaited<ReturnType<typeof requireCompanyAccess>>["admin"],
  companyId: string,
  input: CrmOpportunityInput
) {
  if (!input.productFichaId) return null;

  const { data, error } = await admin
    .from("company_manager_settings")
    .select("data")
    .eq("tenant_company_id", companyId)
    .maybeSingle();
  if (error) throw error;

  const fichas = Array.isArray((data?.data as { productFichas?: unknown } | null)?.productFichas)
    ? (data?.data as { productFichas: ProductFicha[] }).productFichas
    : [];
  const ficha = fichas.find((item) => item.id === input.productFichaId && item.clientId === input.clientId && item.status !== "INATIVO");
  if (!ficha) throw new Error("PRODUTO NAO ENCONTRADO PARA ESTE CLIENTE.");

  const unitPrice = Number(ficha.price || 0);
  const quantity = Number(input.productQuantity || 0);
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) throw new Error("O PRODUTO SELECIONADO NAO POSSUI PRECO VALIDO.");
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("INFORME UMA QUANTIDADE VALIDA PARA O PRODUTO.");

  return {
    id: ficha.id,
    reference: productReference(ficha),
    quantity,
    unitPrice,
    total: unitPrice * quantity,
  };
}

async function scheduleOpportunityAgenda({
  admin,
  companyId,
  clientId,
  opportunityId,
  representativeId,
  userId,
  title,
  linkedActivityId,
  nextActionType,
  nextActionAt,
}: {
  admin: Awaited<ReturnType<typeof requireCompanyAccess>>["admin"];
  companyId: string;
  clientId: string;
  opportunityId: string;
  representativeId: string;
  userId: string;
  title: string;
  linkedActivityId: string;
  nextActionType: string;
  nextActionAt: string;
}) {
  const now = new Date().toISOString();
  let scheduledAt = nextActionAt;

  if (linkedActivityId) {
    const { data: activity, error: activityError } = await admin
      .from("crm_activities")
      .select("id,next_action_type,next_action_at")
      .eq("id", linkedActivityId)
      .eq("tenant_company_id", companyId)
      .eq("client_id", clientId)
      .is("opportunity_id", null)
      .eq("agenda_kind", "FOLLOW_UP")
      .maybeSingle();
    if (activityError) throw activityError;
    if (!activity?.next_action_at) throw new Error("A AGENDA SELECIONADA NAO ESTA MAIS ABERTA.");

    scheduledAt = nextActionAt || activity.next_action_at;
    const { error: clearPreviousAgendaError } = await admin
      .from("crm_activities")
      .update({ next_action_type: null, next_action_at: null })
      .eq("tenant_company_id", companyId)
      .eq("opportunity_id", opportunityId)
      .not("next_action_at", "is", null);
    if (clearPreviousAgendaError) throw clearPreviousAgendaError;
    const { error: linkError } = await admin
      .from("crm_activities")
      .update({
        opportunity_id: opportunityId,
        agenda_kind: "OPPORTUNITY",
        next_action_type: nextActionType || activity.next_action_type || "FOLLOW_UP",
        next_action_at: scheduledAt,
      })
      .eq("id", activity.id)
      .eq("tenant_company_id", companyId);
    if (linkError) throw linkError;
  } else {
    const { data: currentAgenda, error: currentAgendaError } = await admin
      .from("crm_activities")
      .select("id")
      .eq("tenant_company_id", companyId)
      .eq("opportunity_id", opportunityId)
      .not("next_action_at", "is", null)
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (currentAgendaError) throw currentAgendaError;

    if (currentAgenda) {
      const { error: updateAgendaError } = await admin
        .from("crm_activities")
        .update({ next_action_type: nextActionType, next_action_at: scheduledAt })
        .eq("id", currentAgenda.id)
        .eq("tenant_company_id", companyId);
      if (updateAgendaError) throw updateAgendaError;
    } else {
      const { error: activityError } = await admin.from("crm_activities").insert({
        tenant_company_id: companyId,
        client_id: clientId,
        opportunity_id: opportunityId,
        agenda_kind: "OPPORTUNITY",
        representative_profile_id: representativeId,
        activity_type: "NOTE",
        outcome: "FOLLOW_UP",
        subject: `ACOMPANHAMENTO DA OPORTUNIDADE: ${title}`,
        notes: "OPORTUNIDADE ABERTA NO FUNIL.",
        occurred_at: now,
        next_action_type: nextActionType,
        next_action_at: scheduledAt,
        created_by: userId,
      });
      if (activityError) throw activityError;
    }
  }

  return true;
}

async function clearOpportunityAgenda(
  admin: Awaited<ReturnType<typeof requireCompanyAccess>>["admin"],
  companyId: string,
  opportunityId: string
) {
  const { error } = await admin
    .from("crm_activities")
    .update({ next_action_type: null, next_action_at: null })
    .eq("tenant_company_id", companyId)
    .eq("opportunity_id", opportunityId)
    .not("next_action_at", "is", null);
  if (error) throw error;
}

async function opportunityOwnsCycleAgenda(
  admin: Awaited<ReturnType<typeof requireCompanyAccess>>["admin"],
  companyId: string,
  opportunityId: string
) {
  const { data, error } = await admin
    .from("crm_activities")
    .select("id")
    .eq("tenant_company_id", companyId)
    .eq("opportunity_id", opportunityId)
    .eq("agenda_kind", "CYCLE")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

function isClosedStage(stage: string) {
  return stage === "WON" || stage === "LOST";
}

function nextBusinessMorning() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const cursor = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day) + 1, 12));
  while (cursor.getUTCDay() === 0 || cursor.getUTCDay() === 6) cursor.setUTCDate(cursor.getUTCDate() + 1);
  return cursor.toISOString();
}

function productReference(product: ProductFicha) {
  return [product.ftNumber, product.reference].filter(Boolean).join(" - ") || "PRODUTO SEM REFERENCIA";
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function upper(value: string) { return (value || "").trim().toLocaleUpperCase("pt-BR"); }
function failure(message: string, status: number) { return NextResponse.json({ success: false, message }, { status }); }
function handleError(error: unknown) {
  if (error instanceof AccessError) return failure(error.message, error.status);
  console.error("CRM OPPORTUNITY ERROR", error);
  return failure("NAO FOI POSSIVEL SALVAR A OPORTUNIDADE.", 500);
}

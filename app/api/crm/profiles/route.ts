import { NextResponse } from "next/server";

import { AccessError, requireCompanyAccess, requireCompanyProfile } from "@/lib/server/company-access";
import type { CrmProfileInput } from "@/types/crm";

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as { slug?: string; profile?: CrmProfileInput };
    const slug = body.slug?.trim() ?? "";
    const input = body.profile;
    if (!slug || !input?.clientId) return failure("CLIENTE NAO INFORMADO.", 400);

    const { admin, company, user } = await requireCompanyAccess(request, slug);
    const { data: client } = await admin.from("clients").select("id").eq("id", input.clientId).eq("tenant_company_id", company.id).eq("active", true).maybeSingle();
    if (!client) return failure("CLIENTE NAO ENCONTRADO.", 404);
    if (input.ownerProfileId) await requireCompanyProfile(admin, company.id, input.ownerProfileId);
    const { data: currentProfile, error: currentProfileError } = await admin
      .from("crm_customer_profiles")
      .select("next_contact_at")
      .eq("tenant_company_id", company.id)
      .eq("client_id", input.clientId)
      .maybeSingle();
    if (currentProfileError) throw currentProfileError;
    const purchaseFrequencyDays = input.purchaseFrequencyDays && input.purchaseFrequencyDays > 0 ? Math.trunc(input.purchaseFrequencyDays) : null;
    const nextPurchaseAt = input.nextPurchaseAt || calculateNextPurchaseDate(input.lastPurchaseAt, purchaseFrequencyDays);
    const nextContactAt = input.nextContactAt || null;

    const payload = {
      tenant_company_id: company.id,
      client_id: input.clientId,
      owner_profile_id: input.ownerProfileId || null,
      purchase_frequency_days: purchaseFrequencyDays,
      average_purchase_value: Math.max(0, Number(input.averagePurchaseValue || 0)),
      last_purchase_at: input.lastPurchaseAt || null,
      next_purchase_at: nextPurchaseAt || null,
      next_contact_at: nextContactAt,
      relationship_status: input.relationshipStatus || "ACTIVE",
      whatsapp_opt_in: Boolean(input.whatsappOptIn),
      whatsapp_opt_in_at: input.whatsappOptIn ? new Date().toISOString() : null,
      whatsapp_opt_in_source: input.whatsappOptIn ? input.whatsappOptInSource || "CRM" : null,
      notes: upper(input.notes) || null,
      created_by: user.id,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await admin.from("crm_customer_profiles").upsert(payload, { onConflict: "tenant_company_id,client_id" }).select("*").single();
    if (error) throw error;
    await syncProfileAgenda({
      admin,
      companyId: company.id,
      clientId: input.clientId,
      representativeId: input.ownerProfileId || user.id,
      userId: user.id,
      previousNextContactAt: currentProfile?.next_contact_at || "",
      nextContactAt,
    });
    return NextResponse.json({ success: true, profile: data });
  } catch (error) {
    return handleError(error);
  }
}

async function syncProfileAgenda({
  admin,
  companyId,
  clientId,
  representativeId,
  userId,
  previousNextContactAt,
  nextContactAt,
}: {
  admin: Awaited<ReturnType<typeof requireCompanyAccess>>["admin"];
  companyId: string;
  clientId: string;
  representativeId: string;
  userId: string;
  previousNextContactAt: string;
  nextContactAt: string | null;
}) {
  if (!nextContactAt) {
    if (!previousNextContactAt) return;
    const { error } = await admin
      .from("crm_activities")
      .update({ next_action_type: null, next_action_at: null })
      .eq("tenant_company_id", companyId)
      .eq("client_id", clientId)
      .is("opportunity_id", null)
      .eq("next_action_at", previousNextContactAt);
    if (error) throw error;
    return;
  }

  const { data: agendaAtTarget, error: agendaAtTargetError } = await admin
    .from("crm_activities")
    .select("id")
    .eq("tenant_company_id", companyId)
    .eq("client_id", clientId)
    .eq("next_action_at", nextContactAt)
    .limit(1);
  if (agendaAtTargetError) throw agendaAtTargetError;
  if (agendaAtTarget?.length) return;

  if (previousNextContactAt) {
    const { data: directAgenda, error: directAgendaError } = await admin
      .from("crm_activities")
      .select("id,next_action_type")
      .eq("tenant_company_id", companyId)
      .eq("client_id", clientId)
      .is("opportunity_id", null)
      .eq("next_action_at", previousNextContactAt)
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (directAgendaError) throw directAgendaError;
    if (directAgenda) {
      const { error } = await admin
        .from("crm_activities")
        .update({ next_action_type: directAgenda.next_action_type || "FOLLOW_UP", next_action_at: nextContactAt })
        .eq("id", directAgenda.id)
        .eq("tenant_company_id", companyId);
      if (error) throw error;
      return;
    }

    const { data: agendasAtPreviousDate, error: agendasAtPreviousDateError } = await admin
      .from("crm_activities")
      .select("id,next_action_type")
      .eq("tenant_company_id", companyId)
      .eq("client_id", clientId)
      .eq("next_action_at", previousNextContactAt)
      .limit(2);
    if (agendasAtPreviousDateError) throw agendasAtPreviousDateError;
    if (agendasAtPreviousDate?.length === 1) {
      const agenda = agendasAtPreviousDate[0];
      const { error } = await admin
        .from("crm_activities")
        .update({ next_action_type: agenda.next_action_type || "FOLLOW_UP", next_action_at: nextContactAt })
        .eq("id", agenda.id)
        .eq("tenant_company_id", companyId);
      if (error) throw error;
      return;
    }
  }

  const { error } = await admin.from("crm_activities").insert({
    tenant_company_id: companyId,
    client_id: clientId,
    representative_profile_id: representativeId,
    activity_type: "NOTE",
    outcome: "FOLLOW_UP",
    subject: "CONTATO PROGRAMADO",
    notes: "AGENDA CRIADA A PARTIR DO RESUMO DO CLIENTE.",
    occurred_at: new Date().toISOString(),
    next_action_type: "FOLLOW_UP",
    next_action_at: nextContactAt,
    created_by: userId,
  });
  if (error) throw error;
}

function calculateNextPurchaseDate(lastPurchaseAt: string, purchaseFrequencyDays: number | null) {
  if (!lastPurchaseAt || !purchaseFrequencyDays) return "";
  const [year, month, day] = lastPurchaseAt.split("-").map(Number);
  if (!year || !month || !day) return "";
  const date = new Date(year, month - 1, day, 12);
  date.setDate(date.getDate() + purchaseFrequencyDays);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function upper(value: string) { return (value || "").trim().toLocaleUpperCase("pt-BR"); }
function failure(message: string, status: number) { return NextResponse.json({ success: false, message }, { status }); }
function handleError(error: unknown) {
  if (error instanceof AccessError) return failure(error.message, error.status);
  console.error("CRM PROFILE ERROR", error);
  return failure("NAO FOI POSSIVEL SALVAR A CARTEIRA DO CLIENTE.", 500);
}

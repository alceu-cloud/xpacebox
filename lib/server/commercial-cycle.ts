import type { SupabaseClient } from "@supabase/supabase-js";

type CycleInput = {
  admin: SupabaseClient;
  companyId: string;
  clientId: string;
  representativeId: string;
  userId: string;
  baseDate: string;
  purchaseRecorded: boolean;
  title: string;
};

export async function scheduleCommercialCycle(input: CycleInput) {
  const { admin, companyId, clientId, representativeId, userId, baseDate, purchaseRecorded, title } = input;
  const { data: profile, error: profileError } = await admin
    .from("crm_customer_profiles")
    .select("owner_profile_id,purchase_frequency_days")
    .eq("tenant_company_id", companyId)
    .eq("client_id", clientId)
    .maybeSingle();
  if (profileError) throw profileError;

  const frequencyDays = Number(profile?.purchase_frequency_days || 0);
  const cycleDate = frequencyDays > 0 ? addDays(baseDate, frequencyDays) : "";
  const now = new Date().toISOString();

  const { error: clearError } = await admin
    .from("crm_activities")
    .update({ next_action_type: null, next_action_at: null })
    .eq("tenant_company_id", companyId)
    .eq("client_id", clientId)
    .eq("agenda_kind", "CYCLE")
    .not("next_action_at", "is", null);
  if (clearError) throw clearError;

  const profilePayload: Record<string, string | null> = {
    owner_profile_id: profile?.owner_profile_id || representativeId,
    next_purchase_at: cycleDate || null,
    next_contact_at: cycleDate ? `${cycleDate}T12:00:00.000Z` : null,
    updated_at: now,
  };
  if (purchaseRecorded) profilePayload.last_purchase_at = baseDate;

  const { error: profileUpdateError } = await admin.from("crm_customer_profiles").upsert({
    tenant_company_id: companyId,
    client_id: clientId,
    created_by: userId,
    ...profilePayload,
  }, { onConflict: "tenant_company_id,client_id" });
  if (profileUpdateError) throw profileUpdateError;

  if (!cycleDate) return { scheduled: false, nextActionAt: "" };

  const { error: activityError } = await admin.from("crm_activities").insert({
    tenant_company_id: companyId,
    client_id: clientId,
    representative_profile_id: profile?.owner_profile_id || representativeId,
    activity_type: "NOTE",
    outcome: "FOLLOW_UP",
    subject: "PROXIMO CICLO COMERCIAL AGENDADO",
    notes: `${purchaseRecorded ? "PEDIDO REGISTRADO" : "CICLO COMERCIAL ENCERRADO"}: ${title}. NOVO CONTATO PROGRAMADO CONFORME A FREQUENCIA DE COMPRA DO CLIENTE.`,
    occurred_at: now,
    next_action_type: "FOLLOW_UP",
    next_action_at: `${cycleDate}T12:00:00.000Z`,
    agenda_kind: "CYCLE",
    created_by: userId,
  });
  if (activityError) throw activityError;
  return { scheduled: true, nextActionAt: `${cycleDate}T12:00:00.000Z` };
}

export function saoPauloDate() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

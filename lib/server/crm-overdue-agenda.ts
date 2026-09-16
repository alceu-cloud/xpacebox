import type { SupabaseClient } from "@supabase/supabase-js";

type CrmAgendaKind = "CYCLE" | "OPPORTUNITY" | "FOLLOW_UP" | null;

export type OverdueCrmAgenda = {
  id: string;
  client_id: string | null;
  opportunity_id: string | null;
  representative_profile_id: string | null;
  next_action_type: string | null;
  next_action_at: string;
  agenda_kind: CrmAgendaKind;
};

/**
 * Returns the first agenda that can genuinely block the representative.
 *
 * Legacy rows sometimes classified a client follow-up as OPPORTUNITY before
 * an opportunity was linked. They must stay in the timeline, but cannot be
 * operational agendas: there is no open opportunity to attend.
 */
export async function findOverdueCrmAgenda(
  admin: SupabaseClient,
  input: { tenantCompanyId: string; representativeProfileId: string; before: string }
) {
  const { data: candidates, error: candidatesError } = await admin
    .from("crm_activities")
    .select("id,client_id,opportunity_id,representative_profile_id,next_action_type,next_action_at,agenda_kind")
    .eq("tenant_company_id", input.tenantCompanyId)
    .eq("representative_profile_id", input.representativeProfileId)
    .not("next_action_at", "is", null)
    .lt("next_action_at", input.before)
    .order("next_action_at", { ascending: true })
    .limit(100);
  if (candidatesError) throw candidatesError;

  const agendas = (candidates ?? []) as OverdueCrmAgenda[];
  const opportunityIds = [...new Set(agendas.map((agenda) => agenda.opportunity_id).filter(Boolean))] as string[];
  const stages = new Map<string, string>();

  if (opportunityIds.length) {
    const { data: opportunities, error: opportunitiesError } = await admin
      .from("crm_opportunities")
      .select("id,stage")
      .eq("tenant_company_id", input.tenantCompanyId)
      .in("id", opportunityIds);
    if (opportunitiesError) throw opportunitiesError;
    for (const opportunity of opportunities ?? []) stages.set(opportunity.id, opportunity.stage);
  }

  return agendas.find((agenda) => {
    if (agenda.agenda_kind !== "OPPORTUNITY") return true;

    const opportunityId = agenda.opportunity_id;
    if (!opportunityId) return false;
    const stage = stages.get(opportunityId);
    return Boolean(stage && stage !== "WON" && stage !== "LOST");
  }) ?? null;
}

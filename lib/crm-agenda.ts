type AgendaReference = {
  nextActionAt?: string | null;
  opportunityId?: string | null;
  agendaKind?: string | null;
};

export function isPendingCrmAgenda(activity: AgendaReference, opportunityStages: ReadonlyMap<string, string>) {
  if (!activity.nextActionAt || !Number.isFinite(Date.parse(activity.nextActionAt))) return false;
  if (!activity.opportunityId) return activity.agendaKind !== "OPPORTUNITY";
  const stage = opportunityStages.get(activity.opportunityId);
  // Overdue actions remain pending; closed or missing opportunities do not.
  return Boolean(stage && stage !== "WON" && stage !== "LOST");
}

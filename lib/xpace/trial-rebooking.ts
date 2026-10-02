type IdentityLead = { id: string; full_name: string; email?: string | null };

// A phone can belong to a parent or family. Never borrow another person's history.
export function normalizeBookingIdentity(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
}

export function publicLeadMatch<T extends IdentityLead>(leads: T[], identity: { fullName: string; email: string }): T | null {
  if (!leads.length) return null;
  const name = normalizeBookingIdentity(identity.fullName);
  const email = identity.email.trim().toLowerCase();
  const matches = leads.filter((lead) => normalizeBookingIdentity(lead.full_name) === name
    && (!lead.email?.trim() || lead.email.trim().toLowerCase() === email));
  if (matches.length !== 1) throw new Error("XPACE_TRIAL_IDENTITY_AMBIGUOUS");
  return matches[0];
}

export type RebookingTrial = {
  id: string; scheduled_on: string; starts_at: string | null; ends_at?: string | null;
  attendance_status: string; modality_name_snapshot: string | null;
};

export function reschedulePredecessor(history: RebookingTrial[], target: { modality: string; scheduledOn: string; startsAt: string }, now = new Date()): string | null {
  const modality = target.modality.trim().toLocaleLowerCase("pt-BR");
  if (!modality || ["sem modalidade", "aula experimental"].includes(modality)) return null;
  const same = history.filter((row) => row.attendance_status !== "CANCELADO"
    && row.modality_name_snapshot?.trim().toLocaleLowerCase("pt-BR") === modality);
  const time = (value: string | null | undefined) => value ? `${value.slice(0, 5)}:${value.slice(6, 8) || "00"}` : "23:59:59";
  const key = (row: RebookingTrial) => `${row.scheduled_on}T${time(row.starts_at)}`;
  same.sort((left, right) => key(right).localeCompare(key(left)));
  const previous = same[0];
  if (!previous?.starts_at || previous.attendance_status !== "FALTOU" || (same[1] && key(previous) === key(same[1]))) return null;
  const targetKey = `${target.scheduledOn}T${target.startsAt.slice(0, 5)}:00`;
  if (key(previous) >= targetKey) return null;
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const part = (type: string) => parts.find((value) => value.type === type)?.value ?? "";
  const localNow = `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}:${part("second")}`;
  const previousEnd = `${previous.scheduled_on}T${time(previous.ends_at || previous.starts_at)}`;
  return previousEnd < localNow && previousEnd < targetKey ? previous.id : null;
}

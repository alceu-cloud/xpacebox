/** Class audiences. These boundaries do not change guardian or contract rules. */
export const classAudiences = [
  { value: "BABY", label: "Baby (4 a 6)", minAge: 4, maxAge: 6 },
  { value: "KIDS", label: "Kids (7 a 11)", minAge: 7, maxAge: 11 },
  { value: "TEENS", label: "Teens (12 a 16)", minAge: 12, maxAge: 16 },
  { value: "ADULTO", label: "Adulto (17+)", minAge: 17, maxAge: null },
] as const;

export function trialScheduleSettings(scheduleSettings: unknown, groupSettings: unknown): Record<string, unknown> {
  const settings = scheduleSettings ?? groupSettings;
  return settings && typeof settings === "object" && !Array.isArray(settings) ? settings as Record<string, unknown> : {};
}
export function scheduleAllowsTrial(scheduleSettings: unknown, groupSettings: unknown): boolean {
  return trialScheduleSettings(scheduleSettings, groupSettings).allowLeads === true;
}

const levelLabels: Record<string, string> = { INICIANTE: "Iniciante", INICIANTE_INTERMEDIARIO: "Iniciante / Intermediário", INTERMEDIARIO: "Intermediário", AVANCADO: "Avançado" };
const audienceLabels: Record<string, string> = Object.fromEntries(classAudiences.map(item => [item.value, item.label]));

// Missing historical schedule data must not be guessed as beginner/adult.
export function trialScheduleDetails(schedule?: { class_level?: unknown; age_groups?: unknown; age_group?: unknown } | null) {
  const level = typeof schedule?.class_level === "string" && levelLabels[schedule.class_level] ? schedule.class_level : "";
  const raw = Array.isArray(schedule?.age_groups) && schedule.age_groups.length ? schedule.age_groups : [schedule?.age_group];
  const ageGroups = Object.keys(audienceLabels).filter((key) => raw.includes(key));
  return { level, ageGroups };
}

export function trialClassLabel(level?: string, ageGroups?: string[]) {
  const labels = [...new Set(ageGroups ?? [])].flatMap((key) => audienceLabels[key] ? [audienceLabels[key]] : []);
  return [level && levelLabels[level] ? `Nível: ${levelLabels[level]}` : "", labels.length ? `Público: ${labels.join(" / ")}` : ""].filter(Boolean).join(" · ");
}

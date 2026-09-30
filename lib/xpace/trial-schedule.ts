export function trialScheduleSettings(scheduleSettings: unknown, groupSettings: unknown): Record<string, unknown> {
  const settings = scheduleSettings ?? groupSettings;
  return settings && typeof settings === "object" && !Array.isArray(settings) ? settings as Record<string, unknown> : {};
}
export function scheduleAllowsTrial(scheduleSettings: unknown, groupSettings: unknown): boolean {
  return trialScheduleSettings(scheduleSettings, groupSettings).allowLeads === true;
}

const levelLabels: Record<string, string> = { INICIANTE: "Iniciante", INICIANTE_INTERMEDIARIO: "Iniciante / Intermediário", INTERMEDIARIO: "Intermediário", AVANCADO: "Avançado" };
const audienceLabels: Record<string, string> = { BABY: "Baby (4 a 6)", KIDS: "Kids (7 a 11)", TEENS: "Teens (12 a 17)", ADULTO: "Adult (18+)" };

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

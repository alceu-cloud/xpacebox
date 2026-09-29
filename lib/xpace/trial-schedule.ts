export function trialScheduleSettings(scheduleSettings: unknown, groupSettings: unknown): Record<string, unknown> {
  const settings = scheduleSettings ?? groupSettings;
  return settings && typeof settings === "object" && !Array.isArray(settings) ? settings as Record<string, unknown> : {};
}
export function scheduleAllowsTrial(scheduleSettings: unknown, groupSettings: unknown): boolean {
  return trialScheduleSettings(scheduleSettings, groupSettings).allowLeads === true;
}

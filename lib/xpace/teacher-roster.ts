// Civil dates: independent from academic schedules and browser time zones.
export function teacherRosterDates(month: string, weekdays: number[]): string[] {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !weekdays.length || weekdays.some(d => !Number.isInteger(d) || d < 0 || d > 6)) return [];
  const dates: string[] = [], date = new Date(month + '-01T12:00:00Z');
  while (date.toISOString().slice(0, 7) === month) {
    if (weekdays.includes(date.getUTCDay())) dates.push(date.toISOString().slice(0, 10));
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return dates;
}

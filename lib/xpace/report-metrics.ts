export type TrialRecord = {
  id: string; leadId: string; personId: string | null; on: string; startsAt: string | null;
  kind: string; modality: string; instructor: string; attendance: string; enrollment: string;
  legacy: boolean; legacyMonth: string | null;
};
export type TrialStats = {
  appointments: number; leads: number; attended: number; absent: number; pendingAttendance: number;
  enrolled: number; notEnrolled: number; pendingEnrollment: number; attendedKnown: number;
  attendedEnrolled: number; attendedPending: number; enrollmentWithoutAttendance: number;
  attendanceRate: number | null; resolvedAttendanceRate: number | null; conversionRate: number | null;
  attendedConversionRate: number | null; modalityConversionRate: number | null;
};
export type TrialGroup = { key: string; label: string; stats: TrialStats };
export type TrialReport = {
  stats: TrialStats; months: TrialGroup[]; kinds: TrialGroup[]; modalities: TrialGroup[];
  instructors: TrialGroup[]; weeks: TrialGroup[]; kindsByMonth: Array<TrialGroup & { kind: string }>;
  records: TrialRecord[]; imported: number; cancelled: number; monthDifferences: Array<{ on: string; savedMonth: string }>;
};

export function rate(part: number, total: number): number | null {
  return total > 0 ? Math.round(part / total * 10000) / 100 : null;
}
export function trialStats(records: TrialRecord[]): TrialStats {
  const attended = records.filter((r) => r.attendance === "COMPARECEU");
  const absent = records.filter((r) => r.attendance === "FALTOU").length;
  const known = records.filter((r) => ["MATRICULOU", "NAO_MATRICULOU"].includes(r.enrollment));
  const attendedKnown = attended.filter((r) => ["MATRICULOU", "NAO_MATRICULOU"].includes(r.enrollment));
  const enrolled = known.filter((r) => r.enrollment === "MATRICULOU").length;
  const attendedEnrolled = attendedKnown.filter((r) => r.enrollment === "MATRICULOU").length;
  return {
    appointments: records.length, leads: new Set(records.map((r) => r.personId ? `person:${r.personId}` : `lead:${r.leadId}`)).size,
    attended: attended.length, absent, pendingAttendance: records.length - attended.length - absent,
    enrolled, notEnrolled: known.length - enrolled, pendingEnrollment: records.length - known.length,
    attendedKnown: attendedKnown.length, attendedEnrolled, attendedPending: attended.length - attendedKnown.length,
    enrollmentWithoutAttendance: enrolled - attendedEnrolled,
    attendanceRate: rate(attended.length, records.length), resolvedAttendanceRate: rate(attended.length, attended.length + absent),
    conversionRate: rate(enrolled, known.length), attendedConversionRate: rate(attendedEnrolled, attendedKnown.length),
    // Compatibility with Conversão Modalidade: sum all recorded enrollments / all attendees.
    modalityConversionRate: rate(enrolled, attended.length),
  };
}
function grouped(records: TrialRecord[], keyOf: (r: TrialRecord) => string): TrialGroup[] {
  const buckets = new Map<string, TrialRecord[]>();
  for (const record of records) { const key = keyOf(record); const rows = buckets.get(key) ?? []; rows.push(record); buckets.set(key, rows); }
  return [...buckets].map(([key, rows]) => ({ key, label: key, stats: trialStats(rows) }));
}
export function weekStart(day: string): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - date.getUTCDay()); // Excel WEEKNUM default: Sunday.
  return date.toISOString().slice(0, 10);
}
export function monthSequence(from: string, to: string): string[] {
  const result: string[] = []; const end = to.slice(0, 7);
  let month = from.slice(0, 7);
  while (month <= end && result.length < 24) {
    result.push(month);
    const date = new Date(`${month}-01T12:00:00Z`); date.setUTCMonth(date.getUTCMonth() + 1);
    month = date.toISOString().slice(0, 7);
  }
  return result;
}
export function buildTrialReport(all: TrialRecord[], from: string, to: string): TrialReport {
  const selection = all.filter((r) => r.on >= from && r.on <= to);
  const records = selection.filter((r) => r.attendance !== "CANCELADO");
  const rank = (groups: TrialGroup[]) => groups.sort((a, b) => b.stats.appointments - a.stats.appointments || a.label.localeCompare(b.label, "pt-BR"));
  const months = monthSequence(from, to).map((month) => ({ key: month, label: month, stats: trialStats(records.filter((r) => r.on.startsWith(month))) }));
  const kinds = grouped(records, (r) => r.kind);
  const expectedMonths = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return { stats: trialStats(records), records, months, kinds: rank(kinds),
    modalities: rank(grouped(records, (r) => r.modality || "SEM MODALIDADE")),
    instructors: rank(grouped(records, (r) => r.instructor || "SEM PROFESSOR")),
    weeks: grouped(records, (r) => weekStart(r.on)).sort((a, b) => a.key.localeCompare(b.key)),
    kindsByMonth: months.flatMap(({ key }) => kinds.map((kind) => ({ key: `${key}:${kind.key}`, label: key, kind: kind.key, stats: trialStats(records.filter((r) => r.on.startsWith(key) && r.kind === kind.key)) }))),
    imported: records.filter((r) => r.legacy).length, cancelled: selection.length - records.length,
    monthDifferences: records.filter((r) => r.legacy && r.legacyMonth && r.legacyMonth.toLocaleLowerCase("pt-BR") !== expectedMonths[Number(r.on.slice(5, 7)) - 1]).map((r) => ({ on: r.on, savedMonth: r.legacyMonth! })),
  };
}
export function attendanceTone(value: number | null): "green" | "amber" | "red" | "neutral" {
  return value === null ? "neutral" : value >= 60 ? "green" : value >= 55 ? "amber" : "red";
}
export function modalityAction(stats: TrialStats): string {
  if (stats.attended < 10) return "Coletar dados";
  return (stats.modalityConversionRate ?? 0) >= 50 ? "Avaliar investimento" : "Melhorar";
}
export function professorSample(total: number): string { return total < 5 ? "Baixa" : total < 10 ? "Média" : "Alta"; }
export function professorAction(stats: TrialStats): string {
  if (stats.attendedKnown < 5) return "Coletar dados";
  return (stats.attendedConversionRate ?? 0) >= 50 ? "Compartilhar boas práticas" : (stats.attendedConversionRate ?? 0) >= 35 ? "Manter e acompanhar" : "Desenvolver estratégia";
}

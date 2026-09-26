export function dateInSaoPaulo(value: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(value));
}

export function validDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function addMonthsToDay(day: string, count: number): string {
  const [year, month, date] = day.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + count, 1, 12));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0, 12)).getUTCDate();
  target.setUTCDate(Math.min(date, lastDay));
  return target.toISOString().slice(0, 10);
}

export function monthKeys(from: string, to: string, maximum = 12): string[] {
  const keys: string[] = [];
  let cursor = from.slice(0, 7);
  const end = to.slice(0, 7);
  while (cursor <= end && keys.length < 120) {
    keys.push(cursor);
    cursor = addMonthsToDay(`${cursor}-01`, 1).slice(0, 7);
  }
  return keys.slice(-maximum);
}

export function leadCohortDay(lead: { legacy_payload?: unknown; created_at: string }): string {
  const payload = lead.legacy_payload;
  const original = payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)["Data"] : null;
  return validDay(original as string) ? original as string : dateInSaoPaulo(lead.created_at);
}

export function ageOn(birthDay: string, today: string): number {
  const [birthYear, birthMonth, birthDate] = birthDay.split("-").map(Number);
  const [year, month, date] = today.split("-").map(Number);
  return year - birthYear - (month < birthMonth || (month === birthMonth && date < birthDate) ? 1 : 0);
}

export function ageBand(age: number): string {
  if (age <= 4) return "0–4";
  if (age <= 8) return "5–8";
  if (age <= 12) return "9–12";
  if (age <= 20) return "13–20";
  if (age <= 30) return "21–30";
  if (age <= 40) return "31–40";
  if (age <= 50) return "41–50";
  if (age <= 60) return "51–60";
  return "61+";
}

export function nextBirthday(birthDay: string, today: string): string {
  const year = Number(today.slice(0, 4));
  const suffix = birthDay.slice(4);
  for (const candidateYear of [year, year + 1]) {
    const candidate = `${candidateYear}${suffix}`;
    const normalized = validDay(candidate) ? candidate : suffix === "-02-29" ? `${candidateYear}-02-28` : candidate;
    if (normalized >= today) return normalized;
  }
  return `${year + 1}${suffix}`;
}

export function percent(part: number, total: number): number | null {
  return total > 0 ? Math.round(part * 1000 / total) / 10 : null;
}

export type ContractSpan = { student_id: string; starts_on: string; ends_on: string; cancel_effective_on: string | null; cancelled_at: string | null };

function coverageEnd(contract: ContractSpan): string {
  const cancellation = contract.cancel_effective_on ?? (contract.cancelled_at ? dateInSaoPaulo(contract.cancelled_at) : null);
  return cancellation && cancellation < contract.ends_on ? cancellation : contract.ends_on;
}

export type PricedContract = ContractSpan & { amount_cents: number; billing_interval_snapshot: string; duration_months_snapshot: number };

const intervalMonths: Record<string, number> = { MENSAL: 1, TRIMESTRAL: 3, SEMESTRAL: 6, ANUAL: 12 };

export function saleValueCents(contract: PricedContract): number | null {
  if (contract.billing_interval_snapshot === "DIARIO") return contract.amount_cents;
  const cycle = intervalMonths[contract.billing_interval_snapshot];
  return cycle ? contract.amount_cents * Math.ceil(contract.duration_months_snapshot / cycle) : null;
}

export function contractedRevenueForMonthCents(contract: PricedContract, month: string): number | null {
  const effectiveEnd = coverageEnd(contract);
  if (contract.starts_on.slice(0, 7) > month || effectiveEnd.slice(0, 7) < month) return 0;
  if (contract.billing_interval_snapshot === "DIARIO") {
    const first = `${month}-01`;
    const next = addMonthsToDay(first, 1);
    const monthEnd = new Date(Date.parse(`${next}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
    const overlapStart = contract.starts_on > first ? contract.starts_on : first;
    const overlapEnd = effectiveEnd < monthEnd ? effectiveEnd : monthEnd;
    return (Math.round((Date.parse(`${overlapEnd}T12:00:00Z`) - Date.parse(`${overlapStart}T12:00:00Z`)) / 86_400_000) + 1) * contract.amount_cents;
  }
  const cycle = intervalMonths[contract.billing_interval_snapshot];
  return cycle ? contract.amount_cents / cycle : null;
}

export function lifecycleForMonth(contracts: ContractSpan[], month: string, asOf: string) {
  const first = `${month}-01`;
  const next = addMonthsToDay(first, 1);
  const students = new Map<string, ContractSpan[]>();
  for (const contract of contracts) students.set(contract.student_id, [...(students.get(contract.student_id) ?? []), contract]);
  let activeAtStart = 0;
  const exits: Array<{ studentId: string; on: string; months: number }> = [];
  for (const [studentId, spans] of students) {
    if (!spans.some((span) => span.starts_on <= first && coverageEnd(span) >= first)) continue;
    activeAtStart += 1;
    const comparisonDay = next <= asOf ? next : asOf;
    if (spans.some((span) => span.starts_on <= comparisonDay && coverageEnd(span) >= comparisonDay)) continue;
    const lastEnd = spans.map(coverageEnd).filter((day) => day <= asOf).sort().at(-1);
    if (!lastEnd || lastEnd < first || lastEnd >= next) continue;
    const firstStart = spans.map((span) => span.starts_on).sort()[0];
    const days = Math.max(1, Math.round((Date.parse(`${lastEnd}T12:00:00Z`) - Date.parse(`${firstStart}T12:00:00Z`)) / 86_400_000) + 1);
    exits.push({ studentId, on: lastEnd, months: Math.round(days / 30.4375 * 10) / 10 });
  }
  return { activeAtStart, exits, churn: percent(exits.length, activeAtStart),
    ltMonths: exits.length ? Math.round(exits.reduce((sum, exit) => sum + exit.months, 0) / exits.length * 10) / 10 : null };
}

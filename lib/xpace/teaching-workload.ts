/** Calendar and pricing primitives. Persistence and authorization are not implemented here. */
export type TeachingRecurrence = {
  id: string;
  weekday: number;
  startsAt: string;
  endsAt: string;
  startsOn: string;
  endsOn?: string | null;
};

export type TeachingOccurrence = {
  key: string;
  scheduleId: string;
  scheduledOn: string;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  lessonUnits: 1;
};

function date(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Data inválida.");
  const parsed = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error("Data inválida.");
  return parsed;
}

function minutes(value: string): number {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error("Horário inválido.");
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

/** Uses civil dates, independent of the device timezone; historical snapshots take precedence in storage. */
export function teachingOccurrences(month: string, schedules: TeachingRecurrence[]): TeachingOccurrence[] {
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month)) throw new Error("Mês inválido.");
  const first = date(`${month}-01`);
  const last = new Date(first);
  last.setUTCMonth(last.getUTCMonth() + 1, 0);
  const result: TeachingOccurrence[] = [];
  const ids = new Set<string>();
  for (const schedule of schedules) {
    if (!schedule.id.trim() || ids.has(schedule.id)) throw new Error("Horário duplicado ou sem identificação.");
    ids.add(schedule.id);
    if (!Number.isInteger(schedule.weekday) || schedule.weekday < 0 || schedule.weekday > 6) throw new Error("Dia da semana inválido.");
    date(schedule.startsOn);
    if (schedule.endsOn) date(schedule.endsOn);
    if (schedule.endsOn && schedule.endsOn < schedule.startsOn) throw new Error("Período da grade inválido.");
    const duration = minutes(schedule.endsAt) - minutes(schedule.startsAt);
    if (duration <= 0) throw new Error("O fim da aula deve ser posterior ao início no mesmo dia.");
    for (let cursor = new Date(first); cursor <= last; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      const scheduledOn = cursor.toISOString().slice(0, 10);
      if (cursor.getUTCDay() !== schedule.weekday || scheduledOn < schedule.startsOn || (schedule.endsOn && scheduledOn > schedule.endsOn)) continue;
      result.push({ key: `${schedule.id}/${scheduledOn}`, scheduleId: schedule.id, scheduledOn, startsAt: schedule.startsAt, endsAt: schedule.endsAt, durationMinutes: duration, lessonUnits: 1 });
    }
  }
  return result.sort((a, b) => a.scheduledOn.localeCompare(b.scheduledOn) || a.startsAt.localeCompare(b.startsAt) || a.scheduleId.localeCompare(b.scheduleId));
}

/** Confirmed product rule: a 45-minute lesson receives the entire lesson rate. Not a payroll eligibility rule. */
export function lessonAmountCents(lessonUnits: number, rateCents: number): number {
  nonnegativeInteger(lessonUnits, "Quantidade de aulas");
  nonnegativeInteger(rateCents, "Valor por aula");
  const amount = lessonUnits * rateCents;
  if (!Number.isSafeInteger(amount)) throw new Error("Valor total fora do limite.");
  return amount;
}

export const INITIAL_ROOM_HOURLY_RATE_CENTS = 3500;

/** Rates are supplied from trusted room configuration; preserve this quote on the reservation. */
export function roomReservationQuote(startsAt: string, endsAt: string, hourlyRateCents: number) {
  nonnegativeInteger(hourlyRateCents, "Valor por hora");
  const starts = instant(startsAt), ends = instant(endsAt);
  const durationMs = ends - starts;
  if (durationMs <= 0 || durationMs % 60000 !== 0) throw new Error("A reserva deve ter duração positiva em minutos inteiros.");
  const durationMinutes = durationMs / 60000;
  const numerator = BigInt(durationMinutes) * BigInt(hourlyRateCents);
  const amount = (numerator + 30n) / 60n;
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Valor total fora do limite.");
  return { durationMinutes, hourlyRateCents, amountCents: Number(amount) };
}

/** Adjacent reservations can touch at their endpoints. Atomic database conflict checks are still required. */
export function intervalsOverlap(left: { startsAt: string; endsAt: string }, right: { startsAt: string; endsAt: string }): boolean {
  const a = instant(left.startsAt), b = instant(left.endsAt), c = instant(right.startsAt), d = instant(right.endsAt);
  if (a >= b || c >= d) throw new Error("Intervalo inválido.");
  return a < d && c < b;
}

function instant(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) throw new Error("Informe a data e o horário com fuso.");
  date(value.slice(0, 10));
  minutes(value.slice(11, 16));
  const parsed = Date.parse(value);
  if (!Number.isSafeInteger(parsed)) throw new Error("Data e horário inválidos.");
  return parsed;
}

function nonnegativeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} inválido.`);
}

import { monthBounds } from "./billing-cycle";
import { CommercialError } from "./commercial";

export type StudentMeasurementMetric = "PENDING" | "ACTIVE_STUDENTS" | "DAILY_AVERAGE";
export type StudentMeasurementRecord = {
  tenantCompanyId: string;
  date: string;
  activeStudents: number;
  source: "DAY_CLOSE" | "OBSERVATION";
};

export type StudentMeasurementInput = {
  tenantCompanyId: string;
  period: string;
  metric: StudentMeasurementMetric;
  records: readonly StudentMeasurementRecord[];
  // The caller supplies a trusted clock; this helper never calls Date.now().
  asOf: Date;
};

const timeZone = "America/Sao_Paulo" as const;

function brazilDay(asOf: Date) {
  if (!(asOf instanceof Date) || !Number.isFinite(asOf.getTime())) {
    throw new CommercialError("RELÓGIO DE MEDIÇÃO INVÁLIDO.");
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(asOf);
  const value = (type: "year" | "month" | "day") => parts.find(part => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

/**
 * Preparation only. Observations never substitute a daily or monthly close.
 * A DAY_CLOSE is usable only after that entire calendar day ended in Brasília.
 * No rounding rule or missing historical measurement is invented here.
 */
export function measureStudents(input: StudentMeasurementInput) {
  if (!input || typeof input !== "object"
    || typeof input.tenantCompanyId !== "string" || !input.tenantCompanyId.trim()
    || !["PENDING", "ACTIVE_STUDENTS", "DAILY_AVERAGE"].includes(input.metric)
    || !Array.isArray(input.records)) {
    throw new CommercialError("EMPRESA, MÉTRICA OU REGISTROS DE MEDIÇÃO INVÁLIDOS.");
  }

  const { periodStart, dueOn: periodEnd } = monthBounds(input.period);
  const asOfDate = brazilDay(input.asOf);
  const daysInMonth = Number(periodEnd.slice(-2));
  const dates = Array.from({ length: daysInMonth }, (_, index) =>
    `${input.period}-${String(index + 1).padStart(2, "0")}`);
  const validDates = new Set(dates);
  const seen = new Set<string>();
  const closes = new Map<string, number>();
  let observations = 0;

  for (const record of input.records) {
    if (!record || record.tenantCompanyId !== input.tenantCompanyId) {
      throw new CommercialError("REGISTRO PERTENCE A OUTRA EMPRESA.");
    }
    if (typeof record.date !== "string" || !validDates.has(record.date)) {
      throw new CommercialError("DATA DE MEDIÇÃO FORA DA COMPETÊNCIA OU INVÁLIDA.");
    }
    if (!Number.isSafeInteger(record.activeStudents) || record.activeStudents < 0) {
      throw new CommercialError("QUANTIDADE DE ALUNOS INVÁLIDA.");
    }
    if (record.source !== "DAY_CLOSE" && record.source !== "OBSERVATION") {
      throw new CommercialError("ORIGEM DA MEDIÇÃO INVÁLIDA.");
    }
    // One record per day/source. An observation may coexist with the real close,
    // but duplicate closes (even with the same count) are rejected, not summed.
    const key = `${record.date}:${record.source}`;
    if (seen.has(key)) throw new CommercialError("REGISTRO DE MEDIÇÃO DUPLICADO.");
    seen.add(key);
    if (record.date > asOfDate || (record.source === "DAY_CLOSE" && record.date === asOfDate)) {
      throw new CommercialError("NÃO É POSSÍVEL REGISTRAR UM FECHAMENTO FUTURO OU PREMATURO.");
    }
    if (record.source === "DAY_CLOSE") closes.set(record.date, record.activeStudents);
    else observations += 1;
  }

  const requiredDates = input.metric === "DAILY_AVERAGE" ? dates
    : input.metric === "ACTIVE_STUDENTS" ? [periodEnd] : [];
  const missingDates = requiredDates.filter(date => !closes.has(date));
  const periodClosed = asOfDate > periodEnd;
  const complete = input.metric !== "PENDING" && periodClosed && missingDates.length === 0;
  const blockers: string[] = [];
  if (input.metric === "PENDING") blockers.push("DEFINIR QUAIS ALUNOS ENTRAM NA MENSALIDADE.");
  if (!periodClosed) blockers.push("AGUARDAR O FECHAMENTO COMPLETO DA COMPETÊNCIA EM BRASÍLIA.");
  if (missingDates.length) blockers.push(input.metric === "ACTIVE_STUDENTS"
    ? "FALTA O REGISTRO EXATO DE FECHAMENTO DO ÚLTIMO DIA DO MÊS."
    : "FALTAM REGISTROS DE FECHAMENTO DIÁRIO. NÃO RECONSTRUIR A MÉDIA COM OBSERVAÇÕES.");

  let billableStudents: number | null = null;
  let numerator: number | null = null;
  let denominator: number | null = null;
  if (complete && input.metric === "ACTIVE_STUDENTS") {
    billableStudents = closes.get(periodEnd)!;
    numerator = billableStudents;
    denominator = 1;
  }
  if (complete && input.metric === "DAILY_AVERAGE") {
    numerator = dates.reduce((sum, date) => sum + closes.get(date)!, 0);
    if (!Number.isSafeInteger(numerator)) throw new CommercialError("SOMA DE ALUNOS FORA DO LIMITE SEGURO.");
    denominator = daysInMonth;
    // Even an integral average waits for an explicit, shared rounding policy.
    blockers.push("DEFINIR ARREDONDAMENTO DA MÉDIA DIÁRIA ANTES DE ESCOLHER A FAIXA.");
  }

  return {
    tenantCompanyId: input.tenantCompanyId,
    period: input.period,
    metric: input.metric,
    periodStart,
    periodEnd,
    asOfDate,
    timeZone,
    periodClosed,
    complete,
    coverage: {
      expectedDays: requiredDates.length,
      coveredDays: requiredDates.length - missingDates.length,
      missingDates,
      ignoredObservations: observations,
    },
    numerator,
    denominator,
    billableStudents,
    blockers,
    kind: "PREVIEW" as const,
    canCharge: false as const,
  };
}

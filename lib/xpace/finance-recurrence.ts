export const recurrenceFrequencies = ["DIARIA", "MENSAL", "BIMESTRAL", "TRIMESTRAL", "SEMESTRAL", "ANUAL"] as const;
export type RecurrenceFrequency = typeof recurrenceFrequencies[number] | "UNICA";

const monthsPerFrequency: Partial<Record<RecurrenceFrequency, number>> = {
  MENSAL: 1,
  BIMESTRAL: 2,
  TRIMESTRAL: 3,
  SEMESTRAL: 6,
  ANUAL: 12,
};

export function shiftedFinanceDate(isoDate: string, frequency: RecurrenceFrequency, index: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate) || !Number.isInteger(index) || index < 0) throw new Error("Data ou repetição inválida.");
  const [year, month, day] = isoDate.split("-").map(Number);
  const base = new Date(0);
  base.setUTCFullYear(year, month - 1, day);
  if (base.toISOString().slice(0, 10) !== isoDate) throw new Error("Data inválida.");
  if (index === 0) return isoDate;
  if (frequency === "DIARIA") base.setUTCDate(base.getUTCDate() + index);
  else {
    const monthOffset = monthsPerFrequency[frequency];
    if (!monthOffset) throw new Error("Frequência inválida.");
    const targetMonth = month - 1 + monthOffset * index;
    const target = new Date(0);
    target.setUTCFullYear(year, targetMonth + 1, 0);
    const lastDay = target.getUTCDate();
    base.setUTCFullYear(year, targetMonth, Math.min(day, lastDay));
  }
  const shifted = base.toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(shifted)) throw new Error("A recorrência ultrapassa o limite de datas.");
  return shifted;
}

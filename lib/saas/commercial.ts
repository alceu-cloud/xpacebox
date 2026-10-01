// Pure commercial rules shared by preview/API/tests. Never trusts client totals or exemptions.
export const addonCodes = ["WHATSAPP"] as const;
export type AddonCode = typeof addonCodes[number];
export type StudentBand = { min: number; max: number | null; monthlyCents: number | null };
export type Pricebook = {
  bands: StudentBand[];
  addons: { WHATSAPP: number | null };
  studentMetric: "PENDING" | "ACTIVE_STUDENTS";
  billingTiming: "MONTH_END";
  graceDays: number | null;
  rangeChange: "PENDING" | "NEXT_CYCLE";
};
export const emptyPricebook = (): Pricebook => ({ bands: [
  { min: 0, max: 50, monthlyCents: 9900 }, { min: 51, max: 200, monthlyCents: 14900 },
  { min: 201, max: 300, monthlyCents: 19900 }, { min: 301, max: 500, monthlyCents: 24900 },
  { min: 501, max: 800, monthlyCents: 29900 }, { min: 801, max: null, monthlyCents: 34900 },
], addons: { WHATSAPP: 15000 }, studentMetric: "PENDING", billingTiming: "MONTH_END", graceDays: null, rangeChange: "PENDING" });
export class CommercialError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
const whole = (v: unknown, max = 1_000_000) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= max;
const cents = (v: unknown) => v === null || whole(v, 100_000_000);
export function validatePricebook(value: unknown): Pricebook {
  if (!value || typeof value !== "object") throw new CommercialError("TABELA DE PREÇOS INVÁLIDA.");
  const input = value as Pricebook;
  if (!Array.isArray(input.bands) || input.bands.length > 100) throw new CommercialError("INFORME ATÉ 100 FAIXAS.");
  const bands = input.bands.map(b => {
    if (!b || !whole(b.min) || (b.max !== null && (!whole(b.max) || b.max < b.min)) || !cents(b.monthlyCents)) throw new CommercialError("FAIXA OU PREÇO INVÁLIDO. USE INTEIROS EM CENTAVOS.");
    return { min: b.min, max: b.max, monthlyCents: b.monthlyCents };
  }).sort((a, b) => a.min - b.min);
  bands.forEach((band, index) => {
    if (index && (bands[index - 1].max === null || band.min <= bands[index - 1].max!)) throw new CommercialError("AS FAIXAS NÃO PODEM SE SOBREPOR.");
  });
  if (!input.addons || !cents(input.addons.WHATSAPP) || Object.keys(input.addons).some(k => k !== "WHATSAPP")) throw new CommercialError("PREÇO DO ADICIONAL INVÁLIDO.");
  if (!["PENDING", "ACTIVE_STUDENTS"].includes(input.studentMetric) || !["PENDING", "NEXT_CYCLE"].includes(input.rangeChange)) throw new CommercialError("REGRA DE ALUNOS OU MUDANÇA DE FAIXA INVÁLIDA.");
  if (input.billingTiming !== "MONTH_END") throw new CommercialError("O FECHAMENTO DEVE OCORRER NO FINAL DO MÊS.");
  if (input.graceDays !== null && !whole(input.graceDays, 90)) throw new CommercialError("PRAZO DE TOLERÂNCIA INVÁLIDO.");
  return { bands, addons: { WHATSAPP: input.addons.WHATSAPP }, studentMetric: input.studentMetric, billingTiming: input.billingTiming, graceDays: input.graceDays, rangeChange: input.rangeChange };
}
export function visiblePricebook(book: Pricebook, isPlatformOwner: boolean): Pricebook {
  // Explicit DTO: internal or unexpected properties never leak to clients.
  return validatePricebook(book);
}
export function pricebookBlockers(book: Pricebook) {
  const blockers: string[] = [];
  if (!book.bands.length || book.bands[0].min !== 0 || book.bands.at(-1)?.max !== null || book.bands.some((b, i) => b.monthlyCents === null || (i > 0 && b.min !== book.bands[i - 1].max! + 1))) blockers.push("DEFINIR PREÇOS E COBERTURA CONTÍNUA DAS FAIXAS DE ALUNOS.");
  if (book.addons.WHATSAPP === null) blockers.push("DEFINIR MENSALIDADE DO WHATSAPP.");
  if (book.studentMetric === "PENDING") blockers.push("DEFINIR QUAIS ALUNOS ENTRAM NA MENSALIDADE.");
  if (book.graceDays === null) blockers.push("DEFINIR TOLERÂNCIA DE INADIMPLÊNCIA.");
  if (book.rangeChange === "PENDING") blockers.push("DEFINIR QUANDO A TROCA DE FAIXA PASSA A VALER.");
  return blockers;
}
export function quoteMonthly(book: Pricebook, companyId: string, ownerCompanyId: string, studentCount: number, selected: unknown) {
  if (!companyId || !ownerCompanyId || !whole(studentCount) || !Array.isArray(selected) || selected.some(c => !addonCodes.includes(c)) || new Set(selected).size !== selected.length) throw new CommercialError("EMPRESA, ALUNOS OU ADICIONAIS INVÁLIDOS.");
  const addons = selected as AddonCode[];
  const exempt = companyId === ownerCompanyId;
  const band = book.bands.find(b => studentCount >= b.min && (b.max === null || studentCount <= b.max));
  const blockers = exempt ? [] : pricebookBlockers(book);
  if (!exempt && !band) blockers.push("NÚMERO DE ALUNOS SEM FAIXA CONFIGURADA.");
  const base = exempt ? 0 : band?.monthlyCents ?? null;
  const lines = [{ code: "DANCE_SCHOOL", monthlyCents: base }, { code: "XPAY", monthlyCents: 0 }, ...addons.map(code => ({ code, monthlyCents: exempt ? 0 : book.addons[code] }))];
  const total = lines.some(l => l.monthlyCents === null) ? null : lines.reduce((sum, l) => sum + l.monthlyCents!, 0);
  return { exempt, studentCount, addons, lines, monthlyCents: total, blockers, accountMode: exempt ? "PARENT" as const : "SUBACCOUNT" as const, cycle: "MONTHLY" as const, kind: "SIMULATION" as const, canCharge: false as const };
}

export function accountModeForCompany(companyId: string, ownerCompanyId: string) {
  if (!companyId || !ownerCompanyId) throw new CommercialError("EMPRESA PRINCIPAL NÃO CONFIGURADA.", 409);
  return companyId === ownerCompanyId ? "PARENT" as const : "SUBACCOUNT" as const;
}

// This is deliberately not a live billing decision. It cannot grant operational access.
export function evaluateBillingReceipt(expected: { paymentId: string; customerId: string; reference: string; valueCents: number }, event: { paymentId: string; customerId: string; reference: string; valueCents: number; status: string }) {
  if (expected.paymentId !== event.paymentId || expected.customerId !== event.customerId || expected.reference !== event.reference || expected.valueCents !== event.valueCents) return "REVIEW";
  if (["RECEIVED", "CONFIRMED"].includes(event.status)) return "PAID";
  if (["REFUNDED", "CHARGEBACK_REQUESTED", "CHARGEBACK_DISPUTE", "AWAITING_CHARGEBACK_REVERSAL"].includes(event.status)) return "REVIEW";
  return "PENDING";
}

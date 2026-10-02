import { CommercialError, quoteMonthly, type Pricebook } from "./commercial";
// Pure preparation helpers. No issuer, recurring job or entitlement is wired here.
export function monthBounds(period: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period) || Number(period.slice(0,4)) < 2000) throw new CommercialError("COMPETÊNCIA INVÁLIDA.");
  const year = Number(period.slice(0,4)), month = Number(period.slice(5));
  const lastDay = new Date(Date.UTC(year,month,0)).getUTCDate();
  return { periodStart: `${period}-01`, dueOn: `${period}-${lastDay}`, timeZone: "America/Sao_Paulo" as const };
}
export function monthlyDraft(input: { companyId: string; ownerCompanyId: string; period: string; pricebookId: string; pricebook: Pricebook; measuredStudents: number; addons: string[] }) {
  const dates = monthBounds(input.period);
  const quote = quoteMonthly(input.pricebook,input.companyId,input.ownerCompanyId,input.measuredStudents,input.addons);
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(input.pricebookId)) throw new CommercialError("VERSÃO DE PREÇOS INVÁLIDA.");
  if (quote.exempt) return { kind: "EXEMPT" as const, canIssue: false as const, amountCents: 0, ...dates };
  return { kind: "DRAFT" as const, canIssue: false as const, ...dates, pricebookId: input.pricebookId,
    // Stable tenant+period key prevents creating a separate invoice per add-on.
    operationKey: `${input.companyId}:${input.period}`, amountCents: quote.monthlyCents, lines: quote.lines, blockers: quote.blockers,
    settlementAccount: "PLATFORM_PARENT" as const };
}
export type InvoiceState = "PENDING" | "PAID" | "OVERDUE" | "CANCELLED" | "REVIEW";
type PaymentIdentity = { accountId: string; paymentId: string; customerId: string; reference: string; valueCents: number };
export function reducePaymentEvent(current: InvoiceState, expected: PaymentIdentity, event: PaymentIdentity & { type: string }) {
  if (Object.keys(expected).some(key => expected[key as keyof PaymentIdentity] !== event[key as keyof PaymentIdentity])) return { state: current, reconcile: true };
  // REVIEW is sticky: out-of-order paid events cannot hide a refund/chargeback.
  if (current === "REVIEW") return { state: current, reconcile: true };
  if (["PAYMENT_REFUNDED","PAYMENT_PARTIALLY_REFUNDED","PAYMENT_REFUND_IN_PROGRESS","PAYMENT_CHARGEBACK_REQUESTED","PAYMENT_CHARGEBACK_DISPUTE","PAYMENT_AWAITING_CHARGEBACK_REVERSAL","PAYMENT_RECEIVED_IN_CASH_UNDONE"].includes(event.type)) return { state: "REVIEW" as const, reconcile: true };
  if (["PAYMENT_CONFIRMED","PAYMENT_RECEIVED"].includes(event.type)) return current === "CANCELLED" ? { state: "REVIEW" as const, reconcile: true } : { state: "PAID" as const, reconcile: false };
  if (event.type === "PAYMENT_DELETED") return { state: current === "PAID" ? "REVIEW" as const : "CANCELLED" as const, reconcile: true };
  // Stale created/overdue events never downgrade a payment already confirmed.
  if (current === "PAID" || current === "CANCELLED") return { state: current, reconcile: false };
  if (event.type === "PAYMENT_OVERDUE") return { state: "OVERDUE" as const, reconcile: false };
  return { state: current, reconcile: event.type !== "PAYMENT_CREATED" };
}

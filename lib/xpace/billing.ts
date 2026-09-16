import type { SupabaseClient } from "@supabase/supabase-js";

type ContractForCharges = {
  id: string;
  student_id: string;
  starts_on: string;
  first_due_on: string;
  ends_on: string;
  billing_interval_snapshot: string;
  duration_months_snapshot: number;
  base_amount_cents: number;
  amount_cents: number;
  benefit_name_snapshot: string | null;
  discount_type_snapshot: "PERCENTUAL" | "FIXO" | null;
  discount_value_snapshot: number | null;
  enrollment_service_snapshot?: unknown;
  renews_automatically: boolean;
  status: string;
  cancel_effective_on: string | null;
};

export function calculateDiscountedAmount(baseAmountCents: number, benefit?: { discountType: "PERCENTUAL" | "FIXO"; discountValue: number } | null) {
  if (!benefit) return baseAmountCents;
  const discount = benefit.discountType === "PERCENTUAL"
    ? Math.round((baseAmountCents * benefit.discountValue) / 10_000)
    : benefit.discountValue;
  return Math.max(0, baseAmountCents - discount);
}

export async function ensureContractCharges(admin: SupabaseClient, companyId: string, contract: ContractForCharges) {
  if (!['AGENDADO', 'ATIVO'].includes(contract.status)) return;
  const interval = 1;
  const latestDate = contract.ends_on;
  const charges: Array<Record<string, unknown>> = [];
  const enrollment = parseEnrollmentService(contract.enrollment_service_snapshot);
  const chargeCount = countCharges(contract.starts_on, contract.ends_on, interval);
  let competence = contract.starts_on;
  let guard = 0;

  while (competence <= latestDate && guard < 120) {
    if (contract.cancel_effective_on && competence >= contract.cancel_effective_on) break;
    const enrollmentFeeCents = enrollmentFeeForCharge(enrollment, guard, chargeCount);
    charges.push({
      tenant_company_id: companyId,
      contract_id: contract.id,
      student_id: contract.student_id,
      competence_on: competence,
      due_on: addMonths(contract.first_due_on, guard),
      base_amount_cents: contract.base_amount_cents,
      benefit_name_snapshot: contract.benefit_name_snapshot,
      discount_type_snapshot: contract.discount_type_snapshot,
      discount_value_snapshot: contract.discount_value_snapshot,
      enrollment_fee_cents: enrollmentFeeCents,
      amount_cents: contract.amount_cents + enrollmentFeeCents,
    });
    competence = addMonths(competence, interval);
    guard += 1;
  }

  if (!charges.length) return;
  const { error } = await admin.from("xpace_contract_charges").upsert(charges, { onConflict: "tenant_company_id,contract_id,competence_on", ignoreDuplicates: true });
  if (error) throw error;
}

export function addMonths(date: string, months: number) {
  const [year, month, day] = date.split("-").map(Number);
  const targetMonth = month - 1 + months;
  const targetYear = year + Math.floor(targetMonth / 12);
  const targetMonthNumber = (targetMonth % 12) + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonthNumber, 0)).getUTCDate();
  return `${targetYear}-${String(targetMonthNumber).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

export function todayIso() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function parseEnrollmentService(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const service = value as { salePriceCents?: unknown; chargeMode?: unknown };
  const salePriceCents = Number(service.salePriceCents);
  if (!Number.isInteger(salePriceCents) || salePriceCents <= 0) return null;
  return { salePriceCents, chargeMode: service.chargeMode === "RATEAR_PARCELAS" ? "RATEAR_PARCELAS" as const : "PRIMEIRA_PARCELA" as const };
}

function countCharges(startsOn: string, endsOn: string, intervalMonths: number) {
  let count = 0;
  let competence = startsOn;
  while (competence <= endsOn && count < 120) { count += 1; competence = addMonths(competence, intervalMonths); }
  return Math.max(1, count);
}

function enrollmentFeeForCharge(enrollment: ReturnType<typeof parseEnrollmentService>, chargeIndex: number, chargeCount: number) {
  if (!enrollment) return 0;
  if (enrollment.chargeMode === "PRIMEIRA_PARCELA") return chargeIndex === 0 ? enrollment.salePriceCents : 0;
  if (chargeIndex >= chargeCount) return 0;
  return Math.floor((enrollment.salePriceCents * (chargeIndex + 1)) / chargeCount) - Math.floor((enrollment.salePriceCents * chargeIndex) / chargeCount);
}

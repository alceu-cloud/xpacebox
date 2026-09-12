import type { SupabaseClient } from "@supabase/supabase-js";

type ContractForCharges = {
  id: string;
  student_id: string;
  starts_on: string;
  ends_on: string;
  billing_interval_snapshot: string;
  duration_months_snapshot: number;
  base_amount_cents: number;
  amount_cents: number;
  benefit_name_snapshot: string | null;
  discount_type_snapshot: "PERCENTUAL" | "FIXO" | null;
  discount_value_snapshot: number | null;
  renews_automatically: boolean;
  status: string;
  cancel_effective_on: string | null;
};

const intervalMonths: Record<string, number> = { MENSAL: 1, TRIMESTRAL: 3, SEMESTRAL: 6, ANUAL: 12 };

export function calculateDiscountedAmount(baseAmountCents: number, benefit?: { discountType: "PERCENTUAL" | "FIXO"; discountValue: number } | null) {
  if (!benefit) return baseAmountCents;
  const discount = benefit.discountType === "PERCENTUAL"
    ? Math.round((baseAmountCents * benefit.discountValue) / 10_000)
    : benefit.discountValue;
  return Math.max(0, baseAmountCents - discount);
}

export async function ensureContractCharges(admin: SupabaseClient, companyId: string, contract: ContractForCharges) {
  if (!['AGENDADO', 'ATIVO', 'PAUSADO'].includes(contract.status)) return;
  const today = todayIso();
  const interval = intervalMonths[contract.billing_interval_snapshot] ?? Math.max(1, contract.duration_months_snapshot);
  const latestDate = contract.renews_automatically ? today : minDate(today, contract.ends_on);
  const charges: Array<Record<string, unknown>> = [];
  let competence = contract.starts_on;
  let guard = 0;

  while (competence <= latestDate && guard < 120) {
    if (contract.cancel_effective_on && competence >= contract.cancel_effective_on) break;
    charges.push({
      tenant_company_id: companyId,
      contract_id: contract.id,
      student_id: contract.student_id,
      competence_on: competence,
      due_on: competence,
      base_amount_cents: contract.base_amount_cents,
      benefit_name_snapshot: contract.benefit_name_snapshot,
      discount_type_snapshot: contract.discount_type_snapshot,
      discount_value_snapshot: contract.discount_value_snapshot,
      amount_cents: contract.amount_cents,
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

function minDate(first: string, second: string) { return first < second ? first : second; }

import "server-only";
import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createAsaasPixCharge, xPayEnvironment } from "@/lib/server/xpay-asaas";

type Charge = { id: string; contract_id: string; student_id: string; amount_cents: number; due_on: string };
type Account = {
  id: string;
  provider_environment: string;
  provider_access_token_ciphertext: string | null;
  provider_access_token_iv: string | null;
  provider_access_token_auth_tag: string | null;
};
type Student = { id: string; full_name: string; cpf: string | null; email: string | null; mobile: string | null; whatsapp_opt_in: boolean };
type Contract = { id: string; plan_name_snapshot: string; payment_method: string | null };

export async function issuePendingPixCharges(admin: SupabaseClient, companyId: string, contractId?: string) {
  const result = { issued: 0, failed: 0, skipped: 0 };
  const { data: account, error: accountError } = await admin
    .from("xpace_payment_accounts")
    .select("id,provider_environment,provider_access_token_ciphertext,provider_access_token_iv,provider_access_token_auth_tag")
    .eq("tenant_company_id", companyId)
    .eq("account_status", "ATIVA")
    .is("closed_at", null)
    .maybeSingle();
  if (accountError) throw accountError;

  let chargeQuery = admin
    .from("xpace_contract_charges")
    .select("id,contract_id,student_id,amount_cents,due_on")
    .eq("tenant_company_id", companyId)
    .eq("status", "ABERTO")
    .is("provider_payment_id", null)
    .order("competence_on")
    .limit(100);
  if (contractId) chargeQuery = chargeQuery.eq("contract_id", contractId);
  const { data: pendingCharges, error: chargesError } = await chargeQuery;
  if (chargesError) throw chargesError;
  const charges = (pendingCharges ?? []) as Charge[];
  if (!charges.length) return result;

  if (!account) {
    await Promise.all(charges.map((charge) => saveIssueError(admin, companyId, charge.id, "NÃO HÁ UMA CONTA XPAY ATIVA PARA GERAR O PIX.")));
    return { ...result, failed: charges.length };
  }
  if (account.provider_environment !== xPayEnvironment()) {
    await Promise.all(charges.map((charge) => saveIssueError(admin, companyId, charge.id, "A CONTA XPAY ATIVA NÃO CORRESPONDE AO AMBIENTE ASAAS CONFIGURADO.")));
    return { ...result, failed: charges.length };
  }

  const contractIds = [...new Set(charges.map((charge) => charge.contract_id))];
  const studentIds = [...new Set(charges.map((charge) => charge.student_id))];
  const [{ data: contracts, error: contractsError }, { data: students, error: studentsError }] = await Promise.all([
    admin.from("xpace_student_contracts").select("id,plan_name_snapshot,payment_method").eq("tenant_company_id", companyId).in("id", contractIds),
    admin.from("xpace_people").select("id,full_name,cpf,email,mobile,whatsapp_opt_in").eq("tenant_company_id", companyId).in("id", studentIds),
  ]);
  if (contractsError) throw contractsError;
  if (studentsError) throw studentsError;
  const contractsById = new Map((contracts ?? []).map((contract) => [contract.id, contract as Contract]));
  const studentsById = new Map((students ?? []).map((student) => [student.id, student as Student]));

  for (const charge of charges) {
    const contract = contractsById.get(charge.contract_id);
    const student = studentsById.get(charge.student_id);
    if (contract?.payment_method !== "PIX") { result.skipped += 1; continue; }
    if (!student) { await saveIssueError(admin, companyId, charge.id, "ALUNO NÃO ENCONTRADO PARA GERAR O PIX."); result.failed += 1; continue; }

    const leaseToken = randomUUID();
    const now = new Date();
    const { data: claimed, error: claimError } = await admin.rpc("xpace_claim_pending_payment_issue", {
      p_company: companyId,
      p_charge: charge.id,
      p_account: account.id,
      p_lease_token: leaseToken,
      p_lease_until: new Date(now.getTime() + 2 * 60_000).toISOString(),
    });
    if (claimError) throw claimError;
    if (!claimed) { result.skipped += 1; continue; }

    try {
      const payment = await createAsaasPixCharge(account as Account, {
        person: { name: student.full_name, cpf: student.cpf ?? "", email: student.email ?? "", mobile: student.mobile ?? "", whatsappOptIn: student.whatsapp_opt_in },
        valueCents: charge.amount_cents,
        dueOn: charge.due_on,
        description: `XPACE · ${contract.plan_name_snapshot}`,
        externalReference: charge.id,
      });
      const { error: updateError } = await admin.from("xpace_contract_charges").update({ provider_payment_id: payment.providerPaymentId, provider_status: payment.providerStatus, pix_copy_paste: payment.pixCopyPaste || null, pix_qr_code_url: payment.pixQrCodeUrl || null, issued_at: new Date().toISOString(), provider_error: null, provider_issue_lease_token: null, provider_issue_lease_until: null, updated_at: new Date().toISOString() }).eq("id", charge.id).eq("tenant_company_id", companyId).eq("provider_issue_lease_token", leaseToken);
      if (updateError) throw updateError;
      result.issued += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : "NÃO FOI POSSÍVEL GERAR O PIX.";
      await saveIssueError(admin, companyId, charge.id, message, leaseToken);
      result.failed += 1;
    }
  }
  return result;
}

export function issuePixChargesForContract(admin: SupabaseClient, companyId: string, contractId: string) {
  return issuePendingPixCharges(admin, companyId, contractId);
}

async function saveIssueError(admin: SupabaseClient, companyId: string, chargeId: string, message: string, leaseToken?: string) {
  let query = admin.from("xpace_contract_charges").update({ provider_error: message, provider_issue_lease_token: null, provider_issue_lease_until: null, updated_at: new Date().toISOString() }).eq("id", chargeId).eq("tenant_company_id", companyId);
  if (leaseToken) query = query.eq("provider_issue_lease_token", leaseToken);
  const { error } = await query;
  if (error) throw error;
}

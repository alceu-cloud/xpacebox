import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cancelAsaasCharge, findAsaasCharges, xPayEnvironment } from "@/lib/server/xpay-asaas";

type Job = { charge_id: string; tenant_company_id: string; attempts: number; lease_token: string };

export async function processPaymentCancellations(admin: SupabaseClient, companyId?: string, contractId?: string) {
  const { data: jobs, error } = await admin.rpc("xpace_claim_cancellations", { p_company: companyId ?? null, p_contract: contractId ?? null });
  if (error) throw error;
  const result = { confirmed: 0, pending: 0, review: 0 };
  await Promise.all(((jobs ?? []) as Job[]).map(async (job) => {
    try {
      const { data: charge, error: chargeError } = await admin.from("xpace_contract_charges").select("id,status,contract_id,provider_payment_id,payment_account_id,provider_cancelled_at")
        .eq("tenant_company_id", job.tenant_company_id).eq("id", job.charge_id).single();
      if (chargeError) throw chargeError;
      if (charge.status === "RECEBIDO") {
        await finish(admin, job, "REVIEW", "PAGAMENTO RECEBIDO. REVISAR O ENCERRAMENTO; NÃO HOUVE ESTORNO."); result.review++; return;
      }
      if (charge.status !== "CANCELADO") throw new Error("CANCELAMENTO INTERROMPIDO: A COBRANÇA LOCAL NÃO ESTÁ CANCELADA.");
      if (charge.provider_cancelled_at) { await finish(admin, job, "DONE"); result.confirmed++; return; }
      let accountQuery = admin.from("xpace_payment_accounts").select("id,provider_environment,provider_access_token_ciphertext,provider_access_token_iv,provider_access_token_auth_tag").eq("tenant_company_id", job.tenant_company_id);
      accountQuery = charge.payment_account_id ? accountQuery.eq("id", charge.payment_account_id) : accountQuery;
      const { data: accounts, error: accountError } = await accountQuery;
      if (accountError) throw accountError;
      if (accounts?.length !== 1) throw new Error("NÃO FOI POSSÍVEL IDENTIFICAR COM SEGURANÇA A CONTA DESTA COBRANÇA.");
      const account = accounts[0];
      if (account.provider_environment !== xPayEnvironment()) throw new Error("A CONTA E O AMBIENTE ASAAS NÃO CORRESPONDEM.");
      const payments = charge.provider_payment_id ? [{ id: charge.provider_payment_id }] : await findAsaasCharges(account, charge.id);
      if (payments.length > 1) {
        await finish(admin, job, "REVIEW", "HÁ MAIS DE UMA COBRANÇA PARA ESTA REFERÊNCIA. CONCILIAÇÃO NECESSÁRIA."); result.review++; return;
      }
      let received = false;
      for (const candidate of payments) {
        const payment = await cancelAsaasCharge(account, candidate.id);
        const paid = !payment.deleted && ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(payment.status ?? "");
        // Recover IDs lost between provider creation and QR generation.
        if (!charge.provider_payment_id) {
          const { error: linkError } = await admin.from("xpace_contract_charges").update({ provider_payment_id: candidate.id, payment_account_id: account.id })
            .eq("id", charge.id).eq("tenant_company_id", job.tenant_company_id).is("provider_payment_id", null);
          if (linkError) throw linkError;
        }
        const { error: syncError } = await admin.rpc("xpace_sync_payment", { p_account: account.id, p_payment: payment, p_event: payment.deleted ? "PAYMENT_DELETED" : "PAYMENT_RECEIVED" });
        if (syncError) throw syncError;
        received ||= paid;
      }
      if (received) {
        await finish(admin, job, "REVIEW", "PAGAMENTO IDENTIFICADO NO ASAAS. RECEBIMENTO PRESERVADO; REVISAR O ENCERRAMENTO."); result.review++;
      } else {
        const { error: cleanError } = await admin.from("xpace_contract_charges").update({ provider_cancelled_at: payments.length ? new Date().toISOString() : null, provider_error: null, pix_copy_paste: null, pix_qr_code_url: null })
          .eq("id", charge.id).eq("tenant_company_id", job.tenant_company_id).eq("status", "CANCELADO");
        if (cleanError) throw cleanError;
        await finish(admin, job, "DONE"); result.confirmed++;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0,500) : "FALHA AO CONFIRMAR CANCELAMENTO NO ASAAS.";
      const { error: retryError } = await admin.from("xpace_payment_cancellations").update({ status: "PENDING", last_error: message, next_attempt_at: new Date(Date.now() + Math.min(3600,30 * 2 ** Math.min(job.attempts,7)) * 1000).toISOString(), lease_until: null })
        .eq("charge_id", job.charge_id).eq("lease_token", job.lease_token);
      if (retryError) throw retryError;
      result.pending++;
    }
  }));
  return result;
}

async function finish(admin: SupabaseClient, job: Job, status: "DONE" | "REVIEW", error: string | null = null) {
  const { error: updateError } = await admin.from("xpace_payment_cancellations").update({ status, last_error: error, completed_at: new Date().toISOString(), lease_until: null })
    .eq("charge_id", job.charge_id).eq("lease_token", job.lease_token);
  if (updateError) throw updateError;
}

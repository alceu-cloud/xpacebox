import "server-only";
import { accountModeForCompany, CommercialError } from "@/lib/saas/commercial";
import { encryptIntegrationCredential } from "@/lib/server/telephony-credentials";
import type { XPayRegistration } from "@/lib/server/xpay-asaas";

// Separate from the legacy XPay client: never falls back to its production key.
// Not connected to any cron or live checkout. Test runner must acquire a persisted
// operation lease and reconcile ambiguous results before invoking any write again.
export function createSaasAsaasSandboxClient(key: string, fetcher: typeof fetch = fetch) {
  if (!key || process.env.SAAS_ASAAS_SANDBOX_ENABLED !== "true") throw new CommercialError("TESTE ASAAS AINDA NÃO AUTORIZADO NO SERVIDOR.", 409);
  async function call(path: string, body?: object): Promise<Record<string, any>> {
    let response: Response;
    try {
      response = await fetcher(`https://api-sandbox.asaas.com/v3${path}`, { method: body ? "POST" : "GET", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15_000), headers: { "access_token": key, "content-type": "application/json", "user-agent": "XPACEBOX-SaaS-Test/1.0" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    } catch { throw new CommercialError(body ? "ASAAS_RESULTADO_INCERTO. CONFERIR NO PROVEDOR SEM REPETIR O POST." : "ASAAS_CONSULTA_INDISPONIVEL.", 503); }
    const result = await response.json().catch(() => null);
    if (!response.ok || !result || typeof result !== "object") throw new CommercialError(body ? "ASAAS_REVISAR_RESULTADO. NENHUMA RETENTATIVA AUTOMÁTICA." : "ASAAS_CONSULTA_INDISPONIVEL.", 502);
    return result;
  }
  return {
    async inspectParent() {
      const result = await call("/myAccount/commercialInfo");
      // Used server-side to verify the legal entity; never return raw account data to browser.
      return { document: String(result.cpfCnpj || "").replace(/\D/g, "") };
    },
    async createChild(companyId: string, ownerCompanyId: string, registration: XPayRegistration) {
      if (accountModeForCompany(companyId, ownerCompanyId) === "PARENT") throw new CommercialError("XPACE USA A CONTA MÃE. NÃO CRIAR SUBCONTA.", 409);
      const doc = registration.documentNumber.replace(/\D/g, "");
      if (registration.legalEntityType !== "PJ" || doc.length !== 14 || !registration.companyType || !registration.legalName || !registration.email || !registration.mobilePhone || !Number.isSafeInteger(registration.monthlyIncomeCents) || registration.monthlyIncomeCents < 0 || !/^\d{8}$/.test(registration.postalCode.replace(/\D/g, "")) || !registration.address || !registration.addressNumber || !registration.neighborhood) throw new CommercialError("DADOS EMPRESARIAIS INCOMPLETOS PARA O TESTE.");
      const parent = await call("/myAccount/commercialInfo");
      if (!parent.cpfCnpj || String(parent.cpfCnpj).replace(/\D/g, "") === doc) throw new CommercialError("NÃO DUPLICAR O DOCUMENTO DA CONTA MÃE.", 409);
      const found = await call(`/accounts?cpfCnpj=${encodeURIComponent(doc)}&limit=1`);
      if (found.data?.length) throw new CommercialError("SUBCONTA JÁ EXISTE. RECONCILIAR, NÃO CRIAR OUTRA.", 409);
      const result = await call("/accounts", { name: registration.legalName, email: registration.email, cpfCnpj: doc, companyType: registration.companyType, mobilePhone: registration.mobilePhone.replace(/\D/g, ""), incomeValue: registration.monthlyIncomeCents / 100, address: registration.address, addressNumber: registration.addressNumber, province: registration.neighborhood, postalCode: registration.postalCode.replace(/\D/g, ""), complement: registration.complement || undefined });
      if (typeof result.id !== "string" || typeof result.apiKey !== "string" || typeof result.walletId !== "string") throw new CommercialError("SUBCONTA COM RESULTADO INCERTO. REVISÃO NECESSÁRIA.", 502);
      return { accountId: result.id, walletId: result.walletId, encryptedKey: encryptIntegrationCredential(result.apiKey) };
    },
    async simulateSubscription(companyId: string, ownerCompanyId: string, input: { customerId: string; monthlyCents: number; dueOn: string; reference: string }) {
      if (companyId === ownerCompanyId) throw new CommercialError("XPACE É ISENTA DE MENSALIDADE.", 409);
      if (!/^cus_[A-Za-z0-9]+$/.test(input.customerId) || !Number.isSafeInteger(input.monthlyCents) || input.monthlyCents <= 0 || input.monthlyCents > 100_000_000 || !/^\d{4}-\d{2}-\d{2}$/.test(input.dueOn) || !/^saas:[a-f0-9-]{36}$/.test(input.reference)) throw new CommercialError("DADOS DA ASSINATURA DE TESTE INVÁLIDOS.");
      const found = await call(`/subscriptions?externalReference=${encodeURIComponent(input.reference)}&limit=2`);
      if (found.data?.length) {
        if (found.data.length !== 1 || found.data[0].customer !== input.customerId || Math.round(found.data[0].value * 100) !== input.monthlyCents) throw new CommercialError("REFERÊNCIA COM DADOS DIVERGENTES. CONFERIR ASSINATURA.", 409);
        return { subscriptionId: found.data[0].id, alreadyExists: true, paid: false };
      }
      // SaaS revenue belongs to parent, not to the school's subaccount. No split,
      // commission, payment-card data, automatic access or live recurring job here.
      const result = await call("/subscriptions", { customer: input.customerId, billingType: "PIX", value: input.monthlyCents / 100, nextDueDate: input.dueOn, cycle: "MONTHLY", externalReference: input.reference, description: "XPACEBOX - teste de assinatura SaaS" });
      if (typeof result.id !== "string") throw new CommercialError("ASSINATURA COM RESULTADO INCERTO. REVISÃO NECESSÁRIA.", 502);
      return { subscriptionId: result.id, alreadyExists: false, paid: false };
    },
  };
}

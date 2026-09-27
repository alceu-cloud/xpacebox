import "server-only";

import { getAsaasInvoiceUrl } from "@/lib/server/xpay-asaas";
import { requireCompanyAccess } from "@/lib/server/company-access";

type Access = Awaited<ReturnType<typeof requireCompanyAccess>>;

export async function saleLinks(access: Access, saleId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(saleId)) throw new Error("VENDA INVÁLIDA.");
  const { data: sale, error: saleError } = await access.admin.from("xpace_contract_sales")
    .select("id,student_id,contract_id,signature_required,signature_status,signature_url,status")
    .eq("id", saleId).eq("tenant_company_id", access.company.id).maybeSingle();
  if (saleError) throw saleError;
  if (!sale) throw new Error("VENDA NÃO ENCONTRADA NESTA ESCOLA.");
  if (sale.status === "CANCELADA") throw new Error("VENDA CANCELADA: NÃO É POSSÍVEL ENVIAR LINKS DESTA VENDA.");
  const { data: person, error: personError } = await access.admin.from("xpace_people")
    .select("id,full_name,mobile,email,whatsapp_opt_in")
    .eq("id", sale.student_id).eq("tenant_company_id", access.company.id).maybeSingle();
  if (personError) throw personError;
  if (!person) throw new Error("CLIENTE NÃO ENCONTRADO NESTA ESCOLA.");
  const { data: charge, error: chargeError } = await access.admin.from("xpace_contract_charges")
    .select("id,provider_payment_id,payment_account_id,status,due_on")
    .eq("tenant_company_id", access.company.id).eq("contract_id", sale.contract_id)
    .eq("status", "ABERTO").not("provider_payment_id", "is", null)
    .order("due_on", { ascending: true }).limit(1).maybeSingle();
  if (chargeError) throw chargeError;
  let paymentUrl = "";
  let paymentError = "";
  if (charge?.provider_payment_id && charge.payment_account_id) {
    const { data: account, error: accountError } = await access.admin.from("xpace_payment_accounts")
      .select("id,provider_access_token_ciphertext,provider_access_token_iv,provider_access_token_auth_tag")
      .eq("id", charge.payment_account_id).eq("tenant_company_id", access.company.id).maybeSingle();
    if (accountError) throw accountError;
    if (account) {
      try { paymentUrl = await getAsaasInvoiceUrl(account, charge.provider_payment_id); }
      catch (error) { paymentError = error instanceof Error ? error.message : "NÃO FOI POSSÍVEL CONSULTAR O LINK NO ASAAS."; }
    }
  }
  return {
    sale, person, charge, paymentError,
    links: {
      ASSINATURA: sale.signature_required && sale.signature_status !== "ASSINADA" && /^https:\/\//.test(sale.signature_url ?? "") ? sale.signature_url as string : "",
      COBRANCA: paymentUrl,
    },
  };
}

export function xpaceLinkMessage(name: string, kind: "ASSINATURA" | "COBRANCA", url: string) {
  const firstName = name.trim().split(/\s+/)[0] || "cliente";
  return kind === "ASSINATURA"
    ? `Olá, ${firstName}! Segue o link para assinar seu contrato da XPACE: ${url}`
    : `Olá, ${firstName}! Segue o link da sua cobrança XPACE: ${url}`;
}

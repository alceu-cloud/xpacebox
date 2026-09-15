import "server-only";

import { decryptIntegrationCredential, encryptIntegrationCredential } from "@/lib/server/telephony-credentials";

type XPayEnvironment = "SANDBOX" | "PRODUCAO";

export type XPayRegistration = {
  legalEntityType: "PJ" | "PF";
  companyType?: "MEI" | "LIMITED" | "INDIVIDUAL" | "ASSOCIATION";
  legalName: string;
  tradeName?: string;
  documentNumber: string;
  email: string;
  phone?: string;
  mobilePhone: string;
  monthlyIncomeCents: number;
  postalCode: string;
  address: string;
  addressNumber: string;
  neighborhood: string;
  complement?: string;
  responsibleName?: string;
  responsibleDocument?: string;
  responsibleBirthDate?: string;
};

type AsaasSubaccountResponse = { id?: string; walletId?: string; apiKey?: string; errors?: Array<{ code?: string; description?: string }> };

export function xPayEnvironment(): XPayEnvironment {
  return process.env.XPAY_ASAAS_ENVIRONMENT === "production" ? "PRODUCAO" : "SANDBOX";
}

export function xPayConfiguration() {
  const parentApiKey = process.env.XPAY_ASAAS_PARENT_API_KEY?.trim() ?? "";
  const integrationKey = process.env.INTEGRATION_CREDENTIAL_ENCRYPTION_KEY?.trim() ?? "";
  const baseUrl = xPayEnvironment() === "PRODUCAO" ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3";
  const webhookBaseUrl = process.env.XPAY_ASAAS_WEBHOOK_BASE_URL?.replace(/\/$/, "") ?? "";
  const webhookToken = process.env.XPAY_ASAAS_WEBHOOK_TOKEN?.trim() ?? "";
  return { baseUrl, parentApiKey, integrationKey, webhookBaseUrl, webhookToken, configured: Boolean(parentApiKey && integrationKey) };
}

export async function createAsaasSubaccount(registration: XPayRegistration, localAccountId: string) {
  const config = xPayConfiguration();
  if (!config.parentApiKey || !config.integrationKey) throw new XPayProviderError("CONECTE A CONTA-PAI DO ASAAS NO AMBIENTE SEGURO ANTES DE CADASTRAR UMA CONTA XPAY.", 503);

  const existing = await asaasRequest<{ data?: Array<{ id?: string }> }>(`/accounts?cpfCnpj=${encodeURIComponent(digits(registration.documentNumber))}`, config.parentApiKey, { method: "GET" });
  if (existing.data?.some((account) => account.id)) throw new XPayProviderError("JÁ EXISTE UMA SUBCONTA ASAAS PARA ESTE CPF/CNPJ. IMPORTE-A OU USE OUTRO DOCUMENTO.", 409);

  const webhook = config.webhookBaseUrl && config.webhookToken.length >= 32 ? [{
    name: "XPay - eventos financeiros",
    url: `${config.webhookBaseUrl}/api/webhooks/xpay/asaas/${localAccountId}`,
    email: registration.email,
    sendType: "SEQUENTIALLY",
    interrupted: false,
    enabled: true,
    apiVersion: 3,
    authToken: config.webhookToken,
    events: ["PAYMENT_CREATED", "PAYMENT_UPDATED", "PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"],
  }] : undefined;

  const body = {
    name: registration.legalName,
    email: registration.email,
    cpfCnpj: digits(registration.documentNumber),
    ...(registration.legalEntityType === "PJ" ? { companyType: registration.companyType } : { birthDate: registration.responsibleBirthDate }),
    phone: digits(registration.phone ?? "") || undefined,
    mobilePhone: digits(registration.mobilePhone),
    incomeValue: registration.monthlyIncomeCents / 100,
    address: registration.address,
    addressNumber: registration.addressNumber,
    complement: registration.complement || undefined,
    province: registration.neighborhood,
    postalCode: digits(registration.postalCode),
    webhooks: webhook,
  };
  const response = await asaasRequest<AsaasSubaccountResponse>("/accounts", config.parentApiKey, { method: "POST", body: JSON.stringify(body) });
  if (!response.id || !response.apiKey) throw new XPayProviderError(providerMessage(response) || "O ASAAS NÃO RETORNOU A CREDENCIAL DA SUBCONTA.", 502);
  return { providerAccountId: response.id, providerWalletId: response.walletId ?? "", encryptedToken: encryptIntegrationCredential(response.apiKey) };
}

export async function pendingDocumentsForAccount(account: { provider_access_token_ciphertext: string | null; provider_access_token_iv: string | null; provider_access_token_auth_tag: string | null }) {
  const apiKey = decryptAccountToken(account);
  return asaasRequest<{ data?: Array<{ id?: string; type?: string; status?: string; onboardingUrl?: string }> }>("/myAccount/documents", apiKey, { method: "GET" });
}

export async function statusForAccount(account: { provider_access_token_ciphertext: string | null; provider_access_token_iv: string | null; provider_access_token_auth_tag: string | null }) {
  const apiKey = decryptAccountToken(account);
  return asaasRequest<{ general?: string; errors?: Array<{ description?: string }> }>("/myAccount/status", apiKey, { method: "GET" });
}

export class XPayProviderError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}

function decryptAccountToken(account: { provider_access_token_ciphertext: string | null; provider_access_token_iv: string | null; provider_access_token_auth_tag: string | null }) {
  if (!account.provider_access_token_ciphertext || !account.provider_access_token_iv || !account.provider_access_token_auth_tag) throw new XPayProviderError("A CREDENCIAL DESTA CONTA XPAY NÃO ESTÁ DISPONÍVEL.", 409);
  return decryptIntegrationCredential({ ciphertext: account.provider_access_token_ciphertext, iv: account.provider_access_token_iv, authTag: account.provider_access_token_auth_tag });
}

async function asaasRequest<T>(path: string, accessToken: string, init: RequestInit): Promise<T> {
  const config = xPayConfiguration();
  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}${path}`, { ...init, headers: { accept: "application/json", "content-type": "application/json", access_token: accessToken, "user-agent": "XPACE-XPay/1.0", ...init.headers }, cache: "no-store" });
  } catch {
    throw new XPayProviderError("NÃO FOI POSSÍVEL CONECTAR AO ASAAS. TENTE NOVAMENTE.", 503);
  }
  const payload = await response.json().catch(() => ({})) as T & { errors?: Array<{ description?: string; code?: string }> };
  if (!response.ok) throw new XPayProviderError(providerMessage(payload) || "O ASAAS RECUSOU ESTA OPERAÇÃO.", response.status >= 400 && response.status < 500 ? response.status : 502);
  return payload;
}

function providerMessage(payload: { errors?: Array<{ description?: string }> }) { const message = payload.errors?.map((item) => item.description).filter(Boolean).join(" ") ?? ""; const normalized = message.toLowerCase(); if (normalized.includes("mesmo padrão") && normalized.includes("cnpj da conta principal")) return "USE UM CNPJ DIFERENTE DO CNPJ DA CONTA-MÃE PARA CRIAR A SUBCONTA DE TESTE."; if (normalized.includes("email") && normalized.includes("já está em uso")) return "USE UM E-MAIL DIFERENTE DO E-MAIL DA CONTA-MÃE PARA CRIAR A SUBCONTA DE TESTE."; return message; }
function digits(value: string) { return value.replace(/\D/g, ""); }

import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";
import { createAsaasSubaccount, pendingDocumentsForAccount, statusForAccount, xPayConfiguration, xPayEnvironment, XPayProviderError, type XPayRegistration } from "@/lib/server/xpay-asaas";

const companySlug = "xpace";
type RequestBody = { action?: "CREATE_SUBACCOUNT" | "CANCEL_ACCOUNT" | "CHECK_DOCUMENTS" | "SYNC_STATUS"; accountId?: string; registration?: Partial<XPayRegistration> };
type CurrentAccount = { id: string; tenant_company_id: string; account_status: string; created_at: string; provider_access_token_ciphertext: string | null; provider_access_token_iv: string | null; provider_access_token_auth_tag: string | null };

export async function GET(request: Request) {
  try {
    const access = await requireCompanyAccess(request, companySlug);
    const { data, error } = await access.admin.from("xpace_payment_accounts").select("id,provider,provider_environment,account_label,account_status,provider_account_id,provider_wallet_id,legal_entity_type,company_type,legal_name,trade_name,document_number,email,phone,mobile_phone,monthly_income_cents,postal_code,address,address_number,neighborhood,complement,responsible_name,responsible_document,responsible_birth_date,onboarding_requested_at,last_provider_status_at,provider_status_note,closed_at,created_at").eq("tenant_company_id", access.company.id).order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ success: true, providerConfigured: xPayConfiguration().configured, environment: xPayEnvironment(), accounts: (data ?? []).map(serializeAccount) });
  } catch (error) { return handleError(error); }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const access = await requireCompanyAccess(request, companySlug);
    requireManager(access.profile.platform_role);
    if (body.action === "CREATE_SUBACCOUNT") return createSubaccount(access, body.registration);
    if (body.action === "CHECK_DOCUMENTS") return checkDocuments(access, body.accountId);
    if (body.action === "SYNC_STATUS") return syncStatus(access, body.accountId);
    throw new RequestError("AÇÃO XPAY INVÁLIDA.", 400);
  } catch (error) { return handleError(error); }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const access = await requireCompanyAccess(request, companySlug);
    requireManager(access.profile.platform_role);
    if (body.action === "CANCEL_ACCOUNT") return cancelAccount(access, body.accountId);
    throw new RequestError("ATUALIZAÇÃO XPAY INVÁLIDA.", 400);
  } catch (error) { return handleError(error); }
}

async function createSubaccount(access: Awaited<ReturnType<typeof requireCompanyAccess>>, input?: Partial<XPayRegistration>) {
  const registration = normalizeRegistration(input);
  validateRegistration(registration);
  const { data: current, error: currentError } = await access.admin.from("xpace_payment_accounts").select("id").eq("tenant_company_id", access.company.id).is("closed_at", null).maybeSingle();
  if (currentError) throw currentError;
  if (current) throw new RequestError("CANCELE A CONTA XPAY ATUAL ANTES DE CADASTRAR OUTRA.", 409);

  const id = randomUUID();
  const provider = await createAsaasSubaccount(registration, id);
  const { data, error } = await access.admin.from("xpace_payment_accounts").insert({
    id,
    tenant_company_id: access.company.id,
    provider: "ASAAS",
    provider_environment: xPayEnvironment(),
    account_label: "XPAY",
    account_status: "PENDENTE_DOCUMENTOS",
    provider_account_id: provider.providerAccountId,
    provider_wallet_id: provider.providerWalletId || null,
    provider_access_token_ciphertext: provider.encryptedToken.ciphertext,
    provider_access_token_iv: provider.encryptedToken.iv,
    provider_access_token_auth_tag: provider.encryptedToken.authTag,
    legal_entity_type: registration.legalEntityType,
    company_type: registration.legalEntityType === "PJ" ? registration.companyType : null,
    legal_name: registration.legalName,
    trade_name: registration.tradeName || null,
    document_number: digits(registration.documentNumber),
    email: registration.email,
    phone: digits(registration.phone ?? "") || null,
    mobile_phone: digits(registration.mobilePhone),
    monthly_income_cents: registration.monthlyIncomeCents,
    postal_code: digits(registration.postalCode),
    address: registration.address,
    address_number: registration.addressNumber,
    neighborhood: registration.neighborhood,
    complement: registration.complement || null,
    responsible_name: registration.responsibleName || null,
    responsible_document: digits(registration.responsibleDocument ?? "") || null,
    responsible_birth_date: registration.responsibleBirthDate || null,
    created_by: access.user.id,
    updated_by: access.user.id,
  }).select("id,provider,provider_environment,account_label,account_status,provider_account_id,provider_wallet_id,legal_entity_type,company_type,legal_name,trade_name,document_number,email,phone,mobile_phone,monthly_income_cents,postal_code,address,address_number,neighborhood,complement,responsible_name,responsible_document,responsible_birth_date,onboarding_requested_at,last_provider_status_at,provider_status_note,closed_at,created_at").single();
  if (error) throw error;
  return NextResponse.json({ success: true, account: serializeAccount(data) }, { status: 201 });
}

async function cancelAccount(access: Awaited<ReturnType<typeof requireCompanyAccess>>, accountId?: string) {
  const account = await currentAccount(access, accountId);
  const { error } = await access.admin.from("xpace_payment_accounts").update({ account_status: "CANCELADA", closed_at: new Date().toISOString(), closed_by: access.user.id, provider_access_token_ciphertext: null, provider_access_token_iv: null, provider_access_token_auth_tag: null, provider_status_note: "INTEGRAÇÃO XPAY ENCERRADA PELO GESTOR.", updated_by: access.user.id, updated_at: new Date().toISOString() }).eq("id", account.id).eq("tenant_company_id", access.company.id);
  if (error) throw error;
  return NextResponse.json({ success: true });
}

async function checkDocuments(access: Awaited<ReturnType<typeof requireCompanyAccess>>, accountId?: string) {
  const account = await currentAccount(access, accountId, true);
  const elapsed = Date.now() - new Date(account.created_at).getTime();
  if (elapsed < 15_000) throw new RequestError("AGUARDE ALGUNS SEGUNDOS. O ASAAS AINDA ESTÁ PREPARANDO AS PENDÊNCIAS DOCUMENTAIS.", 409);
  const result = await pendingDocumentsForAccount(account);
  const { error } = await access.admin.from("xpace_payment_accounts").update({ onboarding_requested_at: new Date().toISOString(), updated_by: access.user.id, updated_at: new Date().toISOString() }).eq("id", account.id).eq("tenant_company_id", access.company.id);
  if (error) throw error;
  return NextResponse.json({ success: true, documents: (result.data ?? []).map((document) => ({ id: document.id ?? "", type: document.type ?? "DOCUMENTO", status: document.status ?? "PENDENTE", onboardingUrl: document.onboardingUrl ?? "" })) });
}

async function syncStatus(access: Awaited<ReturnType<typeof requireCompanyAccess>>, accountId?: string) {
  const account = await currentAccount(access, accountId, true);
  const result = await statusForAccount(account);
  const status = result.general === "APPROVED" ? "ATIVA" : result.general === "REJECTED" ? "REJEITADA" : account.account_status;
  const { data, error } = await access.admin.from("xpace_payment_accounts").update({ account_status: status, last_provider_status_at: new Date().toISOString(), provider_status_note: result.general ?? "STATUS NÃO INFORMADO", updated_by: access.user.id, updated_at: new Date().toISOString() }).eq("id", account.id).eq("tenant_company_id", access.company.id).select("id,provider,provider_environment,account_label,account_status,provider_account_id,provider_wallet_id,legal_entity_type,company_type,legal_name,trade_name,document_number,email,phone,mobile_phone,monthly_income_cents,postal_code,address,address_number,neighborhood,complement,responsible_name,responsible_document,responsible_birth_date,onboarding_requested_at,last_provider_status_at,provider_status_note,closed_at,created_at").single();
  if (error) throw error;
  return NextResponse.json({ success: true, account: serializeAccount(data) });
}

async function currentAccount(access: Awaited<ReturnType<typeof requireCompanyAccess>>, accountId?: string, includeCredential = false) {
  const columns = `${includeCredential ? "provider_access_token_ciphertext,provider_access_token_iv,provider_access_token_auth_tag," : ""}id,tenant_company_id,account_status,created_at`;
  const { data, error } = await access.admin.from("xpace_payment_accounts").select(columns).eq("id", accountId ?? "").eq("tenant_company_id", access.company.id).is("closed_at", null).maybeSingle();
  if (error) throw error;
  const account = data as unknown as CurrentAccount | null;
  if (!account) throw new RequestError("CONTA XPAY ATUAL NÃO ENCONTRADA.", 404);
  return account;
}

function normalizeRegistration(input?: Partial<XPayRegistration>): XPayRegistration {
  return {
    legalEntityType: input?.legalEntityType === "PF" ? "PF" : "PJ",
    companyType: input?.companyType,
    legalName: clean(input?.legalName), tradeName: clean(input?.tradeName), documentNumber: digits(input?.documentNumber ?? ""), email: clean(input?.email, false).toLowerCase(), phone: digits(input?.phone ?? ""), mobilePhone: digits(input?.mobilePhone ?? ""), monthlyIncomeCents: Number(input?.monthlyIncomeCents), postalCode: digits(input?.postalCode ?? ""), address: clean(input?.address), addressNumber: clean(input?.addressNumber), neighborhood: clean(input?.neighborhood), complement: clean(input?.complement), responsibleName: clean(input?.responsibleName), responsibleDocument: digits(input?.responsibleDocument ?? ""), responsibleBirthDate: clean(input?.responsibleBirthDate),
  };
}

function validateRegistration(registration: XPayRegistration) {
  const documentLength = registration.documentNumber.length;
  if (!registration.legalName || !registration.email || !registration.mobilePhone || !registration.postalCode || !registration.address || !registration.addressNumber || !registration.neighborhood) throw new RequestError("PREENCHA OS DADOS OBRIGATÓRIOS DA CONTA XPAY.", 400);
  if ((registration.legalEntityType === "PJ" && documentLength !== 14) || (registration.legalEntityType === "PF" && documentLength !== 11)) throw new RequestError("INFORME UM CPF OU CNPJ VÁLIDO.", 400);
  if (registration.legalEntityType === "PJ" && !(["MEI", "LIMITED", "INDIVIDUAL", "ASSOCIATION"] as const).includes(registration.companyType as "MEI" | "LIMITED" | "INDIVIDUAL" | "ASSOCIATION")) throw new RequestError("SELECIONE O TIPO DA EMPRESA.", 400);
  if (!registration.responsibleName || registration.responsibleDocument?.length !== 11 || !/^\d{4}-\d{2}-\d{2}$/.test(registration.responsibleBirthDate ?? "")) throw new RequestError("INFORME OS DADOS VÁLIDOS DO RESPONSÁVEL ADMINISTRATIVO.", 400);
  if (!Number.isInteger(registration.monthlyIncomeCents) || registration.monthlyIncomeCents <= 0) throw new RequestError("INFORME O FATURAMENTO MÉDIO MENSAL.", 400);
}

function serializeAccount(account: Record<string, unknown>) {
  return { id: account.id, provider: account.provider, environment: account.provider_environment, label: account.account_label, status: account.account_status, providerAccountId: account.provider_account_id, providerWalletId: account.provider_wallet_id, legalEntityType: account.legal_entity_type, companyType: account.company_type, legalName: account.legal_name, tradeName: account.trade_name ?? "", documentNumber: maskDocument(String(account.document_number ?? "")), email: account.email, phone: account.phone ?? "", mobilePhone: account.mobile_phone, monthlyIncomeCents: account.monthly_income_cents, postalCode: account.postal_code, address: account.address, addressNumber: account.address_number, neighborhood: account.neighborhood, complement: account.complement ?? "", responsibleName: account.responsible_name ?? "", responsibleDocument: maskDocument(String(account.responsible_document ?? "")), responsibleBirthDate: account.responsible_birth_date ?? "", onboardingRequestedAt: account.onboarding_requested_at, lastProviderStatusAt: account.last_provider_status_at, providerStatusNote: account.provider_status_note ?? "", closedAt: account.closed_at, createdAt: account.created_at };
}

function requireManager(role: string) { if (!['platform_owner', 'company_manager'].includes(role)) throw new AccessError("APENAS GESTORES PODEM ADMINISTRAR A CONTA XPAY.", 403); }
function clean(value?: string, uppercase = true) { const normalized = value?.trim().replace(/\s+/g, " ") ?? ""; return uppercase ? normalized.toLocaleUpperCase("pt-BR") : normalized; }
function digits(value: string) { return value.replace(/\D/g, ""); }
function maskDocument(value: string) { return value.length === 14 ? `${value.slice(0, 2)}.***.***/****-${value.slice(-2)}` : value.length === 11 ? `***.***.***-${value.slice(-2)}` : ""; }
class RequestError extends Error { constructor(message: string, public status: number) { super(message); } }
function handleError(error: unknown) {
  if (error instanceof AccessError || error instanceof RequestError || error instanceof XPayProviderError) return NextResponse.json({ success: false, message: error.message }, { status: error.status });
  if ((error as { code?: string })?.code === "23505") return NextResponse.json({ success: false, message: "JÁ EXISTE UMA CONTA XPAY ATUAL PARA ESTA ESCOLA.", }, { status: 409 });
  console.error("XPAY API ERROR", error);
  return NextResponse.json({ success: false, message: "NÃO FOI POSSÍVEL ATUALIZAR A CONTA XPAY." }, { status: 500 });
}

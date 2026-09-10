import { NextResponse } from "next/server";

import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";
import type { ClientFormData } from "@/types/clientes";

export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const slug = searchParams.get("slug")?.trim() ?? "";
    const historyClientId = searchParams.get("historyClientId")?.trim() ?? "";
    if (!slug) return failure("EMPRESA NAO INFORMADA.", 400);

    const { admin, company } = await requireCompanyAccess(request, slug);
    if (historyClientId) {
      const { data: client, error: clientError } = await admin
        .from("clients")
        .select("id")
        .eq("id", historyClientId)
        .eq("tenant_company_id", company.id)
        .eq("active", true)
        .maybeSingle();
      if (clientError) throw clientError;
      if (!client) return failure("CLIENTE NAO ENCONTRADO.", 404);
      return NextResponse.json({ success: true, history: await loadClientChangeHistory(admin, historyClientId) });
    }
    const { data, error } = await admin
      .from("clients")
      .select("*")
      .eq("tenant_company_id", company.id)
      .eq("active", true)
      .order("legal_name");

    if (error) throw error;
    return NextResponse.json({ success: true, clients: await enrichClients(admin, data ?? []) });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { slug?: string; client?: ClientFormData };
    const slug = body.slug?.trim() ?? "";
    const client = normalizeClient(body.client);
    validateClient(slug, client);

    const { admin, company, user } = await requireCompanyAccess(request, slug);
    await validateRelations(admin, company.id, client);

    const { data, error } = await admin
      .from("clients")
      .insert({
        ...toDatabase(client),
        tenant_company_id: company.id,
        created_by: user.id,
      })
      .select("*")
      .single();

    if (error) throw error;
    const [saved] = await enrichClients(admin, [data]);
    return NextResponse.json({ success: true, client: saved, syncedProductFichas: [] }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as { slug?: string; client?: ClientFormData };
    const slug = body.slug?.trim() ?? "";
    const client = normalizeClient(body.client);
    validateClient(slug, client, true);

    const { admin, company, user } = await requireCompanyAccess(request, slug);
    await validateRelations(admin, company.id, client);

    const { data, error } = await admin
      .from("clients")
      .update({ ...toDatabase(client), updated_by: user.id, updated_at: new Date().toISOString() })
      .eq("id", client.id)
      .eq("tenant_company_id", company.id)
      .select("*")
      .single();

    if (error) throw error;
    const [saved] = await enrichClients(admin, [data]);
    const { data: settings, error: settingsError } = await admin
      .from("company_manager_settings")
      .select("data")
      .eq("tenant_company_id", company.id)
      .maybeSingle();
    if (settingsError) throw settingsError;
    const productFichas = (settings?.data as { productFichas?: unknown } | null)?.productFichas;
    const syncedProductFichas = Array.isArray(productFichas)
      ? productFichas.filter((item) => (item as { clientId?: string }).clientId === client.id)
      : [];
    return NextResponse.json({ success: true, client: saved, syncedProductFichas });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as { slug?: string; id?: string };
    const slug = body.slug?.trim() ?? "";
    if (!slug || !body.id) return failure("CLIENTE NAO INFORMADO.", 400);

    const { admin, company, user } = await requireCompanyAccess(request, slug);
    const { error } = await admin
      .from("clients")
      .update({ active: false, updated_by: user.id, updated_at: new Date().toISOString() })
      .eq("id", body.id)
      .eq("tenant_company_id", company.id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error);
  }
}

function normalizeClient(value?: ClientFormData): ClientFormData {
  const client = value ?? ({} as ClientFormData);
  return Object.fromEntries(
    Object.entries(client).map(([key, field]) => [key, typeof field === "string" ? field.trim() : field])
  ) as ClientFormData;
}

function validateClient(slug: string, client: ClientFormData, editing = false) {
  if (!slug) throw new RequestError("EMPRESA NAO INFORMADA.", 400);
  if (editing && !client.id) throw new RequestError("CLIENTE NAO INFORMADO.", 400);
  if (!client.legalName || !client.cnpj || !client.sellerCompanyId) {
    throw new RequestError("PREENCHA CNPJ, NOME E EMPRESA ATENDENTE.", 400);
  }
  if (digits(client.cnpj).length !== 14) throw new RequestError("CNPJ INVALIDO.", 400);
}

async function validateRelations(admin: ReturnType<typeof import("@/lib/server/supabase-admin").createSupabaseAdmin>, companyId: string, client: ClientFormData) {
  const { data: seller } = await admin
    .from("seller_companies")
    .select("id")
    .eq("id", client.sellerCompanyId)
    .eq("tenant_company_id", companyId)
    .eq("active", true)
    .maybeSingle();
  if (!seller) throw new RequestError("EMPRESA ATENDENTE INVALIDA.", 400);

  if (client.representativeUserId) {
    const { data: representative } = await admin
      .from("profiles")
      .select("id, platform_role")
      .eq("id", client.representativeUserId)
      .eq("active", true)
      .maybeSingle();

    if (!representative) throw new RequestError("REPRESENTANTE INVALIDO.", 400);

    // Administradores da plataforma aparecem na lista de representantes mesmo
    // sem um registro de membro vinculado a esta empresa.
    if (representative.platform_role !== "platform_owner") {
      const { data: membership } = await admin
        .from("company_members")
        .select("profile_id")
        .eq("profile_id", client.representativeUserId)
        .eq("company_id", companyId)
        .eq("active", true)
        .maybeSingle();
      if (!membership) throw new RequestError("REPRESENTANTE INVALIDO.", 400);
    }
  }
}

function toDatabase(client: ClientFormData) {
  return {
    legal_name: client.legalName,
    trade_name: client.tradeName || null,
    buyer_name: client.buyerName || null,
    whatsapp: client.whatsapp || null,
    cnpj: digits(client.cnpj),
    state_registration: client.stateRegistration || null,
    phone: client.phone || null,
    purchase_email: (client.purchaseEmail || "").toLowerCase() || null,
    invoice_email: (client.invoiceEmail || "").toLowerCase() || null,
    street: client.street || null,
    street_number: client.streetNumber || null,
    complement: client.complement || null,
    postal_code: digits(client.postalCode) || null,
    district: client.district || null,
    city: client.city || null,
    state: (client.state || "").toUpperCase() || null,
    seller_company_id: client.sellerCompanyId,
    representative_profile_id: client.representativeUserId || null,
    payment_terms: client.paymentTerms || null,
    cfop: client.cfop || null,
    freight_terms: client.freightTerms || null,
    purchase_limit: client.purchaseLimit ? Number(client.purchaseLimit.replace(",", ".")) : null,
    tax_regime: client.taxRegime || null,
    fiscal_profile: client.fiscalProfile || null,
    fiscal_benefit: client.fiscalBenefit || null,
    icms: client.icms ? Number(client.icms.replace(",", ".")) : null,
  };
}

async function enrichClients(admin: ReturnType<typeof import("@/lib/server/supabase-admin").createSupabaseAdmin>, rows: Array<Record<string, unknown>>) {
  const sellerIds = [...new Set(rows.map((row) => String(row.seller_company_id || "")).filter(Boolean))];
  const profileIds = [...new Set(rows.map((row) => String(row.representative_profile_id || "")).filter(Boolean))];
  const { data: sellers } = sellerIds.length ? await admin.from("seller_companies").select("id, name").in("id", sellerIds) : { data: [] };
  const { data: profiles } = profileIds.length ? await admin.from("profiles").select("id, full_name, email").in("id", profileIds) : { data: [] };
  const sellerNames = new Map<string, string>((sellers ?? []).map((item) => [String(item.id), String(item.name)]));
  const profileNames = new Map<string, string>((profiles ?? []).map((item) => [String(item.id), String(item.full_name || item.email || "")]));

  return rows.map((row) => ({
    id: row.id,
    clientNumber: row.client_number,
    clientCode: `CLI-${String(row.client_number).padStart(6, "0")}`,
    legalName: row.legal_name || "",
    tradeName: row.trade_name || "",
    buyerName: row.buyer_name || "",
    whatsapp: row.whatsapp || "",
    cnpj: row.cnpj || "",
    stateRegistration: row.state_registration || "",
    phone: row.phone || "",
    purchaseEmail: row.purchase_email || "",
    invoiceEmail: row.invoice_email || "",
    street: row.street || "",
    streetNumber: row.street_number || "",
    complement: row.complement || "",
    postalCode: row.postal_code || "",
    district: row.district || "",
    city: row.city || "",
    state: row.state || "",
    sellerCompanyId: row.seller_company_id || "",
    sellerCompanyName: sellerNames.get(String(row.seller_company_id || "")) || "",
    representativeUserId: row.representative_profile_id || "",
    representativeName: profileNames.get(String(row.representative_profile_id || "")) || "",
    paymentTerms: row.payment_terms || "",
    cfop: row.cfop || "",
    freightTerms: row.freight_terms || "",
    purchaseLimit: row.purchase_limit == null ? "" : String(row.purchase_limit),
    taxRegime: row.tax_regime || "",
    fiscalProfile: row.fiscal_profile || "",
    fiscalBenefit: row.fiscal_benefit || "",
    icms: row.icms == null ? "" : String(row.icms),
    active: row.active,
    updatedAt: row.updated_at,
    changeHistory: [],
  }));
}

async function loadClientChangeHistory(admin: ReturnType<typeof import("@/lib/server/supabase-admin").createSupabaseAdmin>, clientId: string) {
  const { data, error } = await admin
    .from("client_change_history")
    .select("id,changed_by,changed_by_name,changes,created_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const histories = (data ?? []) as Array<Record<string, unknown>>;
  const sellerIds = historyRelationIds(histories, "seller_company_id");
  const profileIds = [...new Set([
    ...histories.map((row) => String(row.changed_by || "")),
    ...historyRelationIds(histories, "representative_profile_id"),
  ].filter(Boolean))];
  const [{ data: sellers }, { data: profiles }] = await Promise.all([
    sellerIds.length ? admin.from("seller_companies").select("id,name").in("id", sellerIds) : Promise.resolve({ data: [] }),
    profileIds.length ? admin.from("profiles").select("id,full_name,email").in("id", profileIds) : Promise.resolve({ data: [] }),
  ]);
  const sellerNames = new Map<string, string>((sellers ?? []).map((item) => [String(item.id), String(item.name)]));
  const profileNames = new Map<string, string>((profiles ?? []).map((item) => [String(item.id), String(item.full_name || item.email || "")]));
  return histories.map((history) => ({
    id: String(history.id),
    changedAt: String(history.created_at),
    changedByName: String(history.changed_by_name || profileNames.get(String(history.changed_by || "")) || "USUARIO"),
    changes: normalizeHistoryChanges(history.changes, sellerNames, profileNames),
  }));
}

function historyRelationIds(histories: Array<Record<string, unknown>>, field: string) {
  return [...new Set(histories.flatMap((history) => Array.isArray(history.changes)
    ? history.changes.flatMap((change) => {
      const entry = change as Record<string, unknown>;
      if (entry.field !== field) return [];
      return [entry.previousValue, entry.nextValue]
        .map((value) => typeof value === "string" ? value : "")
        .filter(Boolean);
    })
    : []))];
}

function normalizeHistoryChanges(changes: unknown, sellerNames: Map<string, string>, profileNames: Map<string, string>) {
  if (!Array.isArray(changes)) return [];
  return changes.map((change) => {
    const entry = change as Record<string, unknown>;
    const field = String(entry.field || "");
    return {
      field,
      label: clientHistoryLabels[field] || field.replaceAll("_", " ").toUpperCase(),
      previousValue: clientHistoryValue(field, entry.previousValue, sellerNames, profileNames),
      nextValue: clientHistoryValue(field, entry.nextValue, sellerNames, profileNames),
    };
  });
}

function clientHistoryValue(field: string, value: unknown, sellerNames: Map<string, string>, profileNames: Map<string, string>) {
  if (value == null || value === "") return "NAO INFORMADO";
  if (field === "seller_company_id") return sellerNames.get(String(value)) || "EMPRESA NAO ENCONTRADA";
  if (field === "representative_profile_id") return profileNames.get(String(value)) || "REPRESENTANTE NAO ENCONTRADO";
  if (field === "active") return value ? "ATIVO" : "INATIVO";
  if (field === "purchase_limit") return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value) || 0);
  if (field === "icms") return `${Number(value).toLocaleString("pt-BR")}%`;
  return String(value);
}

const clientHistoryLabels: Record<string, string> = {
  legal_name: "NOME / RAZAO SOCIAL", trade_name: "NOME FANTASIA", buyer_name: "NOME DO COMPRADOR", whatsapp: "WHATSAPP",
  cnpj: "CNPJ", state_registration: "INSCRICAO ESTADUAL", phone: "FONE", purchase_email: "E-MAIL DE COMPRAS",
  invoice_email: "E-MAIL PARA NOTA FISCAL", street: "ENDERECO", street_number: "NUMERO", complement: "COMPLEMENTO",
  postal_code: "CEP", district: "BAIRRO", city: "CIDADE", state: "UF", seller_company_id: "EMPRESA ATENDENTE",
  representative_profile_id: "REPRESENTANTE", payment_terms: "CONDICAO DE PAGAMENTO", cfop: "CFOP", freight_terms: "FRETE",
  purchase_limit: "LIMITE DE COMPRA", tax_regime: "REGIME TRIBUTARIO", fiscal_profile: "PERFIL FISCAL",
  fiscal_benefit: "BENEFICIO FISCAL", icms: "ICMS", active: "STATUS",
};

function digits(value: string) {
  return value.replace(/\D/g, "");
}

class RequestError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

function failure(message: string, status: number) {
  return NextResponse.json({ success: false, message }, { status });
}

function handleError(error: unknown) {
  if (error instanceof AccessError || error instanceof RequestError) return failure(error.message, error.status);
  console.error("CLIENTS API ERROR", error);
  const code = (error as { code?: string })?.code;
  const message = String((error as { message?: string })?.message ?? "");
  if (code === "23505") return failure("JA EXISTE UM CLIENTE COM ESTE CNPJ NESTA EMPRESA.", 409);
  if (message.includes("clients")) return failure("A ESTRUTURA DO MODULO CLIENTES AINDA NAO FOI APLICADA NO BANCO.", 503);
  return failure("NAO FOI POSSIVEL SALVAR O CLIENTE.", 500);
}

import { NextResponse } from "next/server";

import { AccessError, requireCompanyAccess, requireCompanyProfile } from "@/lib/server/company-access";
import type { ClientSampleFormData, SampleStatus } from "@/types/amostras";

const sampleStatuses: SampleStatus[] = ["REQUESTED", "IN_PRODUCTION", "SENT", "APPROVED", "REJECTED", "CANCELLED"];

export async function GET(request: Request) {
  try {
    const slug = new URL(request.url).searchParams.get("slug")?.trim() ?? "";
    if (!slug) return failure("EMPRESA NAO INFORMADA.", 400);

    const { admin, company } = await requireCompanyAccess(request, slug);
    const { data, error } = await admin
      .from("client_samples")
      .select("*")
      .eq("tenant_company_id", company.id)
      .order("requested_at", { ascending: false })
      .order("sample_number", { ascending: false });

    if (error) throw error;
    return NextResponse.json({ success: true, samples: await enrichSamples(admin, data ?? []) });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { slug?: string; sample?: ClientSampleFormData };
    const slug = body.slug?.trim() ?? "";
    const sample = normalizeSample(body.sample);
    validateSample(slug, sample);

    const { admin, company, user } = await requireCompanyAccess(request, slug);
    await validateRelations(admin, company.id, sample);

    const { data, error } = await admin
      .from("client_samples")
      .insert({ ...toDatabase(sample), tenant_company_id: company.id, created_by: user.id })
      .select("*")
      .single();

    if (error) throw error;
    const [saved] = await enrichSamples(admin, [data]);
    return NextResponse.json({ success: true, sample: saved }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as { slug?: string; sample?: ClientSampleFormData };
    const slug = body.slug?.trim() ?? "";
    const sample = normalizeSample(body.sample);
    validateSample(slug, sample, true);

    const { admin, company } = await requireCompanyAccess(request, slug);
    await validateRelations(admin, company.id, sample);

    const { data, error } = await admin
      .from("client_samples")
      .update({ ...toDatabase(sample), updated_at: new Date().toISOString() })
      .eq("id", sample.id)
      .eq("tenant_company_id", company.id)
      .select("*")
      .single();

    if (error) throw error;
    const [saved] = await enrichSamples(admin, [data]);
    return NextResponse.json({ success: true, sample: saved });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as { slug?: string; id?: string };
    const slug = body.slug?.trim() ?? "";
    if (!slug || !body.id) return failure("AMOSTRA NAO INFORMADA.", 400);

    const { admin, company } = await requireCompanyAccess(request, slug);
    const { error } = await admin.from("client_samples").delete().eq("id", body.id).eq("tenant_company_id", company.id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error);
  }
}

function normalizeSample(value?: ClientSampleFormData): ClientSampleFormData {
  const sample = value ?? ({} as ClientSampleFormData);
  return Object.fromEntries(Object.entries(sample).map(([key, field]) => [key, typeof field === "string" ? field.trim() : field])) as ClientSampleFormData;
}

function validateSample(slug: string, sample: ClientSampleFormData, editing = false) {
  if (!slug) throw new RequestError("EMPRESA NAO INFORMADA.", 400);
  if (editing && !sample.id) throw new RequestError("AMOSTRA NAO INFORMADA.", 400);
  if (!sample.clientId || !sample.productDescription) throw new RequestError("PREENCHA CLIENTE E DESCRICAO DA AMOSTRA.", 400);
  if (!sampleStatuses.includes(sample.status)) throw new RequestError("STATUS DA AMOSTRA INVALIDO.", 400);
  const quantity = Number(sample.quantity || 0);
  if (!Number.isFinite(quantity) || quantity <= 0) throw new RequestError("INFORME UMA QUANTIDADE VALIDA.", 400);
}

async function validateRelations(admin: Awaited<ReturnType<typeof requireCompanyAccess>>["admin"], companyId: string, sample: ClientSampleFormData) {
  const { data: client } = await admin
    .from("clients")
    .select("id, seller_company_id, representative_profile_id")
    .eq("id", sample.clientId)
    .eq("tenant_company_id", companyId)
    .eq("active", true)
    .maybeSingle();
  if (!client) throw new RequestError("CLIENTE NAO ENCONTRADO.", 404);

  if (sample.sellerCompanyId) {
    const { data: seller } = await admin
      .from("seller_companies")
      .select("id")
      .eq("id", sample.sellerCompanyId)
      .eq("tenant_company_id", companyId)
      .eq("active", true)
      .maybeSingle();
    if (!seller) throw new RequestError("EMPRESA ATENDENTE INVALIDA.", 400);
  }

  if (sample.responsibleProfileId) await requireCompanyProfile(admin, companyId, sample.responsibleProfileId);
}

function toDatabase(sample: ClientSampleFormData) {
  return {
    client_id: sample.clientId,
    seller_company_id: sample.sellerCompanyId || null,
    responsible_profile_id: sample.responsibleProfileId || null,
    requested_at: sample.requestedAt || new Date().toISOString().slice(0, 10),
    delivery_date: sample.deliveryDate || null,
    status: sample.status,
    product_description: upper(sample.productDescription),
    dimensions: upper(sample.dimensions) || null,
    quantity: Math.trunc(Number(sample.quantity || 1)),
    shipping_method: upper(sample.shippingMethod) || null,
    tracking_code: upper(sample.trackingCode) || null,
    notes: upper(sample.notes) || null,
  };
}

async function enrichSamples(admin: Awaited<ReturnType<typeof requireCompanyAccess>>["admin"], rows: Array<Record<string, unknown>>) {
  const clientIds = [...new Set(rows.map((row) => String(row.client_id || "")).filter(Boolean))];
  const sellerIds = [...new Set(rows.map((row) => String(row.seller_company_id || "")).filter(Boolean))];
  const profileIds = [...new Set(rows.map((row) => String(row.responsible_profile_id || "")).filter(Boolean))];
  const [{ data: clients }, { data: sellers }, { data: profiles }] = await Promise.all([
    clientIds.length ? admin.from("clients").select("id, legal_name, trade_name").in("id", clientIds) : { data: [] },
    sellerIds.length ? admin.from("seller_companies").select("id, name").in("id", sellerIds) : { data: [] },
    profileIds.length ? admin.from("profiles").select("id, full_name, email").in("id", profileIds) : { data: [] },
  ]);
  const clientNames = new Map((clients ?? []).map((item) => [item.id, item.trade_name || item.legal_name || "CLIENTE"]));
  const sellerNames = new Map((sellers ?? []).map((item) => [item.id, item.name]));
  const profileNames = new Map((profiles ?? []).map((item) => [item.id, item.full_name || item.email || ""]));

  return rows.map((row) => ({
    id: row.id,
    sampleNumber: row.sample_number,
    sampleCode: `AM-${String(row.sample_number).padStart(6, "0")}`,
    clientId: row.client_id,
    clientName: clientNames.get(String(row.client_id || "")) || "",
    sellerCompanyId: row.seller_company_id || "",
    sellerCompanyName: sellerNames.get(String(row.seller_company_id || "")) || "",
    responsibleProfileId: row.responsible_profile_id || "",
    responsibleName: profileNames.get(String(row.responsible_profile_id || "")) || "",
    requestedAt: row.requested_at || "",
    deliveryDate: row.delivery_date || "",
    status: row.status,
    productDescription: row.product_description || "",
    dimensions: row.dimensions || "",
    quantity: Number(row.quantity || 0),
    shippingMethod: row.shipping_method || "",
    trackingCode: row.tracking_code || "",
    notes: row.notes || "",
    updatedAt: row.updated_at,
  }));
}

function upper(value: string) { return (value || "").trim().toLocaleUpperCase("pt-BR"); }
function failure(message: string, status: number) { return NextResponse.json({ success: false, message }, { status }); }

class RequestError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

function handleError(error: unknown) {
  if (error instanceof AccessError || error instanceof RequestError) return failure(error.message, error.status);
  console.error("CLIENT SAMPLES API ERROR", error);
  const message = String((error as { message?: string })?.message ?? "");
  if (message.includes("client_samples")) return failure("A ESTRUTURA DE AMOSTRAS AINDA NAO FOI APLICADA NO SUPABASE.", 503);
  return failure("NAO FOI POSSIVEL SALVAR A AMOSTRA.", 500);
}

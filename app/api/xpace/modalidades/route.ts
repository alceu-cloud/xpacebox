import { NextResponse } from "next/server";

import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";

const companySlug = "xpace";
const mappingTypes = ["AULA", "CHECK_IN", "PRESENÇA"] as const;
type MappingType = (typeof mappingTypes)[number];
type Mapping = { reference?: string; type?: string };
type RequestBody = {
  action?: "CREATE_MODALITY" | "SET_MODALITY_ACTIVE";
  modality?: { id?: string; name?: string; usesSchedule?: boolean; requiresInstructor?: boolean; wellhubMappings?: Mapping[]; totalpassMappings?: Mapping[]; active?: boolean };
};

export async function GET(request: Request) {
  try {
    const { admin, company } = await requireCompanyAccess(request, companySlug);
    const { data, error } = await admin.from("xpace_modalities").select("id,name,uses_schedule,requires_instructor,wellhub_mappings,totalpass_mappings,active,created_at").eq("tenant_company_id", company.id).order("active", { ascending: false }).order("name");
    if (error) throw error;
    return NextResponse.json({ success: true, modalities: (data ?? []).map((modality) => ({ id: modality.id, name: modality.name, usesSchedule: modality.uses_schedule, requiresInstructor: modality.requires_instructor, wellhubMappings: modality.wellhub_mappings ?? [], totalpassMappings: modality.totalpass_mappings ?? [], active: modality.active, createdAt: modality.created_at })) });
  } catch (error) { return handleError(error); }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const access = await requireCompanyAccess(request, companySlug);
    if (body.action !== "CREATE_MODALITY") throw new RequestError("AÇÃO DE MODALIDADE INVÁLIDA.", 400);
    requireManager(access.profile.platform_role);
    const modality = normalizeModality(body.modality);
    if (!modality.name) throw new RequestError("INFORME A DESCRIÇÃO DA MODALIDADE.", 400);
    const { data, error } = await access.admin.from("xpace_modalities").insert({ tenant_company_id: access.company.id, name: modality.name, uses_schedule: modality.usesSchedule, requires_instructor: modality.requiresInstructor, wellhub_mappings: modality.wellhubMappings, totalpass_mappings: modality.totalpassMappings, created_by: access.user.id, updated_by: access.user.id }).select("id,name").single();
    if (error) throw error;
    return NextResponse.json({ success: true, modality: { id: data.id, name: data.name } }, { status: 201 });
  } catch (error) { return handleError(error); }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const access = await requireCompanyAccess(request, companySlug);
    if (body.action !== "SET_MODALITY_ACTIVE" || !body.modality?.id || typeof body.modality.active !== "boolean") throw new RequestError("ATUALIZAÇÃO DE MODALIDADE INVÁLIDA.", 400);
    requireManager(access.profile.platform_role);
    const { error } = await access.admin.from("xpace_modalities").update({ active: body.modality.active, updated_by: access.user.id, updated_at: new Date().toISOString() }).eq("id", body.modality.id).eq("tenant_company_id", access.company.id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) { return handleError(error); }
}

function normalizeModality(value?: RequestBody["modality"]) {
  return {
    name: value?.name?.trim().replace(/\s+/g, " ").slice(0, 120) ?? "",
    usesSchedule: Boolean(value?.usesSchedule),
    requiresInstructor: Boolean(value?.requiresInstructor),
    wellhubMappings: normalizeMappings(value?.wellhubMappings),
    totalpassMappings: normalizeMappings(value?.totalpassMappings),
  };
}

function normalizeMappings(items?: Mapping[]) {
  const seen = new Set<string>();
  return (items ?? []).flatMap((item) => {
    const reference = item.reference?.trim().replace(/\s+/g, " ").slice(0, 120) ?? "";
    const type = item.type as MappingType;
    const key = `${reference}|${type}`;
    if (!reference || !mappingTypes.includes(type) || seen.has(key)) return [];
    seen.add(key);
    return [{ reference, type }];
  }).slice(0, 50);
}

function requireManager(role: string) { if (!['platform_owner', 'company_manager'].includes(role)) throw new AccessError("APENAS GESTORES PODEM ALTERAR AS MODALIDADES.", 403); }
class RequestError extends Error { constructor(message: string, public status: number) { super(message); } }
function handleError(error: unknown) {
  if (error instanceof AccessError || error instanceof RequestError) return NextResponse.json({ success: false, message: error.message }, { status: error.status });
  if ((error as { code?: string })?.code === "23505") return NextResponse.json({ success: false, message: "JÁ EXISTE UMA MODALIDADE COM ESTA DESCRIÇÃO.", }, { status: 409 });
  console.error("XPACE MODALITIES ERROR", error);
  return NextResponse.json({ success: false, message: "NÃO FOI POSSÍVEL ATUALIZAR AS MODALIDADES." }, { status: 500 });
}

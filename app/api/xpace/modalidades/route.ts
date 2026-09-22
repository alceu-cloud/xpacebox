import { NextResponse } from "next/server";

import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";
import { sortNaturally } from "@/lib/xpace/natural-sort";

const companySlug = "xpace";
const mappingTypes = ["AULA", "CHECK_IN", "PRESENÇA"] as const;
type MappingType = (typeof mappingTypes)[number];
type Mapping = { reference?: string; type?: string };
type RequestBody = {
  action?: "CREATE_MODALITY" | "UPDATE_MODALITY" | "SET_MODALITY_ACTIVE" | "DELETE_MODALITY";
  modality?: { id?: string; name?: string; usesSchedule?: boolean; requiresInstructor?: boolean; instructorId?: string; wellhubMappings?: Mapping[]; totalpassMappings?: Mapping[]; active?: boolean };
};

export async function GET(request: Request) {
  try {
    const { admin, company } = await requireCompanyAccess(request, companySlug);
    const [modalitiesResult, instructorsResult] = await Promise.all([
      admin.from("xpace_modalities").select("id,name,uses_schedule,requires_instructor,instructor_id,wellhub_mappings,totalpass_mappings,active,created_at").eq("tenant_company_id", company.id).order("active", { ascending: false }).order("name"),
      admin.from("xpace_instructors").select("id,full_name,active").eq("tenant_company_id", company.id).eq("active", true).order("full_name"),
    ]);
    if (modalitiesResult.error) throw modalitiesResult.error;
    if (instructorsResult.error) throw instructorsResult.error;
    const instructorNames = new Map((instructorsResult.data ?? []).map((instructor) => [instructor.id, instructor.full_name]));
    return NextResponse.json({ success: true, modalities: sortNaturally(modalitiesResult.data ?? [], (modality) => modality.name).sort((left, right) => Number(right.active) - Number(left.active)).map((modality) => ({ id: modality.id, name: modality.name, usesSchedule: modality.uses_schedule, requiresInstructor: modality.requires_instructor, instructorId: modality.instructor_id ?? "", instructorName: modality.instructor_id ? instructorNames.get(modality.instructor_id) ?? "PROFESSOR ARQUIVADO" : "", wellhubMappings: modality.wellhub_mappings ?? [], totalpassMappings: modality.totalpass_mappings ?? [], active: modality.active, createdAt: modality.created_at })), instructors: sortNaturally(instructorsResult.data ?? [], (instructor) => instructor.full_name).map((instructor) => ({ id: instructor.id, fullName: instructor.full_name })) });
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
    await validateInstructor(access, modality);
    const { data, error } = await access.admin.from("xpace_modalities").insert({ tenant_company_id: access.company.id, name: modality.name, uses_schedule: modality.usesSchedule, requires_instructor: modality.requiresInstructor, instructor_id: modality.instructorId || null, wellhub_mappings: modality.wellhubMappings, totalpass_mappings: modality.totalpassMappings, created_by: access.user.id, updated_by: access.user.id }).select("id,name").single();
    if (error) throw error;
    return NextResponse.json({ success: true, modality: { id: data.id, name: data.name } }, { status: 201 });
  } catch (error) { return handleError(error); }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const access = await requireCompanyAccess(request, companySlug);
    requireManager(access.profile.platform_role);
    if (body.action === "SET_MODALITY_ACTIVE" && body.modality?.id && typeof body.modality.active === "boolean") {
      const { error } = await access.admin.from("xpace_modalities").update({ active: body.modality.active, updated_by: access.user.id, updated_at: new Date().toISOString() }).eq("id", body.modality.id).eq("tenant_company_id", access.company.id);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }
    if (body.action !== "UPDATE_MODALITY" || !body.modality?.id) throw new RequestError("ATUALIZAÇÃO DE MODALIDADE INVÁLIDA.", 400);
    const modality = normalizeModality(body.modality);
    if (!modality.name) throw new RequestError("INFORME A DESCRIÇÃO DA MODALIDADE.", 400);
    await validateInstructor(access, modality);
    const { error } = await access.admin.from("xpace_modalities").update({ name: modality.name, uses_schedule: modality.usesSchedule, requires_instructor: modality.requiresInstructor, instructor_id: modality.instructorId || null, wellhub_mappings: modality.wellhubMappings, totalpass_mappings: modality.totalpassMappings, updated_by: access.user.id, updated_at: new Date().toISOString() }).eq("id", body.modality.id).eq("tenant_company_id", access.company.id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) { return handleError(error); }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const access = await requireCompanyAccess(request, companySlug);
    requireManager(access.profile.platform_role);
    const modalityId = body.action === "DELETE_MODALITY" ? body.modality?.id?.trim() : "";
    if (!modalityId) throw new RequestError("MODALIDADE INVÁLIDA.", 400);
    const { data: modality, error: modalityError } = await access.admin.from("xpace_modalities").select("id,name").eq("id", modalityId).eq("tenant_company_id", access.company.id).maybeSingle();
    if (modalityError) throw modalityError;
    if (!modality) throw new RequestError("MODALIDADE NÃO ENCONTRADA NESTA EMPRESA.", 404);
    const { data: plans, error: plansError } = await access.admin.from("xpace_membership_plans").select("id").eq("tenant_company_id", access.company.id).contains("modalities", [modality.name]);
    if (plansError) throw plansError;
    const planIds = (plans ?? []).map((plan) => plan.id);
    if (planIds.length) {
      const { data: contract, error: contractError } = await access.admin.from("xpace_student_contracts").select("id").eq("tenant_company_id", access.company.id).in("plan_id", planIds).limit(1).maybeSingle();
      if (contractError) throw contractError;
      if (contract) throw new RequestError("NÃO É POSSÍVEL EXCLUIR: HÁ ALUNO COM CONTRATO VINCULADO A ESTA MODALIDADE. ARQUIVE A MODALIDADE PARA PRESERVAR O HISTÓRICO.", 409);
      throw new RequestError("NÃO É POSSÍVEL EXCLUIR: ESTA MODALIDADE AINDA ESTÁ VINCULADA A UM CONTRATO DO CATÁLOGO.", 409);
    }
    const { data: classGroup, error: classGroupError } = await access.admin.from("xpace_class_groups").select("id").eq("tenant_company_id", access.company.id).eq("modality_id", modality.id).limit(1).maybeSingle();
    if (classGroupError) throw classGroupError;
    if (classGroup) throw new RequestError("NÃO É POSSÍVEL EXCLUIR: ESTA MODALIDADE JÁ POSSUI GRADE DE AULA. ARQUIVE-A PARA PRESERVAR A AGENDA.", 409);
    const { error } = await access.admin.from("xpace_modalities").delete().eq("id", modality.id).eq("tenant_company_id", access.company.id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) { return handleError(error); }
}

function normalizeModality(value?: RequestBody["modality"]) {
  return {
    name: value?.name?.trim().replace(/\s+/g, " ").slice(0, 120) ?? "",
    usesSchedule: Boolean(value?.usesSchedule),
    requiresInstructor: Boolean(value?.requiresInstructor),
    instructorId: value?.instructorId?.trim() ?? "",
    wellhubMappings: normalizeMappings(value?.wellhubMappings),
    totalpassMappings: normalizeMappings(value?.totalpassMappings),
  };
}

async function validateInstructor(access: Awaited<ReturnType<typeof requireCompanyAccess>>, modality: ReturnType<typeof normalizeModality>) {
  if (!modality.requiresInstructor) return;
  if (!modality.instructorId) throw new RequestError("SELECIONE O PROFESSOR RESPONSÁVEL PELA MODALIDADE.", 400);
  const { data, error } = await access.admin.from("xpace_instructors").select("id").eq("id", modality.instructorId).eq("tenant_company_id", access.company.id).eq("active", true).maybeSingle();
  if (error) throw error;
  if (!data) throw new RequestError("O PROFESSOR SELECIONADO NÃO ESTÁ DISPONÍVEL.", 400);
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

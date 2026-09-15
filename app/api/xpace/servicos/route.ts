import { NextResponse } from "next/server";

import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";

const companySlug = "xpace";
type RequestBody = {
  action?: "CREATE_SERVICE" | "UPDATE_SERVICE" | "SET_SERVICE_ACTIVE" | "DELETE_SERVICE";
  service?: { id?: string; description?: string; salePriceCents?: number; active?: boolean };
};

export async function GET(request: Request) {
  try {
    const access = await requireCompanyAccess(request, companySlug);
    const { data, error } = await access.admin.from("xpace_services").select("id,description,sale_price_cents,image_path,active,created_at").eq("tenant_company_id", access.company.id).order("active", { ascending: false }).order("description");
    if (error) throw error;
    return NextResponse.json({ success: true, services: (data ?? []).map((service) => ({ id: service.id, description: service.description, salePriceCents: service.sale_price_cents, imagePath: service.image_path ?? "", imageUrl: service.image_path ? access.admin.storage.from("xpace-service-images").getPublicUrl(service.image_path).data.publicUrl : "", active: service.active, createdAt: service.created_at })) });
  } catch (error) { return handleError(error); }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const access = await requireCompanyAccess(request, companySlug);
    requireManager(access.profile.platform_role);
    if (body.action !== "CREATE_SERVICE") throw new RequestError("AÇÃO DE SERVIÇO INVÁLIDA.", 400);
    const service = normalizeService(body.service);
    validateService(service);
    const { data, error } = await access.admin.from("xpace_services").insert({ tenant_company_id: access.company.id, description: service.description, sale_price_cents: service.salePriceCents, created_by: access.user.id, updated_by: access.user.id }).select("id,description").single();
    if (error) throw error;
    return NextResponse.json({ success: true, service: { id: data.id, description: data.description } }, { status: 201 });
  } catch (error) { return handleError(error); }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const access = await requireCompanyAccess(request, companySlug);
    requireManager(access.profile.platform_role);
    if (body.action === "SET_SERVICE_ACTIVE" && body.service?.id && typeof body.service.active === "boolean") {
      const { error } = await access.admin.from("xpace_services").update({ active: body.service.active, updated_by: access.user.id, updated_at: new Date().toISOString() }).eq("id", body.service.id).eq("tenant_company_id", access.company.id);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }
    if (body.action !== "UPDATE_SERVICE" || !body.service?.id) throw new RequestError("ATUALIZAÇÃO DE SERVIÇO INVÁLIDA.", 400);
    const service = normalizeService(body.service);
    validateService(service);
    const { error } = await access.admin.from("xpace_services").update({ description: service.description, sale_price_cents: service.salePriceCents, updated_by: access.user.id, updated_at: new Date().toISOString() }).eq("id", body.service.id).eq("tenant_company_id", access.company.id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) { return handleError(error); }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const access = await requireCompanyAccess(request, companySlug);
    requireManager(access.profile.platform_role);
    const serviceId = body.action === "DELETE_SERVICE" ? body.service?.id?.trim() : "";
    if (!serviceId) throw new RequestError("SERVIÇO INVÁLIDO.", 400);
    const { data: service, error: serviceError } = await access.admin.from("xpace_services").select("id,description,image_path").eq("id", serviceId).eq("tenant_company_id", access.company.id).maybeSingle();
    if (serviceError) throw serviceError;
    if (!service) throw new RequestError("SERVIÇO NÃO ENCONTRADO NESTA EMPRESA.", 404);
    const [{ data: plan, error: planError }, { data: contract, error: contractError }] = await Promise.all([
      access.admin.from("xpace_membership_plans").select("id").eq("tenant_company_id", access.company.id).contains("catalog_settings", { enrollmentServiceId: service.id }).limit(1).maybeSingle(),
      access.admin.from("xpace_student_contracts").select("id").eq("tenant_company_id", access.company.id).contains("enrollment_service_snapshot", { serviceId: service.id }).limit(1).maybeSingle(),
    ]);
    if (planError) throw planError;
    if (contractError) throw contractError;
    if (contract) throw new RequestError("NÃO É POSSÍVEL EXCLUIR: ESTE SERVIÇO JÁ FOI COBRADO EM CONTRATO DE ALUNO. ARQUIVE-O PARA PRESERVAR O HISTÓRICO.", 409);
    if (plan) throw new RequestError("NÃO É POSSÍVEL EXCLUIR: ESTE SERVIÇO ESTÁ VINCULADO A UM CONTRATO DO CATÁLOGO. REMOVA-O OU ARQUIVE-O.", 409);
    const { error } = await access.admin.from("xpace_services").delete().eq("id", service.id).eq("tenant_company_id", access.company.id);
    if (error) throw error;
    if (service.image_path) await access.admin.storage.from("xpace-service-images").remove([service.image_path]);
    return NextResponse.json({ success: true });
  } catch (error) { return handleError(error); }
}

function normalizeService(value?: RequestBody["service"]) {
  return { description: value?.description?.trim().replace(/\s+/g, " ").slice(0, 140) ?? "", salePriceCents: Number(value?.salePriceCents) };
}
function validateService(service: ReturnType<typeof normalizeService>) {
  if (!service.description || !Number.isInteger(service.salePriceCents) || service.salePriceCents < 0) throw new RequestError("INFORME DESCRIÇÃO E PREÇO DE VENDA VÁLIDOS.", 400);
}
function requireManager(role: string) { if (!['platform_owner', 'company_manager'].includes(role)) throw new AccessError("APENAS GESTORES PODEM ALTERAR OS SERVIÇOS.", 403); }
class RequestError extends Error { constructor(message: string, public status: number) { super(message); } }
function handleError(error: unknown) {
  if (error instanceof AccessError || error instanceof RequestError) return NextResponse.json({ success: false, message: error.message }, { status: error.status });
  if ((error as { code?: string })?.code === "23505") return NextResponse.json({ success: false, message: "JÁ EXISTE UM SERVIÇO COM ESTA DESCRIÇÃO.", }, { status: 409 });
  console.error("XPACE SERVICES ERROR", error);
  return NextResponse.json({ success: false, message: "NÃO FOI POSSÍVEL ATUALIZAR OS SERVIÇOS." }, { status: 500 });
}

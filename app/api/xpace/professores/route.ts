import { NextResponse } from "next/server";

import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";

const companySlug = "xpace";
type RequestBody = {
  action?: "CREATE_INSTRUCTOR" | "UPDATE_INSTRUCTOR" | "SET_INSTRUCTOR_ACTIVE";
  instructor?: { id?: string; fullName?: string; mobile?: string; email?: string; active?: boolean };
};

export async function GET(request: Request) {
  try {
    const { admin, company } = await requireCompanyAccess(request, companySlug);
    const { data, error } = await admin.from("xpace_instructors").select("id,full_name,mobile,email,active").eq("tenant_company_id", company.id).order("active", { ascending: false }).order("full_name");
    if (error) throw error;
    return NextResponse.json({ success: true, instructors: (data ?? []).map(toInstructor) });
  } catch (error) { return handleError(error); }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const access = await requireCompanyAccess(request, companySlug);
    if (body.action !== "CREATE_INSTRUCTOR") throw new RequestError("AÇÃO DE PROFESSOR INVÁLIDA.", 400);
    requireManager(access.profile.platform_role);
    const instructor = normalize(body.instructor);
    validateInstructor(instructor);
    const { data, error } = await access.admin.from("xpace_instructors").insert({ tenant_company_id: access.company.id, full_name: instructor.fullName, mobile: instructor.mobile || null, email: instructor.email || null, created_by: access.user.id, updated_by: access.user.id }).select("id,full_name,mobile,email,active").single();
    if (error) throw error;
    return NextResponse.json({ success: true, instructor: toInstructor(data) }, { status: 201 });
  } catch (error) { return handleError(error); }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const access = await requireCompanyAccess(request, companySlug);
    if (body.action === "UPDATE_INSTRUCTOR") {
      requireManager(access.profile.platform_role);
      const instructorId = body.instructor?.id?.trim();
      const instructor = normalize(body.instructor);
      if (!instructorId) throw new RequestError("INFORME O PROFESSOR.", 400);
      validateInstructor(instructor);
      const { data, error } = await access.admin.from("xpace_instructors").update({ full_name: instructor.fullName, mobile: instructor.mobile || null, email: instructor.email || null, updated_by: access.user.id, updated_at: new Date().toISOString() }).eq("id", instructorId).eq("tenant_company_id", access.company.id).select("id").maybeSingle();
      if (error) throw error;
      if (!data) throw new RequestError("PROFESSOR NÃO ENCONTRADO NESTA EMPRESA.", 404);
      return NextResponse.json({ success: true });
    }
    if (body.action !== "SET_INSTRUCTOR_ACTIVE" || !body.instructor?.id || typeof body.instructor.active !== "boolean") throw new RequestError("ATUALIZAÇÃO DE PROFESSOR INVÁLIDA.", 400);
    requireManager(access.profile.platform_role);
    const { error } = await access.admin.from("xpace_instructors").update({ active: body.instructor.active, updated_by: access.user.id, updated_at: new Date().toISOString() }).eq("id", body.instructor.id).eq("tenant_company_id", access.company.id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) { return handleError(error); }
}

function normalize(value?: RequestBody["instructor"]) {
  return {
    fullName: value?.fullName?.trim().replace(/\s+/g, " ").slice(0, 120) ?? "",
    mobile: value?.mobile?.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "").slice(0, 11) ?? "",
    email: value?.email?.trim().toLowerCase().slice(0, 160) ?? "",
  };
}

function validateInstructor(instructor: ReturnType<typeof normalize>) {
  if (!instructor.fullName) throw new RequestError("INFORME O NOME DO PROFESSOR.", 400);
  if (instructor.mobile && !/^\d{10,11}$/.test(instructor.mobile)) throw new RequestError("INFORME UM CELULAR COM DDD.", 400);
}

function toInstructor(instructor: { id: string; full_name: string; mobile: string | null; email: string | null; active: boolean }) { return { id: instructor.id, fullName: instructor.full_name, mobile: instructor.mobile ?? "", email: instructor.email ?? "", active: instructor.active }; }
function requireManager(role: string) { if (!["platform_owner", "company_manager"].includes(role)) throw new AccessError("APENAS GESTORES PODEM ALTERAR OS PROFESSORES.", 403); }
class RequestError extends Error { constructor(message: string, public status: number) { super(message); } }
function handleError(error: unknown) { if (error instanceof AccessError || error instanceof RequestError) return NextResponse.json({ success: false, message: error.message }, { status: error.status }); if ((error as { code?: string })?.code === "23505") return NextResponse.json({ success: false, message: "JÁ EXISTE UM PROFESSOR COM ESTE NOME.", }, { status: 409 }); console.error("XPACE INSTRUCTORS ERROR", error); return NextResponse.json({ success: false, message: "NÃO FOI POSSÍVEL ATUALIZAR OS PROFESSORES." }, { status: 500 }); }

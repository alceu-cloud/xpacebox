import { createSupabaseAdmin, createSupabaseAuth } from "@/lib/server/supabase-admin";

export async function requireCompanyAccess(request: Request, slug: string, options: { allowTeacher?: boolean } = {}) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new AccessError("SESSAO NAO ENCONTRADA.", 401);
  }

  const token = authorization.slice("Bearer ".length).trim();
  const auth = createSupabaseAuth();
  const admin = createSupabaseAdmin();
  const { data, error } = await auth.auth.getUser(token);

  if (error || !data.user) throw new AccessError("SESSAO INVALIDA.", 401);

  const [{ data: company, error: companyError }, { data: profile, error: profileError }] = await Promise.all([
    admin
      .from("companies")
      .select("id, name, slug")
      .eq("slug", slug)
      .eq("active", true)
      .single(),
    admin
      .from("profiles")
      .select("id, full_name, email, platform_role, active")
      .eq("id", data.user.id)
      .single(),
  ]);

  if (companyError || !company) throw new AccessError("EMPRESA NAO ENCONTRADA.", 404);

  if (profileError) {
    console.error("COMPANY ACCESS PROFILE LOOKUP ERROR", { userId: data.user.id, error: profileError });
    throw new AccessError("NÃO FOI POSSÍVEL VALIDAR O PERFIL DE ACESSO. ATUALIZE A PÁGINA E TENTE NOVAMENTE.", 503);
  }
  if (!profile) throw new AccessError("SEU USUÁRIO NÃO POSSUI PERFIL DE ACESSO CADASTRADO.", 403);
  if (!profile.active) throw new AccessError("SEU USUÁRIO ESTÁ DESATIVADO. PEÇA A UM GESTOR PARA REATIVÁ-LO.", 403);

  let teacherInstructorId: string | null = null;
  if (profile.platform_role === 'company_teacher') {
    if (!options.allowTeacher) throw new AccessError('O PERFIL DE PROFESSOR ACESSA APENAS SUAS CONFIRMAÇÕES E RESERVA DE SALA COM OCUPAÇÃO.',403);
    const { data: binding, error: bindingError } = await admin.from('xpace_teacher_access').select('instructor_id').eq('profile_id',data.user.id).eq('tenant_company_id',company.id).eq('active',true).maybeSingle();
    if (bindingError) throw new AccessError('NÃO FOI POSSÍVEL VALIDAR O ACESSO DO PROFESSOR.',503);
    if (!binding) throw new AccessError('PROFESSOR SEM VÍNCULO ATIVO COM A ESCOLA.',403);
    const instructor = await admin.from('xpace_instructors').select('id').eq('id',binding.instructor_id).eq('tenant_company_id',company.id).eq('active',true).maybeSingle();
    if (instructor.error || !instructor.data) throw new AccessError('CADASTRO DE PROFESSOR INATIVO.',403);
    teacherInstructorId=binding.instructor_id;
  } else if (profile.platform_role !== "platform_owner") {
    const { data: membership } = await admin
      .from("company_members")
      .select("company_id")
      .eq("company_id", company.id)
      .eq("profile_id", data.user.id)
      .eq("active", true)
      .maybeSingle();

    if (!membership) throw new AccessError("SEM ACESSO A ESTA EMPRESA.", 403);
  }

  return { admin, company, user: data.user, profile, teacherInstructorId };
}

export async function requireCompanyProfile(
  admin: ReturnType<typeof createSupabaseAdmin>,
  companyId: string,
  profileId: string
) {
  const { data: profile } = await admin
    .from("profiles")
    .select("id, full_name, email, platform_role, active")
    .eq("id", profileId)
    .eq("active", true)
    .maybeSingle();

  if (!profile) throw new AccessError("REPRESENTANTE INVALIDO.", 400);
  if (profile.platform_role === "platform_owner") return profile;

  const { data: membership } = await admin
    .from("company_members")
    .select("profile_id")
    .eq("company_id", companyId)
    .eq("profile_id", profileId)
    .eq("active", true)
    .maybeSingle();

  if (!membership) throw new AccessError("REPRESENTANTE SEM ACESSO A ESTA EMPRESA.", 400);
  return profile;
}

export class AccessError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

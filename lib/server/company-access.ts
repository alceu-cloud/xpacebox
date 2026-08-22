import { createSupabaseAdmin, createSupabaseAuth } from "@/lib/server/supabase-admin";

export async function requireCompanyAccess(request: Request, slug: string) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new AccessError("SESSAO NAO ENCONTRADA.", 401);
  }

  const token = authorization.slice("Bearer ".length).trim();
  const auth = createSupabaseAuth();
  const admin = createSupabaseAdmin();
  const { data, error } = await auth.auth.getUser(token);

  if (error || !data.user) throw new AccessError("SESSAO INVALIDA.", 401);

  const { data: company, error: companyError } = await admin
    .from("companies")
    .select("id, name, slug")
    .eq("slug", slug)
    .eq("active", true)
    .single();

  if (companyError || !company) throw new AccessError("EMPRESA NAO ENCONTRADA.", 404);

  const { data: profile } = await admin
    .from("profiles")
    .select("id, full_name, email, platform_role, active")
    .eq("id", data.user.id)
    .single();

  if (!profile?.active) throw new AccessError("USUARIO INATIVO.", 403);

  if (profile.platform_role !== "platform_owner") {
    const { data: membership } = await admin
      .from("company_members")
      .select("company_id")
      .eq("company_id", company.id)
      .eq("profile_id", data.user.id)
      .eq("active", true)
      .maybeSingle();

    if (!membership) throw new AccessError("SEM ACESSO A ESTA EMPRESA.", 403);
  }

  return { admin, company, user: data.user, profile };
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

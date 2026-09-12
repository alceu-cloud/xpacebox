import { NextResponse } from "next/server";

import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";
import { createSupabaseAdmin, createSupabaseAuth } from "@/lib/server/supabase-admin";

const companyData = { name: "XPACE DANCA", slug: "xpace" };

function failure(message: string, status: number) {
  return NextResponse.json({ success: false, message }, { status });
}

function handleError(error: unknown) {
  if (error instanceof AccessError) return failure(error.message, error.status);
  console.error("XPACE COMPANY ERROR", error);
  return failure("NAO FOI POSSIVEL ACESSAR O AMBIENTE XPACE.", 500);
}

export async function GET(request: Request) {
  try {
    const { company } = await requireCompanyAccess(request, companyData.slug);
    return NextResponse.json({ success: true, company: { id: company.id, name: company.name, slug: company.slug } });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return failure("SESSAO NAO ENCONTRADA.", 401);

    const token = authorization.slice("Bearer ".length).trim();
    const auth = createSupabaseAuth();
    const admin = createSupabaseAdmin();
    const { data: userData, error: userError } = await auth.auth.getUser(token);
    if (userError || !userData.user) return failure("SESSAO INVALIDA.", 401);

    const { data: profile } = await admin
      .from("profiles")
      .select("platform_role, active")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (!profile?.active || profile.platform_role !== "platform_owner") return failure("APENAS O ADMINISTRADOR DA PLATAFORMA PODE CRIAR A XPACE.", 403);

    const { data: existing, error: existingError } = await admin
      .from("companies")
      .select("id, name, slug")
      .eq("slug", companyData.slug)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) return NextResponse.json({ success: true, company: existing, existing: true });

    const { data: company, error: companyError } = await admin
      .from("companies")
      .insert({ ...companyData, active: true })
      .select("id, name, slug")
      .single();
    if (companyError) throw companyError;

    return NextResponse.json({ success: true, company });
  } catch (error) {
    return handleError(error);
  }
}

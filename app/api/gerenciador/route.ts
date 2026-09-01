import { NextResponse } from "next/server";

import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";

const allowedKeys = new Set([
  "suppliers",
  "paperTypes",
  "materials",
  "engineeringFormulas",
  "paperCostParams",
  "pricingParams",
  "pricingOperationalParams",
  "pricingGoalsByCompany",
  "productionTimes",
  "paymentConditions",
  "cfops",
  "taxRegimes",
  "fiscalProfiles",
  "fiscalBenefits",
  "lostReasons",
  "salesGoals",
  "productFichas",
  "productColors",
  "quoteParameters",
]);

function failure(message: string, status: number) {
  return NextResponse.json({ success: false, message }, { status });
}

function handleError(error: unknown) {
  if (error instanceof AccessError) return failure(error.message, error.status);
  console.error("MANAGER SETTINGS API ERROR", error);
  const message = String((error as { message?: string })?.message ?? "");
  if (message.includes("company_manager_settings")) {
    return failure("A TABELA DE CONFIGURACOES DO GERENCIADOR AINDA NAO FOI APLICADA NO SUPABASE.", 503);
  }
  return failure("NAO FOI POSSIVEL SALVAR AS CONFIGURACOES DO GERENCIADOR.", 500);
}

async function ensureManager(request: Request, slug: string) {
  const access = await requireCompanyAccess(request, slug);
  if (!['platform_owner', 'company_manager'].includes(access.profile.platform_role)) {
    throw new AccessError("APENAS GERENTES PODEM ALTERAR AS CONFIGURACOES.", 403);
  }
  return access;
}

export async function GET(request: Request) {
  try {
    const slug = new URL(request.url).searchParams.get("slug")?.trim() ?? "";
    if (!slug) return failure("EMPRESA NAO INFORMADA.", 400);
    const { admin, company } = await requireCompanyAccess(request, slug);
    const { data, error } = await admin
      .from("company_manager_settings")
      .select("data, updated_at")
      .eq("tenant_company_id", company.id)
      .maybeSingle();
    if (error) throw error;
    return NextResponse.json({ success: true, settings: data?.data ?? {}, updatedAt: data?.updated_at ?? null });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as { slug?: string; key?: string; value?: unknown };
    const slug = body.slug?.trim() ?? "";
    if (!slug || !body.key || !allowedKeys.has(body.key)) return failure("CONFIGURACAO INVALIDA.", 400);

    const { admin, company } = await ensureManager(request, slug);
    const { data: current, error: currentError } = await admin
      .from("company_manager_settings")
      .select("data")
      .eq("tenant_company_id", company.id)
      .maybeSingle();
    if (currentError) throw currentError;

    const nextData = { ...(current?.data ?? {}), [body.key]: body.value };
    const { error } = await admin
      .from("company_manager_settings")
      .upsert({ tenant_company_id: company.id, data: nextData, updated_at: new Date().toISOString() }, { onConflict: "tenant_company_id" });
    if (error) throw error;
    return NextResponse.json({ success: true, settings: nextData });
  } catch (error) {
    return handleError(error);
  }
}

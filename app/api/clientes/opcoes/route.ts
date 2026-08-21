import { NextResponse } from "next/server";

import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";

const defaultSellerCompanies = [
  { name: "DAWOS", slug: "dawos" },
  { name: "CARCAT", slug: "carcat" },
  { name: "GTA", slug: "gta" },
];

export async function GET(request: Request) {
  try {
    const slug = new URL(request.url).searchParams.get("slug")?.trim() ?? "";
    if (!slug) return failure("EMPRESA NAO INFORMADA.", 400);

    const { admin, company } = await requireCompanyAccess(request, slug);
    let { data: sellerCompanies, error: sellerError } = await admin
      .from("seller_companies")
      .select("id, name, slug")
      .eq("tenant_company_id", company.id)
      .eq("active", true)
      .order("name");

    if (sellerError) throw sellerError;

    if (!sellerCompanies?.length) {
      const { data, error } = await admin
        .from("seller_companies")
        .upsert(
          defaultSellerCompanies.map((item) => ({ ...item, tenant_company_id: company.id })),
          { onConflict: "tenant_company_id,slug" }
        )
        .select("id, name, slug");
      if (error) throw error;
      sellerCompanies = data;
    }

    const { data: memberships, error: membershipError } = await admin
      .from("company_members")
      .select("profile_id")
      .eq("company_id", company.id)
      .eq("active", true);

    if (membershipError) throw membershipError;

    const profileIds = new Set((memberships ?? []).map((item) => item.profile_id).filter(Boolean));
    const { data: profiles, error: profileError } = await admin
      .from("profiles")
      .select("id, full_name, email, platform_role")
      .eq("active", true)
      .order("full_name");

    if (profileError) throw profileError;

    return NextResponse.json({
      success: true,
      options: {
        sellerCompanies: sellerCompanies ?? [],
        representatives: (profiles ?? []).filter((profile) => profile.platform_role === "platform_owner" || profileIds.has(profile.id)).map((profile) => ({
          id: profile.id,
          name: profile.full_name || profile.email || "USUARIO",
          email: profile.email || "",
        })),
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
function failure(message: string, status: number) {
  return NextResponse.json({ success: false, message }, { status });
}

function handleError(error: unknown) {
  if (error instanceof AccessError) return failure(error.message, error.status);
  console.error("CLIENT OPTIONS ERROR", error);
  const message = String((error as { message?: string })?.message ?? "");
  if (message.includes("seller_companies")) {
    return failure("A ESTRUTURA DO MODULO CLIENTES AINDA NAO FOI APLICADA NO BANCO.", 503);
  }
  return failure("NAO FOI POSSIVEL CARREGAR AS OPCOES DO CADASTRO.", 500);
}

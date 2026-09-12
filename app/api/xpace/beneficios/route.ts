import { NextResponse } from "next/server";

import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";

const companySlug = "xpace";
type Body = { name?: string; kind?: string; discountType?: string; discountValue?: number };

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const access = await requireCompanyAccess(request, companySlug);
    if (!["platform_owner", "company_manager"].includes(access.profile.platform_role)) throw new AccessError("APENAS GESTORES PODEM CADASTRAR PERFIS DE BENEFÍCIO.", 403);
    const name = body.name?.trim().replace(/\s+/g, " ") ?? "";
    const kind = body.kind?.trim().toUpperCase();
    const discountType = body.discountType?.trim().toUpperCase();
    const discountValue = Number(body.discountValue);
    if (!name || !["VIP", "BOLSA", "OUTRO"].includes(kind ?? "") || !["PERCENTUAL", "FIXO"].includes(discountType ?? "") || !Number.isInteger(discountValue) || discountValue < 0 || (discountType === "PERCENTUAL" && discountValue > 10000) || (discountType === "FIXO" && discountValue > 100000000)) throw new RequestError("PREENCHA NOME, TIPO E DESCONTO DO PERFIL.", 400);
    const { data, error } = await access.admin.from("xpace_benefit_profiles").insert({ tenant_company_id: access.company.id, name, kind, discount_type: discountType, discount_value: discountValue, created_by: access.user.id, updated_by: access.user.id }).select("id,name").single();
    if (error) throw error;
    return NextResponse.json({ success: true, profile: { id: data.id, name: data.name } }, { status: 201 });
  } catch (error) {
    if (error instanceof AccessError || error instanceof RequestError) return NextResponse.json({ success: false, message: error.message }, { status: error.status });
    if ((error as { code?: string })?.code === "23505") return NextResponse.json({ success: false, message: "JÁ EXISTE UM PERFIL COM ESTE NOME NA XPACE." }, { status: 409 });
    console.error("XPACE BENEFITS ERROR", error);
    return NextResponse.json({ success: false, message: "NÃO FOI POSSÍVEL CADASTRAR O PERFIL DE BENEFÍCIO." }, { status: 500 });
  }
}

class RequestError extends Error { constructor(message: string, public status: number) { super(message); } }

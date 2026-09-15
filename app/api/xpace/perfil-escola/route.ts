import { NextResponse } from "next/server";

import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";

const companySlug = "xpace";
type SchoolProfileInput = { legalName?: string; tradeName?: string; cnpj?: string; postalCode?: string; street?: string; streetNumber?: string; complement?: string; district?: string; city?: string; state?: string };

export async function GET(request: Request) {
  try {
    const { admin, company } = await requireCompanyAccess(request, companySlug);
    const { data, error } = await admin.from("xpace_school_profiles").select("legal_name,trade_name,cnpj,postal_code,street,street_number,complement,district,city,state").eq("tenant_company_id", company.id).maybeSingle();
    if (error) throw error;
    return NextResponse.json({ success: true, profile: toClient(data) });
  } catch (error) { return handleError(error); }
}

export async function PUT(request: Request) {
  try {
    const { profile } = await request.json() as { profile?: SchoolProfileInput };
    const input = normalize(profile);
    if (!input.legalName || !input.tradeName || !isCnpj(input.cnpj)) throw new RequestError("PREENCHA RAZÃO SOCIAL, NOME FANTASIA E UM CNPJ VÁLIDO.", 400);
    if (!input.postalCode || !input.street || !input.streetNumber || !input.district || !input.city || !/^[A-Z]{2}$/.test(input.state)) throw new RequestError("PREENCHA O ENDEREÇO COMPLETO DA ESCOLA.", 400);
    const { admin, company, profile: userProfile } = await requireCompanyAccess(request, companySlug);
    if (!["platform_owner", "company_manager"].includes(userProfile.platform_role)) throw new AccessError("APENAS GESTORES PODEM ALTERAR O PERFIL DA ESCOLA.", 403);
    const { error } = await admin.from("xpace_school_profiles").upsert({ tenant_company_id: company.id, legal_name: input.legalName, trade_name: input.tradeName, cnpj: input.cnpj, postal_code: input.postalCode, street: input.street, street_number: input.streetNumber, complement: input.complement || null, district: input.district, city: input.city, state: input.state, updated_by: userProfile.id, updated_at: new Date().toISOString() }, { onConflict: "tenant_company_id" });
    if (error) throw error;
    return NextResponse.json({ success: true, profile: input });
  } catch (error) { return handleError(error); }
}

function normalize(value?: SchoolProfileInput) { const input = value ?? {}; return { legalName: text(input.legalName), tradeName: text(input.tradeName), cnpj: digits(input.cnpj), postalCode: digits(input.postalCode), street: text(input.street), streetNumber: text(input.streetNumber), complement: text(input.complement), district: text(input.district), city: text(input.city), state: text(input.state).toUpperCase() }; }
function toClient(value: Record<string, string | null> | null) { return { legalName: value?.legal_name ?? "", tradeName: value?.trade_name ?? "", cnpj: value?.cnpj ?? "", postalCode: value?.postal_code ?? "", street: value?.street ?? "", streetNumber: value?.street_number ?? "", complement: value?.complement ?? "", district: value?.district ?? "", city: value?.city ?? "", state: value?.state ?? "" }; }
function text(value?: string) { return (value ?? "").trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR"); }
function digits(value?: string) { return (value ?? "").replace(/\D/g, ""); }
function isCnpj(value: string) { if (!/^\d{14}$/.test(value) || /^(\d)\1{13}$/.test(value)) return false; const digit = (length: number) => { const weights = length === 12 ? [5,4,3,2,9,8,7,6,5,4,3,2] : [6,5,4,3,2,9,8,7,6,5,4,3,2]; const sum = value.slice(0, length).split("").reduce((total, part, index) => total + Number(part) * weights[index], 0); const remainder = sum % 11; return remainder < 2 ? 0 : 11 - remainder; }; return digit(12) === Number(value[12]) && digit(13) === Number(value[13]); }
function handleError(error: unknown) { if (error instanceof AccessError || error instanceof RequestError) return NextResponse.json({ success: false, message: error.message }, { status: error.status }); console.error("XPACE SCHOOL PROFILE ERROR", error); return NextResponse.json({ success: false, message: "NÃO FOI POSSÍVEL SALVAR O PERFIL DA ESCOLA." }, { status: 500 }); }
class RequestError extends Error { constructor(message: string, public status: number) { super(message); } }

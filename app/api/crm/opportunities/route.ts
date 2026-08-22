import { NextResponse } from "next/server";

import { AccessError, requireCompanyAccess, requireCompanyProfile } from "@/lib/server/company-access";
import type { CrmOpportunityInput } from "@/types/crm";

export async function POST(request: Request) { return save(request, false); }
export async function PATCH(request: Request) { return save(request, true); }

async function save(request: Request, editing: boolean) {
  try {
    const body = (await request.json()) as { slug?: string; opportunity?: CrmOpportunityInput };
    const slug = body.slug?.trim() ?? "";
    const input = body.opportunity;
    if (!slug || !input?.clientId || !input.title || (editing && !input.id)) return failure("PREENCHA OS DADOS DA OPORTUNIDADE.", 400);

    const { admin, company, user } = await requireCompanyAccess(request, slug);
    const { data: client } = await admin
      .from("clients")
      .select("id")
      .eq("id", input.clientId)
      .eq("tenant_company_id", company.id)
      .eq("active", true)
      .maybeSingle();
    if (!client) return failure("CLIENTE NAO ENCONTRADO.", 404);

    const representativeId = input.representativeProfileId || user.id;
    await requireCompanyProfile(admin, company.id, representativeId);
    const base = {
      client_id: input.clientId,
      representative_profile_id: representativeId,
      title: upper(input.title),
      stage: input.stage,
      estimated_value: Math.max(0, Number(input.estimatedValue || 0)),
      expected_close_date: input.expectedCloseDate || null,
      notes: upper(input.notes) || null,
      lost_reason: input.stage === "LOST" ? upper(input.lostReason) || null : null,
      updated_at: new Date().toISOString(),
    };

    const query = editing
      ? admin.from("crm_opportunities").update(base).eq("id", input.id).eq("tenant_company_id", company.id)
      : admin.from("crm_opportunities").insert({ ...base, tenant_company_id: company.id, created_by: user.id });
    const { data, error } = await query.select("*").single();
    if (error) throw error;
    return NextResponse.json({ success: true, opportunity: data }, { status: editing ? 200 : 201 });
  } catch (error) {
    return handleError(error);
  }
}

function upper(value: string) { return (value || "").trim().toLocaleUpperCase("pt-BR"); }
function failure(message: string, status: number) { return NextResponse.json({ success: false, message }, { status }); }
function handleError(error: unknown) {
  if (error instanceof AccessError) return failure(error.message, error.status);
  console.error("CRM OPPORTUNITY ERROR", error);
  return failure("NAO FOI POSSIVEL SALVAR A OPORTUNIDADE.", 500);
}

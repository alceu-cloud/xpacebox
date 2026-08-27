import { NextResponse } from "next/server";

import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const slug = url.searchParams.get("slug")?.trim() ?? "";
    const clientId = url.searchParams.get("clientId")?.trim() ?? "";
    if (!slug || !clientId) return failure("CLIENTE INVALIDO PARA A CONSULTA DE OPORTUNIDADES.", 400);

    const { admin, company } = await requireCompanyAccess(request, slug);
    const { data, error } = await admin
      .from("crm_opportunities")
      .select("id,title,stage,estimated_value,product_reference,expected_close_date")
      .eq("tenant_company_id", company.id)
      .eq("client_id", clientId)
      .is("quote_id", null)
      .not("stage", "in", "(WON,LOST)")
      .order("updated_at", { ascending: false });
    if (error) throw error;

    return NextResponse.json({
      success: true,
      opportunities: (data ?? []).map((item) => ({
        id: item.id,
        title: item.title || "OPORTUNIDADE SEM TITULO",
        stage: item.stage || "CONTACT_PENDING",
        estimatedValue: Number(item.estimated_value || 0),
        productReference: item.product_reference || "",
        expectedCloseDate: item.expected_close_date || "",
      })),
    });
  } catch (error) {
    return handleError(error);
  }
}

function failure(message: string, status: number) { return NextResponse.json({ success: false, message }, { status }); }
function handleError(error: unknown) {
  if (error instanceof AccessError) return failure(error.message, error.status);
  console.error("QUOTE CRM OPPORTUNITY LOOKUP ERROR", error);
  return failure("NAO FOI POSSIVEL CONSULTAR AS OPORTUNIDADES DO CLIENTE.", 500);
}

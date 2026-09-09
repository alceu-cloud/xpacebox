import { NextResponse } from "next/server";

import { AccessError, requireCompanyAccess, requireCompanyProfile } from "@/lib/server/company-access";
import { saoPauloDate, scheduleCommercialCycle } from "@/lib/server/commercial-cycle";
import type { CrmOrderInput } from "@/types/crm";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { slug?: string; order?: CrmOrderInput };
    const slug = body.slug?.trim() ?? "";
    const input = body.order;
    if (!slug || !input?.clientId || !input.title?.trim()) return failure("PREENCHA OS DADOS DO PEDIDO.", 400);
    if (!input.orderDate) return failure("INFORME A DATA DO PEDIDO.", 400);

    const { admin, company, user } = await requireCompanyAccess(request, slug);
    const { data: client, error: clientError } = await admin
      .from("clients")
      .select("id")
      .eq("id", input.clientId)
      .eq("tenant_company_id", company.id)
      .eq("active", true)
      .maybeSingle();
    if (clientError) throw clientError;
    if (!client) return failure("CLIENTE NAO ENCONTRADO.", 404);

    const representativeId = input.representativeProfileId || user.id;
    await requireCompanyProfile(admin, company.id, representativeId);
    const orderDate = input.orderDate || saoPauloDate();
    const now = new Date().toISOString();
    const { data: opportunity, error: opportunityError } = await admin.from("crm_opportunities").insert({
      tenant_company_id: company.id,
      client_id: input.clientId,
      representative_profile_id: representativeId,
      title: upper(input.title),
      stage: "WON",
      estimated_value: Math.max(0, Number(input.totalValue || 0)),
      notes: upper(input.notes) || "PEDIDO REGISTRADO MANUALMENTE.",
      closed_at: orderDate,
      created_by: user.id,
      updated_at: now,
    }).select("*").single();
    if (opportunityError) throw opportunityError;

    const cycle = await scheduleCommercialCycle({
      admin,
      companyId: company.id,
      clientId: input.clientId,
      representativeId,
      userId: user.id,
      baseDate: orderDate,
      purchaseRecorded: true,
      title: upper(input.title),
    });

    const { error: activityError } = await admin.from("crm_activities").insert({
      tenant_company_id: company.id,
      client_id: input.clientId,
      opportunity_id: opportunity.id,
      representative_profile_id: representativeId,
      activity_type: "NOTE",
      outcome: "PURCHASE_EXPECTED",
      subject: "PEDIDO REGISTRADO",
      notes: `PEDIDO REGISTRADO EM ${orderDate}. VALOR: ${Number(input.totalValue || 0).toFixed(2)}.`,
      occurred_at: now,
      agenda_kind: "OPPORTUNITY",
      created_by: user.id,
    });
    if (activityError) throw activityError;

    return NextResponse.json({ success: true, opportunity, cycleScheduled: cycle.scheduled }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}

function upper(value: string) { return (value || "").trim().toLocaleUpperCase("pt-BR"); }
function failure(message: string, status: number) { return NextResponse.json({ success: false, message }, { status }); }
function handleError(error: unknown) {
  if (error instanceof AccessError) return failure(error.message, error.status);
  console.error("CRM ORDER ERROR", error);
  return failure("NAO FOI POSSIVEL REGISTRAR O PEDIDO.", 500);
}

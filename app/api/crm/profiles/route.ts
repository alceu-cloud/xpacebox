import { NextResponse } from "next/server";

import { AccessError, requireCompanyAccess, requireCompanyProfile } from "@/lib/server/company-access";
import type { CrmProfileInput } from "@/types/crm";

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as { slug?: string; profile?: CrmProfileInput };
    const slug = body.slug?.trim() ?? "";
    const input = body.profile;
    if (!slug || !input?.clientId) return failure("CLIENTE NAO INFORMADO.", 400);

    const { admin, company, user } = await requireCompanyAccess(request, slug);
    const { data: client } = await admin.from("clients").select("id").eq("id", input.clientId).eq("tenant_company_id", company.id).eq("active", true).maybeSingle();
    if (!client) return failure("CLIENTE NAO ENCONTRADO.", 404);
    if (input.ownerProfileId) await requireCompanyProfile(admin, company.id, input.ownerProfileId);
    const purchaseFrequencyDays = input.purchaseFrequencyDays && input.purchaseFrequencyDays > 0 ? Math.trunc(input.purchaseFrequencyDays) : null;
    const nextPurchaseAt = calculateNextPurchaseDate(input.lastPurchaseAt, purchaseFrequencyDays);

    const payload = {
      tenant_company_id: company.id,
      client_id: input.clientId,
      owner_profile_id: input.ownerProfileId || null,
      purchase_frequency_days: purchaseFrequencyDays,
      average_purchase_value: Math.max(0, Number(input.averagePurchaseValue || 0)),
      last_purchase_at: input.lastPurchaseAt || null,
      next_purchase_at: nextPurchaseAt || null,
      next_contact_at: input.nextContactAt || null,
      relationship_status: input.relationshipStatus || "ACTIVE",
      whatsapp_opt_in: Boolean(input.whatsappOptIn),
      whatsapp_opt_in_at: input.whatsappOptIn ? new Date().toISOString() : null,
      whatsapp_opt_in_source: input.whatsappOptIn ? input.whatsappOptInSource || "CRM" : null,
      notes: upper(input.notes) || null,
      created_by: user.id,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await admin.from("crm_customer_profiles").upsert(payload, { onConflict: "tenant_company_id,client_id" }).select("*").single();
    if (error) throw error;
    return NextResponse.json({ success: true, profile: data });
  } catch (error) {
    return handleError(error);
  }
}

function calculateNextPurchaseDate(lastPurchaseAt: string, purchaseFrequencyDays: number | null) {
  if (!lastPurchaseAt || !purchaseFrequencyDays) return "";
  const [year, month, day] = lastPurchaseAt.split("-").map(Number);
  if (!year || !month || !day) return "";
  const date = new Date(year, month - 1, day, 12);
  date.setDate(date.getDate() + purchaseFrequencyDays);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function upper(value: string) { return (value || "").trim().toLocaleUpperCase("pt-BR"); }
function failure(message: string, status: number) { return NextResponse.json({ success: false, message }, { status }); }
function handleError(error: unknown) {
  if (error instanceof AccessError) return failure(error.message, error.status);
  console.error("CRM PROFILE ERROR", error);
  return failure("NAO FOI POSSIVEL SALVAR A CARTEIRA DO CLIENTE.", 500);
}

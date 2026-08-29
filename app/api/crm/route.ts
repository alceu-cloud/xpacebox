import { NextResponse } from "next/server";

import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";
import { syncExistingDirectQuotesWithCrm } from "@/lib/server/quote-crm";

export async function GET(request: Request) {
  try {
    const slug = new URL(request.url).searchParams.get("slug")?.trim() ?? "";
    if (!slug) return failure("EMPRESA NAO INFORMADA.", 400);

    const { admin, company, profile, user } = await requireCompanyAccess(request, slug);
    await syncExistingDirectQuotesWithCrm(admin, company.id, user.id).catch((error) => {
      console.error("DIRECT QUOTES CRM BACKFILL ERROR", error);
    });
    await activateDueCommercialCycles({ admin, companyId: company.id, userId: user.id });
    const [profilesResult, activitiesResult, opportunitiesResult, quotesResult, sellersResult, peopleResult] = await Promise.all([
      admin.from("crm_customer_profiles").select("*").eq("tenant_company_id", company.id),
      admin.from("crm_activities").select("*").eq("tenant_company_id", company.id).order("occurred_at", { ascending: false }).limit(300),
      admin.from("crm_opportunities").select("*").eq("tenant_company_id", company.id).order("updated_at", { ascending: false }).limit(300),
      admin.from("quotes").select("client_id, grand_total, created_at").eq("tenant_company_id", company.id).not("client_id", "is", null),
      admin.from("seller_companies").select("id, name").eq("tenant_company_id", company.id).eq("active", true).order("name"),
      admin.from("profiles").select("id, full_name, email").eq("active", true),
    ]);

    for (const result of [profilesResult, activitiesResult, opportunitiesResult, quotesResult, sellersResult, peopleResult]) {
      if (result.error) throw result.error;
    }

    const sellers = sellersResult.data ?? [];
    if (sellers.length) {
      const { error } = await admin.from("whatsapp_business_connections").upsert(
        sellers.map((seller) => ({ tenant_company_id: company.id, seller_company_id: seller.id })),
        { onConflict: "tenant_company_id,seller_company_id", ignoreDuplicates: true }
      );
      if (error) throw error;
    }

    const connectionsResult = await admin
      .from("whatsapp_business_connections")
      .select("*")
      .eq("tenant_company_id", company.id);
    if (connectionsResult.error) throw connectionsResult.error;

    const people = new Map((peopleResult.data ?? []).map((person) => [person.id, person.full_name || person.email || "USUARIO"]));
    const sellerNames = new Map(sellers.map((seller) => [seller.id, seller.name]));
    const quoteMap = new Map<string, { count: number; total: number; lastQuoteAt: string }>();
    for (const quote of quotesResult.data ?? []) {
      const clientId = String(quote.client_id || "");
      if (!clientId) continue;
      const current = quoteMap.get(clientId) ?? { count: 0, total: 0, lastQuoteAt: "" };
      current.count += 1;
      current.total += Number(quote.grand_total || 0);
      if (!current.lastQuoteAt || String(quote.created_at) > current.lastQuoteAt) current.lastQuoteAt = String(quote.created_at);
      quoteMap.set(clientId, current);
    }

    const isManager = ["platform_owner", "company_manager"].includes(profile.platform_role);
    return NextResponse.json({
      success: true,
      overview: {
        currentProfileId: profile.id,
        currentProfileName: profile.full_name || profile.email || "USUARIO",
        isManager,
        profiles: (profilesResult.data ?? []).map((row) => ({
          clientId: row.client_id,
          ownerProfileId: row.owner_profile_id || "",
          ownerName: people.get(row.owner_profile_id) || "",
          purchaseFrequencyDays: row.purchase_frequency_days == null ? null : Number(row.purchase_frequency_days),
          averagePurchaseValue: Number(row.average_purchase_value || 0),
          lastPurchaseAt: row.last_purchase_at || "",
          nextPurchaseAt: row.next_purchase_at || "",
          nextContactAt: row.next_contact_at || "",
          relationshipStatus: row.relationship_status,
          whatsappOptIn: Boolean(row.whatsapp_opt_in),
          whatsappOptInAt: row.whatsapp_opt_in_at || "",
          whatsappOptInSource: row.whatsapp_opt_in_source || "",
          notes: row.notes || "",
          updatedAt: row.updated_at,
        })),
        activities: (activitiesResult.data ?? []).map((row) => ({
          id: row.id,
          clientId: row.client_id,
          opportunityId: row.opportunity_id || "",
          representativeProfileId: row.representative_profile_id || "",
          representativeName: people.get(row.representative_profile_id) || "",
          activityType: row.activity_type,
          outcome: row.outcome,
          subject: row.subject || "",
          notes: row.notes || "",
          occurredAt: row.occurred_at,
          nextActionType: row.next_action_type || "",
          nextActionAt: row.next_action_at || "",
        })),
        opportunities: (opportunitiesResult.data ?? []).map((row) => ({
          id: row.id,
          clientId: row.client_id,
          representativeProfileId: row.representative_profile_id || "",
          representativeName: people.get(row.representative_profile_id) || "",
          title: row.title,
          productFichaId: row.product_ficha_id || "",
          productReference: row.product_reference || "",
          productQuantity: Number(row.product_quantity || 0),
          productUnitPrice: Number(row.product_unit_price || 0),
          stage: row.stage,
          estimatedValue: Number(row.estimated_value || 0),
          expectedCloseDate: row.expected_close_date || "",
          quoteId: row.quote_id || "",
          notes: row.notes || "",
          lostReason: row.lost_reason || "",
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        })),
        quotes: [...quoteMap.entries()].map(([clientId, value]) => ({ clientId, ...value })),
        whatsappConnections: (connectionsResult.data ?? []).map((row) => ({
          sellerCompanyId: row.seller_company_id,
          sellerCompanyName: sellerNames.get(row.seller_company_id) || "EMPRESA",
          status: row.status,
          displayPhoneNumber: row.display_phone_number || "",
          displayName: row.display_name || "",
          webhookSubscribed: Boolean(row.webhook_subscribed),
          connectedAt: row.connected_at || "",
        })),
      },
    });
  } catch (error) {
    return handleError(error);
  }
}

async function activateDueCommercialCycles({
  admin,
  companyId,
  userId,
}: {
  admin: Awaited<ReturnType<typeof requireCompanyAccess>>["admin"];
  companyId: string;
  userId: string;
}) {
  const now = new Date().toISOString();
  const activationCutoff = endOfSaoPauloDay();
  const { data: cycles, error: cyclesError } = await admin
    .from("crm_activities")
    .select("id,client_id,representative_profile_id,next_action_at")
    .eq("tenant_company_id", companyId)
    .eq("subject", "PROXIMO CICLO COMERCIAL AGENDADO")
    .is("opportunity_id", null)
    .not("next_action_at", "is", null)
    .lte("next_action_at", activationCutoff)
    .order("next_action_at", { ascending: true })
    .limit(100);
  if (cyclesError) throw cyclesError;

  for (const cycle of cycles ?? []) {
    const { count: activeCount, error: activeError } = await admin
      .from("crm_opportunities")
      .select("id", { count: "exact", head: true })
      .eq("tenant_company_id", companyId)
      .eq("client_id", cycle.client_id)
      .not("stage", "in", "(WON,LOST)");
    if (activeError) throw activeError;

    if (Number(activeCount || 0) > 0) {
      const { error: dismissError } = await admin
        .from("crm_activities")
        .update({ next_action_type: null, next_action_at: null })
        .eq("id", cycle.id)
        .eq("tenant_company_id", companyId)
        .is("opportunity_id", null);
      if (dismissError) throw dismissError;

      const { error: profileError } = await admin
        .from("crm_customer_profiles")
        .update({ next_purchase_at: null, updated_at: now })
        .eq("tenant_company_id", companyId)
        .eq("client_id", cycle.client_id);
      if (profileError) throw profileError;
      continue;
    }

    const { data: customerProfile, error: profileError } = await admin
      .from("crm_customer_profiles")
      .select("owner_profile_id,average_purchase_value")
      .eq("tenant_company_id", companyId)
      .eq("client_id", cycle.client_id)
      .maybeSingle();
    if (profileError) throw profileError;

    const representativeId = customerProfile?.owner_profile_id || cycle.representative_profile_id || userId;
    const { data: opportunity, error: opportunityError } = await admin
      .from("crm_opportunities")
      .insert({
        tenant_company_id: companyId,
        client_id: cycle.client_id,
        representative_profile_id: representativeId,
        title: "RECOMPRA PROGRAMADA",
        stage: "CONTACT_PENDING",
        estimated_value: Number(customerProfile?.average_purchase_value || 0),
        notes: "OPORTUNIDADE CRIADA AUTOMATICAMENTE NO DIA PROGRAMADO PARA O NOVO CICLO DE COMPRA.",
        created_by: userId,
        updated_at: now,
      })
      .select("id")
      .single();
    if (opportunityError) throw opportunityError;

    const { data: linkedActivity, error: linkError } = await admin
      .from("crm_activities")
      .update({ opportunity_id: opportunity.id })
      .eq("id", cycle.id)
      .eq("tenant_company_id", companyId)
      .is("opportunity_id", null)
      .select("id")
      .maybeSingle();
    if (linkError) throw linkError;

    if (!linkedActivity) {
      const { error: deleteError } = await admin
        .from("crm_opportunities")
        .delete()
        .eq("id", opportunity.id)
        .eq("tenant_company_id", companyId);
      if (deleteError) throw deleteError;
      continue;
    }

    const { error: updateProfileError } = await admin
      .from("crm_customer_profiles")
      .update({ next_purchase_at: null, updated_at: now })
      .eq("tenant_company_id", companyId)
      .eq("client_id", cycle.client_id);
    if (updateProfileError) throw updateProfileError;
  }
}

function endOfSaoPauloDay() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T23:59:59.999-03:00`;
}

function failure(message: string, status: number) {
  return NextResponse.json({ success: false, message }, { status });
}

function handleError(error: unknown) {
  if (error instanceof AccessError) return failure(error.message, error.status);
  console.error("CRM OVERVIEW ERROR", error);
  const message = String((error as { message?: string })?.message ?? "");
  if (message.includes("crm_") || message.includes("whatsapp_business_connections")) {
    return failure("A ESTRUTURA DO CRM AINDA NAO FOI APLICADA NO SUPABASE.", 503);
  }
  return failure("NAO FOI POSSIVEL CARREGAR O CRM.", 500);
}

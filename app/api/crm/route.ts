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

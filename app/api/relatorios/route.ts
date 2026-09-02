import { NextResponse } from "next/server";

import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";

export async function GET(request: Request) {
  try {
    const slug = new URL(request.url).searchParams.get("slug")?.trim() ?? "";
    if (!slug) return failure("EMPRESA NAO INFORMADA.", 400);

    const { admin, company, profile, user } = await requireCompanyAccess(request, slug);
    const isManager = ["platform_owner", "company_manager"].includes(profile.platform_role);
    const [clientsResult, profilesResult, activitiesResult, opportunitiesResult, quotesResult, sellersResult, peopleResult, settingsResult, membersResult] = await Promise.all([
      admin.from("clients").select("id,legal_name,trade_name,seller_company_id,representative_profile_id,active,updated_at").eq("tenant_company_id", company.id).eq("active", true).limit(5000),
      admin.from("crm_customer_profiles").select("client_id,owner_profile_id,purchase_frequency_days,average_purchase_value,last_purchase_at,next_purchase_at,next_contact_at,relationship_status").eq("tenant_company_id", company.id).limit(5000),
      admin.from("crm_activities").select("id,client_id,opportunity_id,representative_profile_id,activity_type,outcome,subject,occurred_at,next_action_at").eq("tenant_company_id", company.id).order("occurred_at", { ascending: false }).limit(5000),
      admin.from("crm_opportunities").select("id,client_id,representative_profile_id,title,product_ficha_id,product_reference,stage,estimated_value,expected_close_date,lost_reason,created_at,updated_at").eq("tenant_company_id", company.id).order("updated_at", { ascending: false }).limit(5000),
      admin.from("quotes").select("id,client_id,representative_profile_id,seller_company_name,seller_company_slug,quote_number,grand_total,issue_date,valid_until,created_at,quote_items(item_number,ft_number,description,total,snapshot)").eq("tenant_company_id", company.id).order("created_at", { ascending: false }).limit(5000),
      admin.from("seller_companies").select("id,name,slug").eq("tenant_company_id", company.id).eq("active", true),
      admin.from("profiles").select("id,full_name,email").eq("active", true),
      admin.from("company_manager_settings").select("data").eq("tenant_company_id", company.id).maybeSingle(),
      admin.from("company_members").select("profile_id").eq("company_id", company.id).eq("active", true),
    ]);
    for (const result of [clientsResult, profilesResult, activitiesResult, opportunitiesResult, quotesResult, sellersResult, peopleResult, settingsResult, membersResult]) {
      if (result.error) throw result.error;
    }

    const allClients = clientsResult.data ?? [];
    const visibleClientIds = new Set(
      (isManager ? allClients : allClients.filter((item) => item.representative_profile_id === user.id)).map((item) => item.id)
    );
    const clients = allClients.filter((item) => visibleClientIds.has(item.id));
    const profiles = (profilesResult.data ?? []).filter((item) => visibleClientIds.has(item.client_id));
    const opportunities = (opportunitiesResult.data ?? []).filter((item) => isManager || item.representative_profile_id === user.id || visibleClientIds.has(item.client_id));
    const activities = (activitiesResult.data ?? []).filter((item) => isManager || item.representative_profile_id === user.id || visibleClientIds.has(item.client_id));
    const quotes = (quotesResult.data ?? []).filter((item) => isManager || item.representative_profile_id === user.id || visibleClientIds.has(item.client_id));
    const people = new Map((peopleResult.data ?? []).map((item) => [item.id, item.full_name || item.email || "USUARIO"]));
    const companyMemberIds = (membersResult.data ?? []).map((item) => item.profile_id);
    const sellers = new Map((sellersResult.data ?? []).map((item) => [item.id, { name: item.name, slug: item.slug }]));
    const settings = (settingsResult.data?.data ?? {}) as Record<string, unknown>;
    const productFichas = Array.isArray(settings.productFichas) ? settings.productFichas.filter((item) => {
      const ficha = item as { clientId?: string };
      return isManager || visibleClientIds.has(ficha.clientId || "");
    }) : [];
    const materials = Array.isArray(settings.materials)
      ? isManager
        ? settings.materials
        : settings.materials.map((item) => {
          const material = item as { id?: string; code?: string; paperType?: string };
          return { id: material.id, code: material.code, paperType: material.paperType };
        })
      : [];

    return NextResponse.json({
      success: true,
      report: {
        isManager,
        currentProfileId: user.id,
        representatives: isManager
          ? [...new Set([...companyMemberIds, ...clients.map((item) => item.representative_profile_id), ...opportunities.map((item) => item.representative_profile_id)].filter(Boolean))]
            .map((id) => ({ id, name: people.get(id) || "USUARIO" }))
            .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
          : [{ id: user.id, name: people.get(user.id) || "USUARIO" }],
        clients: clients.map((item) => ({
          id: item.id,
          name: item.trade_name || item.legal_name || "CLIENTE",
          sellerCompanyId: item.seller_company_id || "",
          sellerCompanyName: sellers.get(item.seller_company_id || "")?.name || "SEM EMPRESA",
          sellerCompanySlug: sellers.get(item.seller_company_id || "")?.slug || "",
          representativeProfileId: item.representative_profile_id || "",
          representativeName: people.get(item.representative_profile_id || "") || "SEM REPRESENTANTE",
          updatedAt: item.updated_at,
        })),
        profiles,
        activities,
        opportunities,
        quotes,
        productFichas,
        materials,
        salesGoals: isManager ? settings.salesGoals ?? null : null,
      },
    });
  } catch (error) {
    if (error instanceof AccessError) return failure(error.message, error.status);
    console.error("REPORTS API ERROR", error);
    return failure("NAO FOI POSSIVEL CARREGAR OS RELATORIOS.", 500);
  }
}

function failure(message: string, status: number) {
  return NextResponse.json({ success: false, message }, { status });
}

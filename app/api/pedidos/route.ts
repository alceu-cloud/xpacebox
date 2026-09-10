import { NextResponse } from "next/server";

import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";

export async function GET(request: Request) {
  try {
    const slug = new URL(request.url).searchParams.get("slug")?.trim() ?? "";
    if (!slug) return failure("EMPRESA NAO INFORMADA.", 400);
    const { admin, company } = await requireCompanyAccess(request, slug);
    const { data, error } = await admin
      .from("sales_orders")
      .select("*, sales_order_items(*)")
      .eq("tenant_company_id", company.id)
      .order("ordered_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;

    const clientIds = [...new Set((data ?? []).map((item) => String(item.client_id || "")).filter(Boolean))];
    const representativeIds = [...new Set((data ?? []).map((item) => String(item.representative_profile_id || "")).filter(Boolean))];
    const [clientsResult, profilesResult] = await Promise.all([
      clientIds.length ? admin.from("clients").select("id,legal_name,trade_name").in("id", clientIds) : Promise.resolve({ data: [], error: null }),
      representativeIds.length ? admin.from("profiles").select("id,full_name,email").in("id", representativeIds) : Promise.resolve({ data: [], error: null }),
    ]);
    if (clientsResult.error) throw clientsResult.error;
    if (profilesResult.error) throw profilesResult.error;
    const clientNames = new Map((clientsResult.data ?? []).map((item) => [item.id, item.trade_name || item.legal_name || "CLIENTE"]));
    const representativeNames = new Map((profilesResult.data ?? []).map((item) => [item.id, item.full_name || item.email || "USUARIO"]));

    return NextResponse.json({ success: true, orders: (data ?? []).map((row) => ({
      id: row.id,
      saleNumber: row.sale_number,
      crmOpportunityId: row.crm_opportunity_id || "",
      clientId: row.client_id,
      clientName: clientNames.get(row.client_id) || "CLIENTE",
      representativeName: representativeNames.get(row.representative_profile_id) || "",
      sellerCompanyName: row.seller_company_name,
      sellerCompanySlug: row.seller_company_slug,
      orderedAt: row.ordered_at,
      notes: row.notes || "",
      productTotal: Number(row.product_total || 0),
      ipiTotal: Number(row.ipi_total || 0),
      grandTotal: Number(row.grand_total || 0),
      contributionTotal: row.contribution_total == null ? null : Number(row.contribution_total),
      mcPercent: row.mc_percent == null ? null : Number(row.mc_percent),
      items: ((row.sales_order_items as Record<string, unknown>[] | undefined) ?? [])
        .sort((a, b) => Number(a.item_number || 0) - Number(b.item_number || 0))
        .map((item) => ({
          id: item.id,
          itemNumber: Number(item.item_number || 0),
          productFichaId: item.product_ficha_id || "",
          ftNumber: item.ft_number || "",
          revision: item.revision || "",
          description: item.description || "",
          materialCode: item.material_code || "",
          baseQuantity: Number(item.base_quantity || 0),
          quantity: Number(item.quantity || 0),
          unitPrice: Number(item.unit_price || 0),
          ipiPercent: Number(item.ipi_percent || 0),
          ipiValue: Number(item.ipi_value || 0),
          total: Number(item.total || 0),
          netUnitPrice: item.net_unit_price == null ? null : Number(item.net_unit_price),
          materialCostUnit: item.material_cost_unit == null ? null : Number(item.material_cost_unit),
          contributionUnit: item.contribution_unit == null ? null : Number(item.contribution_unit),
          mcPercent: item.mc_percent == null ? null : Number(item.mc_percent),
          marginSource: item.margin_source,
        })),
    })) });
  } catch (error) {
    if (error instanceof AccessError) return failure(error.message, error.status);
    console.error("SALES ORDERS API ERROR", error);
    return failure("NAO FOI POSSIVEL CARREGAR OS PEDIDOS.", 500);
  }
}

function failure(message: string, status: number) { return NextResponse.json({ success: false, message }, { status }); }

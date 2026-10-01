import { NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/server/company-access";
import { requireStockManager, StockError, stockError } from "@/lib/server/xpace-stock";
import { stockReportFilters, stockReportSearch, type StockReportRow } from "@/lib/xpace/stock-report";

type DbRow = { id: string; product_id: string; direction: "ENTRADA" | "SAIDA"; quantity: number; stock_before: number; stock_after: number; actor_id: string | null; actor_name: string; created_at: string; note: string; product: { description: string; code: string; unit_id: string } };

export async function GET(request: Request) {
  try {
    const access = await requireCompanyAccess(request, "xpace");
    requireStockManager(access.profile.platform_role);
    let filters: ReturnType<typeof stockReportFilters>;
    try { filters = stockReportFilters(new URL(request.url).searchParams); }
    catch (error) { throw new StockError((error as Error).message); }
    let query = access.admin.from("xpace_stock_movements")
      .select("id,product_id,direction,quantity,stock_before,stock_after,actor_id,actor_name,created_at,note,product:xpace_stock_products!inner(description,code,unit_id)", { count: "exact" })
      .eq("tenant_company_id", access.company.id)
      .gte("created_at", filters.since).lt("created_at", filters.until)
      .order("created_at", { ascending: false }).order("id", { ascending: false });
    if (filters.direction !== "ALL") query = query.eq("direction", filters.direction);
    if (filters.product) query = query.ilike("product.description", stockReportSearch(filters.product));
    if (filters.actor) query = query.ilike("actor_name", stockReportSearch(filters.actor));
    const pageSize = 50;
    const { data, error, count } = await query.range((filters.page - 1) * pageSize, filters.page * pageSize - 1);
    if (error) throw error;
    const rows = (data ?? []) as unknown as DbRow[];
    const unitIds = [...new Set(rows.map(row => row.product.unit_id))];
    const { data: units, error: unitError } = unitIds.length
      ? await access.admin.from("xpace_stock_units").select("id,abbreviation").eq("tenant_company_id", access.company.id).in("id", unitIds)
      : { data: [], error: null };
    if (unitError) throw unitError;
    const unitMap = new Map((units ?? []).map(row => [row.id, row.abbreviation]));
    const items: StockReportRow[] = rows.map(row => ({ id: row.id, productId: row.product_id, product: row.product.description, code: row.product.code, unit: unitMap.get(row.product.unit_id) ?? "", direction: row.direction, quantity: Number(row.quantity), before: Number(row.stock_before), after: Number(row.stock_after), actorId: row.actor_id, actor: row.actor_name?.trim() || "Não identificado", at: row.created_at, note: row.note }));
    return NextResponse.json({ success: true, items, total: count ?? 0, page: filters.page, pages: Math.max(1, Math.ceil((count ?? 0) / pageSize)) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return stockError(error); }
}

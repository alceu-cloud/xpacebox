import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/server/company-access";
import { StockError, stockId, stockDescription, stockManager, requireStockManager, stockError } from "@/lib/server/xpace-stock";
import { stockCode, stockMoney, stockQuantity, type StockProduct } from "@/lib/xpace/stock";

const headers = { "Cache-Control": "no-store" };
const productColumns = "id,description,cost_price_cents,sale_price_cents,category_id,unit_id,controls_stock,minimum_stock,stock_quantity,code,code_mode,image_path,active";

export async function GET(request: Request) {
  try {
    const access = await requireCompanyAccess(request, "xpace");
    const params = new URL(request.url).searchParams;
    if (params.has("history")) {
      const productId = stockId(params.get("history"));
      const { data, error } = await access.admin.from("xpace_stock_movements").select("id,direction,quantity,stock_before,stock_after,note,actor_name,created_at,low_stock_crossed,alert_message_id").eq("tenant_company_id", access.company.id).eq("product_id", productId).order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      const ids = (data ?? []).flatMap(row => row.alert_message_id ? [row.alert_message_id] : []);
      const { data: messages, error: messageError } = ids.length ? await access.admin.from("xpace_message_outbox").select("id,status,delivered_at,read_at").eq("tenant_company_id", access.company.id).in("id", ids) : { data: [], error: null };
      if (messageError) throw messageError;
      const indexed = new Map((messages ?? []).map(row => [row.id, row]));
      return NextResponse.json({ success: true, movements: (data ?? []).map(row => ({ ...row, quantity: Number(row.quantity), stock_before: Number(row.stock_before), stock_after: Number(row.stock_after), alertStatus: indexed.get(row.alert_message_id)?.status, deliveredAt: indexed.get(row.alert_message_id)?.delivered_at ?? null })) }, { headers });
    }
    const [categoryResult, unitResult, settingsResult] = await Promise.all([
      access.admin.from("xpace_stock_categories").select("id,description,active").eq("tenant_company_id", access.company.id).order("description"),
      access.admin.from("xpace_stock_units").select("id,description,abbreviation,active").eq("tenant_company_id", access.company.id).order("description"),
      access.admin.from("xpace_stock_settings").select("alert_phone").eq("tenant_company_id", access.company.id).maybeSingle(),
    ]);
    if (categoryResult.error || unitResult.error || settingsResult.error) throw categoryResult.error ?? unitResult.error ?? settingsResult.error;
    const categories = categoryResult.data ?? [], units = unitResult.data ?? [];
    let query = access.admin.from("xpace_stock_products").select(productColumns, { count: "exact" }).eq("tenant_company_id", access.company.id).order("description");
    if (params.has("code")) query = query.eq("code", stockCode(params.get("code"))).eq("active", true);
    else {
      if (params.get("archived") !== "1") query = query.eq("active", true);
      if (params.get("sheet") === "1") query = query.eq("code_mode", "INTERNAL");
      const q = (params.get("q") ?? "").trim().slice(0, 100);
      if (q) query = query.ilike("description", `%${q.replace(/[\\%_]/g, char => `\\${char}`)}%`);
      if (params.has("category")) query = query.eq("category_id", stockId(params.get("category")));
    }
    const page = Math.max(0, Math.min(10000, Number.parseInt(params.get("page") ?? "0", 10) || 0));
    const size = params.get("sheet") === "1" ? 1000 : 100;
    const { data, error, count } = await query.range(page * size, page * size + size - 1);
    if (error) throw error;
    const canManage = stockManager(access.profile.platform_role);
    const products: StockProduct[] = (data ?? []).map(row => ({ id: row.id, description: row.description, costPriceCents: canManage ? row.cost_price_cents : null, salePriceCents: row.sale_price_cents, categoryId: row.category_id, unitId: row.unit_id, categoryName: categories.find(cat => cat.id === row.category_id)?.description ?? "", unitName: units.find(unit => unit.id === row.unit_id)?.description ?? "", unitAbbreviation: units.find(unit => unit.id === row.unit_id)?.abbreviation ?? "", controlsStock: row.controls_stock, minimumStock: Number(row.minimum_stock), stockQuantity: Number(row.stock_quantity), code: row.code, codeMode: row.code_mode, imageUrl: row.image_path ? access.admin.storage.from("xpace-stock-images").getPublicUrl(row.image_path).data.publicUrl : "", active: row.active }));
    return NextResponse.json({ success: true, canManage, products, total: count ?? products.length, categories, units, alertConfigured: Boolean(settingsResult.data?.alert_phone) }, { headers });
  } catch (error) { return stockError(error); }
}

export async function POST(request: Request) {
  try {
    const access = await requireCompanyAccess(request, "xpace");
    const body = await request.json();
    if (body.action === "MOVE") {
      if (!["ENTRADA", "SAIDA"].includes(body.direction)) throw new StockError("SELECIONE ENTRADA OU BAIXA.");
      const note = typeof body.note === "string" ? body.note.trim() : "";
      if (note.length > 500) throw new StockError("OBSERVAÇÃO MUITO LONGA.");
      let quantity: number;
      try { quantity = stockQuantity(body.quantity); } catch (error) { throw new StockError((error as Error).message); }
      const { data, error } = await access.admin.rpc("xpace_move_stock", { p_tenant: access.company.id, p_actor: access.user.id, p_product: stockId(body.productId), p_request: stockId(body.requestId), p_direction: body.direction, p_quantity: quantity, p_note: note });
      if (error) throw error;
      return NextResponse.json({ success: true, ...data }, { headers });
    }
    requireStockManager(access.profile.platform_role);
    if (body.action === "SAVE_CATEGORY" || body.action === "SAVE_UNIT") {
      const unit = body.action === "SAVE_UNIT";
      const table = unit ? "xpace_stock_units" : "xpace_stock_categories";
      const row = { description: stockDescription(body.description, 80), ...(unit ? { abbreviation: stockDescription(body.abbreviation, 8).toUpperCase() } : {}) };
      const query = body.id ? access.admin.from(table).update(row).eq("tenant_company_id", access.company.id).eq("id", stockId(body.id)) : access.admin.from(table).insert({ ...row, tenant_company_id: access.company.id });
      const { data, error } = await query.select("id").single();
      if (error) throw error;
      return NextResponse.json({ success: true, id: data.id }, { headers });
    }
    if (body.action === "SAVE_PRODUCT") {
      const value = body.product;
      if (!value || typeof value.controlsStock !== "boolean" || !["EXTERNAL", "INTERNAL"].includes(value.codeMode)) throw new StockError("DADOS DO PRODUTO INVÁLIDOS.");
      let cost: number, sale: number, minimum: number, code: string;
      const id = value.id ? stockId(value.id) : randomUUID();
      try { cost = stockMoney(value.costPriceCents); sale = stockMoney(value.salePriceCents); minimum = value.controlsStock ? stockQuantity(value.minimumStock, true) : 0; code = value.codeMode === "INTERNAL" ? `XP-${id.toUpperCase()}` : stockCode(value.code); } catch (error) { throw new StockError((error as Error).message); }
      const row = { description: stockDescription(value.description), cost_price_cents: cost, sale_price_cents: sale, category_id: stockId(value.categoryId), unit_id: stockId(value.unitId), controls_stock: value.controlsStock, minimum_stock: minimum, code, code_mode: value.codeMode, updated_by: access.user.id, updated_at: new Date().toISOString() };
      // Never accept a stock quantity from catalog edits: all balances come from the ledger.
      const query = value.id ? access.admin.from("xpace_stock_products").update(row).eq("tenant_company_id", access.company.id).eq("id", id) : access.admin.from("xpace_stock_products").insert({ ...row, id, tenant_company_id: access.company.id, created_by: access.user.id });
      const { data, error } = await query.select("id").single();
      if (error) throw error;
      return NextResponse.json({ success: true, id: data.id }, { headers });
    }
    if (body.action === "SET_ACTIVE") {
      const tables: Record<string, string> = { PRODUCT: "xpace_stock_products", CATEGORY: "xpace_stock_categories", UNIT: "xpace_stock_units" };
      if (!tables[body.entity] || typeof body.active !== "boolean") throw new StockError("AÇÃO INVÁLIDA.");
      const { data, error } = await access.admin.from(tables[body.entity]).update({ active: body.active }).eq("tenant_company_id", access.company.id).eq("id", stockId(body.id)).select("id").single();
      if (error) throw error;
      return NextResponse.json({ success: true, id: data.id }, { headers });
    }
    if (body.action === "DELETE_LOOKUP") {
      const table = body.entity === "CATEGORY" ? "xpace_stock_categories" : body.entity === "UNIT" ? "xpace_stock_units" : "";
      if (!table) throw new StockError("AÇÃO INVÁLIDA.");
      const { data, error } = await access.admin.from(table).delete().eq("tenant_company_id", access.company.id).eq("id", stockId(body.id)).select("id").single();
      if (error) throw error;
      return NextResponse.json({ success: true, id: data.id }, { headers });
    }
    throw new StockError("AÇÃO DE ESTOQUE INVÁLIDA.");
  } catch (error) { return stockError(error); }
}

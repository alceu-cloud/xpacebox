import { NextResponse } from "next/server";

import { AccessError, requireCompanyAccess, requireCompanyProfile } from "@/lib/server/company-access";
import { saoPauloDate, scheduleCommercialCycle } from "@/lib/server/commercial-cycle";
import type { CrmOrderInput } from "@/types/crm";
import type { ProductFicha, ProductPriceSnapshot } from "@/types/gerenciador";

type SavedOrderItem = {
  ficha: ProductFicha;
  snapshot: ProductPriceSnapshot;
  baseQuantity: number;
  quantity: number;
  unitPrice: number;
  ipiPercent: number;
  ipiValue: number;
  total: number;
  netUnitPrice: number | null;
  materialCostUnit: number | null;
  contributionUnit: number | null;
  mcPercent: number | null;
  marginSource: "SNAPSHOT" | "LEGACY_REFERENCE";
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { slug?: string; order?: CrmOrderInput };
    const slug = body.slug?.trim() ?? "";
    const input = body.order;
    if (!slug || !input?.clientId || !input.items?.length) return failure("INFORME PELO MENOS UM ITEM DO PEDIDO.", 400);
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
    const fichas = await loadProductFichas(admin, company.id);
    const items = resolveOrderItems(fichas, input);
    const sellerCompanies = [...new Set(items.map((item) => normalizeCompanyName(item.ficha.company)))];
    if (sellerCompanies.length !== 1) return failure("REGISTRE ITENS DE EMPRESAS DIFERENTES EM PEDIDOS SEPARADOS.", 400);

    const productTotal = items.reduce((total, item) => total + item.quantity * item.unitPrice, 0);
    const ipiTotal = items.reduce((total, item) => total + item.ipiValue, 0);
    const fullSnapshotItems = items.filter((item) => item.marginSource === "SNAPSHOT");
    const hasCompleteMargin = fullSnapshotItems.length === items.length;
    const contributionTotal = hasCompleteMargin
      ? fullSnapshotItems.reduce((total, item) => total + Number(item.contributionUnit || 0) * item.quantity, 0)
      : null;
    const netRevenueTotal = hasCompleteMargin
      ? fullSnapshotItems.reduce((total, item) => total + Number(item.netUnitPrice || 0) * item.quantity, 0)
      : 0;
    const mcPercent = contributionTotal != null && netRevenueTotal > 0 ? contributionTotal / netRevenueTotal * 100 : null;

    const { data: numberData, error: numberError } = await admin.rpc("next_sales_order_number", { target_tenant: company.id });
    if (numberError) throw numberError;
    const saleNumber = String(numberData || "");
    if (!saleNumber) throw new Error("NUMERO DO PEDIDO NAO FOI GERADO.");

    const now = new Date().toISOString();
    const sellerCompanyName = sellerCompanies[0];
    const { data: savedOrder, error: orderError } = await admin.from("sales_orders").insert({
      tenant_company_id: company.id,
      sale_number: saleNumber,
      client_id: input.clientId,
      representative_profile_id: representativeId,
      seller_company_name: sellerCompanyName,
      seller_company_slug: sellerCompanySlug(sellerCompanyName),
      ordered_at: orderDate,
      notes: upper(input.notes) || null,
      product_total: productTotal,
      ipi_total: ipiTotal,
      grand_total: productTotal + ipiTotal,
      contribution_total: contributionTotal,
      mc_percent: mcPercent,
      created_by: user.id,
    }).select("*").single();
    if (orderError) throw orderError;

    const { error: itemsError } = await admin.from("sales_order_items").insert(items.map((item, index) => ({
      sales_order_id: savedOrder.id,
      item_number: index + 1,
      product_ficha_id: item.ficha.id,
      ft_number: item.ficha.ftNumber || null,
      revision: item.ficha.revision || null,
      description: productReference(item.ficha),
      material_code: item.snapshot.materialCode || null,
      base_quantity: item.baseQuantity,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      ipi_percent: item.ipiPercent,
      ipi_value: item.ipiValue,
      total: item.total,
      net_unit_price: item.netUnitPrice,
      material_cost_unit: item.materialCostUnit,
      contribution_unit: item.contributionUnit,
      mc_percent: item.mcPercent,
      margin_source: item.marginSource,
      pricing_snapshot: { ...item.snapshot, fichaId: item.ficha.id, ftNumber: item.ficha.ftNumber, revision: item.ficha.revision },
    })));
    if (itemsError) {
      await admin.from("sales_orders").delete().eq("id", savedOrder.id).eq("tenant_company_id", company.id);
      throw itemsError;
    }

    const { data: opportunity, error: opportunityError } = await admin.from("crm_opportunities").insert({
      tenant_company_id: company.id,
      client_id: input.clientId,
      representative_profile_id: representativeId,
      title: `PEDIDO ${saleNumber}`,
      stage: "WON",
      estimated_value: productTotal + ipiTotal,
      notes: upper(input.notes) || `PEDIDO ${saleNumber} REGISTRADO COM ${items.length} ITEM(NS).`,
      closed_at: orderDate,
      created_by: user.id,
      updated_at: now,
    }).select("*").single();
    if (opportunityError) {
      await admin.from("sales_orders").delete().eq("id", savedOrder.id).eq("tenant_company_id", company.id);
      throw opportunityError;
    }

    const { error: linkError } = await admin.from("sales_orders")
      .update({ crm_opportunity_id: opportunity.id })
      .eq("id", savedOrder.id)
      .eq("tenant_company_id", company.id);
    if (linkError) {
      await Promise.all([
        admin.from("sales_orders").delete().eq("id", savedOrder.id).eq("tenant_company_id", company.id),
        admin.from("crm_opportunities").delete().eq("id", opportunity.id).eq("tenant_company_id", company.id),
      ]);
      throw linkError;
    }

    const cycle = await scheduleCommercialCycle({
      admin,
      companyId: company.id,
      clientId: input.clientId,
      representativeId,
      userId: user.id,
      baseDate: orderDate,
      purchaseRecorded: true,
      title: `PEDIDO ${saleNumber}`,
    }).catch((error) => {
      console.error("SALES ORDER CYCLE ERROR", error);
      return { scheduled: false };
    });

    const { error: activityError } = await admin.from("crm_activities").insert({
      tenant_company_id: company.id,
      client_id: input.clientId,
      opportunity_id: opportunity.id,
      representative_profile_id: representativeId,
      activity_type: "NOTE",
      outcome: "PURCHASE_EXPECTED",
      subject: "PEDIDO REGISTRADO",
      notes: `PEDIDO ${saleNumber} REGISTRADO EM ${orderDate}. VALOR: ${formatCurrency(productTotal + ipiTotal)}.`,
      occurred_at: now,
      agenda_kind: "OPPORTUNITY",
      created_by: user.id,
    });
    if (activityError) console.error("SALES ORDER ACTIVITY ERROR", activityError);

    return NextResponse.json({ success: true, saleNumber, opportunity, cycleScheduled: cycle.scheduled }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}

async function loadProductFichas(admin: Awaited<ReturnType<typeof requireCompanyAccess>>["admin"], companyId: string) {
  const { data, error } = await admin
    .from("company_manager_settings")
    .select("data")
    .eq("tenant_company_id", companyId)
    .maybeSingle();
  if (error) throw error;
  const productFichas = (data?.data as { productFichas?: unknown } | null)?.productFichas;
  return Array.isArray(productFichas) ? productFichas as ProductFicha[] : [];
}

function resolveOrderItems(fichas: ProductFicha[], input: CrmOrderInput): SavedOrderItem[] {
  const selectedIds = new Set<string>();
  return input.items.map((inputItem) => {
    const fichaId = String(inputItem.productFichaId || "").trim();
    if (!fichaId) throw new Error("SELECIONE A FICHA TECNICA DE CADA ITEM.");
    if (selectedIds.has(fichaId)) throw new Error("A MESMA FICHA TECNICA NAO PODE SER REPETIDA NO PEDIDO.");
    selectedIds.add(fichaId);
    const ficha = fichas.find((item) => item.id === fichaId && item.clientId === input.clientId && item.status !== "INATIVO");
    if (!ficha) throw new Error("UMA DAS FICHAS NAO PERTENCE A ESTE CLIENTE OU ESTA INATIVA.");
    const snapshot = currentPriceSnapshot(ficha);
    if (!snapshot) throw new Error(`${productReference(ficha)} NAO POSSUI FORMACAO DE PRECO SALVA.`);
    const baseQuantity = Number(snapshot.quantity || 0);
    const quantity = Number(inputItem.quantity || 0);
    const unitPrice = Number(snapshot.price || ficha.price || 0);
    if (!Number.isFinite(baseQuantity) || baseQuantity <= 0) throw new Error(`${productReference(ficha)} NAO POSSUI O LOTE DA FORMACAO DE PRECO.`);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error(`INFORME UMA QUANTIDADE VALIDA PARA ${productReference(ficha)}.`);
    if (quantity < baseQuantity) throw new Error(`${productReference(ficha)} FOI FORMADA PARA ${baseQuantity} UNIDADES. PARA UMA QUANTIDADE MENOR, FACA UMA NOVA FORMACAO DE PRECO.`);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) throw new Error(`${productReference(ficha)} NAO POSSUI PRECO VALIDO.`);

    const ipiPercent = Number(snapshot.ipiPercent || 0);
    const hasFullSnapshot = [snapshot.netPrice, snapshot.materialCost, snapshot.marginValue, snapshot.expensesPercent]
      .every((value) => Number.isFinite(Number(value)));
    const productValue = quantity * unitPrice;
    return {
      ficha,
      snapshot,
      baseQuantity,
      quantity,
      unitPrice,
      ipiPercent,
      ipiValue: productValue * ipiPercent / 100,
      total: productValue * (1 + ipiPercent / 100),
      netUnitPrice: hasFullSnapshot ? Number(snapshot.netPrice) : null,
      materialCostUnit: hasFullSnapshot ? Number(snapshot.materialCost) : null,
      contributionUnit: hasFullSnapshot ? Number(snapshot.marginValue) : null,
      mcPercent: Number.isFinite(Number(snapshot.mcPercent)) ? Number(snapshot.mcPercent) : null,
      marginSource: hasFullSnapshot ? "SNAPSHOT" : "LEGACY_REFERENCE",
    };
  });
}

function currentPriceSnapshot(ficha: ProductFicha) {
  if (ficha.pricingData && Number(ficha.pricingData.price || 0) > 0) return ficha.pricingData;
  return [...(ficha.priceHistory ?? [])].reverse().find((snapshot) => Number(snapshot.price || 0) > 0);
}

function productReference(ficha: ProductFicha) {
  return [ficha.ftNumber, ficha.reference].filter(Boolean).join(" - ") || "PRODUTO SEM REFERENCIA";
}

function normalizeCompanyName(value: string) { return value.trim().toLocaleUpperCase("pt-BR") || "DAWOS"; }
function sellerCompanySlug(value: string) {
  const normalized = value.toLowerCase();
  if (normalized.includes("carcat")) return "carcat";
  if (normalized.includes("gta")) return "gta";
  return "dawos";
}
function upper(value: string) { return (value || "").trim().toLocaleUpperCase("pt-BR"); }
function formatCurrency(value: number) { return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function failure(message: string, status: number) { return NextResponse.json({ success: false, message }, { status }); }
function handleError(error: unknown) {
  if (error instanceof AccessError) return failure(error.message, error.status);
  console.error("CRM ORDER ERROR", error);
  const message = String((error as { message?: string })?.message ?? "");
  if (message) return failure(message, 400);
  return failure("NAO FOI POSSIVEL REGISTRAR O PEDIDO.", 500);
}

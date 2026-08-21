import { NextResponse } from "next/server";

import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";
import type { QuoteDraft } from "@/types/orcamentos";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const slug = url.searchParams.get("slug")?.trim() ?? "";
    const kind = url.searchParams.get("kind")?.trim() ?? "";
    const search = url.searchParams.get("search")?.trim() ?? "";
    if (!slug || !["DIRECT", "ENGINEERING"].includes(kind)) return failure("CONSULTA DE ORCAMENTO INVALIDA.", 400);

    const { admin, company } = await requireCompanyAccess(request, slug);
    let query = admin.from("quotes").select("*, quote_items(*)").eq("tenant_company_id", company.id).eq("kind", kind).order("created_at", { ascending: false }).limit(50);
    if (search) query = query.or(`quote_number.ilike.%${search}%,client_name.ilike.%${search}%,client_cnpj.ilike.%${search}%`);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ success: true, quotes: (data ?? []).map(mapQuote) });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { slug?: string; quote?: QuoteDraft };
    const slug = body.slug?.trim() ?? "";
    const quote = body.quote;
    if (!slug || !quote || !quote.clientName?.trim() || !quote.items?.length) return failure("PREENCHA O CLIENTE E PELO MENOS UM ITEM.", 400);

    const { admin, company, user } = await requireCompanyAccess(request, slug);
    const prefix = quote.kind === "ENGINEERING" ? "OE" : "OD";
    const { data: numberData, error: numberError } = await admin.rpc("next_quote_number", { target_tenant: company.id, target_prefix: prefix });
    if (numberError) throw numberError;

    const normalizedItems = quote.items.map((item, index) => normalizeItem(item, index + 1));
    const totals = normalizedItems.reduce((summary, item) => ({
      productTotal: summary.productTotal + item.quantity * item.unitPrice,
      ipiTotal: summary.ipiTotal + item.ipiValue,
    }), { productTotal: 0, ipiTotal: 0 });

    const { data: saved, error: quoteError } = await admin.from("quotes").insert({
      tenant_company_id: company.id,
      quote_number: numberData,
      kind: quote.kind,
      status: "FINALIZED",
      recipient: quote.recipient,
      seller_company_name: quote.sellerCompanyName,
      seller_company_slug: quote.sellerCompanySlug,
      client_id: quote.clientId || null,
      client_name: quote.clientName.trim(),
      client_cnpj: quote.clientCnpj || null,
      buyer_name: quote.buyerName || null,
      phone: quote.phone || null,
      email: quote.email?.toLowerCase() || null,
      address: quote.address || null,
      representative_profile_id: null,
      representative_name: quote.representativeName || null,
      issue_date: quote.issueDate || new Date().toISOString().slice(0, 10),
      delivery_date: quote.deliveryDate || null,
      valid_until: quote.validUntil || null,
      payment_terms: quote.paymentTerms || null,
      freight: quote.freight || null,
      observations: quote.observations || null,
      product_total: totals.productTotal,
      ipi_total: totals.ipiTotal,
      grand_total: totals.productTotal + totals.ipiTotal,
      created_by: user.id,
    }).select("*").single();
    if (quoteError) throw quoteError;

    const { error: itemsError } = await admin.from("quote_items").insert(normalizedItems.map((item) => ({
      quote_id: saved.id,
      item_number: item.itemNumber,
      ft_number: item.ftNumber || null,
      description: item.description,
      length: item.length,
      width: item.width,
      height: item.height,
      area: item.area,
      quality: item.quality || null,
      box_type: item.boxType || null,
      material: item.material || null,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      ipi_percent: item.ipiPercent,
      ipi_value: item.ipiValue,
      total: item.quantity * item.unitPrice + item.ipiValue,
      snapshot: item.snapshot ?? {},
    })));
    if (itemsError) throw itemsError;

    const { data: complete, error: completeError } = await admin
      .from("quotes")
      .select("*, quote_items(*)")
      .eq("id", saved.id)
      .single();
    if (completeError) throw completeError;

    return NextResponse.json({ success: true, quote: mapQuote(complete) }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}

function normalizeItem(item: QuoteDraft["items"][number], itemNumber: number) {
  const quantity = Number(item.quantity) || 0;
  const unitPrice = Number(item.unitPrice) || 0;
  const ipiPercent = Number(item.ipiPercent) || 0;
  return { ...item, itemNumber, quantity, unitPrice, ipiPercent, ipiValue: quantity * unitPrice * ipiPercent / 100, total: quantity * unitPrice * (1 + ipiPercent / 100) };
}

function mapQuote(row: Record<string, unknown>) {
  return {
    id: row.id,
    quoteNumber: row.quote_number,
    kind: row.kind,
    status: row.status,
    recipient: row.recipient,
    sellerCompanyName: row.seller_company_name,
    sellerCompanySlug: row.seller_company_slug,
    clientId: row.client_id,
    clientName: row.client_name,
    clientCnpj: row.client_cnpj ?? "",
    buyerName: row.buyer_name ?? "",
    phone: row.phone ?? "",
    email: row.email ?? "",
    address: row.address ?? "",
    representativeName: row.representative_name ?? "",
    issueDate: row.issue_date,
    deliveryDate: row.delivery_date ?? "",
    validUntil: row.valid_until ?? "",
    paymentTerms: row.payment_terms ?? "",
    freight: row.freight ?? "",
    observations: row.observations ?? "",
    productTotal: Number(row.product_total) || 0,
    ipiTotal: Number(row.ipi_total) || 0,
    grandTotal: Number(row.grand_total) || 0,
    items: ((row.quote_items as Record<string, unknown>[] | undefined) ?? []).map((item) => ({
      id: item.id,
      itemNumber: item.item_number,
      ftNumber: item.ft_number ?? "",
      description: item.description,
      length: Number(item.length) || 0,
      width: Number(item.width) || 0,
      height: Number(item.height) || 0,
      area: Number(item.area) || 0,
      quality: item.quality ?? "",
      boxType: item.box_type ?? "",
      material: item.material ?? "",
      quantity: Number(item.quantity) || 0,
      unitPrice: Number(item.unit_price) || 0,
      ipiPercent: Number(item.ipi_percent) || 0,
      ipiValue: Number(item.ipi_value) || 0,
      total: Number(item.total) || 0,
      snapshot: item.snapshot ?? {},
    })),
  };
}

function failure(message: string, status: number) { return NextResponse.json({ success: false, message }, { status }); }
function handleError(error: unknown) {
  if (error instanceof AccessError) return failure(error.message, error.status);
  console.error("QUOTES API ERROR", error);
  const message = String((error as { message?: string })?.message ?? "");
  if (message.includes("quotes") || message.includes("quote_items") || message.includes("next_quote_number")) return failure("A ESTRUTURA DE ORCAMENTOS AINDA NAO FOI APLICADA NO SUPABASE.", 503);
  return failure("NAO FOI POSSIVEL PROCESSAR O ORCAMENTO.", 500);
}

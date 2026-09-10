import { NextResponse } from "next/server";

import { defaultQuoteParametersByCompany } from "@/lib/gerenciador/data";
import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";
import { sendQuoteEmail } from "@/lib/server/daily-agenda-email";
import type { QuoteCompanyKey, QuoteCompanyParameters } from "@/types/gerenciador";

type Context = { params: Promise<{ quoteId: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    const body = await request.json() as { slug?: string; email?: string };
    const slug = body.slug?.trim() || "";
    const { quoteId } = await params;
    if (!slug || !quoteId) return failure("ORCAMENTO NAO INFORMADO.", 400);

    const { admin, company } = await requireCompanyAccess(request, slug);
    const { data: quote, error: quoteError } = await admin
      .from("quotes")
      .select("*, quote_items(*)")
      .eq("id", quoteId)
      .eq("tenant_company_id", company.id)
      .single();
    if (quoteError) throw quoteError;

    const recipientEmail = (body.email || quote.email || "").trim().toLowerCase();
    if (!isEmail(recipientEmail)) return failure("INFORME UM E-MAIL VALIDO PARA ENVIAR O ORCAMENTO.", 400);

    const { data: settings, error: settingsError } = await admin
      .from("company_manager_settings")
      .select("data")
      .eq("tenant_company_id", company.id)
      .maybeSingle();
    if (settingsError) throw settingsError;

    const sellerKey = resolveSellerKey(String(quote.seller_company_slug || quote.seller_company_name || ""));
    const configured = ((settings?.data as { quoteParameters?: Partial<Record<QuoteCompanyKey, Partial<QuoteCompanyParameters>>> } | null)?.quoteParameters?.[sellerKey]) || {};
    const seller = { ...defaultQuoteParametersByCompany[sellerKey], ...configured };
    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://xpacebox.com.br";
    const logo = String(seller.logo || "");
    const sellerLogoUrl = !logo || logo.startsWith("data:") ? "" : logo.startsWith("http") ? logo : `${appUrl}${logo.startsWith("/") ? "" : "/"}${logo}`;

    await sendQuoteEmail({
      companyId: company.id,
      quoteNumber: String(quote.quote_number),
      recipientEmail,
      sellerName: seller.name || String(quote.seller_company_name || company.name),
      sellerLogoUrl,
      clientName: String(quote.client_name || "CLIENTE"),
      buyerName: String(quote.buyer_name || ""),
      issueDate: String(quote.issue_date || ""),
      deliveryDate: String(quote.delivery_date || ""),
      validUntil: String(quote.valid_until || ""),
      paymentTerms: String(quote.payment_terms || ""),
      freight: String(quote.freight || ""),
      observations: String(quote.observations || ""),
      productTotal: Number(quote.product_total || 0),
      ipiTotal: Number(quote.ipi_total || 0),
      grandTotal: Number(quote.grand_total || 0),
      items: ((quote.quote_items as Record<string, unknown>[] | undefined) || []).map((item) => ({
        ftNumber: String(item.ft_number || ""),
        description: String(item.description || ""),
        quantity: Number(item.quantity || 0),
        unitPrice: Number(item.unit_price || 0),
        ipiPercent: Number(item.ipi_percent || 0),
        total: Number(item.total || 0),
      })),
    });

    if (recipientEmail !== String(quote.email || "").toLowerCase()) {
      const { error: updateError } = await admin
        .from("quotes")
        .update({ email: recipientEmail, updated_at: new Date().toISOString() })
        .eq("id", quote.id)
        .eq("tenant_company_id", company.id);
      if (updateError) throw updateError;
    }

    return NextResponse.json({ success: true, recipientEmail });
  } catch (error) {
    return handleError(error);
  }
}

function resolveSellerKey(value: string): QuoteCompanyKey {
  const normalized = value.toLowerCase();
  if (normalized.includes("carcat")) return "carcat";
  if (normalized.includes("gta")) return "gta";
  return "dawos";
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function failure(message: string, status: number) {
  return NextResponse.json({ success: false, message }, { status });
}

function handleError(error: unknown) {
  if (error instanceof AccessError) return failure(error.message, error.status);
  const message = error instanceof Error ? error.message : "";
  if (message.includes("CONFIGURE A CHAVE") || message.includes("CRIPTOGRAFIA")) return failure(message, 503);
  if (message) return failure(`RESEND: ${message}`, 502);
  console.error("QUOTE EMAIL ERROR", error);
  return failure("NAO FOI POSSIVEL ENVIAR O ORCAMENTO POR E-MAIL.", 500);
}

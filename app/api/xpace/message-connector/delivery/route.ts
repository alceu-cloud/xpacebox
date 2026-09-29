import { NextResponse } from "next/server";

import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";
import { sendXpaceLinkEmail } from "@/lib/server/daily-agenda-email";
import { saleLinks, xpaceLinkMessage } from "@/lib/server/xpace-sale-links";

const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  try {
    const saleId = new URL(request.url).searchParams.get("saleId") ?? "";
    const access = await requireCompanyAccess(request, "xpace");
    const { sale, person, links, paymentError } = await saleLinks(access, saleId);
    const { data: connector, error } = await access.admin.from("xpace_message_connectors")
      .select("id,status,last_seen_at").eq("tenant_company_id", access.company.id).maybeSingle();
    if (error) throw error;
    return NextResponse.json({ success: true, saleId: sale.id, customer: { name: person.full_name, email: person.email ?? "", mobile: person.mobile ?? "", whatsappOptIn: person.whatsapp_opt_in }, links, paymentError, connector: { configured: Boolean(connector), online: Boolean(connector?.status === "CONNECTED" && connector.last_seen_at && Date.now() - Date.parse(connector.last_seen_at) < 60_000) } }, { headers });
  } catch (error) { return handleError(error); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { saleId?: string; kind?: string; channel?: string };
    if (!body.saleId || !["ASSINATURA", "COBRANCA"].includes(body.kind ?? "") || !["WHATSAPP", "EMAIL"].includes(body.channel ?? "")) return fail("SELECIONE UM LINK E UM CANAL VÁLIDOS.", 400);
    const kind = body.kind as "ASSINATURA" | "COBRANCA";
    const access = await requireCompanyAccess(request, "xpace");
    const { sale, person, charge, links, paymentError } = await saleLinks(access, body.saleId);
    const url = links[kind];
    if (!url) return fail(kind === "COBRANCA" && paymentError ? paymentError : "ESTE LINK AINDA NÃO ESTÁ DISPONÍVEL OU JÁ FOI CONCLUÍDO.", 409);
    if (body.channel === "EMAIL") {
      if (!person.email) return fail("CADASTRE O E-MAIL DO CLIENTE ANTES DE ENVIAR.", 409);
      await sendXpaceLinkEmail({ companyId: access.company.id, recipientEmail: person.email, recipientName: person.full_name, kind, url });
      return NextResponse.json({ success: true, status: "SENT" }, { headers });
    }
    if (!person.whatsapp_opt_in) return fail("O CLIENTE NÃO AUTORIZOU MENSAGENS PELO WHATSAPP.", 409);
    if (kind === "COBRANCA" && charge?.id) {
      const { data: automatic, error: automaticError } = await access.admin.from("xpace_message_outbox")
        .select("id,status").eq("tenant_company_id", access.company.id).eq("charge_id", charge.id)
        .eq("kind", "COBRANCA_PIX_AUTOMATICA").in("status", ["QUEUED", "SENDING", "SENT", "UNKNOWN"])
        .limit(1).maybeSingle();
      if (automaticError) throw automaticError;
      if (automatic) return fail("ESTE LINK JÁ TEM ENVIO AUTOMÁTICO PROGRAMADO OU REALIZADO. CONFIRA A FILA ANTES DE REENVIAR.", 409);
    }
    const digits = (person.mobile ?? "").replace(/\D/g, "");
    const phone = digits.startsWith("55") ? digits : `55${digits}`;
    if (phone.length < 12 || phone.length > 15) return fail("CADASTRE UM CELULAR VÁLIDO PARA O CLIENTE.", 409);
    const { data: connector, error: connectorError } = await access.admin.from("xpace_message_connectors")
      .select("id").eq("tenant_company_id", access.company.id).maybeSingle();
    if (connectorError) throw connectorError;
    if (!connector) return fail("CONFIGURE O CONECTOR NA LOJA ANTES DE ENVIAR PELO WHATSAPP.", 409);
    const { data: duplicate, error: duplicateError } = await access.admin.from("xpace_message_outbox")
      .select("id").eq("tenant_company_id", access.company.id).eq("sale_id", sale.id).eq("kind", kind)
      .in("status", ["QUEUED", "SENDING"]).limit(1).maybeSingle();
    if (duplicateError) throw duplicateError;
    if (duplicate) return fail("ESTE LINK JÁ ESTÁ NA FILA DE ENVIO.", 409);
    const { data: message, error } = await access.admin.from("xpace_message_outbox")
      .insert({ tenant_company_id: access.company.id, connector_id: connector.id, student_id: person.id, sale_id: sale.id, charge_id: kind === "COBRANCA" ? charge?.id ?? null : null, kind, contact_name: person.full_name, destination_phone: phone, body: xpaceLinkMessage(person.full_name, kind, url), created_by: access.user.id })
      .select("id").single();
    if (error) throw error;
    return NextResponse.json({ success: true, status: "QUEUED", messageId: message.id }, { status: 201, headers });
  } catch (error) { return handleError(error); }
}

function fail(message: string, status: number) { return NextResponse.json({ success: false, message }, { status, headers }); }
function handleError(error: unknown) {
  if (error instanceof AccessError) return fail(error.message, error.status);
  console.error("XPACE LINK DELIVERY ERROR", error);
  return fail(error instanceof Error && /VENDA|CLIENTE|LINK|ASAAS|COBRANÇA/.test(error.message) ? error.message : "NÃO FOI POSSÍVEL PREPARAR O ENVIO. TENTE NOVAMENTE.", 500);
}

import { NextResponse } from "next/server";

import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { slug?: string; clientId?: string };
    const slug = body.slug?.trim() || "";
    const clientId = body.clientId?.trim() || "";
    if (!slug || !clientId) return failure("CLIENTE INVALIDO.", 400);

    const { admin, company, profile, user } = await requireCompanyAccess(request, slug);
    const { data: client, error: clientError } = await admin
      .from("clients")
      .select("id")
      .eq("id", clientId)
      .eq("tenant_company_id", company.id)
      .eq("active", true)
      .maybeSingle();
    if (clientError) throw clientError;
    if (!client) return failure("CLIENTE NAO ENCONTRADO.", 404);

    const { error } = await admin.from("crm_activities").insert({
      tenant_company_id: company.id,
      client_id: client.id,
      representative_profile_id: profile.id,
      activity_type: "WHATSAPP",
      outcome: "OTHER",
      subject: "WHATSAPP ABERTO",
      notes: "REGISTRO AUTOMATICO DO CLIQUE. O ENVIO DA MENSAGEM E A RESPOSTA NAO FORAM CONFIRMADOS.",
      occurred_at: new Date().toISOString(),
      created_by: user.id,
    });
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AccessError) return failure(error.message, error.status);
    console.error("CRM WHATSAPP OPENED ERROR", error);
    return failure("NAO FOI POSSIVEL REGISTRAR A ABERTURA DO WHATSAPP.", 500);
  }
}

function failure(message: string, status: number) {
  return NextResponse.json({ success: false, message }, { status });
}

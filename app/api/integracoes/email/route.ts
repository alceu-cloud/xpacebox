import { NextResponse } from "next/server";

import { getCompanyEmailIntegration, listCompanyEmailRecipients, saveCompanyEmailIntegration, sendCompanyAgendaTest } from "@/lib/server/daily-agenda-email";
import { AccessError, requireCompanyAccess, requireCompanyProfile } from "@/lib/server/company-access";

function failure(message: string, status: number) {
  return NextResponse.json({ success: false, message }, { status });
}

async function requireManager(request: Request, slug: string) {
  const access = await requireCompanyAccess(request, slug);
  if (!["platform_owner", "company_manager"].includes(access.profile.platform_role)) {
    throw new AccessError("APENAS GERENTES PODEM CONFIGURAR O ENVIO DE E-MAIL.", 403);
  }
  return access;
}

export async function GET(request: Request) {
  try {
    const slug = new URL(request.url).searchParams.get("slug")?.trim() || "";
    if (!slug) return failure("EMPRESA NAO INFORMADA.", 400);
    const { company, profile } = await requireManager(request, slug);
    const recipients = await listCompanyEmailRecipients(company.id, profile.id);
    const integration = await getCompanyEmailIntegration(company.id);
    return NextResponse.json({ success: true, integration, recipients });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { slug?: string; profileId?: string };
    const slug = body.slug?.trim() || "";
    const profileId = body.profileId?.trim() || "";
    if (!slug || !profileId) return failure("EMPRESA OU DESTINATARIO NAO INFORMADO.", 400);

    const { admin, company } = await requireManager(request, slug);
    await requireCompanyProfile(admin, company.id, profileId);
    const result = await sendCompanyAgendaTest({ companyId: company.id, companyName: company.name, companySlug: company.slug, profileId });
    return NextResponse.json({ success: true, result });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json() as { slug?: string; apiKey?: string; sender?: string; replyTo?: string; enabled?: boolean };
    const slug = body.slug?.trim() || "";
    if (!slug) return failure("EMPRESA NAO INFORMADA.", 400);
    const { company } = await requireManager(request, slug);
    const integration = await saveCompanyEmailIntegration({
      companyId: company.id,
      apiKey: body.apiKey,
      sender: body.sender || "",
      replyTo: body.replyTo || "",
      enabled: body.enabled !== false,
    });
    return NextResponse.json({ success: true, integration });
  } catch (error) {
    return handleError(error);
  }
}

function handleError(error: unknown) {
  if (error instanceof AccessError) return failure(error.message, error.status);
  const message = error instanceof Error ? error.message : "";
  if (message.includes("CONFIGURACAO DO SUPABASE")) return failure("O SUPABASE NAO ESTA CONFIGURADO NO SERVIDOR.", 503);
  if (message.includes("CREDENCIAL") || message.includes("CRIPTOGRAFIA")) return failure(message, 503);
  if (message.includes("REMETENTE") || message.includes("E-MAIL DE RESPOSTA") || message.includes("CONFIGURE A CHAVE")) return failure(message, 400);
  console.error("EMAIL INTEGRATION ERROR", error);
  return failure("NAO FOI POSSIVEL ENVIAR O E-MAIL DE TESTE.", 500);
}

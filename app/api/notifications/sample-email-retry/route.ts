import { NextResponse } from "next/server";
import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";
import { retrySampleOverdueEmail } from "@/lib/server/daily-agenda-email";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const access = await requireCompanyAccess(request, "dawos");
    const membership = access.profile.platform_role === "platform_owner" ? null : await access.admin
      .from("company_members").select("company_role")
      .eq("company_id", access.company.id).eq("profile_id", access.profile.id)
      .eq("active", true).maybeSingle();
    if (membership?.error) throw membership.error;
    const manager = access.profile.platform_role === "platform_owner" || Boolean(membership?.data &&
      (membership.data.company_role === "company_manager" || access.profile.platform_role === "company_manager"));
    if (!manager) throw new AccessError("APENAS O GERENTE AUTORIZADO PODE REENVIAR.", 403);
    const body = await request.json() as { deliveryId?: unknown };
    if (typeof body.deliveryId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.deliveryId))
      throw new AccessError("AVISO INVÁLIDO.", 400);
    const result = await retrySampleOverdueEmail({ companyId: access.company.id, deliveryId: body.deliveryId, actorId: access.profile.id });
    return NextResponse.json({ success: result.accepted, result, message: result.accepted
      ? "O PROVEDOR ACEITOU O REENVIO. CONFIRA O RECEBIMENTO NAS CAIXAS DE ENTRADA."
      : result.message }, { status: result.accepted ? 200 : result.uncertain ? 409 : 502, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AccessError) return NextResponse.json({ success: false, message: error.message }, { status: error.status });
    const message = error instanceof Error ? error.message : "";
    if (/AVISO NAO ENCONTRADO|AVISO NÃO ENCONTRADO/.test(message)) return NextResponse.json({ success: false, message: "AVISO NÃO ENCONTRADO." }, { status: 404 });
    if (/NAO ESTA DISPONIVEL|NÃO ESTÁ DISPONÍVEL|AMOSTRA ENCERRADA|ETAPA DA AMOSTRA MUDOU|DESTINATÁRIOS ALTERADOS|TENTATIVA EM ANDAMENTO|SEM CONFIRMACAO|CONSULTOR SEM E-MAIL|AVISO MAIS RECENTE/.test(message))
      return NextResponse.json({ success: false, message }, { status: 409 });
    console.error("SAMPLE EMAIL RETRY ERROR", { message: message.slice(0, 200) });
    return NextResponse.json({ success: false, message: "NÃO FOI POSSÍVEL CONCLUIR O REENVIO. CONFIRA A PENDÊNCIA E O RESEND ANTES DE TENTAR NOVAMENTE." }, { status: 500 });
  }
}

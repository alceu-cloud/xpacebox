import { NextResponse } from "next/server";
import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";
import { CommercialError } from "@/lib/saas/commercial";
import { rpcRow } from "@/lib/saas/rpc-row";

const headers = { "Cache-Control": "private, no-store" };
export async function POST(request: Request) {
  try {
    const slug = new URL(request.url).searchParams.get("company") || "";
    if (!/^[a-z0-9-]{1,80}$/.test(slug)) throw new CommercialError("EMPRESA INVÁLIDA.");
    const access = await requireCompanyAccess(request, slug);
    if (!["platform_owner", "company_manager"].includes(access.profile.platform_role)) throw new AccessError("SOMENTE GESTORES REGISTRAM CONTAGENS.", 403);
    const raw = await request.text();
    if (raw.length > 1000) throw new CommercialError("FORMULÁRIO MUITO GRANDE.");
    let input: Record<string, unknown>;
    try { input = JSON.parse(raw); } catch { throw new CommercialError("FORMULÁRIO INVÁLIDO."); }
    if (!input || typeof input !== "object" || Array.isArray(input)
      || Object.keys(input).length !== 1 || typeof input.requestId !== "string"
      || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(input.requestId)) {
      throw new CommercialError("INFORME SOMENTE O IDENTIFICADOR DA OBSERVAÇÃO. DATA E CONTAGEM VÊM DO SERVIDOR.");
    }
    const { data, error } = await access.admin.rpc("saas_observe_students", {
      p_company: access.company.id, p_actor: access.user.id, p_request: input.requestId,
    });
    if (error) throw error;
    const row = rpcRow<{ id: string; local_date: string; observed_at: string; active_students: number; source: string }>(data);
    return NextResponse.json({ success: true, observation: {
      id: row.id, date: row.local_date, observedAt: row.observed_at, activeStudents: row.active_students, source: row.source,
    }, message: "OBSERVAÇÃO REGISTRADA. NÃO É FECHAMENTO, MÉDIA DIÁRIA OU COBRANÇA." }, { headers });
  } catch (error) {
    if (error instanceof CommercialError || error instanceof AccessError) return NextResponse.json({ success: false, message: error.message }, { status: error.status, headers });
    if (String((error as { message?: string })?.message).includes("IDEMPOTENCY_CONFLICT")) return NextResponse.json({ success: false, message: "ESTA OBSERVAÇÃO JÁ FOI REGISTRADA POR OUTRO GESTOR." }, { status: 409, headers });
    return NextResponse.json({ success: false, message: "NÃO FOI POSSÍVEL REGISTRAR. REPITA A MESMA OPERAÇÃO PARA EVITAR DUPLICIDADE." }, { status: 503, headers });
  }
}

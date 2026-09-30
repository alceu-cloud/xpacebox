import { NextResponse } from "next/server";
import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";

export async function POST(request: Request, context: { params: Promise<{ sampleId: string }> }) {
  try {
    const body = await request.json();
    const { sampleId } = await context.params;
    const slug = typeof body.slug === "string" ? body.slug.trim() : "";
    if (!slug || !sampleId) return failure("AMOSTRA OU EMPRESA NAO INFORMADA.", 400);
    const actions = ["REPROGRAM", "MARK_READY", "MARK_DELIVERED", "APPROVE", "REJECT"];
    if (!actions.includes(body.action) || typeof body.expectedStatus !== "string" || typeof body.expectedDueDate !== "string") return failure("ATUALIZE A PAGINA E INFORME UMA ACAO VALIDA.", 400);
    for (const value of [body.expectedDueDate, body.nextDueDate, body.actualDate]) {
      if (value && !validDate(value)) return failure("DATA INVALIDA.", 400);
    }
    if (body.action === "REPROGRAM" && (typeof body.reason !== "string" || body.reason.trim().length < 3 || body.reason.length > 2000)) return failure("INFORME O MOTIVO DA REPROGRAMACAO (3 A 2000 CARACTERES).", 400);
    if (body.action !== "REPROGRAM" && !body.actualDate) return failure("INFORME A DATA REAL.", 400);
    const { admin, company, profile } = await requireCompanyAccess(request, slug);
    const { error } = await admin.rpc("change_sample_deadline", {
      p_company_id: company.id, p_sample_id: sampleId, p_actor_id: profile.id,
      p_action: body.action, p_expected_status: body.expectedStatus,
      p_expected_due: body.expectedDueDate || null, p_new_due: body.nextDueDate || null,
      p_actual_date: body.actualDate || null, p_reason: body.action === "REPROGRAM" ? body.reason.trim() : null,
    });
    if (error) {
      const statuses: Record<string, number> = { "42501": 403, P0002: 404, "40001": 409, "22023": 400, "23514": 409 };
      if (statuses[error.code]) return failure(error.message, statuses[error.code]);
      throw error;
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AccessError) return failure(error.message, error.status);
    console.error("SAMPLE TRANSITION API ERROR", error);
    return failure("NAO FOI POSSIVEL ATUALIZAR O FLUXO DA AMOSTRA.", 500);
  }
}

function validDate(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function failure(message: string, status: number) { return NextResponse.json({ success: false, message }, { status }); }

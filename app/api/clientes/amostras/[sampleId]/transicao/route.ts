import { NextResponse } from "next/server";

import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";
import type { SampleStatus } from "@/types/amostras";

type TransitionAction = "MARK_READY" | "MARK_DELIVERED" | "APPROVE" | "REJECT";

export async function POST(request: Request, context: { params: Promise<{ sampleId: string }> }) {
  try {
    const body = (await request.json()) as { slug?: string; action?: TransitionAction; nextDueDate?: string };
    const slug = body.slug?.trim() ?? "";
    const action = body.action;
    const { sampleId } = await context.params;
    if (!slug || !sampleId || !action) return failure("AMOSTRA OU ACAO NAO INFORMADA.", 400);

    const { admin, company, profile } = await requireCompanyAccess(request, slug);
    const { data: sample, error: sampleError } = await admin
      .from("client_samples")
      .select("id,responsible_profile_id,status,closed_at")
      .eq("id", sampleId)
      .eq("tenant_company_id", company.id)
      .maybeSingle();
    if (sampleError) throw sampleError;
    if (!sample) return failure("AMOSTRA NAO ENCONTRADA.", 404);

    const isManager = ["platform_owner", "company_manager"].includes(profile.platform_role);
    if (!isManager && sample.responsible_profile_id && sample.responsible_profile_id !== profile.id) return failure("VOCE NAO PODE ATUALIZAR ESTA AMOSTRA.", 403);
    if (sample.closed_at) return failure("ESTA AMOSTRA JA ESTA ENCERRADA.", 409);

    const now = saoPauloDate();
    const currentStatus = String(sample.status) as SampleStatus;
    const nextDueDate = body.nextDueDate?.trim() ?? "";
    let update: Record<string, unknown>;

    if (action === "MARK_READY") {
      if (!["REQUESTED", "IN_PRODUCTION"].includes(currentStatus)) return failure("A AMOSTRA PRECISA ESTAR EM PRODUCAO PARA SER MARCADA COMO PRONTA.", 409);
      if (!nextDueDate) return failure("INFORME A DATA PREVISTA PARA ENTREGAR AO CLIENTE.", 400);
      update = { status: "READY", ready_at: now, customer_delivery_date: nextDueDate };
    } else if (action === "MARK_DELIVERED") {
      if (currentStatus !== "READY") return failure("A AMOSTRA PRECISA ESTAR PRONTA PARA SER MARCADA COMO ENTREGUE.", 409);
      if (!nextDueDate) return failure("INFORME A DATA LIMITE PARA A APROVACAO DO CLIENTE.", 400);
      update = { status: "SENT", delivered_at: now, approval_due_date: nextDueDate };
    } else if (action === "APPROVE") {
      if (currentStatus !== "SENT") return failure("A AMOSTRA PRECISA ESTAR ENTREGUE PARA SER APROVADA.", 409);
      update = { status: "APPROVED", approved_at: now, closed_at: now };
    } else if (action === "REJECT") {
      if (currentStatus !== "SENT") return failure("A AMOSTRA PRECISA ESTAR ENTREGUE PARA SER REPROVADA.", 409);
      update = { status: "REJECTED", closed_at: now };
    } else {
      return failure("ACAO DE AMOSTRA INVALIDA.", 400);
    }

    const { error } = await admin
      .from("client_samples")
      .update({ ...update, updated_at: new Date().toISOString() })
      .eq("id", sample.id)
      .eq("tenant_company_id", company.id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AccessError) return failure(error.message, error.status);
    console.error("SAMPLE TRANSITION API ERROR", error);
    return failure("NAO FOI POSSIVEL ATUALIZAR O FLUXO DA AMOSTRA.", 500);
  }
}

function saoPauloDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function failure(message: string, status: number) {
  return NextResponse.json({ success: false, message }, { status });
}

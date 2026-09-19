import { NextResponse } from "next/server";

import { AutentiqueError, getAutentiqueSignatureStatus } from "@/lib/server/autentique";
import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";

const companySlug = "xpace";
type Body = { saleIds?: string[] };

export async function POST(request: Request) {
  try {
    const access = await requireCompanyAccess(request, companySlug);
    if (!['platform_owner', 'company_manager'].includes(access.profile.platform_role)) throw new AccessError("APENAS GESTORES PODEM CONSULTAR ASSINATURAS.", 403);
    const body = (await request.json()) as Body;
    const saleIds = [...new Set((body.saleIds ?? []).filter((value): value is string => typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value)))].slice(0, 30);
    if (!saleIds.length) return NextResponse.json({ success: true, updated: 0 });
    const { data: sales, error } = await access.admin.from("xpace_contract_sales").select("id,contract_id,signature_envelope_id,signature_status").eq("tenant_company_id", access.company.id).in("id", saleIds).eq("signature_provider", "AUTENTIQUE").eq("signature_status", "ENVIADA");
    if (error) throw error;
    let updated = 0;
    for (const sale of sales ?? []) {
      if (!sale.signature_envelope_id) continue;
      const signature = await getAutentiqueSignatureStatus(sale.signature_envelope_id);
      if (signature.status === "ENVIADA") continue;
      const now = new Date().toISOString();
      const signed = signature.status === "ASSINADA";
      const { error: saleError } = await access.admin.from("xpace_contract_sales").update({ signature_status: signed ? "ASSINADA" : "RECUSADA", signed_at: signed ? signature.signedAt || now : null, signed_document_url: signed ? signature.signedDocumentUrl || null : null, signature_error: signed ? null : "ASSINATURA RECUSADA PELO ALUNO.", updated_at: now }).eq("id", sale.id).eq("tenant_company_id", access.company.id).eq("signature_status", "ENVIADA");
      if (saleError) throw saleError;
      if (signed) {
        const { error: unblockError } = await access.admin.from("xpace_student_contracts").update({ signature_access_blocked: false, signature_access_blocked_at: null, updated_at: now }).eq("id", sale.contract_id).eq("tenant_company_id", access.company.id).in("status", ["ATIVO", "AGENDADO"]);
        if (unblockError) throw unblockError;
      }
      const { error: eventError } = await access.admin.from("xpace_contract_events").insert({ tenant_company_id: access.company.id, contract_id: sale.contract_id, event_type: signed ? "ASSINATURA_CONCLUIDA" : "ASSINATURA_RECUSADA", note: signed ? "ASSINATURA CONFIRMADA APÓS CONSULTA À AUTENTIQUE." : "ASSINATURA RECUSADA PELO ALUNO.", created_by: access.user.id });
      if (eventError) throw eventError;
      updated += 1;
    }
    return NextResponse.json({ success: true, updated });
  } catch (error) {
    if (error instanceof AccessError || error instanceof AutentiqueError) return NextResponse.json({ success: false, message: error.message }, { status: error.status });
    console.error("XPACE SIGNATURE STATUS ERROR", error);
    return NextResponse.json({ success: false, message: "NÃO FOI POSSÍVEL CONSULTAR A ASSINATURA." }, { status: 500 });
  }
}

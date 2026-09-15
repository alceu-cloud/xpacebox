import { NextResponse } from "next/server";

import { AutentiqueError, createAutentiqueSignatureDocument } from "@/lib/server/autentique";
import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";

const companySlug = "xpace";
type Body = { saleId?: string };

export async function POST(request: Request) {
  let saleId = "";
  let access: Awaited<ReturnType<typeof requireCompanyAccess>> | null = null;
  let dispatchStarted = false;
  try {
    const body = (await request.json()) as Body;
    saleId = body.saleId?.trim() ?? "";
    if (!saleId) throw new RequestError("VENDA NÃO INFORMADA.", 400);
    access = await requireCompanyAccess(request, companySlug);
    if (!["platform_owner", "company_manager"].includes(access.profile.platform_role)) throw new AccessError("APENAS GESTORES PODEM ENVIAR CONTRATOS PARA ASSINATURA.", 403);

    const { data: sale, error: saleError } = await access.admin.from("xpace_contract_sales").select("id,contract_id,signature_required,signature_status,signature_envelope_id").eq("id", saleId).eq("tenant_company_id", access.company.id).maybeSingle();
    if (saleError) throw saleError;
    if (!sale) throw new RequestError("VENDA NÃO ENCONTRADA NESTA EMPRESA.", 404);
    if (!sale.signature_required) throw new RequestError("ESTA VENDA NÃO EXIGE ASSINATURA ONLINE.", 409);
    if (sale.signature_envelope_id || ["ENVIADA", "ASSINADA"].includes(sale.signature_status)) throw new RequestError("ESTE CONTRATO JÁ FOI ENVIADO PARA ASSINATURA. USE O LINK JÁ GERADO.", 409);

    const { data: contract, error: contractError } = await access.admin.from("xpace_student_contracts").select("id,contract_number,plan_id,student_id").eq("id", sale.contract_id).eq("tenant_company_id", access.company.id).maybeSingle();
    if (contractError) throw contractError;
    if (!contract?.plan_id) throw new RequestError("O PLANO DE ORIGEM DESTE CONTRATO NÃO ESTÁ DISPONÍVEL PARA ASSINATURA.", 409);

    const [{ data: plan, error: planError }, { data: student, error: studentError }] = await Promise.all([
      access.admin.from("xpace_membership_plans").select("contract_template_path").eq("id", contract.plan_id).eq("tenant_company_id", access.company.id).maybeSingle(),
      access.admin.from("xpace_people").select("full_name,email,mobile,cpf").eq("id", contract.student_id).eq("tenant_company_id", access.company.id).eq("is_student", true).maybeSingle(),
    ]);
    if (planError) throw planError;
    if (studentError) throw studentError;
    if (!plan?.contract_template_path) throw new RequestError("ANTES DE ENVIAR, IMPORTE O MODELO PDF DESTE CONTRATO NO CADASTRO DO PLANO.", 409);
    if (!plan.contract_template_path.toLowerCase().endsWith(".pdf")) throw new RequestError("PARA A ASSINATURA ONLINE, O MODELO DO CONTRATO PRECISA ESTAR EM PDF.", 409);
    if (!student) throw new RequestError("ALUNO NÃO ENCONTRADO PARA ASSINATURA.", 404);

    const { data: file, error: fileError } = await access.admin.storage.from("xpace-contract-templates").download(plan.contract_template_path);
    if (fileError || !file) throw new RequestError("NÃO FOI POSSÍVEL LER O MODELO PDF DO CONTRATO.", 409);
    if (file.size > 5 * 1024 * 1024) throw new RequestError("O MODELO PDF EXCEDE 5 MB, LIMITE ATUAL DA AUTENTIQUE PARA O PLANO GRATUITO.", 409);

    const now = new Date().toISOString();
    const { error: processingError } = await access.admin.from("xpace_contract_sales").update({ status: "PROCESSANDO", signature_status: "PENDENTE", signature_error: null, updated_by: access.user.id, updated_at: now }).eq("id", sale.id).eq("tenant_company_id", access.company.id);
    if (processingError) throw processingError;
    dispatchStarted = true;
    const document = await createAutentiqueSignatureDocument({ file, fileName: `xpace-contrato-${contract.contract_number}.pdf`, documentName: `XPACE · CONTRATO #${String(contract.contract_number).padStart(5, "0")} · ${student.full_name}`, signer: student });
    const { error: updateError } = await access.admin.from("xpace_contract_sales").update({ status: "ENVIADA_PARA_ASSINATURA", signature_status: "ENVIADA", signature_provider: "AUTENTIQUE", signature_envelope_id: document.documentId, signature_url: document.signatureUrl || null, signature_error: null, sent_for_signature_at: now, updated_by: access.user.id, updated_at: now }).eq("id", sale.id).eq("tenant_company_id", access.company.id);
    if (updateError) throw updateError;
    const { error: eventError } = await access.admin.from("xpace_contract_events").insert({ tenant_company_id: access.company.id, contract_id: contract.id, event_type: "ASSINATURA_ENVIADA", note: document.sandbox ? "ENVIADO À AUTENTIQUE EM MODO DE TESTE (SANDBOX)." : "ENVIADO À AUTENTIQUE PARA ASSINATURA.", created_by: access.user.id });
    if (eventError) console.error("XPACE SIGNATURE EVENT ERROR", eventError);
    return NextResponse.json({ success: true, signatureUrl: document.signatureUrl, sandbox: document.sandbox });
  } catch (error) {
    if (access && saleId && dispatchStarted) await access.admin.from("xpace_contract_sales").update({ status: "ERRO", signature_status: "ERRO", signature_error: error instanceof Error ? error.message.slice(0, 500) : "NÃO FOI POSSÍVEL ENVIAR O DOCUMENTO PARA ASSINATURA.", updated_by: access.user.id, updated_at: new Date().toISOString() }).eq("id", saleId).eq("tenant_company_id", access.company.id);
    if (error instanceof AccessError || error instanceof RequestError || error instanceof AutentiqueError) return NextResponse.json({ success: false, message: error.message }, { status: error.status });
    console.error("XPACE AUTENTIQUE SEND ERROR", error);
    return NextResponse.json({ success: false, message: "NÃO FOI POSSÍVEL ENVIAR O CONTRATO PARA ASSINATURA." }, { status: 500 });
  }
}

class RequestError extends Error { constructor(message: string, public status: number) { super(message); } }

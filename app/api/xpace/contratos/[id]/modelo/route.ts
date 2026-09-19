import { NextResponse } from "next/server";

import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";

const companySlug = "xpace";
const allowedTypes = new Set(["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);
type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const access = await requireCompanyAccess(request, companySlug);
    if (!["platform_owner", "company_manager"].includes(access.profile.platform_role)) throw new AccessError("APENAS GESTORES PODEM ALTERAR O MODELO DO CONTRATO.", 403);
    const { id } = await context.params;
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) throw new RequestError("SELECIONE UM ARQUIVO DE MODELO.", 400);
    if (!allowedTypes.has(file.type) || file.size > 10 * 1024 * 1024) throw new RequestError("ENVIE UM PDF, DOC OU DOCX DE ATÉ 10 MB.", 400);
    const { data: plan, error: planError } = await access.admin.from("xpace_membership_plans").select("id,contract_template_path").eq("id", id).eq("tenant_company_id", access.company.id).maybeSingle();
    if (planError) throw planError;
    if (!plan) throw new RequestError("CONTRATO NÃO ENCONTRADO.", 404);
    const extension = file.type === "application/pdf" ? "pdf" : file.type === "application/msword" ? "doc" : "docx";
    const path = `${access.company.id}/${id}/modelo-${Date.now()}.${extension}`;
    const { error: uploadError } = await access.admin.storage.from("xpace-contract-templates").upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
    if (uploadError) throw uploadError;
    const { error: updateError } = await access.admin.from("xpace_membership_plans").update({ contract_template_path: path, contract_template_name: file.name, updated_by: access.user.id, updated_at: new Date().toISOString() }).eq("id", id).eq("tenant_company_id", access.company.id);
    if (updateError) { await access.admin.storage.from("xpace-contract-templates").remove([path]); throw updateError; }
    if (plan.contract_template_path) await access.admin.storage.from("xpace-contract-templates").remove([plan.contract_template_path]);
    return NextResponse.json({ success: true, fileName: file.name });
  } catch (error) {
    if (error instanceof AccessError || error instanceof RequestError) return NextResponse.json({ success: false, message: error.message }, { status: error.status });
    console.error("XPACE CONTRACT TEMPLATE ERROR", error);
    return NextResponse.json({ success: false, message: "NÃO FOI POSSÍVEL IMPORTAR O MODELO DE CONTRATO." }, { status: 500 });
  }
}

class RequestError extends Error { constructor(message: string, public status: number) { super(message); } }

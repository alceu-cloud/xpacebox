import { NextResponse } from "next/server";

import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";

const companySlug = "xpace";
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const access = await requireCompanyAccess(request, companySlug);
    if (!['platform_owner', 'company_manager'].includes(access.profile.platform_role)) throw new AccessError("APENAS GESTORES PODEM ALTERAR A IMAGEM DO SERVIÇO.", 403);
    const form = await request.formData();
    const file = form.get("image");
    if (!(file instanceof File)) throw new RequestError("SELECIONE UMA IMAGEM PARA ENVIAR.", 400);
    if (!allowedTypes.has(file.type) || file.size > 3 * 1024 * 1024) throw new RequestError("ENVIE UMA IMAGEM JPG, PNG OU WEBP DE ATÉ 3 MB.", 400);
    const { data: service, error: serviceError } = await access.admin.from("xpace_services").select("id,image_path").eq("id", id).eq("tenant_company_id", access.company.id).maybeSingle();
    if (serviceError) throw serviceError;
    if (!service) throw new RequestError("SERVIÇO NÃO ENCONTRADO NESTA EMPRESA.", 404);
    const extension = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
    const path = `${access.company.id}/${service.id}/capa-${Date.now()}.${extension}`;
    const { error: uploadError } = await access.admin.storage.from("xpace-service-images").upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
    if (uploadError) throw uploadError;
    const { error: updateError } = await access.admin.from("xpace_services").update({ image_path: path, updated_by: access.user.id, updated_at: new Date().toISOString() }).eq("id", service.id).eq("tenant_company_id", access.company.id);
    if (updateError) { await access.admin.storage.from("xpace-service-images").remove([path]); throw updateError; }
    if (service.image_path) await access.admin.storage.from("xpace-service-images").remove([service.image_path]);
    return NextResponse.json({ success: true, imageUrl: access.admin.storage.from("xpace-service-images").getPublicUrl(path).data.publicUrl });
  } catch (error) {
    if (error instanceof AccessError || error instanceof RequestError) return NextResponse.json({ success: false, message: error.message }, { status: error.status });
    console.error("XPACE SERVICE IMAGE ERROR", error);
    return NextResponse.json({ success: false, message: "NÃO FOI POSSÍVEL ENVIAR A IMAGEM." }, { status: 500 });
  }
}

class RequestError extends Error { constructor(message: string, public status: number) { super(message); } }

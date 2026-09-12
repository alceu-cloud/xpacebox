import { NextResponse } from "next/server";

import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";

const companySlug = "xpace";
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const access = await requireCompanyAccess(request, companySlug);
    const form = await request.formData();
    const file = form.get("photo");
    if (!(file instanceof File)) throw new RequestError("SELECIONE UMA FOTO PARA ENVIAR.", 400);
    if (!allowedTypes.has(file.type) || file.size > 3 * 1024 * 1024) throw new RequestError("ENVIE UMA IMAGEM JPG, PNG OU WEBP DE ATÉ 3 MB.", 400);
    const { data: student, error: studentError } = await access.admin.from("xpace_people").select("id,photo_path").eq("id", id).eq("tenant_company_id", access.company.id).eq("is_student", true).maybeSingle();
    if (studentError) throw studentError;
    if (!student) throw new RequestError("ALUNO NÃO ENCONTRADO NA COMUNIDADE.", 404);
    const extension = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
    const path = `${access.company.id}/${id}/perfil-${Date.now()}.${extension}`;
    const { error: uploadError } = await access.admin.storage.from("xpace-people").upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
    if (uploadError) throw uploadError;
    const { error: updateError } = await access.admin.from("xpace_people").update({ photo_path: path, updated_by: access.user.id, updated_at: new Date().toISOString() }).eq("id", id).eq("tenant_company_id", access.company.id);
    if (updateError) { await access.admin.storage.from("xpace-people").remove([path]); throw updateError; }
    if (student.photo_path) await access.admin.storage.from("xpace-people").remove([student.photo_path]);
    const { data: signed } = await access.admin.storage.from("xpace-people").createSignedUrl(path, 60 * 30);
    return NextResponse.json({ success: true, photoUrl: signed?.signedUrl ?? "" });
  } catch (error) {
    if (error instanceof AccessError || error instanceof RequestError) return NextResponse.json({ success: false, message: error.message }, { status: error.status });
    console.error("XPACE STUDENT PHOTO ERROR", error);
    return NextResponse.json({ success: false, message: "NÃO FOI POSSÍVEL ENVIAR A FOTO." }, { status: 500 });
  }
}

class RequestError extends Error { constructor(message: string, public status: number) { super(message); } }

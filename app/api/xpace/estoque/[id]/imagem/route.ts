import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/server/company-access";
import { StockError, stockId, requireStockManager, stockError } from "@/lib/server/xpace-stock";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await requireCompanyAccess(request, "xpace");
    requireStockManager(access.profile.platform_role);
    const id = stockId((await context.params).id);
    const file = (await request.formData()).get("image");
    if (!(file instanceof File) || !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 3 * 1024 * 1024) throw new StockError("ENVIE JPG, PNG OU WEBP DE ATÉ 3 MB.");
    const bytes = Buffer.from(await file.arrayBuffer());
    const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const webp = bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
    if (!(file.type === "image/jpeg" ? jpeg : file.type === "image/png" ? png : webp)) throw new StockError("O ARQUIVO NÃO É UMA IMAGEM VÁLIDA.");
    const { data: product, error } = await access.admin.from("xpace_stock_products").select("id,image_path").eq("tenant_company_id", access.company.id).eq("id", id).single();
    if (error) throw error;
    const extension = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
    const imagePath = `${access.company.id}/${id}/${randomUUID()}.${extension}`;
    const bucket = access.admin.storage.from("xpace-stock-images");
    const upload = await bucket.upload(imagePath, bytes, { contentType: file.type, upsert: false });
    if (upload.error) throw upload.error;
    const update = await access.admin.from("xpace_stock_products").update({ image_path: imagePath, updated_by: access.user.id, updated_at: new Date().toISOString() }).eq("tenant_company_id", access.company.id).eq("id", id);
    if (update.error) { await bucket.remove([imagePath]); throw update.error; }
    if (product.image_path) await bucket.remove([product.image_path]);
    return NextResponse.json({ success: true, imageUrl: bucket.getPublicUrl(imagePath).data.publicUrl });
  } catch (error) { return stockError(error); }
}

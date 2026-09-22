import { NextResponse } from "next/server";

import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";
import { sortNaturally } from "@/lib/xpace/natural-sort";

const companySlug = "xpace";
type RequestBody = { action?: "CREATE_ROOM" | "UPDATE_ROOM" | "SET_ROOM_ACTIVE"; room?: { id?: string; name?: string; coverageType?: string; capacity?: number | null; active?: boolean } };

export async function GET(request: Request) {
  try {
    const { admin, company } = await requireCompanyAccess(request, companySlug);
    const { data, error } = await admin.from("xpace_rooms").select("id,name,coverage_type,capacity,active").eq("tenant_company_id", company.id).order("active", { ascending: false }).order("name");
    if (error) throw error;
    return NextResponse.json({ success: true, rooms: sortNaturally(data ?? [], (room) => room.name).sort((left, right) => Number(right.active) - Number(left.active)).map((room) => ({ id: room.id, name: room.name, coverageType: room.coverage_type, capacity: room.capacity, active: room.active })) });
  } catch (error) { return handleError(error); }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const access = await requireCompanyAccess(request, companySlug); requireManager(access.profile.platform_role);
    if (body.action !== "CREATE_ROOM") throw new RequestError("AÇÃO DE SALA INVÁLIDA.", 400);
    const room = normalize(body.room);
    if (!room.name) throw new RequestError("INFORME A DESCRIÇÃO DA SALA.", 400);
    const { data, error } = await access.admin.from("xpace_rooms").insert({ tenant_company_id: access.company.id, name: room.name, coverage_type: room.coverageType, capacity: room.capacity, created_by: access.user.id, updated_by: access.user.id }).select("id,name,coverage_type,capacity,active").single();
    if (error) throw error;
    return NextResponse.json({ success: true, room: { id: data.id, name: data.name, coverageType: data.coverage_type, capacity: data.capacity, active: data.active } }, { status: 201 });
  } catch (error) { return handleError(error); }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const access = await requireCompanyAccess(request, companySlug); requireManager(access.profile.platform_role);
    if (body.action === "UPDATE_ROOM") {
      const roomId = body.room?.id?.trim();
      const room = normalize(body.room);
      if (!roomId || !room.name) throw new RequestError("INFORME A DESCRIÇÃO DA SALA.", 400);
      const { data, error } = await access.admin.from("xpace_rooms").update({ name: room.name, coverage_type: room.coverageType, capacity: room.capacity, updated_by: access.user.id, updated_at: new Date().toISOString() }).eq("id", roomId).eq("tenant_company_id", access.company.id).select("id").maybeSingle();
      if (error) throw error;
      if (!data) throw new RequestError("SALA NÃO ENCONTRADA NESTA EMPRESA.", 404);
      return NextResponse.json({ success: true });
    }
    if (body.action !== "SET_ROOM_ACTIVE" || !body.room?.id || typeof body.room.active !== "boolean") throw new RequestError("ATUALIZAÇÃO DE SALA INVÁLIDA.", 400);
    const { error } = await access.admin.from("xpace_rooms").update({ active: body.room.active, updated_by: access.user.id, updated_at: new Date().toISOString() }).eq("id", body.room.id).eq("tenant_company_id", access.company.id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) { return handleError(error); }
}

function normalize(value?: RequestBody["room"]) { const capacity = value?.capacity === null || value?.capacity === undefined || value.capacity === 0 ? null : Number(value.capacity); if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1 || capacity > 10000)) throw new RequestError("INFORME UMA CAPACIDADE ENTRE 1 E 10.000 OU DEIXE EM BRANCO.", 400); return { name: value?.name?.trim().replace(/\s+/g, " ").slice(0, 80) ?? "", coverageType: ["COBERTO", "ABERTO", "OUTRO"].includes(value?.coverageType ?? "") ? value?.coverageType : "COBERTO", capacity }; }
function requireManager(role: string) { if (!["platform_owner", "company_manager"].includes(role)) throw new AccessError("APENAS GESTORES PODEM ALTERAR AS SALAS.", 403); }
class RequestError extends Error { constructor(message: string, public status: number) { super(message); } }
function handleError(error: unknown) { if (error instanceof AccessError || error instanceof RequestError) return NextResponse.json({ success: false, message: error.message }, { status: error.status }); if ((error as { code?: string })?.code === "23505") return NextResponse.json({ success: false, message: "JÁ EXISTE UMA SALA COM ESTA DESCRIÇÃO.", }, { status: 409 }); console.error("XPACE ROOMS ERROR", error); return NextResponse.json({ success: false, message: "NÃO FOI POSSÍVEL ATUALIZAR AS SALAS." }, { status: 500 }); }

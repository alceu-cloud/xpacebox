import { NextResponse } from "next/server";

import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";

const companySlug = "xpace";
type Body = {
  action?: "CREATE_CLASS" | "ENROLL_STUDENT" | "CREATE_RENTAL";
  group?: { name?: string; modality?: string; color?: string; capacity?: number; weekday?: number; startsAt?: string; endsAt?: string; roomName?: string };
  enrollment?: { classGroupId?: string; studentId?: string; startsOn?: string };
  rental?: { roomName?: string; renterName?: string; startsAt?: string; endsAt?: string; amountCents?: number; note?: string };
};

export async function GET(request: Request) {
  try {
    const { admin, company } = await requireCompanyAccess(request, companySlug);
    const [groupsResult, schedulesResult, enrollmentsResult, studentsResult, rentalsResult] = await Promise.all([
      admin.from("xpace_class_groups").select("id,name,modality,color,capacity,active").eq("tenant_company_id", company.id).order("name"),
      admin.from("xpace_class_schedules").select("id,class_group_id,weekday,starts_at,ends_at,room_name,active").eq("tenant_company_id", company.id).eq("active", true).order("weekday").order("starts_at"),
      admin.from("xpace_class_enrollments").select("id,class_group_id,student_id,starts_on,ends_on,status").eq("tenant_company_id", company.id).eq("status", "ATIVA"),
      admin.from("xpace_people").select("id,full_name,mobile").eq("tenant_company_id", company.id).eq("is_student", true).eq("active", true).order("full_name").limit(500),
      admin.from("xpace_room_rentals").select("id,room_name,renter_name,starts_at,ends_at,amount_cents,status,note").eq("tenant_company_id", company.id).neq("status", "CANCELADA").order("starts_at").limit(200),
    ]);
    for (const result of [groupsResult, schedulesResult, enrollmentsResult, studentsResult, rentalsResult]) if (result.error) throw result.error;
    const studentsById = new Map((studentsResult.data ?? []).map((student) => [student.id, student]));
    const enrollmentsByGroup = new Map<string, Array<{ id: string; studentId: string; studentName: string; mobile: string; startsOn: string }>>();
    for (const enrollment of enrollmentsResult.data ?? []) {
      const student = studentsById.get(enrollment.student_id);
      if (!student) continue;
      const list = enrollmentsByGroup.get(enrollment.class_group_id) ?? [];
      list.push({ id: enrollment.id, studentId: enrollment.student_id, studentName: student.full_name, mobile: student.mobile ?? "", startsOn: enrollment.starts_on });
      enrollmentsByGroup.set(enrollment.class_group_id, list);
    }
    return NextResponse.json({ success: true, groups: (groupsResult.data ?? []).map((group) => ({ id: group.id, name: group.name, modality: group.modality ?? "", color: group.color, capacity: group.capacity, active: group.active, schedules: (schedulesResult.data ?? []).filter((schedule) => schedule.class_group_id === group.id).map((schedule) => ({ id: schedule.id, weekday: schedule.weekday, startsAt: schedule.starts_at.slice(0, 5), endsAt: schedule.ends_at.slice(0, 5), roomName: schedule.room_name ?? "" })), students: enrollmentsByGroup.get(group.id) ?? [] })), students: (studentsResult.data ?? []).map((student) => ({ id: student.id, name: student.full_name, mobile: student.mobile ?? "" })), rentals: (rentalsResult.data ?? []).map((rental) => ({ id: rental.id, roomName: rental.room_name, renterName: rental.renter_name, startsAt: rental.starts_at, endsAt: rental.ends_at, amountCents: rental.amount_cents, status: rental.status, note: rental.note ?? "" })) });
  } catch (error) { return handleError(error); }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const access = await requireCompanyAccess(request, companySlug);
    if (body.action === "CREATE_CLASS") return createClass(access, body.group);
    if (body.action === "ENROLL_STUDENT") return enrollStudent(access, body.enrollment);
    if (body.action === "CREATE_RENTAL") return createRental(access, body.rental);
    throw new RequestError("AÇÃO DA AGENDA INVÁLIDA.", 400);
  } catch (error) { return handleError(error); }
}

async function createClass(access: Awaited<ReturnType<typeof requireCompanyAccess>>, input?: Body["group"]) {
  const group = { name: input?.name?.trim().replace(/\s+/g, " ") ?? "", modality: input?.modality?.trim() ?? "", color: input?.color?.trim() ?? "#7435d9", capacity: input?.capacity ? Number(input.capacity) : null, weekday: Number(input?.weekday), startsAt: input?.startsAt?.trim() ?? "", endsAt: input?.endsAt?.trim() ?? "", roomName: input?.roomName?.trim() ?? "" };
  if (!group.name || !/^#[0-9a-fA-F]{6}$/.test(group.color) || !Number.isInteger(group.weekday) || group.weekday < 0 || group.weekday > 6 || !isTime(group.startsAt) || !isTime(group.endsAt) || group.endsAt <= group.startsAt || (group.capacity !== null && (!Number.isInteger(group.capacity) || group.capacity < 1))) throw new RequestError("PREENCHA NOME, DIA, HORÁRIOS E UMA COR VÁLIDA PARA A GRADE.", 400);
  const { data: saved, error } = await access.admin.from("xpace_class_groups").insert({ tenant_company_id: access.company.id, name: group.name, modality: group.modality || null, color: group.color, capacity: group.capacity, created_by: access.user.id, updated_by: access.user.id }).select("id").single();
  if (error) throw error;
  const { error: scheduleError } = await access.admin.from("xpace_class_schedules").insert({ tenant_company_id: access.company.id, class_group_id: saved.id, weekday: group.weekday, starts_at: group.startsAt, ends_at: group.endsAt, room_name: group.roomName || null, created_by: access.user.id });
  if (scheduleError) throw scheduleError;
  return NextResponse.json({ success: true, groupId: saved.id }, { status: 201 });
}

async function enrollStudent(access: Awaited<ReturnType<typeof requireCompanyAccess>>, input?: Body["enrollment"]) {
  const classGroupId = input?.classGroupId?.trim(); const studentId = input?.studentId?.trim(); const startsOn = input?.startsOn?.trim() || today();
  if (!classGroupId || !studentId || !isDate(startsOn)) throw new RequestError("SELECIONE A GRADE, O ALUNO E A DATA DE INÍCIO.", 400);
  const [group, student] = await Promise.all([access.admin.from("xpace_class_groups").select("id").eq("id", classGroupId).eq("tenant_company_id", access.company.id).eq("active", true).maybeSingle(), access.admin.from("xpace_people").select("id").eq("id", studentId).eq("tenant_company_id", access.company.id).eq("is_student", true).eq("active", true).maybeSingle()]);
  if (group.error) throw group.error; if (student.error) throw student.error;
  if (!group.data || !student.data) throw new RequestError("ALUNO OU GRADE NÃO ENCONTRADO.", 404);
  const { error } = await access.admin.from("xpace_class_enrollments").insert({ tenant_company_id: access.company.id, class_group_id: classGroupId, student_id: studentId, starts_on: startsOn, created_by: access.user.id });
  if (error) throw error;
  return NextResponse.json({ success: true }, { status: 201 });
}

async function createRental(access: Awaited<ReturnType<typeof requireCompanyAccess>>, input?: Body["rental"]) {
  const rental = { roomName: input?.roomName?.trim().replace(/\s+/g, " ") ?? "", renterName: input?.renterName?.trim().replace(/\s+/g, " ") ?? "", startsAt: input?.startsAt?.trim() ?? "", endsAt: input?.endsAt?.trim() ?? "", amountCents: Number(input?.amountCents ?? 0), note: input?.note?.trim() ?? "" };
  if (!rental.roomName || !rental.renterName || Number.isNaN(Date.parse(rental.startsAt)) || Number.isNaN(Date.parse(rental.endsAt)) || rental.endsAt <= rental.startsAt || !Number.isInteger(rental.amountCents) || rental.amountCents < 0) throw new RequestError("PREENCHA SALA, LOCATÁRIO, PERÍODO E VALOR DA LOCAÇÃO.", 400);
  const { data: conflict, error: conflictError } = await access.admin.from("xpace_room_rentals").select("id").eq("tenant_company_id", access.company.id).eq("room_name", rental.roomName).neq("status", "CANCELADA").lt("starts_at", rental.endsAt).gt("ends_at", rental.startsAt).maybeSingle();
  if (conflictError) throw conflictError;
  if (conflict) throw new RequestError("JÁ EXISTE UMA LOCAÇÃO NESTA SALA PARA ESTE HORÁRIO.", 409);
  const { error } = await access.admin.from("xpace_room_rentals").insert({ tenant_company_id: access.company.id, room_name: rental.roomName, renter_name: rental.renterName, starts_at: rental.startsAt, ends_at: rental.endsAt, amount_cents: rental.amountCents, note: rental.note || null, created_by: access.user.id });
  if (error) throw error;
  return NextResponse.json({ success: true }, { status: 201 });
}

function isDate(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00`)); }
function isTime(value: string) { return /^\d{2}:\d{2}$/.test(value); }
function today() { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()); }
class RequestError extends Error { constructor(message: string, public status: number) { super(message); } }
function handleError(error: unknown) { if (error instanceof AccessError || error instanceof RequestError) return NextResponse.json({ success: false, message: error.message }, { status: error.status }); const code = (error as { code?: string })?.code; if (code === "23505") return NextResponse.json({ success: false, message: "ESTE ALUNO JÁ ESTÁ MATRICULADO NESTA GRADE DE HORÁRIOS." }, { status: 409 }); console.error("XPACE AGENDA ERROR", error); return NextResponse.json({ success: false, message: "NÃO FOI POSSÍVEL ATUALIZAR A AGENDA." }, { status: 500 }); }

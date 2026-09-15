import { NextResponse } from "next/server";

import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";

const companySlug = "xpace";
type Body = {
  action?: "CREATE_CLASS" | "ENROLL_STUDENT" | "CREATE_RENTAL" | "UPDATE_GRADE_SETTINGS" | "DELETE_GRADE";
  group?: { id?: string; name?: string; modalityId?: string; roomId?: string; color?: string; capacity?: number; sourceType?: string; settings?: unknown; weekdays?: number[]; startsAt?: string; endsAt?: string };
  enrollment?: { classGroupId?: string; studentId?: string; startsOn?: string };
  rental?: { roomName?: string; renterName?: string; startsAt?: string; endsAt?: string; amountCents?: number; note?: string };
};

export async function GET(request: Request) {
  try {
    const { admin, company } = await requireCompanyAccess(request, companySlug);
    const [groupsResult, schedulesResult, enrollmentsResult, studentsResult, rentalsResult, modalitiesResult, instructorsResult, roomsResult] = await Promise.all([
      admin.from("xpace_class_groups").select("id,name,modality,modality_id,instructor_id,color,capacity,source_type,settings,active").eq("tenant_company_id", company.id).order("name"),
      admin.from("xpace_class_schedules").select("id,class_group_id,weekday,starts_at,ends_at,room_name,room_id,instructor_id,active").eq("tenant_company_id", company.id).eq("active", true).order("weekday").order("starts_at"),
      admin.from("xpace_class_enrollments").select("id,class_group_id,student_id,starts_on,ends_on,status").eq("tenant_company_id", company.id).eq("status", "ATIVA"),
      admin.from("xpace_people").select("id,full_name,mobile").eq("tenant_company_id", company.id).eq("is_student", true).eq("active", true).order("full_name").limit(500),
      admin.from("xpace_room_rentals").select("id,room_name,renter_name,starts_at,ends_at,amount_cents,status,note").eq("tenant_company_id", company.id).neq("status", "CANCELADA").order("starts_at").limit(200),
      admin.from("xpace_modalities").select("id,name,instructor_id,requires_instructor").eq("tenant_company_id", company.id).eq("active", true).eq("uses_schedule", true).order("name"),
      admin.from("xpace_instructors").select("id,full_name").eq("tenant_company_id", company.id).eq("active", true).order("full_name"),
      admin.from("xpace_rooms").select("id,name,capacity").eq("tenant_company_id", company.id).eq("active", true).order("name"),
    ]);
    for (const result of [groupsResult, schedulesResult, enrollmentsResult, studentsResult, rentalsResult, modalitiesResult, instructorsResult, roomsResult]) if (result.error) throw result.error;
    const studentsById = new Map((studentsResult.data ?? []).map((student) => [student.id, student]));
    const enrollmentsByGroup = new Map<string, Array<{ id: string; studentId: string; studentName: string; mobile: string; startsOn: string }>>();
    for (const enrollment of enrollmentsResult.data ?? []) {
      const student = studentsById.get(enrollment.student_id);
      if (!student) continue;
      const list = enrollmentsByGroup.get(enrollment.class_group_id) ?? [];
      list.push({ id: enrollment.id, studentId: enrollment.student_id, studentName: student.full_name, mobile: student.mobile ?? "", startsOn: enrollment.starts_on });
      enrollmentsByGroup.set(enrollment.class_group_id, list);
    }
    const instructorNames = new Map((instructorsResult.data ?? []).map((instructor) => [instructor.id, instructor.full_name]));
    return NextResponse.json({ success: true, groups: (groupsResult.data ?? []).map((group) => ({ id: group.id, name: group.name, modality: group.modality ?? "", modalityId: group.modality_id ?? "", instructorName: group.instructor_id ? instructorNames.get(group.instructor_id) ?? "PROFESSOR ARQUIVADO" : "", color: group.color, capacity: group.capacity, sourceType: group.source_type, settings: group.settings ?? {}, active: group.active, schedules: (schedulesResult.data ?? []).filter((schedule) => schedule.class_group_id === group.id).map((schedule) => ({ id: schedule.id, weekday: schedule.weekday, startsAt: schedule.starts_at.slice(0, 5), endsAt: schedule.ends_at.slice(0, 5), roomName: schedule.room_name ?? "", roomId: schedule.room_id ?? "" })), students: enrollmentsByGroup.get(group.id) ?? [] })), modalities: (modalitiesResult.data ?? []).map((modality) => ({ id: modality.id, name: modality.name, instructorId: modality.instructor_id ?? "", instructorName: modality.instructor_id ? instructorNames.get(modality.instructor_id) ?? "PROFESSOR ARQUIVADO" : "", requiresInstructor: modality.requires_instructor })), rooms: (roomsResult.data ?? []).map((room) => ({ id: room.id, name: room.name, capacity: room.capacity })), students: (studentsResult.data ?? []).map((student) => ({ id: student.id, name: student.full_name, mobile: student.mobile ?? "" })), rentals: (rentalsResult.data ?? []).map((rental) => ({ id: rental.id, roomName: rental.room_name, renterName: rental.renter_name, startsAt: rental.starts_at, endsAt: rental.ends_at, amountCents: rental.amount_cents, status: rental.status, note: rental.note ?? "" })) });
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

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const access = await requireCompanyAccess(request, companySlug);
    if (body.action !== "UPDATE_GRADE_SETTINGS" || !body.group?.id) throw new RequestError("CONFIGURAÇÃO DA GRADE INVÁLIDA.", 400);
    if (!["platform_owner", "company_manager"].includes(access.profile.platform_role)) throw new AccessError("APENAS GESTORES PODEM ALTERAR AS CONFIGURAÇÕES DA GRADE.", 403);
    const settings = normalizeSettings(body.group.settings);
    const { data, error } = await access.admin.from("xpace_class_groups").update({ settings, updated_by: access.user.id, updated_at: new Date().toISOString() }).eq("id", body.group.id).eq("tenant_company_id", access.company.id).select("id").maybeSingle();
    if (error) throw error;
    if (!data) throw new RequestError("GRADE NÃO ENCONTRADA.", 404);
    return NextResponse.json({ success: true });
  } catch (error) { return handleError(error); }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const access = await requireCompanyAccess(request, companySlug);
    const gradeId = body.group?.id?.trim();
    if (body.action !== "DELETE_GRADE" || !gradeId) throw new RequestError("GRADE INVÁLIDA PARA EXCLUSÃO.", 400);
    if (!["platform_owner", "company_manager"].includes(access.profile.platform_role)) throw new AccessError("APENAS GESTORES PODEM EXCLUIR GRADES.", 403);
    const [gradeResult, enrollmentResult, contractResult] = await Promise.all([
      access.admin.from("xpace_class_groups").select("id,name").eq("id", gradeId).eq("tenant_company_id", access.company.id).maybeSingle(),
      access.admin.from("xpace_class_enrollments").select("id", { count: "exact", head: true }).eq("class_group_id", gradeId).eq("tenant_company_id", access.company.id),
      access.admin.from("xpace_student_contracts").select("id", { count: "exact", head: true }).eq("class_group_id", gradeId).eq("tenant_company_id", access.company.id),
    ]);
    if (gradeResult.error || enrollmentResult.error || contractResult.error) throw gradeResult.error ?? enrollmentResult.error ?? contractResult.error;
    if (!gradeResult.data) throw new RequestError("GRADE NÃO ENCONTRADA.", 404);
    if ((enrollmentResult.count ?? 0) > 0) throw new RequestError("NÃO É POSSÍVEL EXCLUIR ESTA GRADE: HÁ ALUNO(S) MATRICULADO(S).", 409);
    if ((contractResult.count ?? 0) > 0) throw new RequestError("NÃO É POSSÍVEL EXCLUIR ESTA GRADE: HÁ CONTRATO(S) VINCULADO(S).", 409);
    const { error } = await access.admin.from("xpace_class_groups").delete().eq("id", gradeId).eq("tenant_company_id", access.company.id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) { return handleError(error); }
}

async function createClass(access: Awaited<ReturnType<typeof requireCompanyAccess>>, input?: Body["group"]) {
  const weekdays = [...new Set(Array.isArray(input?.weekdays) ? input.weekdays.map(Number) : [])].sort((left, right) => left - right);
  const group = { name: input?.name?.trim().replace(/\s+/g, " ") ?? "", modalityId: input?.modalityId?.trim() ?? "", roomId: input?.roomId?.trim() ?? "", color: input?.color?.trim() ?? "#7435d9", capacity: input?.capacity ? Number(input.capacity) : null, sourceType: input?.sourceType === "SERVICO" ? "SERVICO" : "CONTRATO", settings: normalizeSettings(input?.settings), startsAt: input?.startsAt?.trim() ?? "", endsAt: input?.endsAt?.trim() ?? "" };
  if (!group.name || !group.modalityId || !group.roomId || !/^#[0-9a-fA-F]{6}$/.test(group.color) || !weekdays.length || weekdays.some((weekday) => !Number.isInteger(weekday) || weekday < 0 || weekday > 6) || !isTime(group.startsAt) || !isTime(group.endsAt) || group.endsAt <= group.startsAt || (group.capacity !== null && (!Number.isInteger(group.capacity) || group.capacity < 1))) throw new RequestError("PREENCHA NOME, MODALIDADE, SALA, DIA, HORÁRIOS E UMA COR VÁLIDA PARA A GRADE.", 400);
  const { data: modality, error: modalityError } = await access.admin.from("xpace_modalities").select("id,name,instructor_id,requires_instructor").eq("id", group.modalityId).eq("tenant_company_id", access.company.id).eq("active", true).eq("uses_schedule", true).maybeSingle();
  if (modalityError) throw modalityError;
  if (!modality?.instructor_id) throw new RequestError("A MODALIDADE PRECISA TER UM PROFESSOR RESPONSÁVEL PARA CRIAR UMA GRADE.", 400);
  const { data: room, error: roomError } = await access.admin.from("xpace_rooms").select("id,name,capacity").eq("id", group.roomId).eq("tenant_company_id", access.company.id).eq("active", true).maybeSingle();
  if (roomError) throw roomError;
  if (!room) throw new RequestError("SELECIONE UMA SALA ATIVA CADASTRADA.", 400);
  const capacity = group.capacity ?? room.capacity;
  if (room.capacity !== null && capacity !== null && capacity > room.capacity) throw new RequestError(`A GRADE NÃO PODE TER MAIS QUE AS ${room.capacity} VAGAS DA SALA.`, 409);
  if (group.settings.maxClientsEnabled && capacity !== null && (group.settings.maxClients ?? 0) > capacity) throw new RequestError(`O LIMITE DE ALUNOS NÃO PODE PASSAR DAS ${capacity} VAGAS DA GRADE.`, 400);
  const { data: saved, error } = await access.admin.from("xpace_class_groups").insert({ tenant_company_id: access.company.id, name: group.name, modality: modality.name, modality_id: modality.id, instructor_id: modality.instructor_id ?? null, color: group.color, capacity, source_type: group.sourceType, settings: group.settings, created_by: access.user.id, updated_by: access.user.id }).select("id").single();
  if (error) throw error;
  const { error: scheduleError } = await access.admin.from("xpace_class_schedules").insert(weekdays.map((weekday) => ({ tenant_company_id: access.company.id, class_group_id: saved.id, weekday, starts_at: group.startsAt, ends_at: group.endsAt, room_name: room.name, room_id: room.id, instructor_id: modality.instructor_id, created_by: access.user.id })));
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
function normalizeSettings(value: unknown) { const input = value && typeof value === "object" ? value as Record<string, unknown> : {}; const maxClients = Number(input.maxClients); const gender = input.restrictions && typeof input.restrictions === "object" ? (input.restrictions as Record<string, unknown>).gender : "TODOS"; if (input.maxClientsEnabled && (!Number.isInteger(maxClients) || maxClients < 1 || maxClients > 10000)) throw new RequestError("INFORME UM LIMITE DE ALUNOS ENTRE 1 E 10.000.", 400); if (!["TODOS", "FEMININO", "MASCULINO"].includes(typeof gender === "string" ? gender : "")) throw new RequestError("RESTRIÇÃO DE GÊNERO INVÁLIDA.", 400); return { maxClientsEnabled: Boolean(input.maxClientsEnabled), maxClients: input.maxClientsEnabled ? maxClients : null, allowSpecialStudents: Boolean(input.allowSpecialStudents), allowLeads: Boolean(input.allowLeads), checkIn: { requireClass: Boolean(input.checkIn && typeof input.checkIn === "object" && (input.checkIn as Record<string, unknown>).requireClass), showInApp: Boolean(input.checkIn && typeof input.checkIn === "object" && (input.checkIn as Record<string, unknown>).showInApp), accessBeforeMinutes: boundedMinutes(input.checkIn, "accessBeforeMinutes"), accessAfterStartMinutes: boundedMinutes(input.checkIn, "accessAfterStartMinutes") }, restrictions: { gender: typeof gender === "string" ? gender : "TODOS", freeSchedule: Boolean(input.restrictions && typeof input.restrictions === "object" && (input.restrictions as Record<string, unknown>).freeSchedule) } }; }
function boundedMinutes(value: unknown, key: string) { const raw = value && typeof value === "object" ? Number((value as Record<string, unknown>)[key]) : 0; return Number.isInteger(raw) && raw >= 0 && raw <= 1440 ? raw : 0; }
function today() { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()); }
class RequestError extends Error { constructor(message: string, public status: number) { super(message); } }
function handleError(error: unknown) { if (error instanceof AccessError || error instanceof RequestError) return NextResponse.json({ success: false, message: error.message }, { status: error.status }); const code = (error as { code?: string })?.code; const message = (error as { message?: string })?.message ?? ""; if (code === "23505") return NextResponse.json({ success: false, message: "ESTE ALUNO JÁ ESTÁ MATRICULADO NESTA GRADE DE HORÁRIOS." }, { status: 409 }); if (code === "23P01") return NextResponse.json({ success: false, message: "CONFLITO DE HORÁRIO: A SALA OU O PROFESSOR JÁ ESTÁ OCUPADO NESTE INTERVALO.", }, { status: 409 }); if (message.includes("XPACE_GRADE_SEM_VAGAS")) return NextResponse.json({ success: false, message: "ESTA GRADE JÁ ATINGIU O LIMITE DE VAGAS.", }, { status: 409 }); if (message.includes("XPACE_GRADE_RESTRITA_POR_GENERO")) return NextResponse.json({ success: false, message: "ESTA GRADE POSSUI RESTRIÇÃO DE GÊNERO.", }, { status: 409 }); console.error("XPACE AGENDA ERROR", error); return NextResponse.json({ success: false, message: "NÃO FOI POSSÍVEL ATUALIZAR A AGENDA." }, { status: 500 }); }

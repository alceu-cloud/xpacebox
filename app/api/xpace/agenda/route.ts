import { NextResponse } from "next/server";

import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";
import { sortNaturally } from "@/lib/xpace/natural-sort";

const companySlug = "xpace";
type Body = {
  action?: "CREATE_CLASS" | "ENROLL_STUDENT" | "CREATE_RENTAL" | "UPDATE_GRADE_SETTINGS" | "UPDATE_CLASS" | "DELETE_GRADE";
  group?: { id?: string; name?: string; modalityId?: string; level?: string; ageGroup?: string; ageGroups?: unknown; roomId?: string; instructorId?: string; color?: string; scheduleColor?: string; capacity?: number; sourceType?: string; settings?: unknown; weekdays?: number[]; startsAt?: string; endsAt?: string; schedules?: Array<{ id?: string; weekday?: number; startsAt?: string; endsAt?: string; roomId?: string; instructorId?: string; level?: string; ageGroup?: string; ageGroups?: unknown; color?: string; capacity?: number | string; settings?: unknown }> };
  enrollment?: { classGroupId?: string; studentId?: string; startsOn?: string };
  rental?: { roomName?: string; renterName?: string; startsAt?: string; endsAt?: string; amountCents?: number; note?: string };
};

export async function GET(request: Request) {
  try {
    const { admin, company } = await requireCompanyAccess(request, companySlug);
    const [groupsResult, schedulesResult, enrollmentsResult, studentsResult, rentalsResult, modalitiesResult, instructorsResult, roomsResult] = await Promise.all([
      admin.from("xpace_class_groups").select("id,name,modality,modality_id,class_level,instructor_id,color,capacity,source_type,settings,active").eq("tenant_company_id", company.id).eq("active", true).order("name"),
      admin.from("xpace_class_schedules").select("id,class_group_id,weekday,starts_at,ends_at,room_name,room_id,instructor_id,class_level,age_group,age_groups,color,capacity,settings,active").eq("tenant_company_id", company.id).eq("active", true).order("weekday").order("starts_at"),
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
    return NextResponse.json({ success: true, groups: sortNaturally(groupsResult.data ?? [], (group) => group.name).map((group) => ({ id: group.id, name: group.name, modality: group.modality ?? "", modalityId: group.modality_id ?? "", level: normalizeClassLevel(group.class_level), instructorName: group.instructor_id ? instructorNames.get(group.instructor_id) ?? "PROFESSOR ARQUIVADO" : "", color: "#7435D9", capacity: group.capacity, sourceType: group.source_type, settings: group.settings ?? {}, active: group.active, schedules: (schedulesResult.data ?? []).filter((schedule) => schedule.class_group_id === group.id).map((schedule) => { const ageGroups = normalizeAgeGroups(schedule.age_groups, schedule.age_group); return { id: schedule.id, weekday: schedule.weekday, startsAt: schedule.starts_at.slice(0, 5), endsAt: schedule.ends_at.slice(0, 5), roomName: schedule.room_name ?? "", roomId: schedule.room_id ?? "", instructorId: schedule.instructor_id ?? "", instructorName: schedule.instructor_id ? instructorNames.get(schedule.instructor_id) ?? "PROFESSOR ARQUIVADO" : "", level: normalizeClassLevel(schedule.class_level ?? group.class_level), ageGroup: ageGroups[0] ?? "ADULTO", ageGroups, color: normalizeColor(schedule.color), capacity: schedule.capacity ?? group.capacity, settings: schedule.settings ?? group.settings ?? {} }; }), students: enrollmentsByGroup.get(group.id) ?? [] })), modalities: sortNaturally(modalitiesResult.data ?? [], (modality) => modality.name).map((modality) => ({ id: modality.id, name: modality.name, instructorId: modality.instructor_id ?? "", instructorName: modality.instructor_id ? instructorNames.get(modality.instructor_id) ?? "PROFESSOR ARQUIVADO" : "", requiresInstructor: modality.requires_instructor })), instructors: sortNaturally(instructorsResult.data ?? [], (instructor) => instructor.full_name).map((instructor) => ({ id: instructor.id, fullName: instructor.full_name })), rooms: sortNaturally(roomsResult.data ?? [], (room) => room.name).map((room) => ({ id: room.id, name: room.name, capacity: room.capacity })), students: sortNaturally(studentsResult.data ?? [], (student) => student.full_name).map((student) => ({ id: student.id, name: student.full_name, mobile: student.mobile ?? "" })), rentals: (rentalsResult.data ?? []).map((rental) => ({ id: rental.id, roomName: rental.room_name, renterName: rental.renter_name, startsAt: rental.starts_at, endsAt: rental.ends_at, amountCents: rental.amount_cents, status: rental.status, note: rental.note ?? "" })) });
  } catch (error) { return handleError(error); }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const access = await requireCompanyAccess(request, companySlug);
    if (body.action === "CREATE_CLASS") return await createClassV2(access, body.group);
    if (body.action === "ENROLL_STUDENT") return await enrollStudent(access, body.enrollment);
    if (body.action === "CREATE_RENTAL") return await createRental(access, body.rental);
    throw new RequestError("AÇÃO DA AGENDA INVÁLIDA.", 400);
  } catch (error) { return handleError(error); }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const access = await requireCompanyAccess(request, companySlug);
    if (!body.group?.id) throw new RequestError("CONFIGURAÇÃO DA GRADE INVÁLIDA.", 400);
    if (!["platform_owner", "company_manager"].includes(access.profile.platform_role)) throw new AccessError("APENAS GESTORES PODEM ALTERAR AS CONFIGURAÇÕES DA GRADE.", 403);
    if (body.action === "UPDATE_CLASS") return await updateClassV2(access, body.group);
    if (body.action !== "UPDATE_GRADE_SETTINGS") throw new RequestError("AÇÃO DE GRADE INVÁLIDA.", 400);
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

async function createClassV2(access: Awaited<ReturnType<typeof requireCompanyAccess>>, input?: Body["group"]) {
  const group = normalizeGroup(input);
  const schedules = await prepareScheduleRows(access, input, group.modalityId);
  if (!group.name || !group.modalityId || !/^#[0-9a-fA-F]{6}$/.test(group.color) || !schedules.length) throw new RequestError("PREENCHA NOME, MODALIDADE E PELO MENOS UM HORÁRIO CONFIGURADO.", 400);
  const { data: modality, error: modalityError } = await access.admin.from("xpace_modalities").select("id,name").eq("id", group.modalityId).eq("tenant_company_id", access.company.id).eq("active", true).eq("uses_schedule", true).maybeSingle();
  if (modalityError) throw modalityError;
  if (!modality) throw new RequestError("SELECIONE UMA MODALIDADE ATIVA COM AGENDA.", 400);
  const { data: saved, error } = await access.admin.from("xpace_class_groups").insert({ tenant_company_id: access.company.id, name: group.name, modality: modality.name, modality_id: modality.id, class_level: group.level, instructor_id: schedules[0].instructor_id, color: group.color, capacity: null, source_type: group.sourceType, settings: {}, created_by: access.user.id, updated_by: access.user.id }).select("id").single();
  if (error) throw error;
  const { error: scheduleError } = await access.admin.from("xpace_class_schedules").insert(schedules.map((schedule) => ({ ...schedule, tenant_company_id: access.company.id, class_group_id: saved.id, created_by: access.user.id })));
  if (scheduleError) throw scheduleError;
  return NextResponse.json({ success: true, groupId: saved.id }, { status: 201 });
}

async function updateClassV2(access: Awaited<ReturnType<typeof requireCompanyAccess>>, input?: Body["group"]) {
  const id = clean(input?.id);
  const group = normalizeGroup(input);
  if (!id || !group.name || !group.modalityId || !/^#[0-9a-fA-F]{6}$/.test(group.color)) throw new RequestError("PREENCHA NOME, MODALIDADE E UMA COR VÁLIDA PARA A GRADE.", 400);
  const schedules = await prepareScheduleRows(access, input, group.modalityId, id);
  if (!schedules.length) throw new RequestError("ADICIONE AO MENOS UM HORÁRIO CONFIGURADO.", 400);
  const [currentResult, modalityResult, previousResult] = await Promise.all([
    access.admin.from("xpace_class_groups").select("id").eq("id", id).eq("tenant_company_id", access.company.id).maybeSingle(),
    access.admin.from("xpace_modalities").select("id,name").eq("id", group.modalityId).eq("tenant_company_id", access.company.id).eq("active", true).eq("uses_schedule", true).maybeSingle(),
    access.admin.from("xpace_class_schedules").select("id,active").eq("class_group_id", id).eq("tenant_company_id", access.company.id),
  ]);
  if (currentResult.error || modalityResult.error || previousResult.error) throw currentResult.error ?? modalityResult.error ?? previousResult.error;
  if (!currentResult.data || !modalityResult.data) throw new RequestError("GRADE OU MODALIDADE NÃO ENCONTRADA.", 404);
  const { error: groupError } = await access.admin.from("xpace_class_groups").update({ name: group.name, modality: modalityResult.data.name, modality_id: modalityResult.data.id, class_level: group.level, instructor_id: schedules[0].instructor_id, color: group.color, capacity: null, source_type: group.sourceType, settings: {}, updated_by: access.user.id, updated_at: new Date().toISOString() }).eq("id", id).eq("tenant_company_id", access.company.id);
  if (groupError) throw groupError;
  const { error: deactivateError } = await access.admin.from("xpace_class_schedules").update({ active: false }).eq("class_group_id", id).eq("tenant_company_id", access.company.id);
  if (deactivateError) throw deactivateError;
  const { error: insertError } = await access.admin.from("xpace_class_schedules").insert(schedules.map((schedule) => ({ ...schedule, tenant_company_id: access.company.id, class_group_id: id, created_by: access.user.id })));
  if (insertError) {
    await access.admin.from("xpace_class_schedules").update({ active: true }).eq("class_group_id", id).eq("tenant_company_id", access.company.id).in("id", (previousResult.data ?? []).filter((schedule) => schedule.active).map((schedule) => schedule.id));
    throw insertError;
  }
  return NextResponse.json({ success: true });
}

function normalizeGroup(input?: Body["group"]) { const ageGroups = normalizeAgeGroups(input?.ageGroups, input?.ageGroup); return { name: clean(input?.name), modalityId: clean(input?.modalityId), level: normalizeClassLevel(input?.level), ageGroup: ageGroups[0] ?? "", ageGroups, color: "#7435D9", sourceType: input?.sourceType === "SERVICO" ? "SERVICO" : "CONTRATO" }; }
function normalizeClassLevel(value: unknown) { return ["INICIANTE", "INICIANTE_INTERMEDIARIO", "INTERMEDIARIO", "AVANCADO"].includes(clean(value)) ? clean(value) : "INICIANTE"; }
function normalizeAgeGroup(value: unknown) { return ["BABY", "KIDS", "TEENS", "ADULTO"].includes(clean(value)) ? clean(value) : ""; }
function normalizeAgeGroups(value: unknown, fallback?: unknown) { const received = Array.isArray(value) ? value.map(normalizeAgeGroup) : []; const normalized = ["BABY", "KIDS", "TEENS", "ADULTO"].filter((ageGroup) => received.includes(ageGroup)); if (normalized.length) return normalized; const ageGroup = normalizeAgeGroup(fallback); return ageGroup ? [ageGroup] : []; }
function normalizeColor(value: unknown, fallback = "#7435D9") { const color = clean(value); return /^#[0-9a-fA-F]{6}$/.test(color) ? color.toUpperCase() : fallback; }
async function prepareScheduleRows(access: Awaited<ReturnType<typeof requireCompanyAccess>>, input: Body["group"] | undefined, modalityId: string, excludedGroupId = "") {
  const fallback = { roomId: clean(input?.roomId), instructorId: clean(input?.instructorId), level: normalizeClassLevel(input?.level), ageGroups: normalizeAgeGroups(input?.ageGroups, input?.ageGroup), color: normalizeColor(input?.scheduleColor), capacity: input?.capacity, settings: input?.settings };
  const raw = (input?.schedules ?? []).map((item) => { const ageGroups = normalizeAgeGroups(item.ageGroups, item.ageGroup ?? fallback.ageGroups[0]); return { weekday: Number(item.weekday), startsAt: clean(item.startsAt), endsAt: clean(item.endsAt), roomId: clean(item.roomId) || fallback.roomId, instructorId: clean(item.instructorId) || fallback.instructorId, level: normalizeClassLevel(item.level ?? fallback.level), ageGroup: ageGroups[0] ?? "", ageGroups, color: normalizeColor(item.color, fallback.color), capacity: item.capacity ?? fallback.capacity, settings: normalizeSettings(item.settings ?? fallback.settings) }; });
  if (!raw.length || raw.some((slot) => !Number.isInteger(slot.weekday) || slot.weekday < 0 || slot.weekday > 6 || !isTime(slot.startsAt) || !isTime(slot.endsAt) || slot.endsAt <= slot.startsAt || !slot.roomId || !slot.instructorId || !slot.ageGroups.length)) throw new RequestError("CADA HORÁRIO PRECISA TER DIA, INÍCIO, DURAÇÃO, PÚBLICO, SALA E PROFESSOR.", 400);
  const roomIds = [...new Set(raw.map((slot) => slot.roomId))]; const instructorIds = [...new Set(raw.map((slot) => slot.instructorId))];
  const [roomsResult, instructorsResult, otherResult] = await Promise.all([
    access.admin.from("xpace_rooms").select("id,name,capacity").eq("tenant_company_id", access.company.id).eq("active", true).in("id", roomIds),
    access.admin.from("xpace_instructors").select("id,full_name").eq("tenant_company_id", access.company.id).eq("active", true).in("id", instructorIds),
    access.admin.from("xpace_class_schedules").select("weekday,starts_at,ends_at,room_id,instructor_id").eq("tenant_company_id", access.company.id).eq("active", true).neq("class_group_id", excludedGroupId || "00000000-0000-0000-0000-000000000000"),
  ]);
  if (roomsResult.error || instructorsResult.error || otherResult.error) throw roomsResult.error ?? instructorsResult.error ?? otherResult.error;
  const rooms = new Map((roomsResult.data ?? []).map((room) => [room.id, room])); const instructors = new Set((instructorsResult.data ?? []).map((instructor) => instructor.id)); const instructorNames = new Map((instructorsResult.data ?? []).map((instructor) => [instructor.id, instructor.full_name]));
  if (rooms.size !== roomIds.length || instructors.size !== instructorIds.length) throw new RequestError("SALA OU PROFESSOR NÃO ESTÁ ATIVO NESTA EMPRESA.", 400);
  const rows = raw.map((slot) => {
    const room = rooms.get(slot.roomId)!; const requestedCapacity = slot.capacity === "" || slot.capacity === undefined || slot.capacity === null ? room.capacity : Number(slot.capacity);
    if (requestedCapacity !== null && (!Number.isInteger(requestedCapacity) || requestedCapacity < 1 || (room.capacity !== null && requestedCapacity > room.capacity))) throw new RequestError(`A CAPACIDADE DE ${room.name} É INVÁLIDA PARA ESTE HORÁRIO.`, 400);
    if (slot.settings.maxClientsEnabled && requestedCapacity !== null && (slot.settings.maxClients ?? 0) > requestedCapacity) throw new RequestError("O LIMITE DE ALUNOS NÃO PODE PASSAR DAS VAGAS DESTE HORÁRIO.", 400);
    return { weekday: slot.weekday, starts_at: slot.startsAt, ends_at: slot.endsAt, room_name: room.name, room_id: room.id, instructor_id: slot.instructorId, class_level: slot.level, age_group: slot.ageGroup, age_groups: slot.ageGroups, color: slot.color, capacity: requestedCapacity, settings: slot.settings, active: true };
  });
  for (const [index, slot] of rows.entries()) {
    const overlaps = (other: { weekday: number; starts_at: string; ends_at: string; room_id: string; instructor_id: string }) => other.weekday === slot.weekday && timeToMinutes(other.starts_at) < timeToMinutes(slot.ends_at) && timeToMinutes(other.ends_at) > timeToMinutes(slot.starts_at) && (other.room_id === slot.room_id || other.instructor_id === slot.instructor_id);
    const savedConflict = (otherResult.data ?? []).find(overlaps);
    const draftConflict = rows.slice(0, index).find(overlaps);
    const conflict = savedConflict ?? draftConflict;
    if (conflict) {
      if (draftConflict) throw new RequestError(`O MESMO PROFESSOR OU SALA FOI ADICIONADO DUAS VEZES NA ${weekdayLabel(slot.weekday)}, DAS ${slot.starts_at} ÀS ${slot.ends_at}. REMOVA UM DOS BLOCOS ANTES DE SALVAR.`, 409);
      const conflictSubject = conflict.room_id === slot.room_id
        ? `A SALA ${rooms.get(slot.room_id)?.name ?? "SELECIONADA"} JÁ ESTÁ OCUPADA`
        : `O PROFESSOR ${instructorNames.get(slot.instructor_id) ?? "SELECIONADO"} JÁ ESTÁ OCUPADO`;
      throw new RequestError(`${conflictSubject} NA ${weekdayLabel(slot.weekday)}, DAS ${slot.starts_at} ÀS ${slot.ends_at}.`, 409);
    }
  }
  return rows;
}
function clean(value: unknown) { return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : ""; }

async function createClass(access: Awaited<ReturnType<typeof requireCompanyAccess>>, input?: Body["group"]) {
  const weekdays = [...new Set(Array.isArray(input?.weekdays) ? input.weekdays.map(Number) : [])].sort((left, right) => left - right);
  const schedules = Array.isArray(input?.schedules) && input.schedules.length ? input.schedules.map((item) => ({ weekday: Number(item.weekday), startsAt: item.startsAt?.trim() ?? "", endsAt: item.endsAt?.trim() ?? "" })) : weekdays.map((weekday) => ({ weekday, startsAt: input?.startsAt?.trim() ?? "", endsAt: input?.endsAt?.trim() ?? "" }));
  const group = { name: input?.name?.trim().replace(/\s+/g, " ") ?? "", modalityId: input?.modalityId?.trim() ?? "", roomId: input?.roomId?.trim() ?? "", color: input?.color?.trim() ?? "#7435d9", capacity: input?.capacity ? Number(input.capacity) : null, sourceType: input?.sourceType === "SERVICO" ? "SERVICO" : "CONTRATO", settings: normalizeSettings(input?.settings) };
  if (!group.name || !group.modalityId || !group.roomId || !/^#[0-9a-fA-F]{6}$/.test(group.color) || !schedules.length || schedules.some((schedule) => !Number.isInteger(schedule.weekday) || schedule.weekday < 0 || schedule.weekday > 6 || !isTime(schedule.startsAt) || !isTime(schedule.endsAt) || schedule.endsAt <= schedule.startsAt) || (group.capacity !== null && (!Number.isInteger(group.capacity) || group.capacity < 1))) throw new RequestError("PREENCHA NOME, MODALIDADE, SALA, DIA, HORÁRIOS E UMA COR VÁLIDA PARA A GRADE.", 400);
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
  const { error: scheduleError } = await access.admin.from("xpace_class_schedules").insert(schedules.map((schedule) => ({ tenant_company_id: access.company.id, class_group_id: saved.id, weekday: schedule.weekday, starts_at: schedule.startsAt, ends_at: schedule.endsAt, room_name: room.name, room_id: room.id, instructor_id: modality.instructor_id, created_by: access.user.id })));
  if (scheduleError) throw scheduleError;
  return NextResponse.json({ success: true, groupId: saved.id }, { status: 201 });
}


async function updateClass(access: Awaited<ReturnType<typeof requireCompanyAccess>>, input?: Body["group"]) {
  const id = input?.id?.trim();
  const schedules = Array.isArray(input?.schedules) ? input.schedules.map((item) => ({ weekday: Number(item.weekday), startsAt: item.startsAt?.trim() ?? "", endsAt: item.endsAt?.trim() ?? "" })) : [];
  const group = { name: input?.name?.trim().replace(/\s+/g, " ") ?? "", modalityId: input?.modalityId?.trim() ?? "", roomId: input?.roomId?.trim() ?? "", color: input?.color?.trim() ?? "#7435d9", capacity: input?.capacity ? Number(input.capacity) : null, sourceType: input?.sourceType === "SERVICO" ? "SERVICO" : "CONTRATO", settings: normalizeSettings(input?.settings) };
  if (!id || !group.name || !group.modalityId || !group.roomId || !/^#[0-9a-fA-F]{6}$/.test(group.color) || !schedules.length || schedules.some((schedule) => !Number.isInteger(schedule.weekday) || schedule.weekday < 0 || schedule.weekday > 6 || !isTime(schedule.startsAt) || !isTime(schedule.endsAt) || schedule.endsAt <= schedule.startsAt) || (group.capacity !== null && (!Number.isInteger(group.capacity) || group.capacity < 1))) throw new RequestError("PREENCHA NOME, MODALIDADE, SALA, DIA, HORÁRIOS E UMA COR VÁLIDA PARA A GRADE.", 400);

  const [currentResult, modalityResult, roomResult, enrollmentResult, otherSchedulesResult] = await Promise.all([
    access.admin.from("xpace_class_groups").select("id").eq("id", id).eq("tenant_company_id", access.company.id).maybeSingle(),
    access.admin.from("xpace_modalities").select("id,name,instructor_id").eq("id", group.modalityId).eq("tenant_company_id", access.company.id).eq("active", true).eq("uses_schedule", true).maybeSingle(),
    access.admin.from("xpace_rooms").select("id,name,capacity").eq("id", group.roomId).eq("tenant_company_id", access.company.id).eq("active", true).maybeSingle(),
    access.admin.from("xpace_class_enrollments").select("id", { count: "exact", head: true }).eq("class_group_id", id).eq("tenant_company_id", access.company.id).eq("status", "ATIVA"),
    access.admin.from("xpace_class_schedules").select("weekday,starts_at,ends_at,room_id,instructor_id").eq("tenant_company_id", access.company.id).neq("class_group_id", id).eq("active", true),
  ]);
  if (currentResult.error || modalityResult.error || roomResult.error || enrollmentResult.error || otherSchedulesResult.error) throw currentResult.error ?? modalityResult.error ?? roomResult.error ?? enrollmentResult.error ?? otherSchedulesResult.error;
  if (!currentResult.data) throw new RequestError("GRADE NÃO ENCONTRADA.", 404);
  const modality = modalityResult.data;
  const room = roomResult.data;
  if (!modality?.instructor_id) throw new RequestError("A MODALIDADE PRECISA TER UM PROFESSOR RESPONSÁVEL PARA USAR A AGENDA.", 400);
  if (!room) throw new RequestError("SELECIONE UMA SALA ATIVA CADASTRADA.", 400);

  const capacity = group.capacity ?? room.capacity;
  if (room.capacity !== null && capacity !== null && capacity > room.capacity) throw new RequestError(`A GRADE NÃO PODE TER MAIS QUE AS ${room.capacity} VAGAS DA SALA.`, 409);
  if (capacity !== null && (enrollmentResult.count ?? 0) > capacity) throw new RequestError(`NÃO É POSSÍVEL REDUZIR PARA ${capacity} VAGAS: HÁ ${enrollmentResult.count} ALUNO(S) MATRICULADO(S).`, 409);
  if (group.settings.maxClientsEnabled && capacity !== null && (group.settings.maxClients ?? 0) > capacity) throw new RequestError(`O LIMITE DE ALUNOS NÃO PODE PASSAR DAS ${capacity} VAGAS DA GRADE.`, 400);

  for (const schedule of schedules) {
    const conflict = (otherSchedulesResult.data ?? []).some((other) => other.weekday === schedule.weekday && other.starts_at < schedule.endsAt && other.ends_at > schedule.startsAt && (other.room_id === room.id || other.instructor_id === modality.instructor_id));
    if (conflict) throw new RequestError("CONFLITO DE HORÁRIO: A SALA OU O PROFESSOR JÁ ESTÁ OCUPADO NESTE INTERVALO.", 409);
  }

  const { data: previousSchedules, error: previousError } = await access.admin.from("xpace_class_schedules").select("weekday,starts_at,ends_at,room_name,room_id,instructor_id,active,created_by").eq("class_group_id", id).eq("tenant_company_id", access.company.id);
  if (previousError) throw previousError;
  const { error: groupError } = await access.admin.from("xpace_class_groups").update({ name: group.name, modality: modality.name, modality_id: modality.id, instructor_id: modality.instructor_id, color: group.color, capacity, source_type: group.sourceType, settings: group.settings, updated_by: access.user.id, updated_at: new Date().toISOString() }).eq("id", id).eq("tenant_company_id", access.company.id);
  if (groupError) throw groupError;

  const { error: deleteError } = await access.admin.from("xpace_class_schedules").delete().eq("class_group_id", id).eq("tenant_company_id", access.company.id);
  if (deleteError) throw deleteError;
  const { error: insertError } = await access.admin.from("xpace_class_schedules").insert(schedules.map((schedule) => ({ tenant_company_id: access.company.id, class_group_id: id, weekday: schedule.weekday, starts_at: schedule.startsAt, ends_at: schedule.endsAt, room_name: room.name, room_id: room.id, instructor_id: modality.instructor_id, created_by: access.user.id })));
  if (insertError) {
    if (previousSchedules?.length) await access.admin.from("xpace_class_schedules").insert(previousSchedules.map((schedule) => ({ ...schedule, tenant_company_id: access.company.id, class_group_id: id })));
    throw insertError;
  }
  return NextResponse.json({ success: true });
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
function normalizeSettings(value: unknown) { const input = value && typeof value === "object" ? value as Record<string, unknown> : {}; const maxClients = Number(input.maxClients); const gender = input.restrictions && typeof input.restrictions === "object" ? (input.restrictions as Record<string, unknown>).gender : "TODOS"; const leadWelcomeVideoUrl = typeof input.leadWelcomeVideoUrl === "string" ? input.leadWelcomeVideoUrl.trim() : ""; if (input.maxClientsEnabled && (!Number.isInteger(maxClients) || maxClients < 1 || maxClients > 10000)) throw new RequestError("INFORME UM LIMITE DE ALUNOS ENTRE 1 E 10.000.", 400); if (!["TODOS", "FEMININO", "MASCULINO"].includes(typeof gender === "string" ? gender : "")) throw new RequestError("RESTRIÇÃO DE GÊNERO INVÁLIDA.", 400); if (leadWelcomeVideoUrl && !/^https?:\/\/\S+$/i.test(leadWelcomeVideoUrl)) throw new RequestError("INFORME UMA URL VÁLIDA PARA O VÍDEO DE BOAS-VINDAS.", 400); return { maxClientsEnabled: Boolean(input.maxClientsEnabled), maxClients: input.maxClientsEnabled ? maxClients : null, allowSpecialStudents: Boolean(input.allowSpecialStudents), allowLeads: Boolean(input.allowLeads), leadWelcomeVideoUrl: leadWelcomeVideoUrl || null, checkIn: { requireClass: Boolean(input.checkIn && typeof input.checkIn === "object" && (input.checkIn as Record<string, unknown>).requireClass), showInApp: Boolean(input.checkIn && typeof input.checkIn === "object" && (input.checkIn as Record<string, unknown>).showInApp), accessBeforeMinutes: boundedMinutes(input.checkIn, "accessBeforeMinutes"), accessAfterStartMinutes: boundedMinutes(input.checkIn, "accessAfterStartMinutes") }, restrictions: { gender: typeof gender === "string" ? gender : "TODOS", freeSchedule: Boolean(input.restrictions && typeof input.restrictions === "object" && (input.restrictions as Record<string, unknown>).freeSchedule) } }; }
function boundedMinutes(value: unknown, key: string) { const raw = value && typeof value === "object" ? Number((value as Record<string, unknown>)[key]) : 0; return Number.isInteger(raw) && raw >= 0 && raw <= 1440 ? raw : 0; }
function today() { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()); }
class RequestError extends Error { constructor(message: string, public status: number) { super(message); } }
function weekdayLabel(value: number) { return ["DOMINGO", "SEGUNDA", "TERÇA", "QUARTA", "QUINTA", "SEXTA", "SÁBADO"][value] ?? "DIA SELECIONADO"; }
function timeToMinutes(value: string) { const [hours, minutes] = value.slice(0, 5).split(":").map(Number); return hours * 60 + minutes; }
function handleError(error: unknown) { const typedError = error as { status?: unknown; code?: unknown; message?: unknown }; const status = typeof typedError.status === "number" ? typedError.status : undefined; const message = typeof typedError.message === "string" ? typedError.message : ""; if (error instanceof AccessError || error instanceof RequestError || (status !== undefined && status >= 400 && status < 500 && message)) return NextResponse.json({ success: false, message }, { status: status ?? 400 }); const code = typeof typedError.code === "string" ? typedError.code : ""; if (code === "23505") return NextResponse.json({ success: false, message: "ESTE ALUNO JÁ ESTÁ MATRICULADO NESTA GRADE DE HORÁRIOS." }, { status: 409 }); if (code === "23P01") return NextResponse.json({ success: false, message: "CONFLITO DE HORÁRIO: A SALA OU O PROFESSOR JÁ ESTÁ OCUPADO NESTE INTERVALO.", }, { status: 409 }); if (message.includes("XPACE_GRADE_SEM_VAGAS")) return NextResponse.json({ success: false, message: "ESTA GRADE JÁ ATINGIU O LIMITE DE VAGAS.", }, { status: 409 }); if (message.includes("XPACE_GRADE_RESTRITA_POR_GENERO")) return NextResponse.json({ success: false, message: "ESTA GRADE POSSUI RESTRIÇÃO DE GÊNERO.", }, { status: 409 }); console.error("XPACE AGENDA ERROR", error); return NextResponse.json({ success: false, message: "NÃO FOI POSSÍVEL ATUALIZAR A AGENDA." }, { status: 500 }); }

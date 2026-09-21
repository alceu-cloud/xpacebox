import { NextResponse } from "next/server";

import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";

const companySlug = "xpace";
const stages = ["NOVO", "ATENDIMENTO", "AULA_EXPERIMENTAL", "NEGOCIACAO", "GANHO", "PERDIDO"] as const;
const bookingKinds = ["NOVO", "REAGENDAMENTO", "RECUPERACAO"] as const;
const confirmations = ["PENDENTE", "CONFIRMADO", "NAO_CONFIRMADO", "NAO_INFORMADO"] as const;
const attendances = ["AGENDADO", "COMPARECEU", "FALTOU", "CANCELADO", "NAO_INFORMADO"] as const;
const enrollments = ["PENDENTE", "MATRICULOU", "NAO_MATRICULOU", "NAO_INFORMADO"] as const;
const surveys = ["PENDENTE", "ENVIADA", "NAO_ENVIADA", "NAO_INFORMADO"] as const;
const welcomeDeliveries = ["NAO_CONFIGURADO", "PENDENTE", "ENVIADO", "FALHOU", "DISPENSADO"] as const;

type Body = {
  action?: "CREATE_LEAD" | "UPDATE_LEAD" | "CREATE_APPOINTMENT" | "UPDATE_APPOINTMENT" | "ADD_NOTE" | "SAVE_SOURCE" | "SAVE_LOSS_REASON" | "MAP_HISTORICAL_APPOINTMENTS";
  lead?: Record<string, unknown>;
  appointment?: Record<string, unknown>;
  setting?: Record<string, unknown>;
  historical?: Record<string, unknown>;
  note?: string;
};

export async function GET(request: Request) {
  try {
    const access = await requireCompanyAccess(request, companySlug);
    const [leadsResult, appointmentsResult, activitiesResult, sourcesResult, reasonsResult, groupsResult, schedulesResult, instructorsResult, membersResult] = await Promise.all([
      access.admin.from("xpace_leads").select("id,lead_number,full_name,mobile,email,pipeline_stage,source_id,source_note,assigned_to,loss_reason_id,loss_note,converted_person_id,converted_contract_id,created_at,updated_at,won_at,lost_at,legacy_import_batch_id,legacy_row_number").eq("tenant_company_id", access.company.id).order("updated_at", { ascending: false }).limit(1000),
      access.admin.from("xpace_lead_appointments").select("id,lead_id,class_group_id,class_schedule_id,scheduled_on,starts_at,ends_at,booking_kind,confirmation_status,attendance_status,enrollment_outcome,assigned_to,attendant_name_snapshot,modality_name_snapshot,instructor_name_snapshot,actual_instructor_id,actual_instructor_name_snapshot,class_name_snapshot,legacy_week_label,note,survey_status,welcome_video_url,welcome_delivery_status,welcome_delivered_at,confirmed_at,attended_at,outcome_recorded_at,created_at,updated_at").eq("tenant_company_id", access.company.id).order("scheduled_on", { ascending: false }).limit(1500),
      access.admin.from("xpace_lead_activities").select("id,lead_id,appointment_id,activity_type,body,payload,created_by,created_at").eq("tenant_company_id", access.company.id).order("created_at", { ascending: false }).limit(2000),
      access.admin.from("xpace_lead_sources").select("id,name,active").eq("tenant_company_id", access.company.id).order("name"),
      access.admin.from("xpace_lead_loss_reasons").select("id,name,active").eq("tenant_company_id", access.company.id).order("name"),
      access.admin.from("xpace_class_groups").select("id,name,modality,capacity,instructor_id,settings,active").eq("tenant_company_id", access.company.id).eq("active", true).order("name"),
      access.admin.from("xpace_class_schedules").select("id,class_group_id,weekday,starts_at,ends_at,room_name,instructor_id,active").eq("tenant_company_id", access.company.id).eq("active", true).order("weekday").order("starts_at"),
      access.admin.from("xpace_instructors").select("id,full_name,active").eq("tenant_company_id", access.company.id).order("full_name"),
      access.admin.from("company_members").select("profile_id").eq("company_id", access.company.id).eq("active", true),
    ]);
    for (const result of [leadsResult, appointmentsResult, activitiesResult, sourcesResult, reasonsResult, groupsResult, schedulesResult, instructorsResult, membersResult]) if (result.error) throw result.error;
    const profileIds = [...new Set([access.profile.id, ...(membersResult.data ?? []).map((member) => member.profile_id)])];
    const { data: profiles, error: profilesError } = profileIds.length ? await access.admin.from("profiles").select("id,full_name").in("id", profileIds) : { data: [], error: null };
    if (profilesError) throw profilesError;
    const instructorNames = new Map((instructorsResult.data ?? []).map((instructor) => [instructor.id, instructor.full_name]));
    const schedulesByGroup = new Map<string, Array<Record<string, unknown>>>();
    for (const schedule of schedulesResult.data ?? []) schedulesByGroup.set(schedule.class_group_id, [...(schedulesByGroup.get(schedule.class_group_id) ?? []), { id: schedule.id, weekday: schedule.weekday, startsAt: schedule.starts_at?.slice(0, 5) ?? "", endsAt: schedule.ends_at?.slice(0, 5) ?? "", roomName: schedule.room_name ?? "", instructorId: schedule.instructor_id ?? "", instructorName: schedule.instructor_id ? instructorNames.get(schedule.instructor_id) ?? "" : "" }]);
    return NextResponse.json({
      success: true,
      leads: leadsResult.data ?? [], appointments: appointmentsResult.data ?? [], activities: activitiesResult.data ?? [], sources: sourcesResult.data ?? [], lossReasons: reasonsResult.data ?? [],
      attendants: profiles ?? [], instructors: instructorsResult.data ?? [],
      groups: (groupsResult.data ?? []).map((group) => ({ id: group.id, name: group.name, modality: group.modality ?? "", instructorName: group.instructor_id ? instructorNames.get(group.instructor_id) ?? "PROFESSOR ARQUIVADO" : "", capacity: group.capacity, allowsLeads: Boolean((group.settings as Record<string, unknown> | null)?.allowLeads), schedules: schedulesByGroup.get(group.id) ?? [] })),
    });
  } catch (error) { return handleError(error); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Body;
    const access = await requireCompanyAccess(request, companySlug);
    if (body.action === "CREATE_LEAD") return createLead(access, body.lead);
    if (body.action === "UPDATE_LEAD") return updateLead(access, body.lead);
    if (body.action === "CREATE_APPOINTMENT") return createAppointment(access, body.appointment);
    if (body.action === "UPDATE_APPOINTMENT") return updateAppointment(access, body.appointment);
    if (body.action === "ADD_NOTE") return addNote(access, text(body.lead?.id), text(body.note));
    if (body.action === "SAVE_SOURCE") return saveSetting(access, "xpace_lead_sources", body.setting);
    if (body.action === "SAVE_LOSS_REASON") return saveSetting(access, "xpace_lead_loss_reasons", body.setting);
    if (body.action === "MAP_HISTORICAL_APPOINTMENTS") return mapHistoricalAppointments(access, body.historical);
    throw new RequestError("AÇÃO DO CRM INVÁLIDA.", 400);
  } catch (error) { return handleError(error); }
}

async function createLead(access: Awaited<ReturnType<typeof requireCompanyAccess>>, raw?: Record<string, unknown>) {
  const lead = normalizeLead(raw);
  await validateSource(access, lead.sourceId);
  const { data, error } = await access.admin.from("xpace_leads").insert({ tenant_company_id: access.company.id, full_name: lead.fullName, mobile: lead.mobile || null, email: lead.email || null, pipeline_stage: lead.pipelineStage, source_id: lead.sourceId || null, source_note: lead.sourceNote || null, assigned_to: lead.assignedTo || access.profile.id, created_by: access.profile.id, updated_by: access.profile.id }).select("id").single();
  if (error) throw error;
  await activity(access, data.id, null, "LEAD_CRIADO", "LEAD CADASTRADO MANUALMENTE.");
  return NextResponse.json({ success: true, leadId: data.id }, { status: 201 });
}

async function updateLead(access: Awaited<ReturnType<typeof requireCompanyAccess>>, raw?: Record<string, unknown>) {
  const id = text(raw?.id);
  const pipelineStage = enumValue(raw?.pipelineStage, stages, "ETAPA DO LEAD INVÁLIDA.");
  const sourceId = nullableId(raw?.sourceId);
  const assignedTo = nullableId(raw?.assignedTo);
  const lossReasonId = nullableId(raw?.lossReasonId);
  const lossNote = text(raw?.lossNote);
  const changesContact = Boolean(raw && ("fullName" in raw || "mobile" in raw || "email" in raw));
  const fullName = text(raw?.fullName);
  const mobile = digits(raw?.mobile);
  const email = text(raw?.email).toLowerCase();
  if (!id) throw new RequestError("LEAD INVÁLIDO.", 400);
  if (changesContact && (fullName.length < 2 || fullName.length > 180)) throw new RequestError("INFORME O NOME COMPLETO DO LEAD.", 400);
  if (changesContact && mobile && (mobile.length < 10 || mobile.length > 13)) throw new RequestError("INFORME UM TELEFONE VÁLIDO.", 400);
  if (changesContact && email && !/^\S+@\S+\.\S+$/.test(email)) throw new RequestError("INFORME UM E-MAIL VÁLIDO.", 400);
  await Promise.all([validateSource(access, sourceId), validateLossReason(access, lossReasonId), validateAttendant(access, assignedTo)]);
  if (pipelineStage === "PERDIDO" && !lossReasonId && !lossNote) throw new RequestError("INFORME O MOTIVO OU UMA OBSERVAÇÃO PARA MARCAR O LEAD COMO PERDIDO.", 400);
  const { data: current, error: currentError } = await access.admin.from("xpace_leads").select("id,pipeline_stage").eq("id", id).eq("tenant_company_id", access.company.id).maybeSingle();
  if (currentError) throw currentError;
  if (!current) throw new RequestError("LEAD NÃO ENCONTRADO.", 404);
  const stamp = new Date().toISOString();
  const patch = { pipeline_stage: pipelineStage, source_id: sourceId, assigned_to: assignedTo, loss_reason_id: lossReasonId, loss_note: lossNote || null, won_at: pipelineStage === "GANHO" ? stamp : null, lost_at: pipelineStage === "PERDIDO" ? stamp : null, updated_by: access.profile.id, updated_at: stamp, ...(changesContact ? { full_name: fullName, mobile: mobile || null, email: email || null } : {}) };
  const { error } = await access.admin.from("xpace_leads").update(patch).eq("id", id).eq("tenant_company_id", access.company.id);
  if (error) throw error;
  const stageChanged = current.pipeline_stage !== pipelineStage;
  await activity(access, id, null, stageChanged ? pipelineStage === "PERDIDO" ? "PERDIDO" : pipelineStage === "GANHO" ? "CONVERTIDO" : "ETAPA_ALTERADA" : changesContact ? "NOTA" : "ETAPA_ALTERADA", stageChanged ? `ETAPA ATUAL: ${pipelineStage}.` : changesContact ? "DADOS CADASTRAIS DO LEAD ATUALIZADOS." : `ETAPA ATUAL: ${pipelineStage}.`);
  return NextResponse.json({ success: true });
}

async function mapHistoricalAppointments(access: Awaited<ReturnType<typeof requireCompanyAccess>>, raw?: Record<string, unknown>) {
  const classGroupId = text(raw?.classGroupId);
  const modalityName = nullableText(raw?.modalityName);
  const instructorName = nullableText(raw?.instructorName);
  if (!classGroupId || (!modalityName && !instructorName)) throw new RequestError("INFORME O HISTÓRICO E A TURMA QUE RECEBERÁ O VÍNCULO.", 400);
  const { data: group, error: groupError } = await access.admin.from("xpace_class_groups").select("id,name").eq("id", classGroupId).eq("tenant_company_id", access.company.id).eq("active", true).maybeSingle();
  if (groupError) throw groupError;
  if (!group) throw new RequestError("TURMA ATIVA NÃO ENCONTRADA.", 404);
  const stamp = new Date().toISOString();
  const pending = access.admin.from("xpace_lead_appointments").update({ class_group_id: group.id, updated_by: access.profile.id, updated_at: stamp }).eq("tenant_company_id", access.company.id).is("class_group_id", null);
  const byModality = modalityName ? pending.eq("modality_name_snapshot", modalityName) : pending.is("modality_name_snapshot", null);
  const request = instructorName ? byModality.eq("instructor_name_snapshot", instructorName) : byModality.is("instructor_name_snapshot", null);
  const { data, error } = await request.select("id,lead_id");
  if (error) throw error;
  const mapped = data ?? [];
  if (mapped.length) {
    const { error: activityError } = await access.admin.from("xpace_lead_activities").insert(mapped.map((appointment) => ({ tenant_company_id: access.company.id, lead_id: appointment.lead_id, appointment_id: appointment.id, activity_type: "AGENDAMENTO_ATUALIZADO", body: `HISTÓRICO VINCULADO À TURMA ${group.name}.`, payload: { classGroupId: group.id, source: "HISTORICO_EXCEL" }, created_by: access.profile.id })));
    if (activityError) throw activityError;
  }
  return NextResponse.json({ success: true, mapped: mapped.length });
}

async function createAppointment(access: Awaited<ReturnType<typeof requireCompanyAccess>>, raw?: Record<string, unknown>) {
  const leadId = text(raw?.leadId);
  const classGroupId = text(raw?.classGroupId);
  const classScheduleId = text(raw?.classScheduleId);
  const scheduledOn = text(raw?.scheduledOn);
  const bookingKind = enumValue(raw?.bookingKind, bookingKinds, "TIPO DE AGENDAMENTO INVÁLIDO.");
  if (!leadId || !classGroupId || !classScheduleId || !isDate(scheduledOn)) throw new RequestError("SELECIONE O LEAD, A TURMA E A DATA DA AULA EXPERIMENTAL.", 400);
  const [leadResult, snapshot] = await Promise.all([access.admin.from("xpace_leads").select("id,pipeline_stage").eq("id", leadId).eq("tenant_company_id", access.company.id).maybeSingle(), classSnapshot(access, classGroupId, classScheduleId, scheduledOn)]);
  if (leadResult.error) throw leadResult.error;
  if (!leadResult.data) throw new RequestError("LEAD NÃO ENCONTRADO.", 404);
  const payload = { tenant_company_id: access.company.id, lead_id: leadId, class_group_id: classGroupId, class_schedule_id: classScheduleId, scheduled_on: scheduledOn, starts_at: snapshot.startsAt, ends_at: snapshot.endsAt, booking_kind: bookingKind, assigned_to: access.profile.id, attendant_name_snapshot: access.profile.full_name, modality_name_snapshot: snapshot.modality, instructor_name_snapshot: snapshot.instructor, actual_instructor_id: snapshot.instructorId || null, actual_instructor_name_snapshot: snapshot.instructorId ? snapshot.instructor : null, class_name_snapshot: snapshot.className, welcome_video_url: snapshot.welcomeVideoUrl || null, welcome_delivery_status: snapshot.welcomeVideoUrl ? "PENDENTE" : "NAO_CONFIGURADO", created_by: access.profile.id, updated_by: access.profile.id };
  const { data, error } = await access.admin.from("xpace_lead_appointments").insert(payload).select("id").single();
  if (error) throw error;
  if (!stages.includes(leadResult.data.pipeline_stage as typeof stages[number]) || ["NOVO", "ATENDIMENTO"].includes(leadResult.data.pipeline_stage)) await access.admin.from("xpace_leads").update({ pipeline_stage: "AULA_EXPERIMENTAL", updated_by: access.profile.id, updated_at: new Date().toISOString() }).eq("id", leadId);
  await activity(access, leadId, data.id, "AGENDAMENTO_CRIADO", `${bookingKind}: ${snapshot.className} em ${scheduledOn}.`);
  if (snapshot.welcomeVideoUrl) await activity(access, leadId, data.id, "VIDEO_PENDENTE", "VÍDEO DE BOAS-VINDAS PENDENTE DE ENVIO.", { url: snapshot.welcomeVideoUrl });
  return NextResponse.json({ success: true, appointmentId: data.id }, { status: 201 });
}

async function updateAppointment(access: Awaited<ReturnType<typeof requireCompanyAccess>>, raw?: Record<string, unknown>) {
  const id = text(raw?.id);
  const confirmationStatus = enumValue(raw?.confirmationStatus, confirmations, "CONFIRMAÇÃO INVÁLIDA.");
  const attendanceStatus = enumValue(raw?.attendanceStatus, attendances, "STATUS DE PRESENÇA INVÁLIDO.");
  const enrollmentOutcome = enumValue(raw?.enrollmentOutcome, enrollments, "RESULTADO DE MATRÍCULA INVÁLIDO.");
  const surveyStatus = enumValue(raw?.surveyStatus, surveys, "STATUS DA PESQUISA INVÁLIDO.");
  const welcomeDeliveryStatus = enumValue(raw?.welcomeDeliveryStatus, welcomeDeliveries, "STATUS DO VÍDEO INVÁLIDO.");
  const changesActualInstructor = Boolean(raw && "actualInstructorId" in raw);
  const actualInstructorId = nullableId(raw?.actualInstructorId);
  const note = text(raw?.note);
  if (!id) throw new RequestError("AGENDAMENTO INVÁLIDO.", 400);
  const { data: current, error: currentError } = await access.admin.from("xpace_lead_appointments").select("id,lead_id").eq("id", id).eq("tenant_company_id", access.company.id).maybeSingle();
  if (currentError) throw currentError;
  if (!current) throw new RequestError("AGENDAMENTO NÃO ENCONTRADO.", 404);
  const actualInstructor = changesActualInstructor ? await resolveInstructor(access, actualInstructorId) : null;
  const stamp = new Date().toISOString();
  const { error } = await access.admin.from("xpace_lead_appointments").update({ confirmation_status: confirmationStatus, attendance_status: attendanceStatus, enrollment_outcome: enrollmentOutcome, survey_status: surveyStatus, welcome_delivery_status: welcomeDeliveryStatus, note: note || null, confirmed_at: confirmationStatus === "CONFIRMADO" ? stamp : null, attended_at: attendanceStatus === "COMPARECEU" ? stamp : null, outcome_recorded_at: enrollmentOutcome !== "PENDENTE" ? stamp : null, welcome_delivered_at: welcomeDeliveryStatus === "ENVIADO" ? stamp : null, ...(changesActualInstructor ? { actual_instructor_id: actualInstructor?.id ?? null, actual_instructor_name_snapshot: actualInstructor?.full_name ?? null } : {}), updated_by: access.profile.id, updated_at: stamp }).eq("id", id).eq("tenant_company_id", access.company.id);
  if (error) throw error;
  if (enrollmentOutcome === "MATRICULOU") await access.admin.from("xpace_leads").update({ pipeline_stage: "GANHO", won_at: stamp, updated_by: access.profile.id, updated_at: stamp }).eq("id", current.lead_id).eq("tenant_company_id", access.company.id);
  await activity(access, current.lead_id, id, "AGENDAMENTO_ATUALIZADO", `CONFIRMAÇÃO: ${confirmationStatus} · PRESENÇA: ${attendanceStatus} · MATRÍCULA: ${enrollmentOutcome}.${changesActualInstructor ? ` PROFESSOR: ${actualInstructor?.full_name ?? "NÃO INFORMADO"}.` : ""}`);
  return NextResponse.json({ success: true });
}

async function addNote(access: Awaited<ReturnType<typeof requireCompanyAccess>>, leadId: string, note: string) {
  if (!leadId || !note) throw new RequestError("INFORME O LEAD E A OBSERVAÇÃO.", 400);
  const { data, error } = await access.admin.from("xpace_leads").select("id").eq("id", leadId).eq("tenant_company_id", access.company.id).maybeSingle();
  if (error) throw error;
  if (!data) throw new RequestError("LEAD NÃO ENCONTRADO.", 404);
  await activity(access, leadId, null, "NOTA", note);
  return NextResponse.json({ success: true });
}

async function saveSetting(access: Awaited<ReturnType<typeof requireCompanyAccess>>, table: "xpace_lead_sources" | "xpace_lead_loss_reasons", raw?: Record<string, unknown>) {
  if (!isManager(access.profile.platform_role)) throw new AccessError("APENAS GESTORES PODEM ALTERAR OS CADASTROS DO CRM.", 403);
  const id = text(raw?.id);
  const name = text(raw?.name).toLocaleUpperCase("pt-BR");
  const active = Boolean(raw?.active);
  if (name.length < 2 || name.length > 100) throw new RequestError("INFORME UM NOME ENTRE 2 E 100 CARACTERES.", 400);
  const stamp = new Date().toISOString();
  if (id) {
    const { error } = await access.admin.from(table).update({ name, active, updated_by: access.profile.id, updated_at: stamp }).eq("id", id).eq("tenant_company_id", access.company.id);
    if (error) throw error;
  } else {
    const { error } = await access.admin.from(table).insert({ tenant_company_id: access.company.id, name, active, created_by: access.profile.id, updated_by: access.profile.id });
    if (error) throw error;
  }
  return NextResponse.json({ success: true });
}

async function classSnapshot(access: Awaited<ReturnType<typeof requireCompanyAccess>>, groupId: string, scheduleId: string, scheduledOn: string) {
  const [{ data: group, error: groupError }, { data: schedule, error: scheduleError }] = await Promise.all([
    access.admin.from("xpace_class_groups").select("id,name,modality,instructor_id,settings,active").eq("id", groupId).eq("tenant_company_id", access.company.id).maybeSingle(),
    access.admin.from("xpace_class_schedules").select("id,class_group_id,weekday,starts_at,ends_at,instructor_id,active").eq("id", scheduleId).eq("tenant_company_id", access.company.id).maybeSingle(),
  ]);
  if (groupError || scheduleError) throw groupError ?? scheduleError;
  if (!group?.active || !schedule?.active || schedule.class_group_id !== group.id) throw new RequestError("A TURMA OU O HORÁRIO NÃO ESTÃO DISPONÍVEIS.", 409);
  if (!Boolean((group.settings as Record<string, unknown> | null)?.allowLeads)) throw new RequestError("ESTA TURMA NÃO ESTÁ LIBERADA PARA AULA EXPERIMENTAL.", 409);
  if (new Date(`${scheduledOn}T12:00:00`).getDay() !== schedule.weekday) throw new RequestError("A DATA NÃO CORRESPONDE AO HORÁRIO DA TURMA.", 400);
  const instructorId = schedule.instructor_id ?? group.instructor_id;
  const { data: instructor, error: instructorError } = instructorId ? await access.admin.from("xpace_instructors").select("id,full_name").eq("id", instructorId).eq("tenant_company_id", access.company.id).maybeSingle() : { data: null, error: null };
  if (instructorError) throw instructorError;
  const url = (group.settings as Record<string, unknown> | null)?.leadWelcomeVideoUrl;
  return { className: group.name, modality: group.modality ?? "SEM MODALIDADE", instructorId: instructor?.id ?? "", instructor: instructor?.full_name ?? "PROFESSOR A DEFINIR", startsAt: schedule.starts_at.slice(0, 5), endsAt: schedule.ends_at.slice(0, 5), welcomeVideoUrl: typeof url === "string" && /^https?:\/\//i.test(url) ? url : "" };
}

async function activity(access: Awaited<ReturnType<typeof requireCompanyAccess>>, leadId: string, appointmentId: string | null, activityType: string, body: string, payload: Record<string, unknown> = {}) {
  const { error } = await access.admin.from("xpace_lead_activities").insert({ tenant_company_id: access.company.id, lead_id: leadId, appointment_id: appointmentId, activity_type: activityType, body, payload, created_by: access.profile.id });
  if (error) throw error;
}

async function validateSource(access: Awaited<ReturnType<typeof requireCompanyAccess>>, id: string | null) { if (!id) return; const { data, error } = await access.admin.from("xpace_lead_sources").select("id").eq("id", id).eq("tenant_company_id", access.company.id).maybeSingle(); if (error) throw error; if (!data) throw new RequestError("ORIGEM DO LEAD INVÁLIDA.", 400); }
async function validateLossReason(access: Awaited<ReturnType<typeof requireCompanyAccess>>, id: string | null) { if (!id) return; const { data, error } = await access.admin.from("xpace_lead_loss_reasons").select("id").eq("id", id).eq("tenant_company_id", access.company.id).maybeSingle(); if (error) throw error; if (!data) throw new RequestError("MOTIVO DE PERDA INVÁLIDO.", 400); }
async function validateAttendant(access: Awaited<ReturnType<typeof requireCompanyAccess>>, id: string | null) { if (!id || id === access.profile.id) return; const { data, error } = await access.admin.from("company_members").select("profile_id").eq("company_id", access.company.id).eq("profile_id", id).eq("active", true).maybeSingle(); if (error) throw error; if (!data) throw new RequestError("ATENDENTE INVÁLIDO.", 400); }
async function resolveInstructor(access: Awaited<ReturnType<typeof requireCompanyAccess>>, id: string | null) { if (!id) return null; const { data, error } = await access.admin.from("xpace_instructors").select("id,full_name").eq("id", id).eq("tenant_company_id", access.company.id).maybeSingle(); if (error) throw error; if (!data) throw new RequestError("PROFESSOR INVÁLIDO.", 400); return data; }
function normalizeLead(raw?: Record<string, unknown>) { const fullName = text(raw?.fullName); const mobile = digits(raw?.mobile); const email = text(raw?.email).toLowerCase(); const pipelineStage = enumValue(raw?.pipelineStage ?? "NOVO", stages, "ETAPA DO LEAD INVÁLIDA."); if (fullName.length < 2 || fullName.length > 180) throw new RequestError("INFORME O NOME COMPLETO DO LEAD.", 400); if (mobile && (mobile.length < 10 || mobile.length > 13)) throw new RequestError("INFORME UM TELEFONE VÁLIDO.", 400); if (email && !/^\S+@\S+\.\S+$/.test(email)) throw new RequestError("INFORME UM E-MAIL VÁLIDO.", 400); return { fullName, mobile, email, pipelineStage, sourceId: nullableId(raw?.sourceId), sourceNote: text(raw?.sourceNote), assignedTo: nullableId(raw?.assignedTo) }; }
function enumValue<T extends readonly string[]>(value: unknown, values: T, error: string): T[number] { if (typeof value !== "string" || !values.includes(value)) throw new RequestError(error, 400); return value as T[number]; }
function text(value: unknown) { return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : ""; }
function digits(value: unknown) { return text(value).replace(/\D/g, ""); }
function nullableId(value: unknown) { const id = text(value); return id || null; }
function nullableText(value: unknown) { const normalized = text(value); return normalized || null; }
function isDate(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00`)); }
function isManager(role: string) { return role === "platform_owner" || role === "company_manager"; }
function handleError(error: unknown) { if (error instanceof AccessError || error instanceof RequestError) return NextResponse.json({ success: false, message: error.message }, { status: error.status }); const message = (error as { message?: string })?.message ?? ""; if (message.includes("XPACE_LEAD_SLOT_UNAVAILABLE")) return NextResponse.json({ success: false, message: "ESTA TURMA JÁ ATINGIU O LIMITE DE VAGAS NESTA DATA." }, { status: 409 }); if (message.includes("XPACE_GRADE_NAO_ACEITA_LEADS")) return NextResponse.json({ success: false, message: "ESTA TURMA NÃO ACEITA AULA EXPERIMENTAL." }, { status: 409 }); if (message.includes("XPACE_TRIAL_LIMIT_REQUIRES_FEE")) return NextResponse.json({ success: false, message: "ESTE LEAD JÁ UTILIZOU AS DUAS EXPERIMENTAIS. A TERCEIRA AULA EXIGE TAXA E A LIBERAÇÃO FINANCEIRA AINDA NÃO ESTÁ CONFIGURADA." }, { status: 409 }); if ((error as { code?: string })?.code === "23505") return NextResponse.json({ success: false, message: "JÁ EXISTE UM AGENDAMENTO ATIVO DESTE LEAD NESTA TURMA E DATA." }, { status: 409 }); console.error("XPACE LEADS ERROR", error); return NextResponse.json({ success: false, message: "NÃO FOI POSSÍVEL ATUALIZAR O CRM." }, { status: 500 }); }
class RequestError extends Error { constructor(message: string, public status: number) { super(message); } }

import { NextResponse } from "next/server";

import { createSupabaseAdmin } from "@/lib/server/supabase-admin";
import { sortNaturally } from "@/lib/xpace/natural-sort";

const companySlug = "xpace";
const bookingHorizonDays = 35;

type BookingBody = { fullName?: unknown; mobile?: unknown; email?: unknown; sourceId?: unknown; classGroupId?: unknown; classScheduleId?: unknown; scheduledOn?: unknown; website?: unknown };

export async function GET() {
  try {
    const admin = createSupabaseAdmin();
    const { data: company, error: companyError } = await admin.from("companies").select("id,name").eq("slug", companySlug).eq("active", true).single();
    if (companyError || !company) throw new PublicError("AGENDA DA ESCOLA NÃO ENCONTRADA.", 404);
    const today = brazilToday(); const end = addDays(today, bookingHorizonDays);
    const [groupsResult, schedulesResult, instructorsResult, appointmentsResult, enrollmentsResult, sourcesResult] = await Promise.all([
      admin.from("xpace_class_groups").select("id,name,modality,class_level,instructor_id,capacity,settings").eq("tenant_company_id", company.id).eq("active", true),
      admin.from("xpace_class_schedules").select("id,class_group_id,weekday,starts_at,ends_at,room_name,instructor_id,class_level,age_group,age_groups,capacity,settings").eq("tenant_company_id", company.id).eq("active", true),
      admin.from("xpace_instructors").select("id,full_name").eq("tenant_company_id", company.id).eq("active", true),
      admin.from("xpace_lead_appointments").select("class_group_id,class_schedule_id,scheduled_on").eq("tenant_company_id", company.id).neq("attendance_status", "CANCELADO").gte("scheduled_on", today).lte("scheduled_on", end),
      admin.from("xpace_class_enrollments").select("class_group_id,starts_on,ends_on").eq("tenant_company_id", company.id).eq("status", "ATIVA"),
      admin.from("xpace_lead_sources").select("id,name").eq("tenant_company_id", company.id).eq("active", true).order("name"),
    ]);
    for (const result of [groupsResult, schedulesResult, instructorsResult, appointmentsResult, enrollmentsResult, sourcesResult]) if (result.error) throw result.error;
    const instructorNames = new Map((instructorsResult.data ?? []).map((instructor) => [instructor.id, instructor.full_name]));
    const appointmentCount = new Map<string, number>();
    for (const appointment of appointmentsResult.data ?? []) appointmentCount.set(`${appointment.class_schedule_id ?? appointment.class_group_id}:${appointment.scheduled_on}`, (appointmentCount.get(`${appointment.class_schedule_id ?? appointment.class_group_id}:${appointment.scheduled_on}`) ?? 0) + 1);
    const groups = new Map((groupsResult.data ?? []).map((group) => [group.id, group]));
    const slots = (schedulesResult.data ?? []).flatMap((schedule) => {
      const group = groups.get(schedule.class_group_id);
      if (!group) return [];
      return datesForWeekday(today, end, schedule.weekday).flatMap((scheduledOn) => {
        const settings = slotSettings(schedule.settings, group.settings);
        if (!Boolean(settings?.allowLeads)) return [];
        const enrolled = (enrollmentsResult.data ?? []).filter((enrollment) => enrollment.class_group_id === group.id && enrollment.starts_on <= scheduledOn && (!enrollment.ends_on || enrollment.ends_on >= scheduledOn)).length;
        const booked = appointmentCount.get(`${schedule.id}:${scheduledOn}`) ?? 0;
        const configuredMax = Boolean(settings?.maxClientsEnabled) && Number.isInteger(Number(settings?.maxClients)) ? Number(settings?.maxClients) : null;
        const slotCapacity = schedule.capacity ?? group.capacity;
        const limit = slotCapacity === null ? configuredMax : configuredMax === null ? slotCapacity : Math.min(slotCapacity, configuredMax);
        const available = limit === null ? null : Math.max(0, limit - enrolled - booked);
        if (available === 0) return [];
        const ageGroups = normalizeAgeGroups(schedule.age_groups, schedule.age_group);
        return [{ classGroupId: group.id, classScheduleId: schedule.id, scheduledOn, startsAt: schedule.starts_at.slice(0, 5), endsAt: schedule.ends_at.slice(0, 5), className: group.name, modality: group.modality ?? "AULA EXPERIMENTAL", level: normalizeClassLevel(schedule.class_level ?? group.class_level), ageGroup: ageGroups[0], ageGroups, instructorName: schedule.instructor_id ? instructorNames.get(schedule.instructor_id) ?? "PROFESSOR" : "PROFESSOR", roomName: schedule.room_name ?? "", remainingSeats: available }];
      });
    }).sort((left, right) => `${left.scheduledOn}${left.startsAt}${left.className}`.localeCompare(`${right.scheduledOn}${right.startsAt}${right.className}`));
    return NextResponse.json({ success: true, schoolName: company.name, slots, sources: sortNaturally(sourcesResult.data ?? [], (source) => source.name) });
  } catch (error) { return handleError(error); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as BookingBody;
    if (text(body.website)) return NextResponse.json({ success: true, message: "SOLICITAÇÃO RECEBIDA." }, { status: 201 });
    const fullName = text(body.fullName); const mobile = phone(body.mobile); const email = text(body.email).toLowerCase(); const sourceId = text(body.sourceId); const classGroupId = text(body.classGroupId); const classScheduleId = text(body.classScheduleId); const scheduledOn = text(body.scheduledOn);
    if (fullName.length < 2 || fullName.length > 180 || mobile.length < 10 || mobile.length > 13 || !/^\S+@\S+\.\S+$/.test(email) || !sourceId || !classGroupId || !classScheduleId || !isDate(scheduledOn)) throw new PublicError("PREENCHA NOME, TELEFONE, E-MAIL, COMO CONHECEU A XPACE E O HORÁRIO DESEJADO.", 400);
    const today = brazilToday();
    if (scheduledOn < today || scheduledOn > addDays(today, bookingHorizonDays)) throw new PublicError("ESCOLHA UM HORÁRIO DISPONÍVEL NA AGENDA.", 400);
    const admin = createSupabaseAdmin();
    const { data: company, error: companyError } = await admin.from("companies").select("id").eq("slug", companySlug).eq("active", true).single();
    if (companyError || !company) throw new PublicError("AGENDA DA ESCOLA NÃO ENCONTRADA.", 404);
    const { data: source, error: sourceError } = await admin.from("xpace_lead_sources").select("id,name").eq("id", sourceId).eq("tenant_company_id", company.id).eq("active", true).maybeSingle();
    if (sourceError) throw sourceError;
    if (!source) throw new PublicError("SELECIONE UMA ORIGEM DE CONTATO VÁLIDA.", 400);
    const snapshot = await classSnapshot(admin, company.id, classGroupId, classScheduleId, scheduledOn);
    const { data: existingLeads, error: leadLookupError } = await admin.from("xpace_leads").select("id,pipeline_stage,source_id").eq("tenant_company_id", company.id).eq("mobile", mobile).order("created_at", { ascending: false }).limit(25);
    if (leadLookupError) throw leadLookupError;
    const existingLeadIds = (existingLeads ?? []).map((lead) => lead.id);
    if (existingLeadIds.length) {
      const { count: previousTrialCount, error: previousCountError } = await admin.from("xpace_lead_appointments").select("id", { count: "exact", head: true }).eq("tenant_company_id", company.id).in("lead_id", existingLeadIds).eq("booking_kind", "NOVO").neq("attendance_status", "CANCELADO");
      if (previousCountError) throw previousCountError;
      if ((previousTrialCount ?? 0) >= 2) throw new PublicError("ESTE TELEFONE JÁ UTILIZOU AS DUAS AULAS EXPERIMENTAIS. PARA UMA NOVA AULA, FALE COM A EQUIPE XPACE PARA RECEBER AS ORIENTAÇÕES.", 409);
    }
    let leadId = existingLeads?.[0]?.id;
    if (leadId) {
      if (!existingLeads?.[0]?.source_id) {
        const { error: sourceUpdateError } = await admin.from("xpace_leads").update({ source_id: source.id, updated_at: new Date().toISOString() }).eq("id", leadId).eq("tenant_company_id", company.id);
        if (sourceUpdateError) throw sourceUpdateError;
      }
    } else {
      const { data: newLead, error: leadError } = await admin.from("xpace_leads").insert({ tenant_company_id: company.id, full_name: fullName, mobile, email, source_id: source.id, pipeline_stage: "AULA_EXPERIMENTAL" }).select("id").single();
      if (leadError) throw leadError;
      leadId = newLead.id;
      await addActivity(admin, company.id, leadId, null, "LEAD_CRIADO", "LEAD CRIADO PELO AGENDAMENTO PÚBLICO.");
    }
    const { data: appointment, error: appointmentError } = await admin.from("xpace_lead_appointments").insert({ tenant_company_id: company.id, lead_id: leadId, class_group_id: classGroupId, class_schedule_id: classScheduleId, scheduled_on: scheduledOn, starts_at: snapshot.startsAt, ends_at: snapshot.endsAt, booking_kind: "NOVO", modality_name_snapshot: snapshot.modality, instructor_name_snapshot: snapshot.instructor, actual_instructor_id: snapshot.instructorId || null, actual_instructor_name_snapshot: snapshot.instructorId ? snapshot.instructor : null, class_name_snapshot: snapshot.className, welcome_video_url: snapshot.welcomeVideoUrl || null, welcome_delivery_status: snapshot.welcomeVideoUrl ? "PENDENTE" : "NAO_CONFIGURADO" }).select("id").single();
    if (appointmentError) throw appointmentError;
    await addActivity(admin, company.id, leadId, appointment.id, "AGENDAMENTO_CRIADO", `AGENDAMENTO PÚBLICO: ${snapshot.className} em ${scheduledOn}.`);
    if (snapshot.welcomeVideoUrl) await addActivity(admin, company.id, leadId, appointment.id, "VIDEO_PENDENTE", "VÍDEO DE BOAS-VINDAS PENDENTE DE ENVIO.", { url: snapshot.welcomeVideoUrl });
    return NextResponse.json({ success: true, message: "AULA EXPERIMENTAL AGENDADA! A EQUIPE XPACE CONFIRMARÁ OS DETALHES COM VOCÊ." }, { status: 201 });
  } catch (error) { return handleError(error); }
}

async function classSnapshot(admin: ReturnType<typeof createSupabaseAdmin>, companyId: string, groupId: string, scheduleId: string, scheduledOn: string) {
  const [{ data: group, error: groupError }, { data: schedule, error: scheduleError }] = await Promise.all([
    admin.from("xpace_class_groups").select("id,name,modality,instructor_id,settings,active").eq("id", groupId).eq("tenant_company_id", companyId).maybeSingle(),
    admin.from("xpace_class_schedules").select("id,class_group_id,weekday,starts_at,ends_at,instructor_id,settings,active").eq("id", scheduleId).eq("tenant_company_id", companyId).maybeSingle(),
  ]);
  if (groupError || scheduleError) throw groupError ?? scheduleError;
  const settings = slotSettings(schedule?.settings, group?.settings);
  if (!group?.active || !schedule?.active || schedule.class_group_id !== group.id || !Boolean(settings?.allowLeads)) throw new PublicError("ESTE HORÁRIO NÃO ESTÁ MAIS DISPONÍVEL.", 409);
  if (weekdayOf(scheduledOn) !== schedule.weekday) throw new PublicError("A DATA NÃO CORRESPONDE AO HORÁRIO ESCOLHIDO.", 400);
  const { data: instructor, error: instructorError } = schedule.instructor_id ? await admin.from("xpace_instructors").select("id,full_name").eq("id", schedule.instructor_id).eq("tenant_company_id", companyId).maybeSingle() : { data: null, error: null };
  if (instructorError) throw instructorError;
  const video = settings?.leadWelcomeVideoUrl;
  return { className: group.name, modality: group.modality ?? "AULA EXPERIMENTAL", instructorId: instructor?.id ?? "", instructor: instructor?.full_name ?? "PROFESSOR", startsAt: schedule.starts_at.slice(0, 5), endsAt: schedule.ends_at.slice(0, 5), welcomeVideoUrl: typeof video === "string" && /^https?:\/\//i.test(video) ? video : "" };
}

async function addActivity(admin: ReturnType<typeof createSupabaseAdmin>, companyId: string, leadId: string, appointmentId: string | null, activityType: string, body: string, payload: Record<string, unknown> = {}) { const { error } = await admin.from("xpace_lead_activities").insert({ tenant_company_id: companyId, lead_id: leadId, appointment_id: appointmentId, activity_type: activityType, body, payload }); if (error) throw error; }
function brazilToday() { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()); }
function addDays(iso: string, days: number) { const value = new Date(`${iso}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }
function datesForWeekday(start: string, end: string, weekday: number) { const result: string[] = []; for (let value = start; value <= end; value = addDays(value, 1)) if (weekdayOf(value) === weekday) result.push(value); return result; }
function weekdayOf(iso: string) { return new Date(`${iso}T12:00:00Z`).getUTCDay(); }
function isDate(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00`)); }
function text(value: unknown) { return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : ""; }
function digits(value: unknown) { return text(value).replace(/\D/g, ""); }
function phone(value: unknown) { return digits(value).replace(/^55(?=\d{10,11}$)/, ""); }
function normalizeClassLevel(value: unknown) { return ["INICIANTE", "INICIANTE_INTERMEDIARIO", "INTERMEDIARIO", "AVANCADO"].includes(text(value)) ? text(value) : "INICIANTE"; }
function normalizeAgeGroup(value: unknown) { return ["BABY", "KIDS", "TEENS", "ADULTO"].includes(text(value)) ? text(value) : "ADULTO"; }
function normalizeAgeGroups(value: unknown, fallback: unknown) { const selected = Array.isArray(value) ? value.map((item) => normalizeAgeGroup(item)) : []; const normalized = ["BABY", "KIDS", "TEENS", "ADULTO"].filter((ageGroup) => selected.includes(ageGroup)); return normalized.length ? normalized : [normalizeAgeGroup(fallback)]; }
function slotSettings(value: unknown, fallback: unknown) { const slot = value && typeof value === "object" ? value as Record<string, unknown> : {}; return Object.keys(slot).length ? slot : fallback && typeof fallback === "object" ? fallback as Record<string, unknown> : {}; }
function handleError(error: unknown) { if (error instanceof PublicError) return NextResponse.json({ success: false, message: error.message }, { status: error.status }); const message = (error as { message?: string })?.message ?? ""; if (message.includes("XPACE_LEAD_SLOT_UNAVAILABLE")) return NextResponse.json({ success: false, message: "ESTE HORÁRIO ACABOU DE SER PREENCHIDO. ESCOLHA OUTRO, POR FAVOR." }, { status: 409 }); if (message.includes("XPACE_TRIAL_LIMIT_REQUIRES_FEE")) return NextResponse.json({ success: false, message: "ESTE TELEFONE JÁ UTILIZOU AS DUAS AULAS EXPERIMENTAIS. PARA UMA NOVA AULA, FALE COM A EQUIPE XPACE PARA RECEBER AS ORIENTAÇÕES." }, { status: 409 }); if ((error as { code?: string })?.code === "23505") return NextResponse.json({ success: false, message: "VOCÊ JÁ POSSUI ESTE AGENDAMENTO ATIVO." }, { status: 409 }); console.error("XPACE PUBLIC TRIAL BOOKING ERROR", error); return NextResponse.json({ success: false, message: "NÃO FOI POSSÍVEL CONCLUIR O AGENDAMENTO. TENTE NOVAMENTE." }, { status: 500 }); }
class PublicError extends Error { constructor(message: string, public status: number) { super(message); } }

import { NextResponse } from "next/server";

import { createSupabaseAdmin } from "@/lib/server/supabase-admin";

const companySlug = "xpace";
const bookingHorizonDays = 35;

type BookingBody = { fullName?: unknown; mobile?: unknown; email?: unknown; classGroupId?: unknown; classScheduleId?: unknown; scheduledOn?: unknown; website?: unknown };

export async function GET() {
  try {
    const admin = createSupabaseAdmin();
    const { data: company, error: companyError } = await admin.from("companies").select("id,name").eq("slug", companySlug).eq("active", true).single();
    if (companyError || !company) throw new PublicError("AGENDA DA ESCOLA NÃO ENCONTRADA.", 404);
    const today = brazilToday(); const end = addDays(today, bookingHorizonDays);
    const [groupsResult, schedulesResult, instructorsResult, appointmentsResult, enrollmentsResult] = await Promise.all([
      admin.from("xpace_class_groups").select("id,name,modality,instructor_id,capacity,settings").eq("tenant_company_id", company.id).eq("active", true),
      admin.from("xpace_class_schedules").select("id,class_group_id,weekday,starts_at,ends_at,room_name").eq("tenant_company_id", company.id).eq("active", true),
      admin.from("xpace_instructors").select("id,full_name").eq("tenant_company_id", company.id).eq("active", true),
      admin.from("xpace_lead_appointments").select("class_group_id,scheduled_on").eq("tenant_company_id", company.id).neq("attendance_status", "CANCELADO").gte("scheduled_on", today).lte("scheduled_on", end),
      admin.from("xpace_class_enrollments").select("class_group_id,starts_on,ends_on").eq("tenant_company_id", company.id).eq("status", "ATIVA"),
    ]);
    for (const result of [groupsResult, schedulesResult, instructorsResult, appointmentsResult, enrollmentsResult]) if (result.error) throw result.error;
    const instructorNames = new Map((instructorsResult.data ?? []).map((instructor) => [instructor.id, instructor.full_name]));
    const appointmentCount = new Map<string, number>();
    for (const appointment of appointmentsResult.data ?? []) appointmentCount.set(`${appointment.class_group_id}:${appointment.scheduled_on}`, (appointmentCount.get(`${appointment.class_group_id}:${appointment.scheduled_on}`) ?? 0) + 1);
    const groups = new Map((groupsResult.data ?? []).filter((group) => Boolean((group.settings as Record<string, unknown> | null)?.allowLeads)).map((group) => [group.id, group]));
    const slots = (schedulesResult.data ?? []).flatMap((schedule) => {
      const group = groups.get(schedule.class_group_id);
      if (!group) return [];
      return datesForWeekday(today, end, schedule.weekday).flatMap((scheduledOn) => {
        const enrolled = (enrollmentsResult.data ?? []).filter((enrollment) => enrollment.class_group_id === group.id && enrollment.starts_on <= scheduledOn && (!enrollment.ends_on || enrollment.ends_on >= scheduledOn)).length;
        const booked = appointmentCount.get(`${group.id}:${scheduledOn}`) ?? 0;
        const settings = group.settings as Record<string, unknown> | null;
        const configuredMax = Boolean(settings?.maxClientsEnabled) && Number.isInteger(Number(settings?.maxClients)) ? Number(settings?.maxClients) : null;
        const limit = group.capacity === null ? configuredMax : configuredMax === null ? group.capacity : Math.min(group.capacity, configuredMax);
        const available = limit === null ? null : Math.max(0, limit - enrolled - booked);
        if (available === 0) return [];
        return [{ classGroupId: group.id, classScheduleId: schedule.id, scheduledOn, startsAt: schedule.starts_at.slice(0, 5), endsAt: schedule.ends_at.slice(0, 5), className: group.name, modality: group.modality ?? "AULA EXPERIMENTAL", instructorName: group.instructor_id ? instructorNames.get(group.instructor_id) ?? "PROFESSOR" : "PROFESSOR", roomName: schedule.room_name ?? "", remainingSeats: available }];
      });
    }).sort((left, right) => `${left.scheduledOn}${left.startsAt}${left.className}`.localeCompare(`${right.scheduledOn}${right.startsAt}${right.className}`));
    return NextResponse.json({ success: true, schoolName: company.name, slots });
  } catch (error) { return handleError(error); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as BookingBody;
    if (text(body.website)) return NextResponse.json({ success: true, message: "SOLICITAÇÃO RECEBIDA." }, { status: 201 });
    const fullName = text(body.fullName); const mobile = digits(body.mobile); const email = text(body.email).toLowerCase(); const classGroupId = text(body.classGroupId); const classScheduleId = text(body.classScheduleId); const scheduledOn = text(body.scheduledOn);
    if (fullName.length < 2 || fullName.length > 180 || mobile.length < 10 || mobile.length > 13 || !/^\S+@\S+\.\S+$/.test(email) || !classGroupId || !classScheduleId || !isDate(scheduledOn)) throw new PublicError("PREENCHA NOME, TELEFONE, E-MAIL E O HORÁRIO DESEJADO.", 400);
    const today = brazilToday();
    if (scheduledOn < today || scheduledOn > addDays(today, bookingHorizonDays)) throw new PublicError("ESCOLHA UM HORÁRIO DISPONÍVEL NA AGENDA.", 400);
    const admin = createSupabaseAdmin();
    const { data: company, error: companyError } = await admin.from("companies").select("id").eq("slug", companySlug).eq("active", true).single();
    if (companyError || !company) throw new PublicError("AGENDA DA ESCOLA NÃO ENCONTRADA.", 404);
    const snapshot = await classSnapshot(admin, company.id, classGroupId, classScheduleId, scheduledOn);
    const { data: existingLeads, error: leadLookupError } = await admin.from("xpace_leads").select("id,pipeline_stage").eq("tenant_company_id", company.id).eq("mobile", mobile).eq("email", email).order("created_at", { ascending: false }).limit(1);
    if (leadLookupError) throw leadLookupError;
    let leadId = existingLeads?.[0]?.id;
    if (leadId) {
      const { data: previousAppointments, error: previousError } = await admin.from("xpace_lead_appointments").select("id").eq("tenant_company_id", company.id).eq("lead_id", leadId).eq("booking_kind", "NOVO").neq("attendance_status", "CANCELADO");
      if (previousError) throw previousError;
      if ((previousAppointments?.length ?? 0) >= 2) throw new PublicError("VOCÊ JÁ UTILIZOU AS DUAS AULAS EXPERIMENTAIS. A TERCEIRA AULA POSSUI TAXA E DEVE SER COMBINADA COM A EQUIPE XPACE.", 409);
    } else {
      const { data: newLead, error: leadError } = await admin.from("xpace_leads").insert({ tenant_company_id: company.id, full_name: fullName, mobile, email, pipeline_stage: "AULA_EXPERIMENTAL" }).select("id").single();
      if (leadError) throw leadError;
      leadId = newLead.id;
      await addActivity(admin, company.id, leadId, null, "LEAD_CRIADO", "LEAD CRIADO PELO AGENDAMENTO PÚBLICO.");
    }
    const { data: appointment, error: appointmentError } = await admin.from("xpace_lead_appointments").insert({ tenant_company_id: company.id, lead_id: leadId, class_group_id: classGroupId, class_schedule_id: classScheduleId, scheduled_on: scheduledOn, starts_at: snapshot.startsAt, ends_at: snapshot.endsAt, booking_kind: "NOVO", modality_name_snapshot: snapshot.modality, instructor_name_snapshot: snapshot.instructor, class_name_snapshot: snapshot.className, welcome_video_url: snapshot.welcomeVideoUrl || null, welcome_delivery_status: snapshot.welcomeVideoUrl ? "PENDENTE" : "NAO_CONFIGURADO" }).select("id").single();
    if (appointmentError) throw appointmentError;
    await addActivity(admin, company.id, leadId, appointment.id, "AGENDAMENTO_CRIADO", `AGENDAMENTO PÚBLICO: ${snapshot.className} em ${scheduledOn}.`);
    if (snapshot.welcomeVideoUrl) await addActivity(admin, company.id, leadId, appointment.id, "VIDEO_PENDENTE", "VÍDEO DE BOAS-VINDAS PENDENTE DE ENVIO.", { url: snapshot.welcomeVideoUrl });
    return NextResponse.json({ success: true, message: "AULA EXPERIMENTAL AGENDADA! A EQUIPE XPACE CONFIRMARÁ OS DETALHES COM VOCÊ." }, { status: 201 });
  } catch (error) { return handleError(error); }
}

async function classSnapshot(admin: ReturnType<typeof createSupabaseAdmin>, companyId: string, groupId: string, scheduleId: string, scheduledOn: string) {
  const [{ data: group, error: groupError }, { data: schedule, error: scheduleError }] = await Promise.all([
    admin.from("xpace_class_groups").select("id,name,modality,instructor_id,settings,active").eq("id", groupId).eq("tenant_company_id", companyId).maybeSingle(),
    admin.from("xpace_class_schedules").select("id,class_group_id,weekday,starts_at,ends_at,active").eq("id", scheduleId).eq("tenant_company_id", companyId).maybeSingle(),
  ]);
  if (groupError || scheduleError) throw groupError ?? scheduleError;
  if (!group?.active || !schedule?.active || schedule.class_group_id !== group.id || !Boolean((group.settings as Record<string, unknown> | null)?.allowLeads)) throw new PublicError("ESTE HORÁRIO NÃO ESTÁ MAIS DISPONÍVEL.", 409);
  if (weekdayOf(scheduledOn) !== schedule.weekday) throw new PublicError("A DATA NÃO CORRESPONDE AO HORÁRIO ESCOLHIDO.", 400);
  const { data: instructor, error: instructorError } = group.instructor_id ? await admin.from("xpace_instructors").select("full_name").eq("id", group.instructor_id).eq("tenant_company_id", companyId).maybeSingle() : { data: null, error: null };
  if (instructorError) throw instructorError;
  const video = (group.settings as Record<string, unknown> | null)?.leadWelcomeVideoUrl;
  return { className: group.name, modality: group.modality ?? "AULA EXPERIMENTAL", instructor: instructor?.full_name ?? "PROFESSOR", startsAt: schedule.starts_at.slice(0, 5), endsAt: schedule.ends_at.slice(0, 5), welcomeVideoUrl: typeof video === "string" && /^https?:\/\//i.test(video) ? video : "" };
}

async function addActivity(admin: ReturnType<typeof createSupabaseAdmin>, companyId: string, leadId: string, appointmentId: string | null, activityType: string, body: string, payload: Record<string, unknown> = {}) { const { error } = await admin.from("xpace_lead_activities").insert({ tenant_company_id: companyId, lead_id: leadId, appointment_id: appointmentId, activity_type: activityType, body, payload }); if (error) throw error; }
function brazilToday() { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()); }
function addDays(iso: string, days: number) { const value = new Date(`${iso}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }
function datesForWeekday(start: string, end: string, weekday: number) { const result: string[] = []; for (let value = start; value <= end; value = addDays(value, 1)) if (weekdayOf(value) === weekday) result.push(value); return result; }
function weekdayOf(iso: string) { return new Date(`${iso}T12:00:00Z`).getUTCDay(); }
function isDate(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00`)); }
function text(value: unknown) { return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : ""; }
function digits(value: unknown) { return text(value).replace(/\D/g, ""); }
function handleError(error: unknown) { if (error instanceof PublicError) return NextResponse.json({ success: false, message: error.message }, { status: error.status }); const message = (error as { message?: string })?.message ?? ""; if (message.includes("XPACE_LEAD_SLOT_UNAVAILABLE")) return NextResponse.json({ success: false, message: "ESTE HORÁRIO ACABOU DE SER PREENCHIDO. ESCOLHA OUTRO, POR FAVOR." }, { status: 409 }); if (message.includes("XPACE_TRIAL_LIMIT_REQUIRES_FEE")) return NextResponse.json({ success: false, message: "VOCÊ JÁ UTILIZOU AS DUAS AULAS EXPERIMENTAIS. A TERCEIRA AULA POSSUI TAXA E DEVE SER COMBINADA COM A EQUIPE XPACE." }, { status: 409 }); if ((error as { code?: string })?.code === "23505") return NextResponse.json({ success: false, message: "VOCÊ JÁ POSSUI ESTE AGENDAMENTO ATIVO." }, { status: 409 }); console.error("XPACE PUBLIC TRIAL BOOKING ERROR", error); return NextResponse.json({ success: false, message: "NÃO FOI POSSÍVEL CONCLUIR O AGENDAMENTO. TENTE NOVAMENTE." }, { status: 500 }); }
class PublicError extends Error { constructor(message: string, public status: number) { super(message); } }

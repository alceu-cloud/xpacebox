import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { queueTrialInstructorMessage, whatsappPhone } from "@/lib/server/xpace-automatic-messages";

export type TrialInstructorContext = { name: string; phone: string; missingReason: string };

// Professor identity comes from the appointment/schedule, not from a sent notice.
export async function trialInstructorContexts(admin: SupabaseClient, companyId: string, appointmentIds: string[]) {
  const contexts = new Map<string, TrialInstructorContext>();
  if (!appointmentIds.length) return contexts;
  const { data: appointments, error } = await admin.from("xpace_lead_appointments")
    .select("id,class_schedule_id,instructor_name_snapshot,scheduled_on,starts_at,attendance_status,confirmation_status")
    .eq("tenant_company_id", companyId).in("id", appointmentIds);
  if (error) throw error;
  const scheduleIds = [...new Set((appointments ?? []).flatMap((a) => a.class_schedule_id ? [a.class_schedule_id] : []))];
  const schedules = scheduleIds.length ? await admin.from("xpace_class_schedules").select("id,instructor_id")
    .eq("tenant_company_id", companyId).in("id", scheduleIds) : { data: [], error: null };
  if (schedules.error) throw schedules.error;
  const instructorIds = [...new Set((schedules.data ?? []).flatMap((s) => s.instructor_id ? [s.instructor_id] : []))];
  const instructors = instructorIds.length ? await admin.from("xpace_instructors").select("id,full_name,mobile,active")
    .eq("tenant_company_id", companyId).in("id", instructorIds) : { data: [], error: null };
  if (instructors.error) throw instructors.error;
  const scheduleMap = new Map((schedules.data ?? []).map((s) => [s.id, s]));
  const instructorMap = new Map((instructors.data ?? []).map((i) => [i.id, i]));
  for (const appointment of appointments ?? []) {
    const instructorId = scheduleMap.get(appointment.class_schedule_id)?.instructor_id;
    const instructor = instructorId ? instructorMap.get(instructorId) : undefined;
    const phone = instructor ? whatsappPhone(instructor.mobile ?? "") : "";
    const expired = Date.parse(`${appointment.scheduled_on}T${appointment.starts_at.slice(0, 5)}:00-03:00`) <= Date.now();
    const missingReason = appointment.attendance_status === "CANCELADO" || appointment.confirmation_status === "NAO_CONFIRMADO" ? "AULA CANCELADA OU NÃO CONFIRMADA"
      : expired ? "PRAZO DO AVISO ENCERRADO"
      : !instructor ? "VINCULE UM PROFESSOR AO HORÁRIO"
      : !instructor.active ? "PROFESSOR INATIVO"
      : !phone ? "CADASTRE O CELULAR DO PROFESSOR"
      : "AVISO NÃO PROGRAMADO";
    contexts.set(appointment.id, { name: instructor?.full_name || appointment.instructor_name_snapshot || "", phone, missingReason });
  }
  return contexts;
}

// Only absent notices are recovered. SENT/UNKNOWN/CANCELLED are never re-queued.
// Saving a teacher's phone is the explicit trigger; GET requests never send messages.
export async function queueMissingInstructorNotices(admin: SupabaseClient, companyId: string, instructorId: string) {
  const { data: instructor, error: instructorError } = await admin.from("xpace_instructors")
    .select("id,mobile,active").eq("tenant_company_id", companyId).eq("id", instructorId).maybeSingle();
  if (instructorError) throw instructorError;
  if (!instructor?.active || !whatsappPhone(instructor.mobile ?? "")) return 0;
  const { data: schedules, error: scheduleError } = await admin.from("xpace_class_schedules")
    .select("id").eq("tenant_company_id", companyId).eq("instructor_id", instructorId);
  if (scheduleError) throw scheduleError;
  if (!schedules?.length) return 0;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const { data: appointments, error: appointmentError } = await admin.from("xpace_lead_appointments")
    .select("id,lead_id,scheduled_on,starts_at,class_name_snapshot,attendance_status,confirmation_status,legacy_week_label")
    .eq("tenant_company_id", companyId).in("class_schedule_id", schedules.map((s) => s.id))
    .gte("scheduled_on", today).order("scheduled_on").limit(1000);
  if (appointmentError) throw appointmentError;
  const candidates = (appointments ?? []).filter((a) => !a.legacy_week_label && a.attendance_status === "AGENDADO" && a.confirmation_status !== "NAO_CONFIRMADO"
    && Date.parse(`${a.scheduled_on}T${a.starts_at.slice(0, 5)}:00-03:00`) > Date.now());
  if (!candidates.length) return 0;
  const [leads, existing] = await Promise.all([
    admin.from("xpace_leads").select("id,full_name,legacy_import_batch_id").eq("tenant_company_id", companyId).in("id", [...new Set(candidates.map((a) => a.lead_id))]),
    admin.from("xpace_message_outbox").select("appointment_id").eq("tenant_company_id", companyId).eq("kind", "AVISO_PROFESSOR").in("appointment_id", candidates.map((a) => a.id)),
  ]);
  if (leads.error || existing.error) throw leads.error ?? existing.error;
  const leadMap = new Map((leads.data ?? []).filter((lead) => !lead.legacy_import_batch_id).map((lead) => [lead.id, lead]));
  const alreadyQueued = new Set((existing.data ?? []).map((m) => m.appointment_id));
  let queued = 0;
  for (const appointment of candidates) {
    const lead = leadMap.get(appointment.lead_id);
    if (!lead || alreadyQueued.has(appointment.id)) continue;
    const result = await queueTrialInstructorMessage(admin, { companyId, instructorId, leadId: lead.id, appointmentId: appointment.id,
      studentName: lead.full_name, scheduledOn: appointment.scheduled_on, startsAt: appointment.starts_at.slice(0, 5), className: appointment.class_name_snapshot });
    if (result === "QUEUED") queued++;
  }
  return queued;
}

export const notificationCategories = {
  EXPERIMENTAL: { label: "Aula experimental", color: "#9b287d" },
  FINANCEIRO: { label: "Financeiro", color: "#167348" },
  CONTRATO: { label: "Contrato", color: "#a34b12" },
  EMAIL: { label: "E-mail", color: "#285db3" },
  WHATSAPP: { label: "WhatsApp", color: "#187266" },
  CRM: { label: "CRM · preenchimento", color: "#7438aa" },
} as const;
export type NotificationCategory = keyof typeof notificationCategories;
export type NoticeTarget = "CRM" | "FINANCE" | "COMMUNITY" | "MESSAGE_CONNECTOR" | "EMAIL" | "SAMPLES";
export type CompanyNotice = { id: string; category: NotificationCategory; title: string; detail: string; createdAt: string; target: NoticeTarget; leadId?: string; studentId?: string; diagnosis?: { cause: string; steps: string[]; actionLabel: string; secondaryTarget?: NoticeTarget; secondaryLabel?: string } };
export type NotificationPreferences = { categories: NotificationCategory[]; readBefore: Partial<Record<NotificationCategory, string>> };
export type NoticeFeed = { notices: CompanyNotice[]; issues: CompanyNotice[]; preferences: NotificationPreferences; unread: number; todayErrors: number };

type Lead = { legacy_import_batch_id?: string | null; legacy_row_number?: number | null; pipeline_stage: string; mobile?: string | null; source_id?: string | null; assigned_to?: string | null; win_reason_id?: string | null; converted_contract_id?: string | null };
type Appointment = { scheduled_on: string; legacy_week_label?: string | null; confirmation_status: string; attendance_status: string; enrollment_outcome: string; class_group_id?: string | null; class_schedule_id?: string | null; actual_instructor_id?: string | null; actual_instructor_name_snapshot?: string | null };
export function wonLeadMissingFields(lead: Lead, appointments: Appointment[], today: string) {
  if (lead.pipeline_stage !== "GANHO" || lead.legacy_import_batch_id || lead.legacy_row_number != null) return [];
  const missing: string[] = [];
  if (!lead.mobile?.trim()) missing.push("telefone");
  if (!lead.source_id) missing.push("origem do lead");
  if (!lead.assigned_to) missing.push("atendente responsável");
  if (!lead.win_reason_id) missing.push("motivo de ganho");
  const active = appointments.filter(a => a.attendance_status !== "CANCELADO" && !a.legacy_week_label);
  // A direct sale need not have a trial. Negative answers are valid answers.
  for (const [index, a] of active.entries()) {
    const prefix = `aula ${index + 1}`;
    if (!a.class_group_id || !a.class_schedule_id) missing.push(`${prefix}: turma/horário`);
    if (a.scheduled_on > today) continue;
    if (["PENDENTE", "NAO_INFORMADO", ""].includes(a.confirmation_status || "")) missing.push(`${prefix}: confirmação`);
    if (["AGENDADO", "NAO_INFORMADO", ""].includes(a.attendance_status || "")) missing.push(`${prefix}: presença`);
    if (["PENDENTE", "NAO_INFORMADO", ""].includes(a.enrollment_outcome || "")) missing.push(`${prefix}: resultado da matrícula`);
    if (a.attendance_status === "COMPARECEU" && !a.actual_instructor_id && !a.actual_instructor_name_snapshot) missing.push(`${prefix}: professor que ministrou`);
  }
  if (!lead.converted_contract_id && !active.some(a => a.enrollment_outcome === "MATRICULOU")) missing.push("matrícula registrada (ou vínculo com contrato)");
  return missing;
}
export function isNoticeUnread(item: CompanyNotice, preferences: NotificationPreferences) {
  return item.createdAt > (preferences.readBefore[item.category] || "");
}

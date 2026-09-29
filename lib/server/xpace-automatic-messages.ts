import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

const zoneOffset = "-03:00";
const dayMs = 24 * 60 * 60_000;

export function whatsappPhone(value: string) {
  const local = value.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  return /^\d{10,11}$/.test(local) ? `55${local}` : "";
}

export async function queueTrialInstructorMessage(admin: SupabaseClient, input: {
  companyId: string; leadId: string; appointmentId: string; instructorId: string;
  studentName: string; scheduledOn: string; startsAt: string; className: string;
}) {
  if (!input.instructorId) return "NO_INSTRUCTOR" as const;
  const [{ data: instructor, error: instructorError }, { data: connector, error: connectorError }] = await Promise.all([
    admin.from("xpace_instructors").select("id,full_name,mobile,active").eq("id", input.instructorId).eq("tenant_company_id", input.companyId).maybeSingle(),
    admin.from("xpace_message_connectors").select("id").eq("tenant_company_id", input.companyId).maybeSingle(),
  ]);
  if (instructorError || connectorError) throw instructorError ?? connectorError;
  if (!instructor?.active || !whatsappPhone(instructor.mobile ?? "")) return "NO_CONTACT" as const;
  if (!connector) return "NO_CONNECTOR" as const;
  const teacherName = personName(instructor.full_name);
  const studentName = personName(input.studentName);
  const { error } = await admin.from("xpace_message_outbox").insert({
    tenant_company_id: input.companyId, connector_id: connector.id,
    lead_id: input.leadId, appointment_id: input.appointmentId, instructor_id: instructor.id,
    appointment_scheduled_on: input.scheduledOn, appointment_starts_at: input.startsAt,
    kind: "AVISO_PROFESSOR", contact_name: instructor.full_name,
    destination_phone: whatsappPhone(instructor.mobile ?? ""),
    body: `✨ Olá, prof. *${teacherName}*!\n\nUma nova aula experimental entrou na sua agenda:\n\n👤 *Aluno(a):* ${studentName}\n💃 *Turma:* ${input.className}\n📅 *Dia:* ${dateLabel(input.scheduledOn)}\n🕒 *Horário:* ${input.startsAt}\n\nAté lá! 💜\n*Equipe XPACE*`,
    scheduled_at: new Date().toISOString(),
    expires_at: new Date(`${input.scheduledOn}T${input.startsAt}:00${zoneOffset}`).toISOString(),
  });
  if (error && error.code !== "23505") throw error;
  return "QUEUED" as const;
}

export async function queueTrialMessages(admin: SupabaseClient, input: {
  companyId: string; leadId: string; appointmentId: string; name: string; mobile: string;
  scheduledOn: string; startsAt: string; className: string; instructor: string; videoUrl: string;
}) {
  const destinationPhone = whatsappPhone(input.mobile);
  if (!destinationPhone) return;
  const { data: connector, error: connectorError } = await admin.from("xpace_message_connectors")
    .select("id").eq("tenant_company_id", input.companyId).maybeSingle();
  if (connectorError) throw connectorError;
  if (!connector) return;
  const now = Date.now();
  const classAt = Date.parse(`${input.scheduledOn}T${input.startsAt}:00${zoneOffset}`);
  const eveAt = Date.parse(`${input.scheduledOn}T18:30:00${zoneOffset}`) - dayMs;
  const dayAt = classAt - 3 * 60 * 60_000;
  const firstName = personName(input.name).split(/\s+/)[0] || "pessoal";
  const instructor = personName(input.instructor);
  const common = {
    tenant_company_id: input.companyId, connector_id: connector.id, lead_id: input.leadId,
    appointment_id: input.appointmentId, appointment_scheduled_on: input.scheduledOn,
    appointment_starts_at: input.startsAt, contact_name: input.name,
    destination_phone: destinationPhone,
  };
  const rows = [
    ...(input.videoUrl ? [{ ...common, kind: "VIDEO_BOAS_VINDAS", scheduled_at: new Date(now).toISOString(), expires_at: new Date(classAt).toISOString(), body: `💜 Oi, *${firstName}*! Sua aula experimental na *XPACE* foi agendada!\n\n💃 *Aula:* ${input.className}\n📅 *Dia:* ${dateLabel(input.scheduledOn)}\n🕒 *Horário:* ${input.startsAt}\n👩‍🏫 *Professor(a):* ${instructor}\n\n🎬 Preparamos um vídeo de boas-vindas para você. Assista antes da aula para já entrar no clima! ✨` }] : []),
    ...(eveAt > now ? [{ ...common, kind: "LEMBRETE_VESPERA", scheduled_at: new Date(eveAt).toISOString(), expires_at: new Date(dayAt > eveAt ? dayAt : classAt).toISOString(), body: `💜 Oi, *${firstName}*! Passando para lembrar: sua aula experimental de *${input.className}* na XPACE é *amanhã*, ${dateLabel(input.scheduledOn)}, às *${input.startsAt}*.\n\nEstamos te esperando! ✨` }] : []),
    ...(dayAt > now ? [{ ...common, kind: "CONFIRMACAO_DIA", scheduled_at: new Date(dayAt).toISOString(), expires_at: new Date(classAt).toISOString(), body: `💜 Oi, *${firstName}*! Sua aula experimental na XPACE é *hoje às ${input.startsAt}*.\n\nVocê vem? Responda *SIM* ou *NÃO* por aqui para nossa equipe acompanhar. 💃` }] : []),
  ];
  if (!rows.length) return;
  const { error } = await admin.from("xpace_message_outbox").insert(rows);
  if (error && error.code !== "23505") throw error;
}

export async function queuePixMessage(admin: SupabaseClient, input: {
  companyId: string; chargeId: string; studentId: string; name: string; mobile: string;
  amountCents: number; dueOn: string; invoiceUrl: string; pixCopyPaste: string; firstPayment: boolean;
}) {
  const destinationPhone = whatsappPhone(input.mobile);
  if (!destinationPhone || !input.invoiceUrl.startsWith("https://")) return;
  const { data: connector, error: connectorError } = await admin.from("xpace_message_connectors")
    .select("id").eq("tenant_company_id", input.companyId).maybeSingle();
  if (connectorError) throw connectorError;
  if (!connector) return;
  const now = Date.now();
  const dueAt = Date.parse(`${input.dueOn}T09:00:00${zoneOffset}`);
  const scheduledAt = input.firstPayment ? now : Math.max(now, dueAt);
  const firstName = input.name.trim().split(/\s+/)[0] || "pessoal";
  const amount = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(input.amountCents / 100);
  const pixCode = input.pixCopyPaste.trim();
  const copyPaste = pixCode && pixCode.length <= 900 ? `\nCódigo Pix copia e cola:\n${pixCode}` : "";
  const body = `Oi, ${firstName}! ${input.firstPayment ? "Seu primeiro pagamento" : "Sua mensalidade"} XPACE de ${amount} vence em ${dateLabel(input.dueOn)}. Abra o link seguro do Asaas para ver o QR Code: ${input.invoiceUrl}${copyPaste}\nSe já pagou, desconsidere esta mensagem.`;
  const { error } = await admin.from("xpace_message_outbox").insert({
    tenant_company_id: input.companyId, connector_id: connector.id, student_id: input.studentId,
    charge_id: input.chargeId, kind: "COBRANCA_PIX_AUTOMATICA", contact_name: input.name,
    destination_phone: destinationPhone, body, scheduled_at: new Date(scheduledAt).toISOString(),
    expires_at: new Date(Date.parse(`${input.dueOn}T23:59:59${zoneOffset}`)).toISOString(),
  });
  if (error && error.code !== "23505") throw error;
}

export async function queueTrialSatisfactionMessage(admin: SupabaseClient, input: {
  companyId: string; leadId: string; appointmentId: string; name: string; mobile: string;
  scheduledOn: string; startsAt: string; endsAt: string | null; className: string;
}) {
  const destinationPhone = whatsappPhone(input.mobile);
  if (!destinationPhone) return false;
  const { data: connector, error: connectorError } = await admin.from("xpace_message_connectors")
    .select("id").eq("tenant_company_id", input.companyId).maybeSingle();
  if (connectorError) throw connectorError;
  if (!connector) return false;
  const firstName = personName(input.name).split(/\s+/)[0] || "pessoal";
  const endTime = input.endsAt?.slice(0, 5) || input.startsAt;
  const classEnd = Date.parse(`${input.scheduledOn}T${endTime}:00${zoneOffset}`);
  const scheduledAt = Math.max(Date.now(), Number.isFinite(classEnd) ? classEnd : Date.now());
  const body = `💜 Oi, *${firstName}*! Foi muito bom ter você na aula de *${input.className}* da XPACE! 💃\n\nQueremos ouvir você: de *0 a 10*, que nota daria para sua experiência?\n\nSe quiser, conte também o que mais gostou ou o que podemos melhorar. É só responder por aqui — sua opinião ajuda a escola a ficar cada vez melhor. ✨`;
  const { error } = await admin.from("xpace_message_outbox").insert({
    tenant_company_id: input.companyId, connector_id: connector.id, lead_id: input.leadId,
    appointment_id: input.appointmentId, appointment_scheduled_on: input.scheduledOn,
    appointment_starts_at: input.startsAt, kind: "PESQUISA_SATISFACAO", contact_name: input.name,
    destination_phone: destinationPhone, body, scheduled_at: new Date(scheduledAt).toISOString(),
    expires_at: new Date(scheduledAt + 48 * 60 * 60_000).toISOString(),
  });
  if (error && error.code !== "23505") throw error;
  return true;
}

export async function queueSatisfactionAfterAttendance(admin: SupabaseClient, companyId: string, appointmentId: string) {
  const { data: appointment, error: appointmentError } = await admin.from("xpace_lead_appointments")
    .select("id,lead_id,scheduled_on,starts_at,ends_at,class_name_snapshot,attendance_status,survey_status,survey_opt_in,whatsapp_opt_in")
    .eq("id", appointmentId).eq("tenant_company_id", companyId).maybeSingle();
  if (appointmentError) throw appointmentError;
  if (!appointment || appointment.attendance_status !== "COMPARECEU" || appointment.survey_status === "ENVIADA") return false;
  const markNotSent = async () => {
    const { error } = await admin.from("xpace_lead_appointments").update({ survey_status: "NAO_ENVIADA" })
      .eq("id", appointmentId).eq("tenant_company_id", companyId).neq("survey_status", "ENVIADA");
    if (error) throw error;
    return false;
  };
  if (!appointment.survey_opt_in) return markNotSent();
  const { data: lead, error: leadError } = await admin.from("xpace_leads")
    .select("full_name,mobile").eq("id", appointment.lead_id).eq("tenant_company_id", companyId).maybeSingle();
  if (leadError) throw leadError;
  if (!lead?.mobile || !appointment.starts_at) return markNotSent();
  const queued = await queueTrialSatisfactionMessage(admin, {
    companyId, leadId: appointment.lead_id, appointmentId: appointment.id,
    name: lead.full_name, mobile: lead.mobile, scheduledOn: appointment.scheduled_on,
    startsAt: appointment.starts_at.slice(0, 5), endsAt: appointment.ends_at,
    className: appointment.class_name_snapshot || "aula experimental",
  });
  return queued || await markNotSent();
}

function dateLabel(iso: string) { return iso.split("-").reverse().join("/"); }

function personName(value: string) {
  const particles = new Set(["de", "da", "do", "das", "dos", "e"]);
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR").split(" ").map((word, index) =>
    index > 0 && particles.has(word) ? word : word.replace(/^\p{L}/u, (letter) => letter.toLocaleUpperCase("pt-BR"))
  ).join(" ");
}

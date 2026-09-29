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
    ...(input.videoUrl ? [{ ...common, kind: "VIDEO_BOAS_VINDAS", scheduled_at: new Date(now).toISOString(), expires_at: new Date(classAt).toISOString(), body: `💜 Oi, *${firstName}*! Sua aula experimental na *XPACE* foi agendada!\n\n💃 *Aula:* ${input.className}\n📅 *Dia:* ${dateLabel(input.scheduledOn)}\n🕒 *Horário:* ${input.startsAt}\n👩‍🏫 *Professor(a):* ${instructor}\n\n🎬 *Seu vídeo de boas-vindas:* ${input.videoUrl}\nAssista antes da aula para já entrar no clima. Esperamos você! ✨` }] : []),
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

function dateLabel(iso: string) { return iso.split("-").reverse().join("/"); }

function personName(value: string) {
  const particles = new Set(["de", "da", "do", "das", "dos", "e"]);
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR").split(" ").map((word, index) =>
    index > 0 && particles.has(word) ? word : word.replace(/^\p{L}/u, (letter) => letter.toLocaleUpperCase("pt-BR"))
  ).join(" ");
}

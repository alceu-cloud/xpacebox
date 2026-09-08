import { createSupabaseAdmin } from "@/lib/server/supabase-admin";
import { decryptIntegrationCredential, encryptIntegrationCredential } from "@/lib/server/telephony-credentials";

type AgendaTask = {
  clientName: string;
  scheduledAt: string;
  actionType: string;
};

type RecipientAgenda = {
  companyId: string;
  companyName: string;
  companySlug: string;
  profileId: string;
  recipientName: string;
  recipientEmail: string;
  overdue: AgendaTask[];
  today: AgendaTask[];
};

type Profile = { id: string; full_name: string | null; email: string | null; active: boolean; platform_role: string | null };
type Company = { id: string; name: string; slug: string };
type EmailConnection = {
  id: string;
  tenant_company_id: string;
  enabled: boolean;
  sender_email: string | null;
  reply_to_email: string | null;
  api_key_ciphertext: string | null;
  api_key_iv: string | null;
  api_key_auth_tag: string | null;
};

const timeZone = "America/Sao_Paulo";

export function emailIntegrationStatus(connection: EmailConnection) {
  const sender = connection.sender_email?.trim() || "";
  return {
    configured: Boolean(connection.enabled && connection.api_key_ciphertext && connection.api_key_iv && connection.api_key_auth_tag && sender),
    sender,
    replyTo: connection.reply_to_email?.trim() || "",
    enabled: connection.enabled,
    scheduleLabel: "DIAS UTEIS, 07:30 (HORARIO DE BRASILIA)",
  };
}

export async function getCompanyEmailIntegration(companyId: string) {
  const admin = createSupabaseAdmin();
  const connection = await emailConnectionForCompany(admin, companyId);
  return emailIntegrationStatus(connection);
}

export async function saveCompanyEmailIntegration(input: { companyId: string; apiKey?: string; sender: string; replyTo: string; enabled: boolean }) {
  const sender = input.sender.trim();
  const replyTo = input.replyTo.trim();
  if (!isEmailSender(sender)) throw new Error("INFORME UM REMETENTE VALIDO, EX: XPACEBOX <NOTIFICACOES@XPACEBOX.COM.BR>.");
  if (replyTo && !isEmailSender(replyTo)) throw new Error("INFORME UM E-MAIL DE RESPOSTA VALIDO.");
  const admin = createSupabaseAdmin();
  const connection = await emailConnectionForCompany(admin, input.companyId);
  const update: Record<string, unknown> = { sender_email: sender, reply_to_email: replyTo || null, enabled: input.enabled, updated_at: new Date().toISOString() };
  if (input.apiKey?.trim()) {
    const credential = encryptIntegrationCredential(input.apiKey.trim());
    Object.assign(update, { api_key_ciphertext: credential.ciphertext, api_key_iv: credential.iv, api_key_auth_tag: credential.authTag });
  }
  const { data, error } = await admin.from("email_integration_connections").update(update).eq("id", connection.id).select("*").single();
  if (error) throw error;
  return emailIntegrationStatus(data as EmailConnection);
}

export async function listCompanyEmailRecipients(companyId: string, currentProfileId: string) {
  const admin = createSupabaseAdmin();
  const [membersResult, profilesResult] = await Promise.all([
    admin.from("company_members").select("profile_id").eq("company_id", companyId).eq("active", true),
    admin.from("profiles").select("id,full_name,email,active,platform_role").eq("active", true),
  ]);
  if (membersResult.error) throw membersResult.error;
  if (profilesResult.error) throw profilesResult.error;

  const memberIds = new Set([currentProfileId, ...(membersResult.data ?? []).map((item) => item.profile_id)]);
  return (profilesResult.data ?? [])
    .filter((profile) => memberIds.has(profile.id) && profile.email)
    .map((profile) => ({
      id: profile.id,
      name: profile.full_name || profile.email || "USUARIO",
      email: profile.email || "",
    }))
    .sort((first, second) => first.name.localeCompare(second.name, "pt-BR"));
}

export async function sendCompanyAgendaTest(input: { companyId: string; companyName: string; companySlug: string; profileId: string }) {
  const agendas = await collectRecipientAgendas({ companyIds: new Set([input.companyId]), profileIds: new Set([input.profileId]) });
  const agenda = agendas.find((item) => item.companyId === input.companyId && item.profileId === input.profileId);
  if (!agenda) throw new Error("O USUARIO NAO POSSUI E-MAIL ATIVO PARA RECEBER O TESTE.");
  const connection = await emailConnectionForCompany(createSupabaseAdmin(), input.companyId);
  await sendAgendaEmail(agenda, connection, true);
  return { recipientEmail: agenda.recipientEmail, overdueCount: agenda.overdue.length, todayCount: agenda.today.length };
}

export async function sendScheduledAgendaEmails() {
  const agendas = await collectRecipientAgendas();
  const scheduledFor = saoPauloDay(new Date());
  const results = { sent: 0, skipped: 0, failed: 0, recipients: agendas.length };
  const admin = createSupabaseAdmin();
  const connections = new Map<string, EmailConnection>();

  for (const agenda of agendas) {
    let connection = connections.get(agenda.companyId);
    if (!connection) {
      connection = await emailConnectionForCompany(admin, agenda.companyId);
      connections.set(agenda.companyId, connection);
    }
    if (!emailIntegrationStatus(connection).configured) {
      results.skipped += 1;
      continue;
    }
    const { data: delivery, error: insertError } = await admin
      .from("daily_agenda_email_deliveries")
      .upsert({
        tenant_company_id: agenda.companyId,
        recipient_profile_id: agenda.profileId,
        scheduled_for: scheduledFor,
        recipient_email: agenda.recipientEmail,
        overdue_count: agenda.overdue.length,
        today_count: agenda.today.length,
        status: "PENDING",
        updated_at: new Date().toISOString(),
      }, { onConflict: "tenant_company_id,recipient_profile_id,scheduled_for", ignoreDuplicates: true })
      .select("id")
      .maybeSingle();
    if (insertError) throw insertError;
    if (!delivery) {
      results.skipped += 1;
      continue;
    }

    try {
      const providerMessageId = await sendAgendaEmail(agenda, connection, false);
      const { error } = await admin
        .from("daily_agenda_email_deliveries")
        .update({ status: "SENT", provider_message_id: providerMessageId, sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", delivery.id);
      if (error) throw error;
      results.sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "ERRO DESCONHECIDO NO ENVIO.";
      await admin
        .from("daily_agenda_email_deliveries")
        .update({ status: "FAILED", error_message: message.slice(0, 1000), updated_at: new Date().toISOString() })
        .eq("id", delivery.id);
      console.error("DAILY AGENDA EMAIL ERROR", { companyId: agenda.companyId, profileId: agenda.profileId, error });
      results.failed += 1;
    }
  }

  return results;
}

async function emailConnectionForCompany(admin: ReturnType<typeof createSupabaseAdmin>, companyId: string) {
  const { data: existing, error } = await admin
    .from("email_integration_connections")
    .select("*")
    .eq("tenant_company_id", companyId)
    .maybeSingle();
  if (error) throw error;
  if (existing) return existing as EmailConnection;
  const { data, error: insertError } = await admin
    .from("email_integration_connections")
    .insert({ tenant_company_id: companyId })
    .select("*")
    .single();
  if (insertError) throw insertError;
  return data as EmailConnection;
}

async function collectRecipientAgendas(filters?: { companyIds?: Set<string>; profileIds?: Set<string> }) {
  const admin = createSupabaseAdmin();
  const { data: companies, error: companiesError } = await admin
    .from("companies")
    .select("id,name,slug")
    .eq("active", true)
    .order("name");
  if (companiesError) throw companiesError;

  const selectedCompanies = (companies ?? []).filter((company) => !filters?.companyIds || filters.companyIds.has(company.id)) as Company[];
  if (!selectedCompanies.length) return [] as RecipientAgenda[];

  const [profilesResult, membershipsResult] = await Promise.all([
    admin.from("profiles").select("id,full_name,email,active,platform_role").eq("active", true),
    admin.from("company_members").select("company_id,profile_id").eq("active", true),
  ]);
  if (profilesResult.error) throw profilesResult.error;
  if (membershipsResult.error) throw membershipsResult.error;

  const profiles = new Map((profilesResult.data ?? []).map((profile) => [profile.id, profile as Profile]));
  const memberIdsByCompany = new Map<string, Set<string>>();
  for (const member of membershipsResult.data ?? []) {
    const ids = memberIdsByCompany.get(member.company_id) ?? new Set<string>();
    ids.add(member.profile_id);
    memberIdsByCompany.set(member.company_id, ids);
  }

  const range = saoPauloRange();
  const recipients = new Map<string, RecipientAgenda>();
  for (const company of selectedCompanies) {
    const [agendaResult, clientsResult] = await Promise.all([
      admin.from("crm_customer_profiles")
        .select("client_id,owner_profile_id,next_contact_at")
        .eq("tenant_company_id", company.id)
        .not("next_contact_at", "is", null)
        .lt("next_contact_at", range.end.toISOString()),
      admin.from("clients")
        .select("id,legal_name,trade_name,representative_profile_id")
        .eq("tenant_company_id", company.id)
        .eq("active", true),
    ]);
    if (agendaResult.error) throw agendaResult.error;
    if (clientsResult.error) throw clientsResult.error;

    const clientsById = new Map((clientsResult.data ?? []).map((client) => [client.id, client]));
    const companyMemberIds = memberIdsByCompany.get(company.id) ?? new Set<string>();
    for (const profile of profiles.values()) {
      const canReceiveCompanyAgenda = companyMemberIds.has(profile.id) || profile.platform_role === "platform_owner";
      if (!canReceiveCompanyAgenda || !profile.email || (filters?.profileIds && !filters.profileIds.has(profile.id))) continue;
      recipients.set(`${company.id}:${profile.id}`, {
        companyId: company.id,
        companyName: company.name,
        companySlug: company.slug,
        profileId: profile.id,
        recipientName: profile.full_name || profile.email,
        recipientEmail: profile.email,
        overdue: [],
        today: [],
      });
    }
    for (const scheduled of agendaResult.data ?? []) {
      const when = new Date(scheduled.next_contact_at || "");
      if (Number.isNaN(when.getTime()) || when >= range.end) continue;
      const client = clientsById.get(scheduled.client_id);
      if (!client) continue;
      const profileId = scheduled.owner_profile_id || client.representative_profile_id || "";
      const profile = profiles.get(profileId);
      const canReceiveCompanyAgenda = companyMemberIds.has(profileId) || profile?.platform_role === "platform_owner";
      if (!profile || !profile.email || !canReceiveCompanyAgenda) continue;
      if (filters?.profileIds && !filters.profileIds.has(profileId)) continue;

      const key = `${company.id}:${profileId}`;
      const recipient: RecipientAgenda = recipients.get(key) ?? {
        companyId: company.id,
        companyName: company.name,
        companySlug: company.slug,
        profileId,
        recipientName: profile.full_name || profile.email,
        recipientEmail: profile.email,
        overdue: [],
        today: [],
      };
      const task = {
        clientName: client.trade_name || client.legal_name || "CLIENTE SEM NOME",
        scheduledAt: scheduled.next_contact_at || "",
        actionType: "ACOMPANHAR",
      };
      if (when < range.start) recipient.overdue.push(task);
      else recipient.today.push(task);
      recipients.set(key, recipient);
    }
  }

  return [...recipients.values()].map((agenda) => ({
    ...agenda,
    overdue: agenda.overdue.sort(byScheduledAt),
    today: agenda.today.sort(byScheduledAt),
  }));
}

async function sendAgendaEmail(agenda: RecipientAgenda, connection: EmailConnection, test: boolean) {
  const integration = emailIntegrationStatus(connection);
  if (!integration.configured) throw new Error("CONFIGURE A CHAVE E O REMETENTE DO RESEND EM INTEGRACOES.");
  const apiKey = decryptIntegrationCredential({
    ciphertext: connection.api_key_ciphertext || "",
    iv: connection.api_key_iv || "",
    authTag: connection.api_key_auth_tag || "",
  });
  const subjectPrefix = test ? "TESTE - " : "";
  const date = formatDate(saoPauloDay(new Date()));
  const subject = `${subjectPrefix}AGENDA COMERCIAL ${date} - ${agenda.companyName}`;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://xpacebox.com.br";
  const html = renderHtml({ ...agenda, appUrl, date, test });
  const text = renderText({ ...agenda, appUrl, date, test });
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: integration.sender, to: [agenda.recipientEmail], subject, html, text, reply_to: integration.replyTo || undefined }),
  });
  const payload = await response.json().catch(() => ({})) as { id?: string; message?: string };
  if (!response.ok) throw new Error(payload.message || "O PROVEDOR DE E-MAIL RECUSOU O ENVIO.");
  return payload.id || "";
}

function renderHtml(input: RecipientAgenda & { appUrl: string; date: string; test: boolean }) {
  const section = (title: string, tasks: AgendaTask[], color: string) => `
    <section style="margin:20px 0;padding:18px;border:1px solid #e8e3eb;border-left:4px solid ${color};border-radius:8px;background:#fff">
      <h2 style="margin:0 0 12px;color:#17131d;font:700 16px Arial,sans-serif">${title} (${tasks.length})</h2>
      ${tasks.length ? `<ul style="margin:0;padding-left:18px;color:#312b3a;font:14px/1.6 Arial,sans-serif">${tasks.map((task) => `<li><strong>${escapeHtml(task.clientName)}</strong> · ${escapeHtml(task.actionType)} · ${formatDateTime(task.scheduledAt)}</li>`).join("")}</ul>` : "<p style=\"margin:0;color:#667085;font:14px Arial,sans-serif\">NENHUMA TAREFA NESTA LISTA.</p>"}
    </section>`;
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f7f6f8;color:#17131d"><main style="max-width:680px;margin:0 auto;padding:30px;background:#fff;border-radius:12px"><div style="color:#7435d9;font:700 11px Arial,sans-serif;letter-spacing:1px">XPACEBOX · ${input.test ? "ENVIO DE TESTE" : "AGENDA COMERCIAL"}</div><h1 style="margin:10px 0;color:#17131d;font:700 26px Arial,sans-serif">OLÁ, ${escapeHtml(input.recipientName)}.</h1><p style="margin:0;color:#667085;font:15px/1.6 Arial,sans-serif">RESUMO DA AGENDA DA ${escapeHtml(input.companyName)} PARA ${input.date}.</p>${section("TAREFAS ATRASADAS", input.overdue, "#ef4444")}${section("TAREFAS DE HOJE", input.today, "#7435d9")}<a href="${escapeHtml(`${input.appUrl}/empresa/${input.companySlug}`)}" style="display:inline-block;margin-top:8px;padding:12px 18px;border-radius:7px;background:#7435d9;color:#fff;font:700 13px Arial,sans-serif;text-decoration:none">ABRIR CRM</a></main></body></html>`;
}

function renderText(input: RecipientAgenda & { appUrl: string; date: string; test: boolean }) {
  const list = (title: string, tasks: AgendaTask[]) => `${title} (${tasks.length})\n${tasks.length ? tasks.map((task) => `- ${task.clientName} · ${task.actionType} · ${formatDateTime(task.scheduledAt)}`).join("\n") : "- NENHUMA TAREFA NESTA LISTA."}`;
  return `XPACEBOX${input.test ? " - ENVIO DE TESTE" : ""}\n\nOLÁ, ${input.recipientName}.\nRESUMO DA AGENDA DA ${input.companyName} PARA ${input.date}.\n\n${list("TAREFAS ATRASADAS", input.overdue)}\n\n${list("TAREFAS DE HOJE", input.today)}\n\nABRIR CRM: ${input.appUrl}/empresa/${input.companySlug}`;
}

function saoPauloRange() {
  const day = saoPauloDay(new Date());
  const start = new Date(`${day}T00:00:00-03:00`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

function saoPauloDay(now: Date) {
  const values = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now).map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] || character);
}

function isEmailSender(value: string) {
  const email = value.match(/<([^>]+)>/)?.[1] || value;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function byScheduledAt(first: AgendaTask, second: AgendaTask) {
  return first.scheduledAt.localeCompare(second.scheduledAt);
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { emailFailureDiagnosis } from "@/lib/email-diagnostics";
import { notificationCategories, wonLeadMissingFields, isNoticeUnread, type CompanyNotice, type NotificationPreferences, type NoticeFeed, type NotificationCategory } from "@/lib/notifications";

type Row = Record<string, any>;
// Exhaust pages rather than silently omitting records after Supabase's row cap.
async function rows(query: any): Promise<Row[]> {
  const result: Row[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await query.range(offset, offset + 999);
    if (error) throw error;
    result.push(...(data || []));
    if (!data || data.length < 1000) return result;
  }
}
export async function notificationPreferences(admin: SupabaseClient, companyId: string, profileId: string): Promise<NotificationPreferences> {
  const { data, error } = await admin.from("company_notification_preferences").select("categories,read_before").eq("tenant_company_id", companyId).eq("profile_id", profileId).maybeSingle();
  if (error) throw error;
  return { categories: data?.categories ?? Object.keys(notificationCategories), readBefore: data?.read_before ?? {} };
}
export async function companyNoticeFeed(admin: SupabaseClient, companyId: string, slug: string, profileId: string, manager: boolean): Promise<NoticeFeed> {
  const preferences = await notificationPreferences(admin, companyId, profileId);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const since = new Date(Date.now() - 90 * 86400000).toISOString();
  const notices: CompanyNotice[] = [], issues: CompanyNotice[] = [];
  const add = (list: CompanyNotice[], item: CompanyNotice) => { if (preferences.categories.includes(item.category)) list.push({ ...item, createdAt: new Date(item.createdAt).toISOString() }); };
  // Managers see company-wide failures. Common users see their own agenda
  // failures and operational CRM data, never company finance credentials/errors.
  let agendasQuery = admin.from("daily_agenda_email_deliveries").select("id,recipient_profile_id,scheduled_for,status,created_at,updated_at,error_message,today_count,overdue_count,recipient:profiles!recipient_profile_id(full_name)").eq("tenant_company_id", companyId).order("scheduled_for", { ascending: false }).order("id");
  if (!manager) agendasQuery = agendasQuery.eq("recipient_profile_id", profileId);
  const [agendaRows, automationRows] = await Promise.all([
    rows(agendasQuery),
    manager ? rows(admin.from("company_automation_issues").select("id,category,summary,last_failed_at,automation,scope_key").eq("tenant_company_id", companyId).is("resolved_at", null).order("id")) : Promise.resolve([]),
  ]);
  const agendaSeen = new Set<string>();
  for (const row of agendaRows) {
    if (agendaSeen.has(row.recipient_profile_id)) continue;
    agendaSeen.add(row.recipient_profile_id);
    if (row.status === "FAILED" || (row.status === "PENDING" && Date.parse(row.created_at) < Date.now() - 30 * 60000)) add(issues, { id: `agenda:${row.id}`, category: "EMAIL", title: "Resumo diário do CRM não enviado", detail: `${row.recipient?.full_name || "Consultor"} · ${dateLabel(row.scheduled_for)}. E-mail com ${row.today_count ?? 0} ações do dia e ${row.overdue_count ?? 0} atrasadas. Suas tarefas continuam no CRM.`, createdAt: row.updated_at, target: "EMAIL", diagnosis: { ...emailFailureDiagnosis(row.error_message, row.status === "PENDING"), steps: [...emailFailureDiagnosis(row.error_message, row.status === "PENDING").steps, "O resumo automático roda em dias úteis a partir das 7h30, horário de Brasília. Um próximo resumo enviado com sucesso retira esta pendência, sem apagar o histórico."], secondaryTarget: "CRM", secondaryLabel: "Ver agenda do CRM" } });
  }
  const inactiveAutomations = new Set<string>();
  if (slug === "dawos") {
    const [deliveries, samples, activeAttempts] = await Promise.all([
      manager ? rows(admin.from("sample_overdue_email_deliveries").select("id,sample_id,control_stage,scheduled_for,status,created_at,updated_at,error_message").eq("tenant_company_id", companyId).order("scheduled_for", { ascending: false }).order("id")) : Promise.resolve([]),
      rows(admin.from("client_samples").select("id,sample_number,responsible_profile_id,status,closed_at,client:clients(tenant_company_id,trade_name,legal_name)").eq("tenant_company_id", companyId).order("id")),
      manager ? rows(admin.from("sample_overdue_email_attempts").select("delivery_id").eq("tenant_company_id", companyId).in("status", ["PROCESSING", "UNKNOWN"]).order("delivery_id")) : Promise.resolve([]),
    ]);
    const sampleById = new Map(samples.map(s => [s.id, s]));
    const lockedDeliveries = new Set(activeAttempts.map(a => a.delivery_id));
    for (const row of automationRows) if (row.automation === "sample-request-email") {
      const sample = sampleById.get(row.scope_key);
      if (!sample || sample.closed_at || !["REQUESTED", "IN_PRODUCTION"].includes(sample.status)) inactiveAutomations.add(row.id);
    }
    const seen = new Set<string>();
    for (const row of deliveries) {
      const key = `${row.sample_id}:${row.control_stage}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const sample = sampleById.get(row.sample_id);
      const stage = sample?.status === "READY" ? "ENTREGA" : sample?.status === "SENT" ? "APROVACAO" : "PRODUCAO";
      if (!sample || sample.closed_at || ["APPROVED", "REJECTED", "CANCELLED"].includes(sample.status) || row.control_stage !== stage) continue;
      if (row.status === "FAILED" || (row.status === "PENDING" && (lockedDeliveries.has(row.id) || Date.parse(row.created_at) < Date.now() - 30 * 60000))) {
        const client = sample.client?.tenant_company_id === companyId ? sample.client.trade_name || sample.client.legal_name : "";
        const stageLabel = { PRODUCAO: "produção", ENTREGA: "entrega", APROVACAO: "aprovação" }[row.control_stage as "PRODUCAO" | "ENTREGA" | "APROVACAO"];
        add(issues, { id: `sample-email:${row.id}`, category: "EMAIL", title: `E-mail da amostra AM-${String(sample.sample_number).padStart(6, "0")} não enviado`, detail: `${client ? `${client} · ` : ""}Aviso de atraso na ${stageLabel} em ${dateLabel(row.scheduled_for)}. A amostra continua cadastrada; o problema foi no e-mail de cobrança.`, createdAt: row.updated_at, target: "EMAIL", canRetrySampleEmail: row.status === "FAILED" && !lockedDeliveries.has(row.id), diagnosis: { ...emailFailureDiagnosis(row.error_message, row.status === "PENDING"), steps: [...emailFailureDiagnosis(row.error_message, row.status === "PENDING").steps, lockedDeliveries.has(row.id) ? "Há uma tentativa em andamento ou sem confirmação. Confira o ID/status no Resend com o suporte antes de qualquer novo envio." : "Use Tentar novamente nesta pendência para reenviar apenas este aviso. A pendência só some quando o provedor aceitar e o sucesso for salvo."], secondaryTarget: "SAMPLES", secondaryLabel: "Ver controle de amostras" } });
      }
    }
  }
  if (slug === "xpace") {
    const [leads, appointments] = await Promise.all([
      rows(admin.from("xpace_leads").select("id,lead_number,full_name,mobile,pipeline_stage,source_id,assigned_to,win_reason_id,converted_contract_id,legacy_import_batch_id,legacy_row_number,won_at,updated_at").eq("tenant_company_id", companyId).order("id")),
      rows(admin.from("xpace_lead_appointments").select("id,lead_id,scheduled_on,created_at,legacy_week_label,confirmation_status,attendance_status,enrollment_outcome,class_group_id,class_schedule_id,actual_instructor_id,actual_instructor_name_snapshot").eq("tenant_company_id", companyId).order("id")),
    ]);
    const leadById = new Map(leads.map(l => [l.id, l]));
    const byLead = new Map<string, Row[]>();
    for (const a of appointments) { const list = byLead.get(a.lead_id) || []; list.push(a); byLead.set(a.lead_id, list); }
    for (const a of appointments) if (!a.legacy_week_label && a.attendance_status !== "CANCELADO" && a.created_at >= since) add(notices, { id: `trial:${a.id}`, category: "EXPERIMENTAL", title: leadById.get(a.lead_id)?.full_name || "Lead", detail: `Aula experimental · ${dateLabel(a.scheduled_on)}`, createdAt: a.created_at, target: "CRM", leadId: a.lead_id });
    for (const lead of leads) {
      const missing = wonLeadMissingFields(lead as any, (byLead.get(lead.id) || []) as any, today);
      if (missing.length) add(issues, { id: `won-lead:${lead.id}`, category: "CRM", title: `${lead.full_name} · ganho com dados pendentes`, detail: `Preencher: ${missing.join("; ")}.`, createdAt: lead.updated_at, target: "CRM", leadId: lead.id });
    }
    if (manager) {
      const [charges, sales, messages, connectors, cancellations] = await Promise.all([
        rows(admin.from("xpace_contract_charges").select("id,student_id,status,paid_at,paid_amount_cents,provider_error,updated_at").eq("tenant_company_id", companyId).or(`paid_at.gte.${since},provider_error.not.is.null`).order("id")),
        rows(admin.from("xpace_contract_sales").select("id,sale_number,student_id,status,signature_status,signature_error,signed_at,updated_at").eq("tenant_company_id", companyId).or(`signed_at.gte.${since},signature_error.not.is.null,signature_status.in.(ENVIADA,PENDENTE)`).order("id")),
        rows(admin.from("xpace_message_outbox").select("id,kind,contact_name,status,updated_at").eq("tenant_company_id", companyId).in("status", ["FAILED", "UNKNOWN"]).order("id")),
        rows(admin.from("xpace_message_connectors").select("id,status,last_seen_at,updated_at,disconnect_requested").eq("tenant_company_id", companyId).order("id")),
        rows(admin.from("xpace_payment_cancellations").select("charge_id,status,last_error,requested_at").eq("tenant_company_id", companyId).not("last_error", "is", null).order("charge_id")),
      ]);
      const salesById = new Map(sales.map(s => [s.id, s]));
      for (const row of automationRows) if (row.automation === "signature-reminder") {
        const sale = salesById.get(row.scope_key.split(":")[0]);
        if (!sale || sale.status === "CANCELADA" || sale.signature_status !== "ENVIADA") inactiveAutomations.add(row.id);
      }
      for (const row of charges) {
        if (row.paid_at && row.status !== "CANCELADA") add(notices, { id: `paid:${row.id}`, category: "FINANCEIRO", title: "Pagamento recebido", detail: `${Number(row.paid_amount_cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} · confira em Financeiro.`, createdAt: row.paid_at, target: "FINANCE", studentId: row.student_id });
        if (row.provider_error && !["PAGA", "CANCELADA"].includes(row.status)) add(issues, { id: `charge:${row.id}`, category: "FINANCEIRO", title: "Cobrança com falha de emissão", detail: "Confira a cobrança e a conta XPay antes de tentar novamente.", createdAt: row.updated_at, target: "FINANCE", studentId: row.student_id });
      }
      for (const row of sales) {
        if (row.signed_at && row.status !== "CANCELADA") add(notices, { id: `signed:${row.id}`, category: "CONTRATO", title: `Contrato da venda ${row.sale_number} assinado`, detail: "Assinatura registrada. Confira o contrato no cadastro do cliente.", createdAt: row.signed_at, target: "COMMUNITY", studentId: row.student_id });
        if (row.signature_error && row.status !== "CANCELADA" && ["ERRO", "RECUSADA"].includes(row.signature_status)) add(issues, { id: `signature:${row.id}`, category: "CONTRATO", title: `Assinatura pendente de ação · venda ${row.sale_number}`, detail: row.signature_status === "RECUSADA" ? "Assinatura recusada pelo cliente. Confira o contrato." : "Falha no envio para assinatura. Confira o contrato e a integração.", createdAt: row.updated_at, target: "COMMUNITY", studentId: row.student_id });
      }
      for (const row of messages) add(issues, { id: `message:${row.id}`, category: "WHATSAPP", title: `${row.contact_name} · envio sem confirmação`, detail: `${row.kind} · confira a conversa antes de reenviar para não duplicar.`, createdAt: row.updated_at, target: "MESSAGE_CONNECTOR" });
      for (const row of connectors) if (!row.disconnect_requested && (row.status !== "CONNECTED" || !row.last_seen_at || Date.parse(row.last_seen_at) < Date.now() - 120000)) add(issues, { id: `connector:${row.id}`, category: "WHATSAPP", title: "Conector WhatsApp offline", detail: "Confira o computador da escola e a conexão na Loja.", createdAt: row.last_seen_at || row.updated_at, target: "MESSAGE_CONNECTOR" });
      for (const row of cancellations) if (!["COMPLETED", "CANCELLED", "DONE"].includes(row.status)) add(issues, { id: `cancellation:${row.charge_id}`, category: "FINANCEIRO", title: "Cancelamento de cobrança precisa de conferência", detail: "Não considere cancelado no Asaas até a confirmação do provedor.", createdAt: row.requested_at, target: "FINANCE" });
    }
  }
  for (const row of automationRows) if (!inactiveAutomations.has(row.id)) add(issues, { id: `automation:${row.id}`, category: row.category, title: row.summary, detail: "A automação ainda precisa de conferência. Some após uma execução bem-sucedida ou a conclusão da etapa.", createdAt: row.last_failed_at, target: row.automation === "sample-request-email" ? "SAMPLES" : row.category === "EMAIL" ? "EMAIL" : row.category === "CONTRATO" ? "COMMUNITY" : "FINANCE" });
  notices.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
  issues.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
  return { notices, issues, preferences, unread: notices.filter(n => isNoticeUnread(n, preferences)).length, todayErrors: issues.filter(n => n.category !== "CRM" && new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(n.createdAt)) === today).length };
}
function dateLabel(day: string) { return day.slice(0, 10).split("-").reverse().join("/"); }

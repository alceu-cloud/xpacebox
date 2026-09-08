"use client";

import { useEffect, useState } from "react";

import { ui } from "@/lib/ui/styles";
import { supabase } from "@/lib/supabase";

type Recipient = { id: string; name: string; email: string };
type Integration = { configured: boolean; sender: string; replyTo: string; enabled: boolean; scheduleLabel: string };
type Payload = { success: boolean; message?: string; integration: Integration; recipients: Recipient[] };

export default function EmailAgendaIntegrationPanel({ companySlug }: { companySlug?: string }) {
  const [integration, setIntegration] = useState<Integration | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sendingTo, setSendingTo] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [sender, setSender] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  async function request(path: string, init?: RequestInit) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("SESSAO NAO ENCONTRADA.");
    const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init?.headers } });
    const payload = await response.json();
    if (!response.ok || !payload.success) throw new Error(payload.message || "NAO FOI POSSIVEL CONCLUIR A OPERACAO.");
    return payload;
  }

  async function load() {
    if (!companySlug) return;
    setLoading(true);
    try {
      const payload = await request(`/api/integracoes/email?slug=${encodeURIComponent(companySlug)}`) as Payload;
      setIntegration(payload.integration);
      setRecipients(payload.recipients);
      setSender(payload.integration.sender || "");
      setReplyTo(payload.integration.replyTo || "");
      setEnabled(payload.integration.enabled);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "NAO FOI POSSIVEL CARREGAR A INTEGRACAO DE E-MAIL.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [companySlug]);

  async function sendTest(profileId: string) {
    if (!companySlug) return;
    setSendingTo(profileId);
    setMessage("");
    try {
      const payload = await request("/api/integracoes/email", { method: "POST", body: JSON.stringify({ slug: companySlug, profileId }) });
      setMessage(`TESTE ENVIADO PARA ${payload.result.recipientEmail}. ATRASADAS: ${payload.result.overdueCount}. HOJE: ${payload.result.todayCount}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "NAO FOI POSSIVEL ENVIAR O TESTE.");
    } finally {
      setSendingTo("");
    }
  }

  async function save() {
    if (!companySlug) return;
    setSaving(true);
    setMessage("");
    try {
      const payload = await request("/api/integracoes/email", { method: "PATCH", body: JSON.stringify({ slug: companySlug, apiKey: apiKey || undefined, sender, replyTo, enabled }) });
      setIntegration(payload.integration);
      setApiKey("");
      setMessage("CONFIGURACAO DE E-MAIL SALVA. USE ENVIAR TESTE PARA VALIDAR O DISPARO.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "NAO FOI POSSIVEL SALVAR A INTEGRACAO.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div style={emptyStyle}>CARREGANDO INTEGRACAO DE E-MAIL...</div>;
  if (!integration) return <div style={errorStyle}>{message || "INTEGRACAO DE E-MAIL INDISPONIVEL."}</div>;

  return <section style={panelStyle}>
    <div style={headerStyle}>
      <div><span style={eyebrowStyle}>NOTIFICACOES COMERCIAIS</span><h3 style={titleStyle}>E-MAIL DA AGENDA</h3><p style={descriptionStyle}>ENVIA PARA CADA REPRESENTANTE AS TAREFAS ATRASADAS E AS TAREFAS DO DIA.</p></div>
      <span style={{ ...statusStyle, ...(integration.configured ? configuredStatusStyle : {}) }}>{integration.configured ? "E-MAIL CONFIGURADO" : "CONFIGURACAO PENDENTE"}</span>
    </div>

    {message ? <div style={message.startsWith("TESTE ENVIADO") || message.startsWith("CONFIGURACAO") ? messageStyle : errorStyle}>{message}</div> : null}

    <section style={configurationStyle}>
      <label style={labelStyle}>REMETENTE<input value={sender} onChange={(event) => setSender(event.target.value)} placeholder="XPACEBOX <NOTIFICACOES@SEUDOMINIO.COM.BR>" style={inputStyle} /></label>
      <label style={labelStyle}>E-MAIL PARA RESPOSTAS<input value={replyTo} onChange={(event) => setReplyTo(event.target.value)} placeholder="OPCIONAL" style={inputStyle} /></label>
      <label style={labelStyle}>API KEY DO RESEND<input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={integration.configured ? "CHAVE CONFIGURADA - INFORME OUTRA PARA TROCAR" : "COLE A CHAVE DO RESEND"} style={inputStyle} /></label>
      <label style={checkLabelStyle}><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /> ENVIO AUTOMATICO ATIVO</label>
      <div><small style={detailLabelStyle}>AGENDAMENTO</small><strong style={detailValueStyle}>{integration.scheduleLabel}</strong></div>
      <div style={saveAreaStyle}><button type="button" onClick={() => void save()} disabled={saving} style={saveButtonStyle}>{saving ? "SALVANDO..." : "SALVAR E-MAIL"}</button></div>
    </section>

    <section style={recipientSectionStyle}>
      <div><span style={eyebrowStyle}>DESTINATARIOS</span><h4 style={subtitleStyle}>CADA USUARIO RECEBE APENAS A PROPRIA AGENDA.</h4></div>
      <div style={recipientHeaderStyle}><span>REPRESENTANTE</span><span>E-MAIL</span><span>TESTE</span></div>
      {recipients.map((recipient) => <div key={recipient.id} style={recipientRowStyle}><strong>{recipient.name}</strong><span>{recipient.email}</span><button type="button" onClick={() => void sendTest(recipient.id)} disabled={!integration.configured || Boolean(sendingTo)} style={{ ...testButtonStyle, ...(!integration.configured ? disabledButtonStyle : {}) }}>{sendingTo === recipient.id ? "ENVIANDO..." : "ENVIAR TESTE"}</button></div>)}
      {!recipients.length ? <div style={emptyStyle}>NENHUM USUARIO ATIVO COM E-MAIL ENCONTRADO NESTA EMPRESA.</div> : null}
    </section>

    {!integration.configured ? <p style={noteStyle}>COLE A API KEY E INFORME O REMETENTE. A CHAVE E SALVA CRIPTOGRAFADA E NUNCA VOLTA A APARECER NA TELA.</p> : <p style={noteStyle}>O ENVIO AUTOMATICO OCORRE EM DIAS UTEIS. O SISTEMA REGISTRA O ENVIO PARA NAO DISPARAR A MESMA AGENDA DUAS VEZES.</p>}
  </section>;
}

const panelStyle = { display: "grid", gap: 18, ...ui.section };
const headerStyle = { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" as const };
const eyebrowStyle = { display: "block", color: "#6d28d9", fontSize: 10, fontWeight: 900, letterSpacing: 0 };
const titleStyle = { margin: "6px 0", color: "#171b2e", ...ui.title };
const subtitleStyle = { margin: "6px 0", color: "#171b2e", fontSize: 14, letterSpacing: 0 };
const descriptionStyle = { margin: 0, color: "#667085", fontSize: 12 };
const statusStyle = { padding: "8px 12px", borderRadius: 5, background: "#fef2f2", color: "#b42318", fontSize: 11, fontWeight: 900 };
const configuredStatusStyle = { background: "#ecfdf3", color: "#027a48" };
const configurationStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, padding: 16, border: "1px solid #d8ccff", borderRadius: 6, background: "#fbfaff" };
const labelStyle = { display: "grid", gap: 7, color: "#344054", fontSize: 10, fontWeight: 900 };
const inputStyle = { width: "100%", boxSizing: "border-box" as const, border: "1px solid #cbd5e1", borderRadius: 5, padding: "10px 11px", background: "#fff", color: "#111827", font: "inherit", fontSize: 12 };
const checkLabelStyle = { display: "flex", alignItems: "center", gap: 8, color: "#344054", fontSize: 11, fontWeight: 900 };
const detailLabelStyle = { display: "block", color: "#667085", fontSize: 10, fontWeight: 900 };
const detailValueStyle = { display: "block", marginTop: 5, color: "#1d2939", fontSize: 13 };
const saveAreaStyle = { display: "flex", justifyContent: "flex-end", alignItems: "end" };
const saveButtonStyle = { border: 0, borderRadius: 5, padding: "10px 13px", background: "#7c3aed", color: "#fff", cursor: "pointer", font: "inherit", fontSize: 10, fontWeight: 900 };
const recipientSectionStyle = { display: "grid", gap: 10, paddingTop: 4 };
const recipientHeaderStyle = { display: "grid", gridTemplateColumns: "minmax(160px, 1fr) minmax(220px, 1.2fr) auto", gap: 14, padding: "0 12px", color: "#667085", fontSize: 10, fontWeight: 900 };
const recipientRowStyle = { display: "grid", gridTemplateColumns: "minmax(160px, 1fr) minmax(220px, 1.2fr) auto", gap: 14, alignItems: "center", padding: "10px 12px", borderBottom: "1px solid #eaecf0", color: "#344054", fontSize: 13 };
const testButtonStyle = { border: 0, borderRadius: 5, padding: "9px 11px", background: "#7c3aed", color: "#fff", cursor: "pointer", font: "inherit", fontSize: 10, fontWeight: 900, whiteSpace: "nowrap" as const };
const disabledButtonStyle = { background: "#c8bdde", cursor: "not-allowed" };
const messageStyle = { padding: "11px 13px", border: "1px solid #86efac", borderRadius: 5, background: "#f0fdf4", color: "#027a48", fontWeight: 800, fontSize: 12 };
const errorStyle = { padding: "11px 13px", border: "1px solid #fda29b", borderRadius: 5, background: "#fff1f3", color: "#b42318", fontWeight: 800, fontSize: 12 };
const emptyStyle = { padding: 18, color: "#667085", fontSize: 12, fontWeight: 800 };
const noteStyle = { margin: 0, color: "#667085", fontSize: 11, lineHeight: 1.5 };

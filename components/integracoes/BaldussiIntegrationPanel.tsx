"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";

type Representative = { id: string; name: string };
type Connection = {
  status: string;
  keyConfigured: boolean;
  clickToCallConfigured: boolean;
  clickToCallUsername: string;
  clickToCallBaseUrl: string;
  webhookUrl: string;
  webhookHeader: string;
  webhookConfigured: boolean;
  audioRetentionDays: number;
  transcriptRetentionDays: number;
};

type Payload = { success: boolean; message?: string; connection: Connection; representatives: Representative[]; extensions: Array<{ profile_id: string; extension: string; click_to_call_extension: string | null }> };

export default function BaldussiIntegrationPanel({ companySlug }: { companySlug?: string }) {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [representatives, setRepresentatives] = useState<Representative[]>([]);
  const [extensions, setExtensions] = useState<Record<string, string>>({});
  const [clickToCallExtensions, setClickToCallExtensions] = useState<Record<string, string>>({});
  const [apiKey, setApiKey] = useState("");
  const [clickToCallUsername, setClickToCallUsername] = useState("");
  const [clickToCallToken, setClickToCallToken] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
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
      const payload = await request(`/api/integracoes/baldussi?slug=${encodeURIComponent(companySlug)}`) as Payload;
      setConnection(payload.connection);
      setRepresentatives(payload.representatives);
      setExtensions(Object.fromEntries(payload.extensions.map((item) => [item.profile_id, item.extension])));
      setClickToCallExtensions(Object.fromEntries(payload.extensions.map((item) => [item.profile_id, item.click_to_call_extension || ""])));
      setClickToCallUsername(payload.connection.clickToCallUsername || "");
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "NAO FOI POSSIVEL CARREGAR A INTEGRACAO.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [companySlug]);

  async function save(generateWebhookSecret = false) {
    if (!companySlug || !connection) return;
    setSaving(true);
    try {
      const payload = await request("/api/integracoes/baldussi", {
        method: "PATCH",
        body: JSON.stringify({
          slug: companySlug,
          apiKey: apiKey || undefined,
          clickToCallUsername: clickToCallUsername || undefined,
          clickToCallToken: clickToCallToken || undefined,
          clickToCallBaseUrl: connection.clickToCallBaseUrl,
          generateWebhookSecret,
          audioRetentionDays: connection.audioRetentionDays,
          transcriptRetentionDays: connection.transcriptRetentionDays,
          extensions: representatives.map((item) => ({ profileId: item.id, extension: extensions[item.id] || "", clickToCallExtension: clickToCallExtensions[item.id] || "" })),
        }),
      });
      setWebhookSecret(payload.webhookSecret || "");
      setApiKey("");
      setClickToCallToken("");
      setMessage(generateWebhookSecret ? "SEGREDO GERADO. COPIE-O AGORA PARA O HEADER DO METRICX; ELE NAO SERA MOSTRADO NOVAMENTE." : "CONFIGURACAO DA TELEFONIA SALVA.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "NAO FOI POSSIVEL SALVAR A INTEGRACAO.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div style={emptyStyle}>CARREGANDO INTEGRACAO BALDUSSI + METRICX...</div>;
  if (!connection) return <div style={errorStyle}>{message || "INTEGRACAO INDISPONIVEL."}</div>;

  return <section style={panelStyle}>
    <div style={headerStyle}>
      <div><span style={eyebrowStyle}>TELEFONIA DA EMPRESA</span><h3 style={titleStyle}>BALDUSSI + METRICX</h3><p style={descriptionStyle}>O BALDUSSI FAZ A LIGACAO; O METRICX ENTREGA O HISTORICO, AUDIO, TRANSCRICAO E ANALISE.</p></div>
      <span style={{ ...statusStyle, ...(connection.keyConfigured && connection.clickToCallConfigured ? configuredStatusStyle : {}) }}>{connection.keyConfigured && connection.clickToCallConfigured ? "TELEFONIA CONFIGURADA" : "CONFIGURACAO PENDENTE"}</span>
    </div>
    {message ? <div style={message.includes("NAO") || message.includes("AIND") ? errorStyle : messageStyle}>{message}</div> : null}
    <div style={gridStyle}>
      <label style={labelStyle}>API KEY METRICX<input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={connection.keyConfigured ? "CHAVE CONFIGURADA - INFORME OUTRA PARA TROCAR" : "COLE A API KEY GERADA NO METRICX"} style={inputStyle} /></label>
      <label style={labelStyle}>USUARIO API CLICK2CALL<input value={clickToCallUsername} onChange={(event) => setClickToCallUsername(event.target.value)} placeholder="EX: XPACEBOX-CLICK2CALL" style={inputStyle} /></label>
      <label style={labelStyle}>TOKEN API CLICK2CALL<input type="password" value={clickToCallToken} onChange={(event) => setClickToCallToken(event.target.value)} placeholder={connection.clickToCallConfigured ? "TOKEN CONFIGURADO - INFORME OUTRO PARA TROCAR" : "COLE O TOKEN GERADO NO BALDUSSI"} style={inputStyle} /></label>
      <label style={labelStyle}>URL API CLICK2CALL<input value={connection.clickToCallBaseUrl} onChange={(event) => setConnection({ ...connection, clickToCallBaseUrl: event.target.value })} style={inputStyle} /></label>
      <label style={labelStyle}>RETENCAO DO AUDIO (DIAS)<input type="number" min={30} max={3650} value={connection.audioRetentionDays} onChange={(event) => setConnection({ ...connection, audioRetentionDays: Number(event.target.value) || 30 })} style={inputStyle} /></label>
      <label style={labelStyle}>RETENCAO DA TRANSCRICAO (DIAS)<input type="number" min={30} max={3650} value={connection.transcriptRetentionDays} onChange={(event) => setConnection({ ...connection, transcriptRetentionDays: Number(event.target.value) || 30 })} style={inputStyle} /></label>
    </div>
    <section style={webhookStyle}>
      <div><span style={eyebrowStyle}>WEBHOOK POR EMPRESA</span><h4 style={subtitleStyle}>COLE ESTA URL NO PAINEL DO METRICX</h4></div>
      <label style={labelStyle}>URL DO WEBHOOK<input readOnly value={connection.webhookUrl} style={readOnlyInputStyle} /></label>
      <div style={headerGridStyle}><label style={labelStyle}>HEADER<input readOnly value={connection.webhookHeader} style={readOnlyInputStyle} /></label><label style={labelStyle}>VALOR DO HEADER<input readOnly value={webhookSecret || (connection.webhookConfigured ? "SEGREDO JA CONFIGURADO" : "GERE O SEGREDO ABAIXO")} style={readOnlyInputStyle} /></label></div>
      <button type="button" onClick={() => void save(true)} disabled={saving} style={secondaryButtonStyle}>GERAR NOVO SEGREDO DO WEBHOOK</button>
    </section>
    <section style={extensionsStyle}>
      <div><span style={eyebrowStyle}>RAMAL POR USUARIO</span><h4 style={subtitleStyle}>A CHAMADA SERA ATRIBUIDA AO USUARIO VINCULADO AO RAMAL.</h4></div>
      <div style={extensionHeaderStyle}><span>USUARIO</span><span>RAMAL METRICX</span><span>RAMAL CLICK2CALL</span></div>
      {representatives.map((representative) => <label key={representative.id} style={extensionRowStyle}><strong>{representative.name}</strong><input value={extensions[representative.id] || ""} onChange={(event) => setExtensions({ ...extensions, [representative.id]: event.target.value.toUpperCase() })} placeholder="EX: DAWOTEC-13" style={inputStyle} /><input inputMode="numeric" value={clickToCallExtensions[representative.id] || ""} onChange={(event) => setClickToCallExtensions({ ...clickToCallExtensions, [representative.id]: event.target.value.replace(/\D/g, "") })} placeholder="EX: 13" style={inputStyle} /></label>)}
      {!representatives.length ? <div style={emptyStyle}>NENHUM USUARIO ATIVO ENCONTRADO PARA ESTA EMPRESA.</div> : null}
    </section>
    <div style={actionsStyle}><button type="button" onClick={() => void save()} disabled={saving} style={primaryButtonStyle}>{saving ? "SALVANDO..." : "SALVAR CONFIGURACAO"}</button></div>
    <p style={noteStyle}>O token do Click2Call e a API key do Metricx sao criptografados. O XPACEBOX nao armazena o arquivo de audio: salva somente o registro da chamada e a referencia segura do Metricx.</p>
  </section>;
}

const panelStyle = { display: "grid", gap: 18, padding: 24, border: "1px solid #d7dff0", borderRadius: 8, background: "#fff" };
const headerStyle = { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" as const };
const eyebrowStyle = { display: "block", color: "#6d28d9", fontSize: 10, fontWeight: 900, letterSpacing: 1.8 };
const titleStyle = { margin: "6px 0", color: "#171b2e", fontSize: 21, letterSpacing: 0 };
const subtitleStyle = { margin: "6px 0", color: "#171b2e", fontSize: 14, letterSpacing: 0 };
const descriptionStyle = { margin: 0, color: "#667085", fontSize: 12 };
const statusStyle = { padding: "8px 12px", borderRadius: 5, background: "#fef2f2", color: "#b42318", fontSize: 11, fontWeight: 900 };
const configuredStatusStyle = { background: "#ecfdf3", color: "#027a48" };
const gridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 };
const labelStyle = { display: "grid", gap: 7, color: "#344054", fontSize: 11, fontWeight: 900 };
const inputStyle = { width: "100%", boxSizing: "border-box" as const, padding: "11px 12px", border: "1px solid #cbd5e1", borderRadius: 5, background: "#fff", color: "#111827", fontWeight: 700 };
const readOnlyInputStyle = { ...inputStyle, background: "#f8fafc", color: "#475467" };
const webhookStyle = { display: "grid", gap: 13, padding: 18, border: "1px solid #d8ccff", borderRadius: 6, background: "#fbfaff" };
const headerGridStyle = { display: "grid", gridTemplateColumns: "minmax(170px, .7fr) minmax(240px, 1.3fr)", gap: 14 };
const extensionsStyle = { display: "grid", gap: 10, paddingTop: 4 };
const extensionHeaderStyle = { display: "grid", gridTemplateColumns: "minmax(160px, 1fr) minmax(160px, 1fr) minmax(160px, 1fr)", gap: 14, padding: "0 12px", color: "#667085", fontSize: 10, fontWeight: 900 };
const extensionRowStyle = { display: "grid", gridTemplateColumns: "minmax(160px, 1fr) minmax(160px, 1fr) minmax(160px, 1fr)", gap: 14, alignItems: "center", padding: "10px 12px", borderBottom: "1px solid #eaecf0", color: "#344054", fontSize: 13 };
const actionsStyle = { display: "flex", justifyContent: "flex-end" };
const primaryButtonStyle = { border: 0, borderRadius: 5, padding: "11px 16px", background: "#7c3aed", color: "#fff", fontWeight: 900, cursor: "pointer" };
const secondaryButtonStyle = { width: "fit-content", border: "1px solid #f79009", borderRadius: 5, padding: "10px 14px", background: "#fffaeb", color: "#b54708", fontWeight: 900, cursor: "pointer" };
const messageStyle = { padding: "11px 13px", border: "1px solid #86efac", borderRadius: 5, background: "#f0fdf4", color: "#027a48", fontWeight: 800, fontSize: 12 };
const errorStyle = { padding: "11px 13px", border: "1px solid #fda29b", borderRadius: 5, background: "#fff1f3", color: "#b42318", fontWeight: 800, fontSize: 12 };
const emptyStyle = { padding: 18, color: "#667085", fontSize: 12, fontWeight: 800 };
const noteStyle = { margin: 0, color: "#667085", fontSize: 11, lineHeight: 1.5 };

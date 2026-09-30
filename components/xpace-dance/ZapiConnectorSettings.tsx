"use client";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";

type Settings = { configured: boolean; instanceId?: string; enabled?: boolean; paused?: boolean; connected?: boolean; lastError?: string; webhookUrl?: string };
async function api(method: "GET" | "POST", body?: object) {
  const { data } = await supabase.auth.getSession();
  const response = await fetch("/api/xpace/message-connector/zapi", { method, cache: "no-store", headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "FALHA NA CONFIGURAÇÃO DA Z-API.");
  return result;
}
export default function ZapiConnectorSettings({ onChanged }: { onChanged: () => void }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState("");
  const [instanceId, setInstanceId] = useState("");
  const [instanceToken, setInstanceToken] = useState("");
  const [clientToken, setClientToken] = useState("");
  const [testPhone, setTestPhone] = useState("");
  const [received, setReceived] = useState(false);
  const testId = useRef<string | null>(null);
  async function refresh() { const value = await api("GET") as Settings; setSettings(value); setInstanceId(value.instanceId ?? ""); }
  useEffect(() => { void refresh().catch(() => setNotice("CONFIGURAÇÃO DA Z-API AINDA NÃO DISPONÍVEL.")); }, []);
  async function action(body: object, message: string) {
    if (working) return;
    setWorking(true); setNotice("");
    try {
      const result = await api("POST", body);
      setNotice(result.code || (result.accepted === false ? "TESTE NÃO CONFIRMADO. NÃO REENVIE SEM CONFERIR." : message));
      await refresh(); onChanged();
      if ((body as { action: string }).action === "SAVE") { setInstanceToken(""); setClientToken(""); }
    } catch (error) { setNotice(error instanceof Error ? error.message : "FALHA NA Z-API."); }
    finally { setWorking(false); }
  }
  return <div className="xd-msg-panel xd-zapi-settings">
    <div className="xd-msg-list-toolbar"><div><h2>WHATSAPP NA NUVEM · Z-API</h2><p>{settings?.enabled ? settings.paused ? "FILA PAUSADA. O COMPUTADOR NÃO CONSUME MAIS OS AVISOS." : "Z-API ATIVA. A FILA NÃO DEPENDE DO COMPUTADOR DA ESCOLA." : "Prepare a integração sem alterar o atendimento nem liberar os avisos."}</p></div><button type="button" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "FECHAR CONFIGURAÇÃO" : "CONFIGURAR Z-API"}</button></div>
    {open ? <>
      <p>Use a instância já conectada da escola. Não gere outro token, não desconecte o WhatsApp e não altere o webhook <strong>Ao receber</strong> do robô. As chaves ficam criptografadas no servidor e não são exibidas novamente.</p>
      {!settings?.enabled ? <form onSubmit={event => { event.preventDefault(); void action({ action: "SAVE", instanceId, instanceToken, clientToken }, "CONFIGURAÇÃO SALVA COM A FILA PAUSADA."); }}>
        <label>ID DA INSTÂNCIA<input value={instanceId} onChange={event => setInstanceId(event.target.value)} required autoComplete="off" /></label>
        <label>TOKEN DA INSTÂNCIA<input type="password" value={instanceToken} onChange={event => setInstanceToken(event.target.value)} required autoComplete="new-password" /></label>
        <label>CLIENT-TOKEN DA CONTA<input type="password" value={clientToken} onChange={event => setClientToken(event.target.value)} required autoComplete="new-password" /></label>
        <button type="submit" className="xd-primary" disabled={working}>SALVAR COM A FILA PAUSADA</button>
      </form> : null}
      {settings?.configured ? <>
        <p>Copie o endereço abaixo <strong>somente</strong> para os campos <strong>Ao enviar</strong> e <strong>Receber status da mensagem</strong> na Z-API. É um endereço privado de autenticação: não o publique nem envie pelo chat.</p>
        <button type="button" onClick={() => void navigator.clipboard.writeText(settings.webhookUrl ?? "").then(() => setNotice("ENDEREÇO PRIVADO COPIADO. COLE NOS DOIS CAMPOS DE STATUS, SEM ALTERAR AO RECEBER."))}>COPIAR ENDEREÇO PRIVADO DOS RECIBOS</button>
        <div><button type="button" disabled={working} onClick={() => void action({ action: "CHECK" }, "CONEXÃO CONSULTADA.")}>CONFERIR CONEXÃO</button> <button type="button" disabled={working} onClick={() => void action({ action: "PAUSE" }, "FILA PAUSADA.")}>PAUSAR FILA</button></div>
        <p>{settings.connected ? "Z-API CONECTADA" : "CONEXÃO NÃO CONFIRMADA"}{settings.lastError ? ` · ${settings.lastError}` : ""}</p>
        <label>WHATSAPP DO ALCEU PARA UM TESTE ISOLADO (55 + DDD)<input type="tel" value={testPhone} onChange={event => setTestPhone(event.target.value)} autoComplete="off" /></label>
        <button type="button" disabled={working || !settings.paused || !testPhone} onClick={() => { testId.current ??= crypto.randomUUID(); void action({ action: "TEST", testPhone, requestId: testId.current }, "TESTE ACEITO PELA Z-API. AGUARDE O RECIBO E CONFIRA O CELULAR."); }}>ENVIAR UM TESTE SOMENTE AO ALCEU</button>
        <label><input type="checkbox" checked={received} onChange={event => setReceived(event.target.checked)} /> RECEBI O TESTE NO CELULAR E OS RECIBOS ESTÃO CONFIGURADOS</label>
        <button type="button" className="xd-primary" disabled={working || !received} onClick={() => void action({ action: "ACTIVATE", confirmReceived: received }, "Z-API ATIVA. FILA LIBERADA; CONSUMO LOCAL BLOQUEADO.")}>ATIVAR Z-API E LIBERAR FILA</button>
        <button type="button" disabled={working} onClick={() => void action({ action: "SCHEDULER" }, "AGENDAMENTO NA NUVEM PREPARADO. A FILA CONTINUA NO ESTADO ATUAL.")}>PREPARAR AGENDAMENTO NA NUVEM</button>
        <p>Antes de ativar, pare a tarefa do conector local. A ativação exige um recibo real de entrega recente; um ID sozinho não basta. Não reenvia mensagens em “Verificar”. A nuvem consulta a fila a cada minuto.</p>
      </> : null}
    </> : null}
    {notice ? <p className="xd-msg-notice" role="status">{notice}</p> : null}
  </div>;
}

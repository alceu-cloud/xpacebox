"use client";

import { ArrowLeft, Check, CircleHelp, Clock3, Copy, Laptop, Link2Off, LoaderCircle, MessageCircle, RefreshCw, Send, ShieldAlert, ShieldCheck, Smartphone, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";

type Message = { id: string; kind: string; contact_name: string; destination_phone: string; status: string; error_message: string | null; created_at: string; sent_at: string | null };
type ConnectorPayload = { success: boolean; connector: { configured: boolean; status: string; phone: string; qrDataUrl: string; lastSeenAt: string | null; lastError: string; disconnectRequested: boolean }; messages: Message[]; score: number | null; scoreDetails: { failures: number; oldQueue: number; windowDays: number } };
type Tab = "PONTUACAO" | "ENVIOS" | "QR";

async function request<T>(method: "GET" | "POST", body?: object): Promise<T> {
  const { data } = await supabase.auth.getSession();
  if (!data.session?.access_token) throw new Error("SESSÃO NÃO ENCONTRADA.");
  const response = await fetch("/api/xpace/message-connector", { method, headers: { Authorization: `Bearer ${data.session.access_token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const result = await response.json().catch(() => ({})) as T & { success?: boolean; message?: string };
  if (!response.ok || !result.success) throw new Error(result.message || "NÃO FOI POSSÍVEL CONSULTAR O CONECTOR.");
  return result;
}

export default function MessageConnectorWorkspace({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<Tab>("PONTUACAO");
  const [data, setData] = useState<ConnectorPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState("");
  const [token, setToken] = useState("");
  const [filter, setFilter] = useState("TODOS");
  const [showGuide, setShowGuide] = useState(false);
  const refresh = useCallback(async () => {
    try { setData(await request<ConnectorPayload>("GET")); setNotice(""); }
    catch (error) { setNotice(error instanceof Error ? error.message : "FALHA AO CONSULTAR O CONECTOR."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); const interval = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 10_000); return () => window.clearInterval(interval); }, [refresh]);

  async function generateToken() {
    if (data?.connector.configured && !window.confirm("GERAR UMA NOVA CHAVE INVALIDA A CHAVE DO COMPUTADOR ATUAL. CONTINUAR?")) return;
    setWorking(true);
    try { const result = await request<{ token: string }>("POST", { action: "GENERATE_TOKEN" }); setToken(result.token); setTab("QR"); await refresh(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL GERAR A CHAVE."); }
    finally { setWorking(false); }
  }
  async function disconnect() {
    if (!window.confirm("DESCONECTAR ESTE WHATSAPP? O COMPUTADOR PRECISA ESTAR LIGADO PARA RECEBER O PEDIDO.")) return;
    setWorking(true);
    try { await request("POST", { action: "DISCONNECT" }); await refresh(); setNotice("PEDIDO DE DESCONEXÃO ENVIADO. AGUARDE O COMPUTADOR DA ESCOLA RESPONDER."); }
    catch (error) { setNotice(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL DESCONECTAR."); }
    finally { setWorking(false); }
  }
  async function cancel(messageId: string) {
    setWorking(true);
    try { await request("POST", { action: "CANCEL_MESSAGE", messageId }); await refresh(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL CANCELAR."); }
    finally { setWorking(false); }
  }
  const connector = data?.connector;
  const online = connector?.status === "CONNECTED";
  const messages = (data?.messages ?? []).filter((item) => filter === "TODOS" || item.status === filter);
  const sent = data?.messages.filter((item) => item.status === "SENT").length ?? 0;
  const pending = data?.messages.filter((item) => ["QUEUED", "SENDING"].includes(item.status)).length ?? 0;
  return <section className="xd-msg-workspace">
    <header className="xd-msg-header"><button type="button" className="xd-xpay-back" onClick={onBack}><ArrowLeft size={16} /> VOLTAR PARA LOJA</button><div><span>LOJA · XPACE</span><h1>INTEGRADOR DE MENSAGENS.</h1><p>Envie links de assinatura e cobrança pelo WhatsApp conectado à escola, somente quando você escolher.</p></div><span className={`xd-msg-status ${online ? "is-online" : ""}`}><i /> {loading ? "CARREGANDO" : online ? `CONECTADO · ${connector.phone || "WHATSAPP"}` : connector?.status === "WAITING_QR" ? "AGUARDANDO QR CODE" : connector?.configured ? "DESCONECTADO" : "NÃO CONFIGURADO"}</span></header>
    {notice ? <p className="xd-msg-notice" role="status">{notice}</p> : null}
    <div className="xd-msg-metrics"><article><MessageCircle size={20} /><span>ENVIOS REGISTRADOS</span><strong>{data?.messages.length ?? 0}</strong></article><article><Check size={20} /><span>ENVIADOS AO WHATSAPP</span><strong>{sent}</strong></article><article><Clock3 size={20} /><span>NA FILA</span><strong>{pending}</strong></article></div>
    <div className="xd-msg-tabs" role="tablist" aria-label="Integrador de mensagens"><button type="button" className={tab === "PONTUACAO" ? "is-active" : ""} onClick={() => setTab("PONTUACAO")}>PONTUAÇÃO</button><button type="button" className={tab === "ENVIOS" ? "is-active" : ""} onClick={() => setTab("ENVIOS")}>CONTROLE DE ENVIOS</button><button type="button" className={tab === "QR" ? "is-active" : ""} onClick={() => setTab("QR")}>QR CODE</button></div>
    {tab === "PONTUACAO" ? <div className="xd-msg-panel"><p className="xd-msg-intro">Este indicador acompanha a <strong>operação do conector</strong>: conexão, falhas e fila antiga. Não é a pontuação oficial do WhatsApp nem prevê bloqueios.</p><div className="xd-msg-health"><div className="xd-msg-gauge"><strong>{data?.score ?? "—"}</strong><small>DE 100</small></div><div><span className="xd-msg-eyebrow"><ShieldCheck size={16} /> SAÚDE DA OPERAÇÃO</span><h2>{online ? "CONEXÃO ATIVA" : "CONECTOR FORA DO AR"}</h2><p>{online ? "O computador está respondendo. Mensagens na fila são processadas uma a uma." : "Ligue o computador da escola e abra o conector para processar a fila."}</p><button type="button" className="xd-msg-text-button" onClick={() => setShowGuide(true)}>COMO REDUZIR RISCOS <CircleHelp size={16} /></button></div></div><div className="xd-msg-factors"><article><strong>{data?.scoreDetails.failures ?? 0}</strong><span>FALHAS OU ENVIOS SEM CONFIRMAÇÃO NOS ÚLTIMOS 7 DIAS</span></article><article><strong>{data?.scoreDetails.oldQueue ?? 0}</strong><span>MENSAGENS HÁ MAIS DE 24 HORAS NA FILA</span></article><article><strong>15 S</strong><span>INTERVALO MÍNIMO ENTRE TENTATIVAS DE ENVIO</span></article></div><aside className="xd-msg-caution"><ShieldAlert size={19} /><p>A conexão por QR usa uma biblioteca não oficial. Mesmo com poucos envios, existe risco de desconexão ou bloqueio do número. Não use para disparos em massa.</p></aside></div> : null}
    {tab === "ENVIOS" ? <div className="xd-msg-panel"><div className="xd-msg-list-toolbar"><div><h2>CONTROLE DE ENVIOS</h2><p>“Enviado” confirma apenas que o WhatsApp aceitou a mensagem; não confirma leitura ou entrega ao cliente.</p></div><div><select aria-label="Filtrar situação" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="TODOS">TODAS AS SITUAÇÕES</option><option value="QUEUED">NA FILA</option><option value="SENDING">ENVIANDO</option><option value="SENT">ENVIADAS</option><option value="UNKNOWN">VERIFICAR</option><option value="CANCELLED">CANCELADAS</option></select><button type="button" onClick={() => void refresh()} aria-label="Atualizar lista"><RefreshCw size={17} /></button></div></div><div className="xd-msg-table"><div className="xd-msg-table-head"><span>CONTATO</span><span>MENSAGEM</span><span>ENTRADA</span><span>SITUAÇÃO</span><span /></div>{messages.length ? messages.map((message) => <article key={message.id}><div><strong>{message.contact_name}</strong><small>{message.destination_phone}</small></div><span>{message.kind === "ASSINATURA" ? "LINK DE ASSINATURA" : "LINK DE PAGAMENTO"}</span><time>{dateTime(message.created_at)}</time><span className={`xd-msg-pill xd-msg-pill--${message.status.toLowerCase()}`}>{statusLabel(message.status)}</span><div>{message.status === "QUEUED" ? <button type="button" disabled={working} title="Cancelar mensagem" onClick={() => void cancel(message.id)}><X size={16} /></button> : null}</div>{message.error_message ? <small className="xd-msg-row-error">{message.error_message}</small> : null}</article>) : <p className="xd-msg-empty">NENHUM ENVIO NESTE FILTRO.</p>}</div></div> : null}
    {tab === "QR" ? <div className="xd-msg-panel xd-msg-setup"><div><h2>CONEXÃO DO WHATSAPP DA ESCOLA</h2><p>O QR aparece aqui depois que o conector estiver rodando no computador da escola. Você pode preparar a chave agora, mas o pareamento precisa ser feito com o celular perto da tela.</p><ol><li><Laptop size={18} /> Instale Node.js 20+ no computador que ficará ligado.</li><li><Smartphone size={18} /> Copie a pasta <code>connector</code> e configure o endereço do XPACEBOX e a chave abaixo.</li><li><RefreshCw size={18} /> Execute <code>npm install</code> e <code>npm start</code>.</li><li><MessageCircle size={18} /> No WhatsApp, abra <strong>Dispositivos conectados → Conectar dispositivo</strong> e leia o QR desta tela.</li></ol><button type="button" className="xd-primary" disabled={working} onClick={() => void generateToken()}>{working ? <LoaderCircle size={17} className="xd-spin" /> : <ShieldCheck size={17} />} {connector?.configured ? "GERAR NOVA CHAVE" : "PREPARAR CONEXÃO"}</button>{token ? <div className="xd-msg-token"><span>CHAVE DE CONEXÃO · EXIBIDA SOMENTE AGORA</span><code>{token}</code><button type="button" onClick={() => void navigator.clipboard.writeText(token)}><Copy size={15} /> COPIAR</button><small>Guarde no arquivo .env do computador da escola. Não envie por WhatsApp nem coloque no Git.</small></div> : null}<p className="xd-msg-footnote">O computador pode ficar ligado com o monitor desligado. Desative suspensão automática do Windows e mantenha internet estável.</p></div><div className="xd-msg-qr-box">{connector?.qrDataUrl ? <><img src={connector.qrDataUrl} alt="QR code temporário para conectar o WhatsApp da escola" /><strong>ESCANEIE COM O WHATSAPP</strong><small>O QR muda periodicamente. Se vencer, aguarde o próximo.</small></> : online ? <><div className="xd-msg-qr-icon is-online"><Check size={47} /></div><strong>CONECTADO</strong><small>{connector.phone || "WhatsApp da escola"}</small><button type="button" className="xd-msg-disconnect" disabled={working} onClick={() => void disconnect()}><Link2Off size={16} /> DESCONECTAR DISPOSITIVO</button></> : <><div className="xd-msg-qr-icon"><Smartphone size={47} /></div><strong>AGUARDANDO O COMPUTADOR</strong><small>{connector?.configured ? "Quando o conector iniciar, o QR aparecerá aqui." : "Prepare a conexão para gerar a chave do computador."}</small>{connector?.lastError ? <p className="xd-msg-error">{connector.lastError}</p> : null}</>}</div></div> : null}
    {showGuide ? <div className="xd-msg-overlay" role="presentation" onMouseDown={() => setShowGuide(false)}><section role="dialog" aria-modal="true" aria-label="Boas práticas de envio" onMouseDown={(event) => event.stopPropagation()}><header><h2>PONTUAÇÃO DO INTEGRADOR</h2><button type="button" aria-label="Fechar" onClick={() => setShowGuide(false)}><X size={20} /></button></header><p>Esta pontuação é interna do XPACEBOX. Ela mede apenas conexão, falhas e mensagens antigas na fila; não controla a reputação do número nem evita banimento.</p><div className="xd-msg-guide-table"><div><strong>SINAL</strong><strong>O QUE ACONTECE</strong></div><div><span>Conexão ativa</span><span>Mensagens escolhidas por você são enviadas uma a uma, com intervalo mínimo de 15 segundos.</span></div><div><span>Computador offline</span><span>Novos pedidos aguardam na fila, sem marcar como entregues.</span></div><div><span>Envio incerto</span><span>Fica em “Verificar”; o sistema não reenvia sem uma conferência no WhatsApp.</span></div></div><ul><li>Envie apenas links solicitados para clientes que autorizaram contato.</li><li>Evite listas, disparos em massa e mensagens repetidas.</li><li>O WhatsApp pode limitar ou encerrar sessões não oficiais sem aviso.</li></ul><a href="https://ajuda.nextfit.com.br/support/solutions/articles/69000881869-como-evitar-bloqueios-de-n%C3%BAmeros-no-whatsapp-manual-de-boas-pr%C3%A1ticas" target="_blank" rel="noreferrer">CONSULTAR MANUAL DE BOAS PRÁTICAS</a><footer><button type="button" className="xd-primary" onClick={() => setShowGuide(false)}>ENTENDI</button></footer></section></div> : null}
  </section>;
}

function dateTime(value: string) { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value)); }
function statusLabel(status: string) { return ({ QUEUED: "NA FILA", SENDING: "ENVIANDO", SENT: "ENVIADO", FAILED: "FALHOU", UNKNOWN: "VERIFICAR", CANCELLED: "CANCELADO" } as Record<string, string>)[status] ?? status; }

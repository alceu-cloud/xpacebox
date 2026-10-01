"use client";

import { ArrowLeft, Check, ChevronLeft, ChevronRight, Clock3, MessageCircle, Search, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import ZapiConnectorSettings from "@/components/xpace-dance/ZapiConnectorSettings";

type Message = { id: string; kind: string; appointment_id: string | null; appointment_scheduled_on: string | null; appointment_starts_at: string | null; contact_name: string; destination_phone: string; student_name: string; student_phone: string; instructor_name?: string; instructor_phone?: string; instructor_missing_reason?: string; status: string; error_message: string | null; created_at: string; scheduled_at: string; sent_at: string | null; delivered_at: string | null; read_at: string | null; manually_confirmed_at?: string | null; manual_confirmation_note?: string | null };
type Payload = { connector: { configured: boolean; status: string; paused?: boolean }; messages: Message[]; schedulerReady: boolean; pagination: { page: number; pageSize: number; total: number }; summary: { registered: number; sent: number; queued: number; confirmed: number; failures: number; receiptPending: number; lateQueue: number; monitoringSince: string | null } };

async function request<T>(method: "GET" | "POST", query = "", body?: object): Promise<T> {
  const { data } = await supabase.auth.getSession();
  if (!data.session?.access_token) throw new Error("SESSÃO NÃO ENCONTRADA.");
  const response = await fetch(`/api/xpace/message-connector${query}`, { method, cache: "no-store", headers: { Authorization: `Bearer ${data.session.access_token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "NÃO FOI POSSÍVEL CONSULTAR OS ENVIOS.");
  return result;
}

export default function MessageConnectorWorkspace({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<Payload | null>(null);
  const [notice, setNotice] = useState("");
  const [working, setWorking] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("TODOS");
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const sequence = useRef(0);
  useEffect(() => { const timer = window.setTimeout(() => { setSearch(searchInput.trim()); setPage(0); }, 300); return () => window.clearTimeout(timer); }, [searchInput]);
  const refresh = useCallback(async () => {
    const id = ++sequence.current;
    const query = new URLSearchParams({ search, status: filter, page: String(page) });
    try { const value = await request<Payload>("GET", `?${query}`); if (id === sequence.current) { setData(value); setNotice(""); } }
    catch (error) { if (id === sequence.current) setNotice(error instanceof Error ? error.message : "FALHA AO CONSULTAR OS ENVIOS."); }
  }, [search, filter, page]);
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 10000);
    const pull = (event: Event) => (event as CustomEvent<{ tasks: Promise<unknown>[] }>).detail.tasks.push(refresh());
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("xpace:refresh", pull); document.addEventListener("visibilitychange", visible);
    return () => { ++sequence.current; window.clearInterval(timer); window.removeEventListener("xpace:refresh", pull); document.removeEventListener("visibilitychange", visible); };
  }, [refresh]);
  async function cancel(id: string) {
    if (!window.confirm("Cancelar apenas este envio ainda na fila?")) return;
    setWorking(true);
    try { await request("POST", "", { action: "CANCEL_MESSAGE", messageId: id }); await refresh(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "FALHA AO CANCELAR."); }
    finally { setWorking(false); }
  }
  const groups = new Map<string, Message[]>();
  for (const message of data?.messages ?? []) { if (message.kind === "TESTE") continue; const key = message.appointment_id ?? message.id; groups.set(key, [...(groups.get(key) ?? []), message]); }
  const summary = data?.summary;
  const online = data?.connector.status === "CONNECTED";
  const attention = (summary?.failures ?? 0) + (summary?.receiptPending ?? 0) + (summary?.lateQueue ?? 0);
  const currentPage = data?.pagination.page ?? page;
  const total = data?.pagination.total ?? 0;
  return <section className="xd-msg-workspace">
    <header className="xd-msg-header"><button type="button" className="xd-xpay-back" onClick={onBack}><ArrowLeft size={16} /> VOLTAR PARA LOJA</button><div><span>LOJA · XPACE</span><h1>WHATSAPP NA NUVEM.</h1><p>Avisos automáticos pela Z-API, sem depender do computador da escola.</p></div><span className={`xd-msg-status ${online ? "is-online" : ""}`}><i /> {!data ? "CARREGANDO" : online ? "CONECTADO · Z-API" : data.connector.status === "PAUSED" ? "FILA PAUSADA" : data.connector.status === "SCHEDULER_ERROR" ? "CONFERIR AGENDADOR" : data.connector.status === "PREPARING" ? "EM PREPARAÇÃO" : "CONFERIR CONEXÃO"}</span></header>
    {notice ? <p className="xd-msg-notice" role="alert">{notice}</p> : null}
    <ZapiConnectorSettings onChanged={() => void refresh()} />
    <aside className={`xd-msg-automation ${online && data?.schedulerReady && !attention ? "is-healthy" : "needs-attention"}`} role="status">
      {online && data?.schedulerReady && !attention ? <ShieldCheck size={23} /> : <ShieldAlert size={23} />}
      <div><strong>{!data ? "CONFERINDO AUTOMAÇÃO" : !online || !data.schedulerReady ? "AUTOMAÇÃO PRECISA DE CONFERÊNCIA" : attention ? `${attention} ENVIO(S) PRECISAM DE CONFERÊNCIA` : "AUTOMAÇÃO ATIVA · SEM PENDÊNCIAS DETECTADAS"}</strong>
      <p>Os novos envios são acompanhados por recibos reais. Agendamentos futuros não são erros. {summary?.monitoringSince ? `Acompanhamento da Z-API desde ${dateTime(summary.monitoringSince)}.` : "O acompanhamento começa com o primeiro envio real pela Z-API."}</p>
      {attention ? <p>{summary?.failures ?? 0} falhas/incertos · {summary?.receiptPending ?? 0} sem recibo há mais de 15 minutos · {summary?.lateQueue ?? 0} atrasados na fila. Confira as Providências; não reenvie sem olhar a conversa.</p> : null}</div>
    </aside>
    <div className="xd-msg-metrics"><article><MessageCircle size={20} /><span>ENVIOS REAIS REGISTRADOS</span><strong>{summary?.registered ?? 0}</strong></article><article><Check size={20} /><span>ENTREGUES / CONFERIDOS</span><strong>{summary?.confirmed ?? 0}</strong></article><article><Clock3 size={20} /><span>NA FILA</span><strong>{summary?.queued ?? 0}</strong></article></div>
    <div className="xd-msg-panel"><div className="xd-msg-list-toolbar"><div><h2>CONTROLE DE ENVIOS</h2><p>5 aulas ou envios por página, do mais recente ao mais antigo. Atualiza automaticamente a cada 10 segundos. No celular, puxe do topo para atualizar.</p></div></div>
      <div className="xd-msg-filters"><label><Search size={17} /><input type="search" aria-label="Buscar envios pelo nome" placeholder="Buscar aluno, professor ou contato" maxLength={100} value={searchInput} onChange={event => setSearchInput(event.target.value)} /></label><select aria-label="Filtrar situação" value={filter} onChange={event => { setFilter(event.target.value); setPage(0); }}><option value="TODOS">TODAS AS SITUAÇÕES</option><option value="QUEUED">NA FILA</option><option value="SENDING">ENVIANDO</option><option value="SENT">PROCESSADAS</option><option value="UNKNOWN">VERIFICAR</option><option value="FAILED">FALHOU</option><option value="CANCELLED">CANCELADAS</option></select></div>
      <p className="xd-msg-legend">Verde: entregue, lido ou conferido manualmente. Azul: aceito, ainda sem recibo. Amarelo: programado. Vermelho: falha ou envio incerto. Testes ficam fora desta lista.</p>
      <div className="xd-msg-bundles">{[...groups].map(([key, group]) => {
        const student = group[0]; const teacher = group.find(item => item.kind === "AVISO_PROFESSOR");
        const steps = student.appointment_id ? ["VIDEO_BOAS_VINDAS", "AVISO_PROFESSOR", "LEMBRETE_VESPERA", "CONFIRMACAO_DIA", ...(group.some(item => item.kind === "PESQUISA_SATISFACAO") ? ["PESQUISA_SATISFACAO"] : [])] : [student.kind];
        return <article className="xd-msg-bundle" key={key}><header><div><span className="xd-msg-bundle-eyebrow">{student.appointment_id ? `AULA EXPERIMENTAL · ${student.appointment_scheduled_on?.split("-").reverse().join("/") ?? "DATA NÃO INFORMADA"} ${student.appointment_starts_at ? `ÀS ${student.appointment_starts_at.slice(0, 5)}` : ""}` : "ENVIO DE LINK"}</span><strong>{student.student_name || group.find(item => item.kind !== "AVISO_PROFESSOR")?.contact_name || student.contact_name}</strong><small>{student.student_phone || student.destination_phone}</small></div>{student.appointment_id ? <div className="xd-msg-bundle-teacher"><strong>{teacher?.contact_name || student.instructor_name || "PROFESSOR NÃO INFORMADO"}</strong><small>{teacher?.destination_phone || student.instructor_phone || "SEM CELULAR CADASTRADO"}</small></div> : null}</header>
          <div className="xd-msg-bundle-steps">{steps.map(kind => { const message = group.find(item => item.kind === kind); return <button type="button" key={kind} disabled={!message} className={`xd-msg-step xd-msg-step--${message ? deliveryState(message) : "missing"}`} aria-expanded={message ? expanded === message.id : undefined} onClick={() => message && setExpanded(expanded === message.id ? null : message.id)}><span>{kindLabel(kind)}</span><strong>{message ? deliveryLabel(message) : "NÃO PROGRAMADO"}</strong><small>{message ? timeLabel(message) : kind === "AVISO_PROFESSOR" ? student.instructor_missing_reason || "Sem envio para esta aula" : "Sem envio para esta aula"}</small></button>; })}</div>
          {group.filter(item => expanded === item.id).map(message => <div className="xd-msg-bundle-detail" key={message.id}><span>DESTINO: {message.contact_name} · {message.destination_phone}</span>{message.manual_confirmation_note ? <span>CONFERÊNCIA MANUAL: {message.manual_confirmation_note}</span> : null}{message.error_message ? <span className="xd-msg-row-error">{message.error_message}</span> : null}{message.status === "QUEUED" ? <button type="button" disabled={working} onClick={() => void cancel(message.id)}><X size={15} /> CANCELAR ESTE ENVIO</button> : null}</div>)}
        </article>;
      })}</div>
      {data && !groups.size ? <p className="xd-msg-empty">NENHUM ENVIO ENCONTRADO NESTA BUSCA.</p> : null}
      <nav className="xd-msg-pagination" aria-label="Páginas de envios"><span>{total ? `${currentPage * 5 + 1}–${Math.min((currentPage + 1) * 5, total)} de ${total}` : "0 resultados"}</span><button type="button" aria-label="Envios mais recentes" disabled={!data || currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={18} /></button><button type="button" aria-label="Envios mais antigos" disabled={!data || (currentPage + 1) * 5 >= total} onClick={() => setPage(currentPage + 1)}><ChevronRight size={18} /></button></nav>
    </div>
  </section>;
}
function dateTime(value: string) { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value)); }
function deliveryState(message: Message) { return message.read_at || message.delivered_at || message.manually_confirmed_at ? "delivered" : ["FAILED", "UNKNOWN"].includes(message.status) ? "failed" : message.status === "CANCELLED" ? "cancelled" : message.status === "SENT" ? "accepted" : "pending"; }
function deliveryLabel(message: Message) { return message.read_at ? "LIDO" : message.delivered_at ? "ENTREGUE" : message.manually_confirmed_at ? "CONFERIDO MANUALMENTE" : ({ QUEUED: "NA FILA", SENDING: "ENVIANDO", SENT: "ACEITO PELO SERVIDOR", FAILED: "FALHOU", UNKNOWN: "VERIFICAR", CANCELLED: "CANCELADO" } as Record<string,string>)[message.status] ?? message.status; }
function kindLabel(kind: string) { return ({ ASSINATURA: "LINK DE ASSINATURA", COBRANCA: "LINK DE PAGAMENTO", COBRANCA_PIX_AUTOMATICA: "MENSALIDADE PIX", VIDEO_BOAS_VINDAS: "VÍDEO DA AULA", LEMBRETE_VESPERA: "LEMBRETE DA AULA", CONFIRMACAO_DIA: "CONFIRMAÇÃO DA AULA", AVISO_PROFESSOR: "AVISO AO PROFESSOR", PESQUISA_SATISFACAO: "PESQUISA DA AULA" } as Record<string,string>)[kind] ?? kind; }
function timeLabel(message: Message) { const label = message.read_at ? "LIDO" : message.delivered_at ? "ENTREGUE" : message.manually_confirmed_at ? "CONFERIDO" : message.status === "QUEUED" ? "PROGRAMADO" : message.sent_at ? "ACEITO" : "ENTROU"; return `${label} · ${dateTime(message.read_at ?? message.delivered_at ?? message.manually_confirmed_at ?? (message.status === "QUEUED" ? message.scheduled_at : message.sent_at ?? message.created_at))}`; }

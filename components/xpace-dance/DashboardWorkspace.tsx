"use client";

import { ArrowLeft, BarChart3, Cake, CalendarDays, CircleAlert, ClipboardList, HeartPulse, PieChart, RefreshCw, UsersRound, WalletCards } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";

type Section = "CRM" | "GERENCIAL" | "OPERACIONAL" | "CLIENTES" | "FINANCEIRO";
type Slice = { name: string; count: number };
type Base = { success: true; section: Section; from: string; to: string };
type CrmData = Base & { section: "CRM"; metrics: { leads: number; open: number; won: number; lost: number; conversion: number | null }; trend: Array<{ month: string; won: number; lost: number }>; birthdays: Array<{ id: string; name: string; on: string; age: number }>; sources: Slice[]; sourceMissing: number; losses: Slice[]; lossMissing: number; imported: number };
type ManagerData = Base & { section: "GERENCIAL"; metrics: { salesCents: number | null; salesCount: number; ticketCents: number | null; ltMonths: number | null; churn: number | null; cacCents: number | null; renewal: number | null }; trend: Array<{ month: string; salesCents: number | null; revenueCents: number | null; ticketCents: number | null; ltMonths: number | null; churn: number | null; count: number }>; plans: Slice[]; closures: Slice[]; notes: { sales: string; revenue: string } };
type OperationsData = Base & { section: "OPERACIONAL"; metrics: { occupancy: number | null; renewal: number | null; atRisk: number | null; activeSchedules: number }; expiring: Array<{ id: string; client: string; plan: string; on: string; automatic: boolean }>; slots: Array<{ id: string; className: string; weekday: number; startsAt: string; room: string | null; capacity: number | null }> };
type ClientsData = Base & { section: "CLIENTES"; metrics: { active: number; new: number; blocked: number; suspended: number; vip: number }; modalities: Slice[]; ages: Slice[]; ageMissing: number };
type FinanceData = Base & { section: "FINANCEIRO" };
type Payload = CrmData | ManagerData | OperationsData | ClientsData | FinanceData;

const tabs: Array<{ id: Section; icon: typeof BarChart3; label: string }> = [
  { id: "CRM", icon: HeartPulse, label: "CRM" },
  { id: "GERENCIAL", icon: BarChart3, label: "GERENCIAL" },
  { id: "OPERACIONAL", icon: ClipboardList, label: "OPERACIONAL" },
  { id: "CLIENTES", icon: UsersRound, label: "CLIENTES" },
  { id: "FINANCEIRO", icon: WalletCards, label: "FINANCEIRO" },
];
const weekdayNames = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
const sourceColors = ["#7134b2", "#a277d2", "#d8b9ef", "#4d9dad", "#a6d5dc", "#e4dded"];
const lossColors = ["#c74762", "#e0798f", "#f1b9c6", "#805d91", "#bba4c9", "#e9dfe9"];

function today() { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()); }
function date(value: string) { return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)); }
function money(cents: number | null) { return cents === null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(cents / 100); }
function number(value: number | null, suffix = "") { return value === null ? "—" : `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value)}${suffix}`; }
function monthLabel(value: string) { return new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(`${value}-01T12:00:00Z`)).replace(".", "").toUpperCase(); }

export default function DashboardWorkspace({ onBack }: { onBack: () => void }) {
  const current = today();
  const [section, setSection] = useState<Section>("CRM");
  const [fromDraft, setFromDraft] = useState(`${current.slice(0, 4)}-01-01`);
  const [toDraft, setToDraft] = useState(current);
  const [period, setPeriod] = useState({ from: `${current.slice(0, 4)}-01-01`, to: current });
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (activeSection: Section, from: string, to: string, signal?: AbortSignal) => {
    setLoading(true); setError(""); setPayload(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sua sessão expirou. Entre novamente para abrir o dashboard.");
      const query = new URLSearchParams({ section: activeSection, from, to });
      const response = await fetch(`/api/xpace/dashboard?${query}`, { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store", signal });
      const result = await response.json().catch(() => null) as (Payload & { message?: string }) | null;
      if (!response.ok || !result?.success) throw new Error(result?.message || "Não foi possível carregar o dashboard.");
      if (!signal?.aborted) setPayload(result);
    } catch (cause) {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : "Não foi possível carregar o dashboard.");
    } finally { if (!signal?.aborted) setLoading(false); }
  }, []);

  useEffect(() => { const controller = new AbortController(); void load(section, period.from, period.to, controller.signal); return () => controller.abort(); }, [load, section, period]);

  function applyPeriod(event: React.FormEvent) {
    event.preventDefault();
    if (fromDraft > toDraft) { setError("A data inicial deve ser anterior à final."); return; }
    setPeriod({ from: fromDraft, to: toDraft });
  }

  return <section className="xdd-workspace">
    <header className="xdd-heading"><button className="xdd-back" type="button" onClick={onBack} aria-label="Voltar ao painel"><ArrowLeft size={18} /></button><div><span>VISÃO ESTRATÉGICA · XPACE</span><h1>Dashboard<span>.</span></h1><p>Do primeiro agendamento à vida ativa na escola.</p></div><button className="xdd-refresh" type="button" disabled={loading} onClick={() => void load(section, period.from, period.to)}><RefreshCw size={16} /> Atualizar</button></header>

    <form className="xdd-period" onSubmit={applyPeriod}><div><CalendarDays size={18} /><span>PERÍODO DE ANÁLISE</span></div><label>DE <input aria-label="Data inicial" type="date" required value={fromDraft} onChange={(event) => setFromDraft(event.target.value)} /></label><label>ATÉ <input aria-label="Data final" type="date" required value={toDraft} onChange={(event) => setToDraft(event.target.value)} /></label><button type="submit">APLICAR</button><small>Os quadros “próximos” e os saldos atuais usam a data de hoje.</small></form>

    <nav className="xdd-tabs" aria-label="Áreas do dashboard">{tabs.map(({ id, icon: Icon, label }) => <button key={id} type="button" aria-pressed={section === id} className={section === id ? "is-active" : ""} onClick={() => setSection(id)}><Icon size={17} />{label}</button>)}</nav>
    <p className="xdd-scope-note">Indicadores calculados apenas com dados do XPACEBOX. Contratos e pagamentos do NextFit ainda não entram nesta análise.</p>
    {error ? <div className="xdd-alert" role="alert"><CircleAlert size={18} />{error}<button type="button" onClick={() => void load(section, period.from, period.to)}>Tentar novamente</button></div> : null}
    {loading ? <div className="xdd-loading" role="status">CARREGANDO INDICADORES...</div> : null}
    {!loading && payload?.section === "CRM" ? <CrmSection data={payload} /> : null}
    {!loading && payload?.section === "GERENCIAL" ? <ManagerSection data={payload} /> : null}
    {!loading && payload?.section === "OPERACIONAL" ? <OperationsSection data={payload} /> : null}
    {!loading && payload?.section === "CLIENTES" ? <ClientsSection data={payload} /> : null}
    {!loading && payload?.section === "FINANCEIRO" ? <FinanceSection /> : null}
  </section>;
}

function Metric({ label, value, note, tone = "violet" }: { label: string; value: string; note: string; tone?: "violet" | "green" | "red" | "blue" | "orange" }) {
  return <article className={`xdd-metric xdd-metric--${tone}`}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>;
}

function Panel({ eyebrow, title, aside, children, className = "" }: { eyebrow: string; title: string; aside?: string; children: React.ReactNode; className?: string }) {
  return <section className={`xdd-panel ${className}`}><header><div><span>{eyebrow}</span><h2>{title}</h2></div>{aside ? <small>{aside}</small> : null}</header>{children}</section>;
}

function Empty({ title, detail }: { title: string; detail: string }) { return <div className="xdd-empty"><PieChart size={26} /><strong>{title}</strong><p>{detail}</p></div>; }

function Donut({ items, missing, emptyText }: { items: Slice[]; missing?: number; emptyText: string }) {
  const total = items.reduce((sum, item) => sum + item.count, 0);
  if (!total) return <Empty title="SEM DADOS CLASSIFICADOS" detail={emptyText} />;
  let cursor = 0;
  const gradient = items.map((item, index) => { const start = cursor; cursor += item.count / total * 100; return `${sourceColors[index % sourceColors.length]} ${start}% ${cursor}%`; }).join(", ");
  return <div className="xdd-donut-layout"><div className="xdd-donut" style={{ background: `conic-gradient(${gradient})` }} role="img" aria-label={items.map((item) => `${item.name}: ${item.count}`).join(", ")}><div><strong>{total}</strong><span>COM DADO</span></div></div><div className="xdd-legend">{items.slice(0, 6).map((item, index) => <div key={item.name}><i style={{ background: sourceColors[index % sourceColors.length] }} /><span>{item.name}</span><strong>{item.count}</strong></div>)}{missing ? <small>{missing} sem classificação estruturada</small> : null}</div></div>;
}

function LossDonut({ items, missing }: { items: Slice[]; missing: number }) {
  const total = items.reduce((sum, item) => sum + item.count, 0);
  if (!total) return <Empty title="MOTIVOS AINDA NÃO PADRONIZADOS" detail={`${missing} perdas sem motivo selecionado no cadastro. As observações livres da planilha não foram convertidas em categorias automaticamente.`} />;
  let cursor = 0;
  const gradient = items.map((item, index) => { const start = cursor; cursor += item.count / total * 100; return `${lossColors[index % lossColors.length]} ${start}% ${cursor}%`; }).join(", ");
  return <div className="xdd-donut-layout"><div className="xdd-donut" style={{ background: `conic-gradient(${gradient})` }} role="img" aria-label={items.map((item) => `${item.name}: ${item.count}`).join(", ")}><div><strong>{total}</strong><span>COM MOTIVO</span></div></div><div className="xdd-legend">{items.slice(0, 6).map((item, index) => <div key={item.name}><i style={{ background: lossColors[index % lossColors.length] }} /><span>{item.name}</span><strong>{item.count}</strong></div>)}{missing ? <small>{missing} sem motivo padronizado</small> : null}</div></div>;
}

function CrmSection({ data }: { data: CrmData }) {
  const max = Math.max(1, ...data.trend.flatMap((item) => [item.won, item.lost]));
  return <div className="xdd-content"><div className="xdd-metrics xdd-metrics--five"><Metric label="LEADS" value={number(data.metrics.leads)} note="Agendamentos e contatos do período" /><Metric label="EM ABERTO" value={number(data.metrics.open)} note="Desta seleção, ainda no funil" tone="blue" /><Metric label="GANHOS" value={number(data.metrics.won)} note="Desta seleção, etapa atual" tone="green" /><Metric label="PERDIDOS" value={number(data.metrics.lost)} note="Desta seleção, etapa atual" tone="red" /><Metric label="CONVERSÃO" value={number(data.metrics.conversion, "%")} note="Ganhos ÷ leads da seleção" tone="orange" /></div>
    <div className="xdd-grid xdd-grid--wide-left"><Panel eyebrow="AGENDA SOCIAL" title="Próximos 10 aniversários" aside="ALUNOS CADASTRADOS">{data.birthdays.length ? <div className="xdd-birthdays">{data.birthdays.map((person, index) => <article key={person.id}><b>{String(index + 1).padStart(2, "0")}</b><span><strong>{person.name}</strong><small>FAZ {person.age} ANOS</small></span><time>{date(person.on)}</time></article>)}</div> : <Empty title="SEM ANIVERSÁRIOS PARA MOSTRAR" detail="Cadastre os alunos com data de nascimento em Clientes para preencher esta lista." />}</Panel>
      <Panel eyebrow="MOVIMENTO DO FUNIL" title="Ganhos e perdas" aside="COORTES POR MÊS"><div className="xdd-bars">{data.trend.map((item) => <div className="xdd-bar-group" key={item.month}><div className="xdd-bar-pair"><i className="xdd-bar-win" style={{ height: `${item.won ? Math.max(2, item.won / max * 100) : 0}%` }} title={`${item.won} ganhos`} /><i className="xdd-bar-loss" style={{ height: `${item.lost ? Math.max(2, item.lost / max * 100) : 0}%` }} title={`${item.lost} perdas`} /></div><b>{monthLabel(item.month)}</b></div>)}</div><div className="xdd-chart-legend"><span><i className="is-green" /> GANHOS</span><span><i className="is-red" /> PERDAS</span></div></Panel></div>
    <div className="xdd-grid"><Panel eyebrow="ORIGEM" title="Como conheceu a escola" aside="AGENDAMENTO"><Donut items={data.sources} missing={data.sourceMissing} emptyText={`${data.sourceMissing} leads sem origem registrada. A planilha antiga não trouxe este campo preenchido.`} /></Panel><Panel eyebrow="APRENDIZADO" title="Motivos de perda" aside="CRM"><LossDonut items={data.losses} missing={data.lossMissing} /></Panel></div>
    {data.imported ? <p className="xdd-method">{data.imported} leads importados foram posicionados pela data original do agendamento, não pela data da importação. A conversão mostra o estado atual dessa coorte e pode mudar depois.</p> : null}
  </div>;
}

function Sparkline({ values, tone = "violet" }: { values: Array<number | null>; tone?: "violet" | "green" | "red" }) {
  const points = values.map((value, index) => ({ value, x: 22 + index * (296 / Math.max(1, values.length - 1)) })).filter((point): point is { value: number; x: number } => typeof point.value === "number" && Number.isFinite(point.value));
  if (!points.length) return <Empty title="AINDA SEM SÉRIE HISTÓRICA" detail="Este gráfico ganhará forma quando os registros necessários estiverem disponíveis." />;
  const maximum = Math.max(1, ...points.map((point) => point.value));
  const coords = points.map((point) => `${point.x},${116 - point.value / maximum * 96}`).join(" ");
  return <svg className={`xdd-sparkline xdd-sparkline--${tone}`} viewBox="0 0 340 136" preserveAspectRatio="none" role="img" aria-label="Evolução mensal"><line x1="10" y1="116" x2="330" y2="116" /><polyline points={coords} />{points.map((point) => <circle key={point.x} cx={point.x} cy={116 - point.value / maximum * 96} r="3.8" />)}</svg>;
}

function ManagerSection({ data }: { data: ManagerData }) {
  const months = data.trend.map((item) => monthLabel(item.month));
  return <div className="xdd-content"><div className="xdd-metrics xdd-metrics--four"><Metric label="LT MÉDIO" value={number(data.metrics.ltMonths, " meses")} note="Clientes que saíram no período" /><Metric label="EVASÃO" value={number(data.metrics.churn, "%")} note="Saídas ÷ ativos no início do mês" tone="red" /><Metric label="CAC" value={money(data.metrics.cacCents)} note="Depende de gastos de aquisição" tone="orange" /><Metric label="RENOVAÇÃO" value={number(data.metrics.renewal, "%")} note="Depende de ciclos completos" tone="green" /></div>
    <Panel eyebrow="CICLO COMERCIAL" title="Vendas × receita mensal" aside="MÊS SELECIONADO + 3 ANTERIORES"><div className="xdd-dual-values"><div><span>VENDAS NO PERÍODO</span><strong>{money(data.metrics.salesCents)}</strong><small>{data.metrics.salesCount} contratos concluídos</small></div><div><span>TICKET MÉDIO</span><strong>{money(data.metrics.ticketCents)}</strong><small>Valor contratado por venda</small></div></div><div className="xdd-comparison">{data.trend.map((item) => <div key={item.month}><b>{monthLabel(item.month)}</b><span>Vendas <strong>{money(item.salesCents)}</strong></span><i className="xdd-sale-track"><em style={{ width: `${item.salesCents ? Math.max(3, item.salesCents / Math.max(1, ...data.trend.map((month) => month.salesCents ?? 0)) * 100) : 0}%` }} /></i><span>Receita mensalizada <strong>{money(item.revenueCents)}</strong></span><i className="xdd-revenue-track"><em style={{ width: `${item.revenueCents ? Math.max(3, item.revenueCents / Math.max(1, ...data.trend.map((month) => month.revenueCents ?? 0)) * 100) : 0}%` }} /></i></div>)}</div><p className="xdd-method">Venda considera o contrato inteiro. Receita aqui distribui a mensalidade contratual por competência; não significa que o dinheiro já entrou. {data.notes.sales}</p></Panel>
    <div className="xdd-grid xdd-grid--three"><Panel eyebrow="RETENÇÃO" title="LT por mês" aside={months.join(" · ")}><Sparkline values={data.trend.map((item) => item.ltMonths)} /></Panel><Panel eyebrow="VALOR" title="Ticket médio" aside={months.join(" · ")}><Sparkline values={data.trend.map((item) => item.ticketCents)} tone="green" /></Panel><Panel eyebrow="RETENÇÃO" title="Evasão" aside={months.join(" · ")}><Sparkline values={data.trend.map((item) => item.churn)} tone="red" /></Panel></div>
    <div className="xdd-grid"><Panel eyebrow="PORTFÓLIO" title="Contratos mais vendidos"><Donut items={data.plans} emptyText="As vendas concluídas da seleção aparecerão aqui, agrupadas por plano." /></Panel><Panel eyebrow="ENCERRAMENTOS" title="Motivo de encerramento"><Empty title="FALTA UM CADASTRO PADRONIZADO" detail="Hoje o encerramento guarda observação livre. Agrupar esse texto em uma rosca poderia misturar motivos diferentes e expor detalhes do cliente." /></Panel></div>
  </div>;
}

function OperationsSection({ data }: { data: OperationsData }) {
  return <div className="xdd-content"><div className="xdd-metrics xdd-metrics--four"><Metric label="OCUPAÇÃO DA GRADE" value={number(data.metrics.occupancy, "%")} note="Exige matrícula por horário" /><Metric label="TAXA DE RENOVAÇÃO" value={number(data.metrics.renewal, "%")} note="Ainda sem ciclos comparáveis" tone="green" /><Metric label="CLIENTES EM RISCO" value={number(data.metrics.atRisk)} note="Mais de 4 faltas de alunos" tone="red" /><Metric label="HORÁRIOS ATIVOS" value={number(data.metrics.activeSchedules)} note="Grade cadastrada agora" tone="blue" /></div>
    <div className="xdd-grid xdd-grid--wide-left"><Panel eyebrow="PRÓXIMOS 30 DIAS" title="Contratos a vencer">{data.expiring.length ? <div className="xdd-list">{data.expiring.map((contract) => <article key={contract.id}><span><strong>{contract.client}</strong><small>{contract.plan}{contract.automatic ? " · RENOVAÇÃO AUTOMÁTICA" : ""}</small></span><time>{date(contract.on)}</time></article>)}</div> : <Empty title="NENHUM CONTRATO NESTA JANELA" detail="Quando houver contratos com vencimento nos próximos 30 dias, os clientes aparecerão aqui." />}</Panel>
      <Panel eyebrow="GRADE ATIVA" title="Clientes por horário" aside={`${data.slots.length} HORÁRIOS`}><div className="xdd-slots">{data.slots.slice(0, 12).map((slot) => <article key={slot.id}><b>{weekdayNames[slot.weekday]}</b><span><strong>{slot.className}</strong><small>{slot.startsAt.slice(0, 5)} · {slot.room || "SALA NÃO INFORMADA"}</small></span><em>—</em></article>)}</div><p className="xdd-method">A matrícula atual aponta para a turma, não para o horário específico. Por isso não atribuí alunos a um horário sem comprovação.</p></Panel></div>
    <Panel eyebrow="PRESENÇA" title="Alunos com mais de 4 faltas"><Empty title="CHAMADA DE ALUNOS AINDA NÃO REGISTRADA" detail="A presença/falta disponível hoje é de aulas experimentais de leads. Usá-la para marcar alunos matriculados como em risco seria incorreto." /></Panel>
  </div>;
}

function RankedBars({ items, empty }: { items: Slice[]; empty: string }) {
  const max = Math.max(1, ...items.map((item) => item.count));
  return items.length ? <div className="xdd-ranked">{items.map((item) => <div key={item.name}><span>{item.name}</span><i><em style={{ width: `${item.count / max * 100}%` }} /></i><strong>{item.count}</strong></div>)}</div> : <Empty title="SEM DISTRIBUIÇÃO PARA MOSTRAR" detail={empty} />;
}

function ClientsSection({ data }: { data: ClientsData }) {
  return <div className="xdd-content"><div className="xdd-metrics xdd-metrics--five"><Metric label="CLIENTES ATIVOS" value={number(data.metrics.active)} note="Pessoas com contrato vigente" /><Metric label="NOVOS CLIENTES" value={number(data.metrics.new)} note="Primeira venda concluída no período" tone="green" /><Metric label="BLOQUEADOS" value={number(data.metrics.blocked)} note="Acesso bloqueado por inadimplência" tone="red" /><Metric label="SUSPENSOS" value={number(data.metrics.suspended)} note="Contratos pausados agora" tone="orange" /><Metric label="VIP" value={number(data.metrics.vip)} note="Benefício VIP ativo" tone="blue" /></div><div className="xdd-grid"><Panel eyebrow="PREFERÊNCIAS" title="Clientes por modalidade"><RankedBars items={data.modalities} empty="Cadastre contratos e turmas com modalidade para acompanhar esta distribuição." /></Panel><Panel eyebrow="COMUNIDADE" title="Faixa etária" aside="CLIENTES ATIVOS"><RankedBars items={data.ages} empty="As idades aparecerão quando os clientes ativos tiverem data de nascimento." />{data.ageMissing ? <p className="xdd-method">{data.ageMissing} clientes ativos sem data de nascimento.</p> : null}</Panel></div></div>;
}

function FinanceSection() { return <div className="xdd-finance-wait"><WalletCards size={34} /><span>FINANCEIRO</span><h2>Indicadores em preparação.</h2><p>Esta categoria fica vazia por enquanto, como combinado. O controle de contas a pagar e receber continua no módulo Financeiro.</p></div>; }

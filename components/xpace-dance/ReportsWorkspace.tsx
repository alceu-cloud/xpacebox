"use client";

import "./reports.css";

import { BarChart3, CalendarDays, CheckCheck, CircleAlert, GraduationCap, Package, RefreshCw, Target, TrendingUp, UsersRound, WalletCards, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { attendanceTone, modalityAction, professorAction, professorSample, rate, type TrialGroup, type TrialRecord, type TrialReport, type TrialStats } from "@/lib/xpace/report-metrics";
import type { HistoryMonth } from "@/lib/server/xpace-report-history";
import ConversionWorkspace from "./ConversionWorkspace";
import TeachingWorkspace from "./TeachingWorkspace";
import StockReportWorkspace from "./StockReportWorkspace";
import { dateInSaoPaulo } from "@/lib/xpace/dashboard-metrics";

type Section = "ACOES" | "COMPARECIMENTO" | "CONVERSAO" | "PROFESSORES" | "EXPERIMENTAIS" | "METAS" | "FINANCEIRO" | "ORIGEM" | "ESTOQUE" | "AULAS";
type SystemMonth = { month: string; future: boolean; partial: boolean; active: number | null; newClients: number | null; churn: number | null; salesCents: number | null; ticketCents: number | null; revenueCents: number | null };
type Payload = { success: true; from: string; to: string; today: string; report: Omit<TrialReport, "records">; history: Array<HistoryMonth & { fullMonth: boolean }>; systemMonths: SystemMonth[]; transition: boolean; historySource: { file: string; inspectedOn: string }; historySources: Array<{ name: string; count: number }>; historyDestinations: Array<{ name: string; count: number }> };
type DetailSelection = { group: "month" | "modality" | "instructor" | "all"; key: string; label: string };
type DetailPayload = { success: true; total: number; page: number; pages: number; items: Array<TrialRecord & { name: string }> };
const tabs: Array<{ id: Section; label: string; icon: typeof BarChart3 }> = [
  { id: "ACOES", label: "AÇÃO E CONVERSÃO", icon: Target },
  { id: "COMPARECIMENTO", label: "COMPARECIMENTO", icon: CheckCheck }, { id: "CONVERSAO", label: "CONVERSÃO", icon: TrendingUp },
  { id: "PROFESSORES", label: "PROFESSORES", icon: GraduationCap }, { id: "EXPERIMENTAIS", label: "EXPERIMENTAIS", icon: CalendarDays },
  { id: "METAS", label: "METAS E RETENÇÃO", icon: Target }, { id: "FINANCEIRO", label: "FINANCEIRO GERENCIAL", icon: WalletCards },
  { id: "ORIGEM", label: "ORIGEM E DESTINO", icon: UsersRound },
  { id: "AULAS", label: "AULAS E RESERVAS", icon: CalendarDays },
  { id: "ESTOQUE", label: "ESTOQUE · ENTRADAS E BAIXAS", icon: Package },
];
const green = "#25835a", red = "#be425b", violet = "#7134b2", amber = "#bd8421";
function fmt(value: number | null, suffix = "") { return value === null ? "—" : `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value)}${suffix}`; }
function money(value: number | null) { return value === null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value / 100); }
function month(value: string) { const label = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" }).format(new Date(`${value}-01T12:00:00Z`)).replace(".", ""); return `${label}/${value.slice(2, 4)}`; }
function day(value: string) { return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)); }
function kind(value: string) { return ({ NOVO: "Novo", REAGENDAMENTO: "Reagendado", RECUPERACAO: "Recuperado" } as Record<string, string>)[value] ?? value; }
function status(value: string) { return ({ COMPARECEU: "Compareceu", FALTOU: "Faltou", AGENDADO: "Agendado", NAO_INFORMADO: "Não informado", MATRICULOU: "Matriculou", NAO_MATRICULOU: "Não matriculou", PENDENTE: "Pendente" } as Record<string, string>)[value] ?? value; }

export default function ReportsWorkspace({ onOpenLead = () => {}, startWithActions = false }: { onOpenLead?: (id: string) => void; startWithActions?: boolean }) {
  const today = dateInSaoPaulo(new Date().toISOString());
  const year = today.slice(0, 4);
  const initialFrom = startWithActions ? `${today.slice(0,7)}-01` : `${year}-01-01`;
  const initialTo = startWithActions ? new Date(Date.UTC(Number(year),Number(today.slice(5,7)),0)).toISOString().slice(0,10) : `${year}-12-31`;
  const [section, setSection] = useState<Section>(startWithActions ? "ACOES" : "COMPARECIMENTO");
  const [from, setFrom] = useState(initialFrom); const [to, setTo] = useState(initialTo);
  const [period, setPeriod] = useState({ from: initialFrom, to: initialTo });
  const [payload, setPayload] = useState<Payload | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const [periodError, setPeriodError] = useState("");
  const [detail, setDetail] = useState<DetailSelection | null>(null); const [detailPage, setDetailPage] = useState(1);
  const [detailData, setDetailData] = useState<DetailPayload | null>(null); const [detailError, setDetailError] = useState(""); const [detailLoading, setDetailLoading] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null); const trigger = useRef<HTMLElement | null>(null);
  const refreshRequest = useRef<AbortController | null>(null);

  const request = useCallback(async (query: URLSearchParams, signal: AbortSignal) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Sua sessão expirou. Entre novamente para abrir os relatórios.");
    const response = await fetch(`/api/xpace/reports?${query}`, { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store", signal });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.success) throw new Error(data?.message ?? "Não foi possível carregar os relatórios.");
    return data;
  }, []);
  const load = useCallback(async (signal: AbortSignal) => {
    setLoading(true); setError("");
    try { const data = await request(new URLSearchParams(period), signal); if (!signal.aborted) setPayload(data); }
    catch (cause) { if (!signal.aborted) setError(cause instanceof Error ? cause.message : "Falha no carregamento."); }
    finally { if (!signal.aborted) setLoading(false); }
  }, [period, request]);
  const separateReport = section === "ACOES" || section === "ESTOQUE" || section === "AULAS";
  useEffect(() => { if (separateReport) return; const controller = new AbortController(); setPayload(null); void load(controller.signal); return () => controller.abort(); }, [load, separateReport]);
  useEffect(() => () => refreshRequest.current?.abort(), []);
  function refresh() { refreshRequest.current?.abort(); const controller = new AbortController(); refreshRequest.current = controller; void load(controller.signal); }
  function openDetail(selection: DetailSelection) { trigger.current = document.activeElement as HTMLElement; setDetailPage(1); setDetail(selection); }
  useEffect(() => {
    if (!detail) { if (dialog.current?.open) dialog.current.close(); trigger.current?.focus(); return; }
    if (!dialog.current?.open) dialog.current?.showModal();
    const controller = new AbortController(); setDetailData(null); setDetailLoading(true); setDetailError("");
    void request(new URLSearchParams({ ...period, detail: "1", group: detail.group, key: detail.key, page: String(detailPage) }), controller.signal)
      .then((data) => { if (!controller.signal.aborted) setDetailData(data); })
      .catch((cause) => { if (!controller.signal.aborted) setDetailError(cause instanceof Error ? cause.message : "Falha ao abrir os registros."); })
      .finally(() => { if (!controller.signal.aborted) setDetailLoading(false); });
    return () => controller.abort();
  }, [detail, detailPage, period, request]);
  const report = payload?.report;

  return <section className="xdd-workspace xpr-workspace">
    <header className="xdd-heading"><div><span>ACOMPANHAMENTO · XPACE</span><h1>Relatórios<span>.</span></h1><p>Entenda os números, investigue os resultados e planeje suas ações.</p></div>{!separateReport ? <button type="button" className="xdd-refresh" disabled={loading} onClick={refresh} aria-label="Atualizar relatórios"><RefreshCw size={16} aria-hidden="true" /> Atualizar</button> : null}</header>
    {section !== 'AULAS' ? <form className="xdd-period" onSubmit={(event) => { event.preventDefault(); if (from > to) { setPeriodError("A data inicial deve ser anterior à final."); return; } setPeriodError(""); refreshRequest.current?.abort(); setDetail(null); setPeriod({ from, to }); }}>
      <div><CalendarDays size={18} aria-hidden="true" /><span>PERÍODO DE ANÁLISE</span></div><label>DE<input type="date" required value={from} onChange={(e) => setFrom(e.target.value)} /></label><label>ATÉ<input type="date" required value={to} onChange={(e) => setTo(e.target.value)} /></label><button type="submit">APLICAR</button><small>{section === "ESTOQUE" ? "Movimentações usam a data do lançamento, no horário de Brasília." : "Experimentais usam a data da aula. Histórico manual permanece identificado."}</small>
    </form> : null}
    <nav className="xdd-tabs xpr-tabs" aria-label="Áreas dos relatórios">{tabs.map(({ id, label, icon: Icon }) => <button type="button" key={id} aria-pressed={section === id} className={section === id ? "is-active" : ""} onClick={() => setSection(id)}><Icon size={17} aria-hidden="true" />{label}</button>)}</nav>
    {periodError ? <p className="xdd-alert" role="alert">{periodError}</p> : null}
    {section === "ACOES" ? <ConversionWorkspace from={period.from} to={period.to} onOpenLead={onOpenLead} /> : null}
    {section === "AULAS" ? <TeachingWorkspace reportOnly /> : null}{section === "ESTOQUE" ? <StockReportWorkspace from={period.from} to={period.to} /> : null}
    {!separateReport && error ? <div className="xdd-alert" role="alert"><CircleAlert size={18} aria-hidden="true" />{error}<button type="button" onClick={refresh}>Tentar novamente</button></div> : null}
    {!separateReport && loading ? <div className="xdd-loading" role="status">CARREGANDO RELATÓRIOS...</div> : null}
    {!separateReport && !loading && !error && report && payload ? <div className="xdd-content">
      <p className="xpr-context">{report.imported} agendamentos históricos + {report.stats.appointments - report.imported} do sistema nesta seleção. {report.cancelled ? `${report.cancelled} cancelados fora das taxas.` : "Cancelados não entram nas taxas."}{payload.transition ? " Setembro/2026: mês de transição; todos os registros disponíveis entram normalmente." : ""}</p>
      {section === "COMPARECIMENTO" ? <Attendance report={report} onDetail={openDetail} /> : null}
      {section === "CONVERSAO" ? <Conversion report={report} onDetail={openDetail} /> : null}
      {section === "PROFESSORES" ? <Professors report={report} onDetail={openDetail} /> : null}
      {section === "EXPERIMENTAIS" ? <Volume report={report} /> : null}
      {section === "METAS" ? <Goals data={payload} /> : null}
      {section === "FINANCEIRO" ? <Finance data={payload} /> : null}
      {section === "ORIGEM" ? <Origins data={payload} /> : null}
    </div> : null}
    <dialog ref={dialog} className="xpr-dialog" aria-labelledby="xpr-detail-title" onClose={() => setDetail(null)}>
      <header><div><span>REGISTROS QUE FORMAM O RESULTADO</span><h2 id="xpr-detail-title">{detail?.label}</h2><p>{detailData ? `${detailData.total} agendamentos · ${day(period.from)} a ${day(period.to)}` : "Consultando registros..."}</p></div><button type="button" autoFocus aria-label="Fechar registros" onClick={() => dialog.current?.close()}><X size={20} aria-hidden="true" /></button></header>
      {detailLoading ? <p role="status">Carregando registros...</p> : null}{detailError ? <p role="alert">{detailError}</p> : null}
      {detailData ? <><Table headers={["Aluno", "Aula / professor", "Data", "Presença", "Matrícula", "Origem"]}>{detailData.items.map((r) => <tr key={r.id}><th scope="row">{r.name}</th><td>{r.modality || "Sem modalidade"}<small>{r.instructor || "Sem professor"}</small></td><td>{day(r.on)}<small>{r.startsAt?.slice(0, 5) ?? "Horário não informado"}</small></td><td><span className={`xpr-tag ${r.attendance === "COMPARECEU" ? "is-green" : r.attendance === "FALTOU" ? "is-red" : "is-amber"}`}>{status(r.attendance)}</span></td><td>{status(r.enrollment)}</td><td>{r.legacy ? "Excel" : "XPACEBOX"}</td></tr>)}</Table><div className="xpr-pagination"><button type="button" disabled={detailData.page <= 1} onClick={() => setDetailPage((n) => n - 1)}>Anterior</button><span>Página {detailData.page} de {detailData.pages}</span><button type="button" disabled={detailData.page >= detailData.pages} onClick={() => setDetailPage((n) => n + 1)}>Próxima</button></div></> : null}
    </dialog>
  </section>;
}

function Panel({ title, note, children }: { title: string; note: string; children: React.ReactNode }) { return <section className="xdd-panel xpr-panel"><header><div><h2>{title}</h2><p>{note}</p></div></header>{children}</section>; }
function Metric({ label, value, note, tone = "violet" }: { label: string; value: string; note: string; tone?: string }) { return <article className={`xdd-metric xdd-metric--${tone}`}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>; }
function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) { return <div className="xpr-table-scroll" tabIndex={0} aria-label="Tabela de resultados, rolável horizontalmente"><table className="xpr-table"><thead><tr>{headers.map((h) => <th scope="col" key={h}>{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div>; }
function Ratio({ part, total, tone }: { part: number; total: number; tone?: string }) { return <span className={`xpr-ratio ${tone ? `is-${tone}` : ""}`}><strong>{fmt(rate(part, total), "%")}</strong><small>{part} de {total}</small></span>; }
function Notes({ children }: { children: React.ReactNode }) { return <div className="xpr-notes">{children}</div>; }
type ChartSeries = { label: string; color: string; values: Array<number | null>; line?: boolean };
function Chart({ labels, series, unit = "count" }: { labels: string[]; series: ChartSeries[]; unit?: "count" | "percent" | "money" }) {
  const hasValues = series.some((s) => s.values.some((v) => v !== null));
  if (!labels.length || !hasValues) return <p className="xpr-empty">Sem informação suficiente nesta seleção. Ausência de dados não significa resultado zero.</p>;
  const valueLabel = (value: number) => unit === "money" ? money(value) : fmt(value, unit === "percent" ? "%" : "");
  const bars = series.filter((s) => !s.line);
  const labelWidth = Math.max(20, ...bars.flatMap((s) => s.values.filter((v) => v !== null).map((v) => valueLabel(v!).length * 7)));
  const barWidth = labelWidth + 12;
  const width = Math.max(660, 75 + labels.length * Math.max(52, bars.length * barWidth + 22));
  const chartHeight = 145; const step = (width - 75) / labels.length;
  const maximum = Math.max(unit === "percent" ? 100 : 1, ...series.flatMap((s) => s.values.map((v) => v ?? 0)));
  const y = (v: number) => 175 - v / maximum * chartHeight;
  const describe = series.map((s) => `${s.label}: ${s.values.map((v, i) => `${labels[i]} ${v === null ? "sem dados" : unit === "money" ? money(v) : fmt(v, unit === "percent" ? "%" : "")}`).join(", ")}`).join(". ");
  return <><div className="xpr-chart-scroll" tabIndex={0} aria-label="Gráfico com rolagem horizontal"><svg viewBox={`0 0 ${width} 222`} role="img" aria-label={describe} className="xpr-chart" style={{ minWidth: width }}>
    {[0, .5, 1].map((fraction) => <g key={fraction}><line x1="55" x2={width - 10} y1={y(maximum * fraction)} y2={y(maximum * fraction)} stroke="#e8dfef" /><text x="48" y={y(maximum * fraction) + 4} textAnchor="end">{unit === "money" ? fmt(Math.round(maximum * fraction / 100)) : fmt(Math.round(maximum * fraction), unit === "percent" ? "%" : "")}</text></g>)}
    {bars.map((s, si) => s.values.map((v, i) => {
      if (v === null) return null;
      const x = 55 + step * (i + .5) + (si - bars.length / 2) * barWidth;
      const height = Math.max(0, 175 - y(v)); const inside = height >= 26;
      // White is readable on the dark series; amber needs dark text for sufficient contrast.
      const ink = inside ? s.color === amber ? "#352145" : "#ffffff" : "#40304c";
      return <g key={`${s.label}:${i}`} className="xpr-bar" data-value={v}>
        <rect x={x} y={y(v)} width={barWidth - 4} height={height} rx="3" fill={s.color}><title>{labels[i]} · {s.label}: {valueLabel(v)}</title></rect>
        <text className="xpr-bar-value" x={x + (barWidth - 4) / 2} y={inside ? y(v) + 17 : y(v) - 7} textAnchor="middle" style={{ "--xpr-label-ink": ink } as React.CSSProperties} data-placement={inside ? "inside" : "above"}>{valueLabel(v)}</text>
      </g>;
    }))}
    {series.filter((s) => s.line).map((s) => {
      const runs: string[][] = [[]];
      s.values.forEach((v, i) => { if (v === null) { if (runs.at(-1)!.length) runs.push([]); } else runs.at(-1)!.push(`${55 + step * (i + .5)},${y(v)}`); });
      return <g key={s.label}>{runs.filter((r) => r.length > 1).map((r, i) => <polyline key={i} points={r.join(" ")} fill="none" stroke={s.color} strokeWidth="2.5" />)}{s.values.map((v, i) => v === null ? null : <circle key={i} cx={55 + step * (i + .5)} cy={y(v)} r="3" fill={s.color}><title>{labels[i]} · {s.label}: {fmt(v)}</title></circle>)}</g>;
    })}
    {labels.map((label, i) => <text key={`${label}:${i}`} x={55 + step * (i + .5)} y="201" textAnchor="middle">{label}</text>)}
  </svg></div><small className="xpr-chart-hint">Se o gráfico não couber inteiro, deslize horizontalmente para ver os demais meses ou semanas.</small><div className="xpr-legend">{series.map((s) => <span key={s.label}><i style={{ background: s.color }} />{s.label}</span>)}{unit === "money" ? <span>Eixo em R$</span> : null}</div></>;
}
type Summary = Omit<TrialReport, "records">;
function Attendance({ report: r, onDetail }: { report: Summary; onDetail: (s: DetailSelection) => void }) {
  return <><div className="xdd-metrics xdd-metrics--four"><Metric label="AGENDAMENTOS" value={fmt(r.stats.appointments)} note={`${r.stats.leads} leads/clientes identificados; não é contagem de pessoas por nome`} /><Metric label="COMPARECERAM" value={fmt(r.stats.attended)} tone="green" note="Presença registrada" /><Metric label="FALTARAM" value={fmt(r.stats.absent)} tone="red" note="Falta registrada" /><Metric label="SEM RESULTADO DE PRESENÇA" value={fmt(r.stats.pendingAttendance)} tone="orange" note="Agendados ou não informados; não tratados como falta aqui" /></div>
    <Panel title="Comparecimento por mês" note="Como no Excel: presentes ÷ todos os agendamentos não cancelados. A taxa só dos resultados preenchidos aparece separada.">
      <Chart labels={r.months.map((m) => month(m.key))} series={[{ label: "Compareceram", color: green, values: r.months.map((m) => m.stats.appointments ? m.stats.attended : null) }, { label: "Faltaram", color: red, values: r.months.map((m) => m.stats.appointments ? m.stats.absent : null) }, { label: "Sem resultado", color: amber, values: r.months.map((m) => m.stats.appointments ? m.stats.pendingAttendance : null) }]} />
      <Table headers={["Mês", "Agendamentos", "Presentes", "Faltas", "Sem resultado", "Comparecimento / total", "Só resultados preenchidos", "Registros"]}>{r.months.map((m) => <tr key={m.key}><th scope="row">{month(m.key)}</th><td>{m.stats.appointments || "—"}</td><td>{m.stats.appointments ? m.stats.attended : "—"}</td><td>{m.stats.appointments ? m.stats.absent : "—"}</td><td>{m.stats.appointments ? m.stats.pendingAttendance : "—"}</td><td><Ratio part={m.stats.attended} total={m.stats.appointments} tone={attendanceTone(m.stats.attendanceRate)} /></td><td><Ratio part={m.stats.attended} total={m.stats.attended + m.stats.absent} /></td><td><button type="button" disabled={!m.stats.appointments} onClick={() => onDetail({ group: "month", key: m.key, label: month(m.key) })}>Ver registros</button></td></tr>)}</Table>
    </Panel>
    <Panel title="Comparecimento por modalidade" note="Mantém os nomes históricos; turmas de sábado, semana e níveis não são unificadas automaticamente."><AttendanceGroups groups={r.modalities} group="modality" onDetail={onDetail} /></Panel>
    <Panel title="Comparecimento por tipo" note="Usa o tipo registrado no agendamento, sem reinterpretar Novo, Reagendado ou Recuperado."><AttendanceGroups groups={r.kinds.map((g) => ({ ...g, label: kind(g.key) }))} /></Panel>
    <Notes><p>Faixas da planilha: menos de 55% = atenção; 55% a menos de 60% = acompanhar; a partir de 60% = meta alcançada. Sem base = sem classificação.</p>{r.monthDifferences.length ? <p>{r.monthDifferences.length} registro(s) têm mês textual histórico diferente da data. A apuração usa a data da aula, sem alterar o cadastro. {r.monthDifferences.slice(0, 3).map((d) => `${day(d.on)}: mês salvo “${d.savedMonth}”`).join("; ")}.</p> : null}<p>A importação original mantém uma linha por agendamento. Não unimos pessoas apenas pelo nome, pois existem homônimos e nomes incompletos.</p></Notes>
  </>;
}
function AttendanceGroups({ groups, group, onDetail }: { groups: TrialGroup[]; group?: "modality"; onDetail?: (s: DetailSelection) => void }) {
  return <Table headers={["Grupo", "Agendamentos", "Presentes", "Faltas", "Sem resultado", "Comparecimento", ...(onDetail ? ["Registros"] : [])]}>{groups.map((g) => <tr key={g.key}><th scope="row">{g.label}</th><td>{g.stats.appointments}</td><td>{g.stats.attended}</td><td>{g.stats.absent}</td><td>{g.stats.pendingAttendance}</td><td><Ratio part={g.stats.attended} total={g.stats.appointments} tone={attendanceTone(g.stats.attendanceRate)} /></td>{onDetail && group ? <td><button type="button" onClick={() => onDetail({ group, key: g.key, label: g.label })}>Ver registros</button></td> : null}</tr>)}</Table>;
}
function Conversion({ report: r, onDetail }: { report: Summary; onDetail: (s: DetailSelection) => void }) {
  return <><div className="xdd-metrics xdd-metrics--four"><Metric label="MATRÍCULAS REGISTRADAS" value={fmt(r.stats.enrolled)} note="Resultado Matriculou no agendamento; não é quantidade de contratos vendidos" tone="green" /><Metric label="CONVERSÃO GERAL" value={fmt(r.stats.conversionRate, "%")} note={`${r.stats.enrolled} de ${r.stats.enrolled + r.stats.notEnrolled} resultados preenchidos`} /><Metric label="CONVERSÃO DOS PRESENTES" value={fmt(r.stats.attendedConversionRate, "%")} note={`${r.stats.attendedEnrolled} de ${r.stats.attendedKnown} presentes com matrícula preenchida`} /><Metric label="MATRÍCULA NÃO INFORMADA" value={fmt(r.stats.pendingEnrollment)} tone="orange" note={`${r.stats.attendedPending} dessas pendências são de quem compareceu`} /></div>
    <Panel title="Conversão mensal" note="Vazios e pendentes ficam fora das taxas de conversão geral e dos presentes. A contagem de pendências continua visível."><Chart unit="percent" labels={r.months.map((m) => month(m.key))} series={[{ label: "Geral · resultados preenchidos", color: violet, values: r.months.map((m) => m.stats.conversionRate) }, { label: "Presentes · resultados preenchidos", color: green, values: r.months.map((m) => m.stats.attendedConversionRate) }]} /><Table headers={["Mês", "Matriculou", "Não matriculou", "Sem resultado", "Conversão geral", "Conversão dos presentes", "Registros"]}>{r.months.map((m) => <tr key={m.key}><th scope="row">{month(m.key)}</th><td>{m.stats.appointments ? m.stats.enrolled : "—"}</td><td>{m.stats.appointments ? m.stats.notEnrolled : "—"}</td><td>{m.stats.appointments ? m.stats.pendingEnrollment : "—"}</td><td><Ratio part={m.stats.enrolled} total={m.stats.enrolled + m.stats.notEnrolled} /></td><td><Ratio part={m.stats.attendedEnrolled} total={m.stats.attendedKnown} /></td><td><button type="button" disabled={!m.stats.appointments} onClick={() => onDetail({ group: "month", key: m.key, label: month(m.key) })}>Ver registros</button></td></tr>)}</Table></Panel>
    <Panel title="Conversão por modalidade" note="Compatibilidade com esta aba do Excel: matrículas registradas ÷ todos os presentes, inclusive os que ainda não têm resultado de matrícula."><Table headers={["Modalidade", "Presentes", "Matriculou", "Presentes sem resultado", "Conversão · regra Excel", "Ação sugerida", "Registros"]}>{r.modalities.map((g) => <tr key={g.key}><th scope="row">{g.label}</th><td>{g.stats.attended}</td><td>{g.stats.enrolled}</td><td>{g.stats.attendedPending}</td><td><Ratio part={g.stats.enrolled} total={g.stats.attended} tone={g.stats.attended < 10 || g.stats.modalityConversionRate === null ? "neutral" : g.stats.modalityConversionRate >= 50 ? "green" : g.stats.modalityConversionRate >= 44 ? "amber" : "red"} /></td><td>{modalityAction(g.stats)}</td><td><button type="button" onClick={() => onDetail({ group: "modality", key: g.key, label: g.label })}>Ver registros</button></td></tr>)}</Table></Panel>
    <Notes><p>Modalidades com menos de 10 presentes: coletar dados. A partir de 10, conversão de 50% ou mais: avaliar investimento; abaixo disso: melhorar. Antes de investir, confira vagas, custos e capacidade da turma.</p><p>{r.stats.enrollmentWithoutAttendance} matrícula(s) estão sem presença registrada como Compareceu; entram na conversão geral e na regra histórica por modalidade, mas não na conversão dos presentes.</p><p>Não transferimos a matrícula para outro professor/modalidade automaticamente. O resultado continua no agendamento em que foi registrado. Duas marcações no mesmo lead podem contar duas vezes neste relatório por aulas; o dashboard conta leads ganhos e usa outra base.</p></Notes>
  </>;
}
function Professors({ report: r, onDetail }: { report: Summary; onDetail: (s: DetailSelection) => void }) {
  return <><Panel title="Conversão por professor" note="Somente quem compareceu e tem Matriculou ou Não matriculou preenchido entra na base. Professor real da aula tem prioridade sobre o previsto."><div className="xpr-rate-bars" aria-label="Conversão dos presentes por professor">{r.instructors.map((g) => <div key={g.key}><span>{g.label}</span><div className="xpr-rate-track" aria-hidden="true"><i style={{ width: `${Math.min(100, g.stats.attendedConversionRate ?? 0)}%`, background: g.stats.attendedKnown < 5 ? amber : green }} /></div><strong>{fmt(g.stats.attendedConversionRate, "%")}<small>{g.stats.attendedEnrolled} de {g.stats.attendedKnown}</small></strong></div>)}</div><Table headers={["Professor", "Presentes com resultado", "Matriculados", "Presentes sem resultado", "Conversão", "Amostra", "Ação sugerida", "Registros"]}>{r.instructors.map((g) => <tr key={g.key}><th scope="row">{g.label}</th><td>{g.stats.attendedKnown}</td><td>{g.stats.attendedEnrolled}</td><td>{g.stats.attendedPending}</td><td><Ratio part={g.stats.attendedEnrolled} total={g.stats.attendedKnown} tone={g.stats.attendedKnown < 5 || g.stats.attendedConversionRate === null ? "neutral" : g.stats.attendedConversionRate >= 50 ? "green" : g.stats.attendedConversionRate >= 35 ? "amber" : "red"} /></td><td>{professorSample(g.stats.attendedKnown)}</td><td>{g.key === "SEM PROFESSOR" ? "Completar o cadastro" : professorAction(g.stats)}</td><td><button type="button" onClick={() => onDetail({ group: "instructor", key: g.key, label: g.label })}>Ver registros</button></td></tr>)}</Table></Panel>
    <Panel title="Presença e matrícula por professor" note="A tabela distingue procura, comparecimento e fechamento; o título antigo ‘Experimental por professor’ não diferenciava esses resultados."><Table headers={["Professor", "Agendamentos", "Presentes", "Faltas", "Matriculados entre presentes", "Não matriculados entre presentes", "Pendentes entre presentes"]}>{r.instructors.map((g) => <tr key={g.key}><th scope="row">{g.label}</th><td>{g.stats.appointments}</td><td>{g.stats.attended}</td><td>{g.stats.absent}</td><td>{g.stats.attendedEnrolled}</td><td>{g.stats.attendedKnown - g.stats.attendedEnrolled}</td><td>{g.stats.attendedPending}</td></tr>)}</Table></Panel>
    <Notes><p>Amostra: baixa = menos de 5; média = 5 a 9; alta = 10 ou mais. Com amostra baixa, nenhuma taxa justifica uma avaliação definitiva do professor. Entre as amostras suficientes, as ações usam cortes de 35% e 50%, como no Excel.</p><p>O resultado também depende da modalidade, horário, preço e atendimento comercial. A taxa não prova que o professor causou a matrícula ou a perda.</p></Notes>
  </>;
}
function Volume({ report: r }: { report: Summary }) {
  const kinds = r.kinds.map((k) => k.key);
  return <><Panel title="Número de experimentais por mês" note="Contagem de agendamentos, não de pessoas únicas. Total geral fica fora das barras mensais."><Chart labels={r.months.map((m) => month(m.key))} series={[{ label: "Agendamentos", color: violet, values: r.months.map((m) => m.stats.appointments || null) }]} /></Panel>
    <Panel title="Presença por tipo de agendamento" note="Como nos gráficos Novo e Reagendado da planilha, só Compareceu e Faltou entram na porcentagem; agendamentos sem resultado ficam fora."><Chart unit="percent" labels={r.months.map((m) => month(m.key))} series={kinds.map((k, i) => ({ label: kind(k), color: [violet, green, amber][i % 3], values: r.months.map((m) => r.kindsByMonth.find((g) => g.label === m.key && g.kind === k)?.stats.resolvedAttendanceRate ?? null) }))} /><Table headers={["Mês", "Tipo", "Compareceu", "Faltou", "Sem resultado", "Comparecimento · preenchidos"]}>{r.kindsByMonth.filter((g) => g.stats.appointments).map((g) => <tr key={g.key}><th scope="row">{month(g.label)}</th><td>{kind(g.kind)}</td><td>{g.stats.attended}</td><td>{g.stats.absent}</td><td>{g.stats.pendingAttendance}</td><td><Ratio part={g.stats.attended} total={g.stats.attended + g.stats.absent} /></td></tr>)}</Table></Panel>
    <Panel title="Acompanhamento semanal" note="Semanas de domingo a sábado, como WEEKNUM padrão do Excel. Semana que cruza dois meses aparece uma única vez, pela data de início."><Chart labels={r.weeks.map((g) => day(g.key).slice(0, 5))} series={[{ label: "Agendamentos na semana", color: violet, values: r.weeks.map((g) => g.stats.appointments) }, { label: "Presentes", color: green, values: r.weeks.map((g) => g.stats.attended) }]} /><Table headers={["Semana iniciada em", "Agendamentos", "Presentes", "Faltas", "Matriculou", "Sem resultado de matrícula"]}>{r.weeks.map((g) => <tr key={g.key}><th scope="row">{day(g.key)}</th><td>{g.stats.appointments}</td><td>{g.stats.attended}</td><td>{g.stats.absent}</td><td>{g.stats.enrolled}</td><td>{g.stats.pendingEnrollment}</td></tr>)}</Table></Panel></>;
}
function ManualNote({ data }: { data: Payload }) { return <Notes><p>Fonte: {data.historySource.file}, leitura de {day(data.historySource.inspectedOn)}. Valores mensais preenchidos manualmente, sem criar contratos ou cobranças. Um traço significa informação ausente, não zero.</p><p>Os valores históricos cobrem o mês inteiro. Seleções parciais não recalculam esses valores; ficam identificadas na tabela.</p></Notes>; }
function Goals({ data }: { data: Payload }) {
  const h = data.history;
  return <><ManualNote data={data} /><div className="xdd-grid"><Panel title="Clientes novos · histórico e meta" note="Regra escrita na planilha: não contar duplo, VIP ou Cia."><Chart labels={h.map((v) => month(v.month))} series={[{ label: "Clientes novos · Excel", color: green, values: h.map((v) => v.newClients) }, { label: "Meta histórica", color: violet, values: h.map((v) => v.newGoal), line: true }]} /></Panel><Panel title="Evasão · histórico e meta" note="Meta de 5%. A planilha exclui Wellhub/TotalPass, troca de aula, VIP e nomes duplicados."><Chart unit="percent" labels={h.map((v) => month(v.month))} series={[{ label: "Evasão · Excel", color: red, values: h.map((v) => v.churn) }, { label: "Limite histórico", color: violet, values: h.map((v) => v.churnGoal), line: true }]} /></Panel></div>
    <Panel title="Clientes ativos · histórico e meta" note="Mantém a meta específica de cada mês da planilha."><Chart labels={h.map((v) => month(v.month))} series={[{ label: "Ativos · Excel", color: violet, values: h.map((v) => v.active) }, { label: "Meta histórica", color: green, values: h.map((v) => v.activeGoal), line: true }]} /><Table headers={["Mês", "Ativos", "Meta ativos", "Novos", "Meta novos", "Evasão", "Limite evasão", "Período"]}>{h.map((v) => <tr key={v.month}><th scope="row">{month(v.month)}</th><td>{fmt(v.active)}</td><td>{v.activeGoal}</td><td>{fmt(v.newClients)}</td><td>{v.newGoal}</td><td>{fmt(v.churn, "%")}</td><td>{fmt(v.churnGoal, "%")}</td><td>{v.fullMonth ? "Mês completo" : "Histórico mensal; filtro parcial"}</td></tr>)}</Table></Panel>
    <Panel title="Acompanhamento pelo XPACEBOX" note="Série independente do histórico: clientes únicos com venda concluída. Ativos no fim do mês ou na data de hoje; novos pela primeira venda efetivada. Benefícios não são excluídos automaticamente nesta série."><Table headers={["Mês", "Ativos identificados", "Novos identificados", "Evasão calculada", "Apuração"]}>{data.systemMonths.filter((v) => v.month >= "2026-09").map((v) => <tr key={v.month}><th scope="row">{month(v.month)}</th><td>{fmt(v.active)}</td><td>{fmt(v.newClients)}</td><td>{fmt(v.churn, "%")}</td><td>{v.future ? "Ainda não iniciado" : v.partial ? "Parcial até a data disponível" : "Mês completo"}</td></tr>)}</Table><p className="xpr-explanation">Não somamos os ativos de meses diferentes. Histórico manual e sistema não são emendados como se tivessem critérios idênticos; exclusões de benefícios e regras de encerramento ainda precisam de confirmação. Pausas históricas não podem ser reconstruídas apenas pelo status atual do contrato.</p></Panel>
  </>;
}
function Finance({ data }: { data: Payload }) {
  const h = data.history;
  return <><ManualNote data={data} /><div className="xdd-grid"><Panel title="Faturamento × ponto de equilíbrio · Excel" note="Referência mensal de R$ 24.000 registrada na planilha. Não é um cálculo novo de custos nem confirmação de dinheiro recebido."><Chart unit="money" labels={h.map((v) => month(v.month))} series={[{ label: "Faturamento histórico", color: violet, values: h.map((v) => v.revenueCents) }, { label: "Ponto de equilíbrio histórico", color: green, values: h.map((v) => v.equilibriumCents), line: true }]} /></Panel><Panel title="Ticket médio × meta · Excel" note="Meta histórica de R$ 190. A definição do ticket antigo ainda não foi confirmada; não misturamos com o ticket contratual das vendas."><Chart unit="money" labels={h.map((v) => month(v.month))} series={[{ label: "Ticket histórico", color: violet, values: h.map((v) => v.ticketCents), line: true }, { label: "Meta histórica", color: green, values: h.map((v) => v.ticketGoalCents), line: true }]} /></Panel></div>
    <Panel title="Valores financeiros históricos" note="A diferença para o equilíbrio usa apenas o valor anotado no Excel. Não representa lucro líquido."><Table headers={["Mês", "Faturamento Excel", "Equilíbrio", "Diferença", "Ticket Excel", "Meta ticket", "Período"]}>{h.map((v) => <tr key={v.month}><th scope="row">{month(v.month)}</th><td>{money(v.revenueCents)}</td><td>{money(v.equilibriumCents)}</td><td>{money(v.revenueCents === null ? null : v.revenueCents - v.equilibriumCents)}</td><td>{money(v.ticketCents)}</td><td>{money(v.ticketGoalCents)}</td><td>{v.fullMonth ? "Mês completo" : "Histórico mensal; filtro parcial"}</td></tr>)}</Table></Panel>
    <Panel title="Valores contratuais do XPACEBOX" note="Venda = valor contratual integral estimado; receita mensalizada = mensalidade por competência; ticket = valor por venda. Nenhum desses valores confirma recebimento em caixa."><Table headers={["Mês", "Vendas contratuais", "Receita mensalizada estimada", "Ticket por venda", "Apuração"]}>{data.systemMonths.filter((v) => v.month >= "2026-09").map((v) => <tr key={v.month}><th scope="row">{month(v.month)}</th><td>{money(v.salesCents)}</td><td>{money(v.revenueCents)}</td><td>{money(v.ticketCents)}</td><td>{v.future ? "Ainda não iniciado" : v.partial ? "Parcial · receita estimada do mês inteiro" : "Mês completo"}</td></tr>)}</Table><p className="xpr-explanation">Valores do NextFit não foram importados como cobranças. Os contratos podem sofrer cancelamentos ou atualização de preço; não use esta estimativa como conciliação bancária. Para unificar os gráficos históricos com a nova série, falta confirmar o conceito de faturamento e ticket do Excel.</p></Panel>
  </>;
}
function Origins({ data }: { data: Payload }) {
  const table = (items: Array<{ name: string; count: number }>) => { const total = items.reduce((sum, i) => sum + i.count, 0); return <Table headers={["Categoria", "Quantidade", "Percentual"]}>{items.map((i) => <tr key={i.name}><th scope="row">{i.name}</th><td>{i.count}</td><td>{fmt(rate(i.count, total), "%")}</td></tr>)}</Table>; };
  return <><Notes><p>Estas duas tabelas foram digitadas manualmente no Excel e não informam período. O filtro de datas acima NÃO altera este quadro. A origem atual por leads já está no dashboard; não repetimos esse gráfico aqui.</p></Notes><div className="xdd-grid"><Panel title="Origem · quadro histórico sem período" note="Percentuais recalculados sobre o total numérico, substituindo a fórmula #VALUE! da visualização original, sem editar o Excel.">{table(data.historySources)}</Panel><Panel title="Destino · quadro histórico sem período" note="Renovou e Trocou de aula são movimentos, não perdas. Não entram automaticamente na evasão nem em motivos de perda do CRM.">{table(data.historyDestinations)}</Panel></div></>;
}

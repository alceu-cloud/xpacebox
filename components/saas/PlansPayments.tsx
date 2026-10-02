"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BadgeCheck, CreditCard, FileText, Info, MessageCircle, Save, UsersRound, WalletCards } from "lucide-react";
import BackButton from "@/components/navigation/BackButton";
import { useWorkspaceNavigation } from "@/components/navigation/WorkspaceNavigation";
import { allowWorkspaceNavigation, useNavigationGuard } from "@/components/navigation/navigation-guard";
import { supabase } from "@/lib/supabase";
import type { PaymentMethod } from "@/lib/saas/billing-preferences";
import type { StudentBand } from "@/lib/saas/commercial";
import "./commercial-store.css";
type Invoice = { id: string; period_start: string; due_on: string; total_cents: number; payment_method: PaymentMethod; status: string };
type Observation = { id: string; local_date: string; observed_at: string; active_students: number; source: string };
type Plan = { company: { name: string }; exempt: boolean; preferences: { payment_method: PaymentMethod | null; addons: string[] }; activeStudents: number; measurement: string; preview: { monthlyCents: number | null }; bands: StudentBand[]; addonMonthlyCents: number | null; invoices: Invoice[]; observations?: Observation[]; total: number; pageSize: number };
const money = (cents: number | null) => cents === null ? "A definir" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const methodName = (value: string) => ({ PIX: "Pix", BOLETO: "Boleto", CREDIT_CARD: "Cartão de crédito" }[value] || "Não escolhida");
const statusName = (value: string) => ({ PENDING: "Em aberto", PAID: "Paga", OVERDUE: "Vencida", CANCELLED: "Cancelada", REVIEW: "Em conferência" }[value] || "Em conferência");
async function request(slug: string, page: number, body?: object, endpoint: "plan" | "students" = "plan") {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("ENTRE NA SUA CONTA PARA VER O PLANO.");
  const response = await fetch(`/api/saas/${endpoint}?company=${encodeURIComponent(slug)}&page=${page}`, { method: body ? "POST" : "GET", cache: "no-store", headers: { Authorization: `Bearer ${data.session.access_token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "NÃO FOI POSSÍVEL CARREGAR O PLANO.");
  return result;
}
export default function PlansPayments({ companySlug, onBack }: { companySlug: string; onBack?: () => void }) {
  const embedded = Boolean(useWorkspaceNavigation());
  const [data, setData] = useState<Plan | null>(null);
  const [page, setPage] = useState(0);
  const [method, setMethod] = useState<PaymentMethod>("PIX");
  const [integrator, setIntegrator] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const howPanel = useRef<HTMLDetailsElement>(null);
  const observationRequest = useRef<{ slug: string; id: string } | null>(null);
  useNavigationGuard(busy, Boolean(data && (method !== (data.preferences.payment_method || "PIX") || integrator !== data.preferences.addons.includes("WHATSAPP"))));
  useEffect(() => { let active = true; setError(""); setData(null); void request(companySlug,page).then(result => { if (active) { setData(result); setMethod(result.preferences.payment_method || "PIX"); setIntegrator(result.preferences.addons.includes("WHATSAPP")); } }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [companySlug,page]);
  async function save() {
    setBusy(true); setError(""); setNotice("");
    try { const result = await request(companySlug,page,{ paymentMethod: method, addons: integrator ? ["WHATSAPP"] : [] }); setNotice(result.message); setData(await request(companySlug,page)); }
    catch (e) { setError(e instanceof Error ? e.message : "NÃO FOI POSSÍVEL SALVAR."); }
    finally { setBusy(false); }
  }
  async function observe() {
    setBusy(true); setError(""); setNotice("");
    if (observationRequest.current?.slug !== companySlug) observationRequest.current = { slug: companySlug, id: crypto.randomUUID() };
    try {
      const result = await request(companySlug,0,{ requestId: observationRequest.current.id },"students");
      observationRequest.current = null;
      setNotice(result.message);
      const saved: Observation = { id: result.observation.id, local_date: result.observation.date, observed_at: result.observation.observedAt, active_students: result.observation.activeStudents, source: result.observation.source };
      setData(previous => previous ? { ...previous, observations: [saved,...(previous.observations || []).filter(item => item.id !== saved.id)].slice(0,5) } : previous);
      // A confirmed write remains visibly saved even if the following read fails.
      try { setData(await request(companySlug,page)); }
      catch { setError("A OBSERVAÇÃO JÁ FOI SALVA. A LISTA NÃO ATUALIZOU; RECARREGUE A PÁGINA, SEM REPETIR O REGISTRO."); }
    } catch (e) { setError(e instanceof Error ? e.message : "NÃO FOI POSSÍVEL REGISTRAR."); }
    finally { setBusy(false); }
  }
  return <section className={`saas-store saas-plan${embedded ? " saas-plan--embedded" : ""}`} aria-busy={busy}>
    <header className="saas-plan-heading">
      {!embedded ? <BackButton onBack={onBack} fallbackHref={companySlug === "xpace" ? "/xpace" : `/empresa/${encodeURIComponent(companySlug)}`} /> : null}
      <div><span>CONFIG · MEU PLANO</span><h1>Planos e Pagamentos</h1><p>{data?.company.name || "Plano da empresa"}</p></div>
      <span className="saas-plan-badge">EM PREPARAÇÃO</span>
    </header>
    <aside className="saas-plan-info"><Info size={18} aria-hidden="true" /><p>Você pode salvar suas preferências. Contratação e cobrança automática ainda não estão ativas.</p></aside>
    {error ? <p className="saas-error" role="alert">{error}</p> : null}{notice ? <p className="saas-notice" role="status">{notice}</p> : null}
    {!data && !error ? <div className="saas-plan-loading" role="status">Carregando plano...</div> : null}
    {data ? <>
      <section className="saas-panel saas-plan-overview" aria-label="Resumo do plano">
        <div className="saas-plan-overview-title"><span className="saas-plan-icon"><WalletCards size={22} aria-hidden="true" /></span><div><h2>{data.exempt ? "Plano XPACE · isento" : "Resumo do seu plano"}</h2><p>{data.exempt ? "Sem mensalidade do software ou dos adicionais." : "Mensalidade por alunos + adicionais escolhidos."}</p></div>{data.exempt ? <BadgeCheck className="saas-plan-exempt-icon" size={25} aria-hidden="true" /> : null}</div>
        <dl className="saas-plan-metrics"><div><dt>Prévia mensal salva</dt><dd>{money(data.preview.monthlyCents)}</dd><small>Simulação, não é fatura</small></div><div><dt>Alunos ativos hoje</dt><dd>{data.activeStudents}</dd><small>Não é a contagem faturável</small></div><div><dt>Pagamento escolhido</dt><dd>{methodName(data.preferences.payment_method || "")}</dd><small>{data.exempt ? "Nenhuma cobrança para a XPACE" : "Fechamento previsto no fim do mês"}</small></div></dl>
      </section>
      <div className="saas-plan-grid">
        <section className="saas-panel"><header className="saas-plan-panel-heading"><CreditCard size={19} aria-hidden="true" /><h2>Preferências do plano</h2></header>
          <form onSubmit={e => { e.preventDefault(); void save(); }}>
            <div className="saas-fields"><label>Forma de pagamento<select aria-label="Forma de pagamento" value={method} disabled={busy} onChange={e => setMethod(e.target.value as PaymentMethod)}><option value="PIX">Pix</option><option value="BOLETO">Boleto</option><option value="CREDIT_CARD">Cartão de crédito</option></select></label></div>
            <label className="saas-plan-addon"><input type="checkbox" checked={integrator} disabled={busy} onChange={e => setIntegrator(e.target.checked)} /><MessageCircle size={20} aria-hidden="true" /><span><strong>Integrador de mensagens</strong><small>{data.exempt ? "Isento para a XPACE" : `${money(data.addonMonthlyCents)}/mês · somado ao plano`}</small></span></label>
            <p className="saas-plan-helper">{method === "CREDIT_CARD" ? "O cartão será cadastrado no provedor após a homologação. Não informe número ou CVV aqui." : "Selecionar Pix ou boleto não gera pagamento agora. A emissão dependerá da ativação da cobrança."}</p>
            <button className="saas-plan-primary" type="submit" disabled={busy}><Save size={16} aria-hidden="true" />{busy ? "Salvando..." : "Salvar preferências"}</button>
            <small className="saas-plan-save-note">Salva a preparação; não contrata nem ativa serviços.</small>
          </form>
        </section>
        <section className="saas-panel"><header className="saas-plan-panel-heading"><FileText size={19} aria-hidden="true" /><h2>Faturas</h2></header>{data.invoices.length ? <ul className="saas-invoices">{data.invoices.map(invoice => <li key={invoice.id}><strong>{new Date(`${invoice.period_start}T12:00:00`).toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" })} · {money(invoice.total_cents)}</strong><span>Vence em {new Date(`${invoice.due_on}T12:00:00`).toLocaleDateString("pt-BR")} · {statusName(invoice.status)}</span><span>{methodName(invoice.payment_method)}</span></li>)}</ul> : <div className="saas-plan-empty"><FileText size={28} aria-hidden="true" /><strong>Nenhuma fatura emitida</strong><p>{data.exempt ? "A XPACE é isenta. Não há mensalidade do software a pagar." : "As faturas aparecerão aqui quando a cobrança for ativada."}</p><a href="#saas-plan-how" onClick={event => { event.preventDefault(); if (howPanel.current) { howPanel.current.open = true; howPanel.current.scrollIntoView({ block: "start" }); } }}>Entender como funciona</a></div>}
          {data.total > data.pageSize ? <nav className="saas-actions" aria-label="Páginas de faturas"><button type="button" disabled={busy || page === 0} onClick={() => setPage(page-1)}>Anterior</button><span>Página {page+1}</span><button type="button" disabled={busy || (page+1)*data.pageSize >= data.total} onClick={() => setPage(page+1)}>Próxima</button></nav> : null}
        </section>
      </div>
      <details className="saas-panel saas-plan-details"><summary><WalletCards size={18} aria-hidden="true" /><h2>Tabela de preços</h2></summary><ul className="saas-price-list">{data.bands.map(band => <li key={band.min}><span>{band.max === null ? `${band.min} alunos ou mais` : `De ${band.min} até ${band.max} alunos`}</span><strong>{money(band.monthlyCents)}/mês</strong></li>)}</ul><p>Integrador de mensagens: {money(data.addonMonthlyCents)}/mês, opcional e somado ao plano. Xpace Pay obrigatório: sem mensalidade de módulo. Tarifas de transação são separadas. {data.exempt ? "A XPACE é isenta do plano e dos adicionais." : ""}</p><Link className="saas-plan-link" onClick={event => { if (!allowWorkspaceNavigation()) event.preventDefault(); }} href={`/loja/${encodeURIComponent(companySlug)}`}>Abrir loja e simular</Link></details>
      <details className="saas-panel saas-plan-details"><summary><UsersRound size={18} aria-hidden="true" /><h2>Contagem de alunos · preparação</h2></summary>
        <p>Registre uma observação dos alunos ativos agora, com data e hora de Brasília. Ela não substitui o fechamento do mês nem uma média diária; a regra faturável continua pendente.</p>
        <button type="button" disabled={busy} onClick={() => void observe()}>Registrar contagem atual</button>
        {data.observations?.length ? <ul className="saas-invoices" aria-label="Últimas cinco observações">{data.observations.map(item => <li key={item.id}><strong>{item.active_students} alunos ativos</strong><span>{new Date(item.observed_at).toLocaleString("pt-BR",{ timeZone: "America/Sao_Paulo" })} · observação, sem cobrança</span></li>)}</ul> : <p>Nenhuma observação registrada. Não existe histórico diário automático ou fechamento faturável ativo.</p>}
      </details>
      <details className="saas-panel saas-plan-details" id="saas-plan-how" ref={howPanel}><summary><Info size={18} aria-hidden="true" /><h2>Como funciona o plano?</h2></summary><p>A mensalidade do software e dos adicionais das outras escolas será cobrada pela XPACEBOX, em uma cobrança única no fim do mês. Os pagamentos dos alunos pertencem à conta da própria escola: são um fluxo separado.</p><p>{data.exempt ? "A XPACE usa a conta mãe, pois tem o mesmo CNPJ, e é isenta do plano e dos adicionais. " : ""}{data.measurement === "PENDING" ? "A regra de contagem de alunos ainda precisa ser definida. " : ""}Nesta fase, esta tela só guarda preferências e mostra uma prévia. Não cria assinatura, fatura, débito ou autorização de cartão.</p></details>
    </> : null}
  </section>;
}

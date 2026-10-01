"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { PaymentMethod } from "@/lib/saas/billing-preferences";
import type { StudentBand } from "@/lib/saas/commercial";
import "./commercial-store.css";
type Invoice = { id: string; period_start: string; due_on: string; total_cents: number; payment_method: PaymentMethod; status: string };
type Plan = { company: { name: string }; exempt: boolean; preferences: { payment_method: PaymentMethod | null; addons: string[] }; activeStudents: number; measurement: string; preview: { monthlyCents: number | null }; bands: StudentBand[]; addonMonthlyCents: number | null; invoices: Invoice[]; total: number; pageSize: number };
const money = (cents: number | null) => cents === null ? "A definir" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const methodName = (value: string) => ({ PIX: "Pix", BOLETO: "Boleto", CREDIT_CARD: "Cartão de crédito" }[value] || "Não escolhida");
const statusName = (value: string) => ({ PENDING: "Em aberto", PAID: "Paga", OVERDUE: "Vencida", CANCELLED: "Cancelada", REVIEW: "Em conferência" }[value] || "Em conferência");
async function request(slug: string, page: number, body?: object) {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("ENTRE NA SUA CONTA PARA VER O PLANO.");
  const response = await fetch(`/api/saas/plan?company=${encodeURIComponent(slug)}&page=${page}`, { method: body ? "POST" : "GET", cache: "no-store", headers: { Authorization: `Bearer ${data.session.access_token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "NÃO FOI POSSÍVEL CARREGAR O PLANO.");
  return result;
}
export default function PlansPayments({ companySlug, onBack }: { companySlug: string; onBack?: () => void }) {
  const [data, setData] = useState<Plan | null>(null);
  const [page, setPage] = useState(0);
  const [method, setMethod] = useState<PaymentMethod>("PIX");
  const [integrator, setIntegrator] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => { let active = true; setError(""); setData(null); void request(companySlug,page).then(result => { if (active) { setData(result); setMethod(result.preferences.payment_method || "PIX"); setIntegrator(result.preferences.addons.includes("WHATSAPP")); } }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [companySlug,page]);
  async function save() {
    setBusy(true); setError(""); setNotice("");
    try { const result = await request(companySlug,page,{ paymentMethod: method, addons: integrator ? ["WHATSAPP"] : [] }); setNotice(result.message); setData(await request(companySlug,page)); }
    catch (e) { setError(e instanceof Error ? e.message : "NÃO FOI POSSÍVEL SALVAR."); }
    finally { setBusy(false); }
  }
  return <section className="saas-store" aria-busy={busy}>
    {onBack ? <button type="button" onClick={onBack}>Voltar para Config</button> : null}
    <header><span>CONFIG · MEU PLANO</span><h1>Planos e Pagamentos</h1><p>{data?.company.name}</p></header>
    <p className="saas-notice">Preparação para lançamento. Nenhuma cobrança automática ou contratação está ativa nesta tela.</p>
    {error ? <p className="saas-error" role="alert">{error}</p> : null}{notice ? <p className="saas-notice" role="status">{notice}</p> : null}
    {!data && !error ? <p role="status">Carregando plano...</p> : null}
    {data ? <>
      <div className="saas-billing-grid">
        <section className="saas-panel"><h2>Dados do próximo faturamento</h2>
          <p>{data.exempt ? "XPACE isenta: usa a mesma conta mãe da XPACEBOX." : "Fechamento previsto: último dia do mês. Mensalidade e adicionais em uma cobrança única da XPACEBOX."}</p>
          <dl className="saas-summary"><dt>Alunos ativos hoje</dt><dd>{data.activeStudents}</dd><dt>Prévia mensal com preferências salvas</dt><dd>{money(data.preview.monthlyCents)}</dd><dt>Pagamento escolhido</dt><dd>{methodName(data.preferences.payment_method || "")}</dd></dl>
          <p>Esta prévia não é uma fatura. {data.measurement === "PENDING" ? "A regra de contagem de alunos ainda precisa ser definida." : "O fechamento mensal ainda não foi homologado."}</p>
          <form onSubmit={e => { e.preventDefault(); void save(); }}><div className="saas-fields"><label>Forma de pagamento<select aria-label="Forma de pagamento" value={method} disabled={busy} onChange={e => setMethod(e.target.value as PaymentMethod)}><option value="PIX">Pix</option><option value="BOLETO">Boleto</option><option value="CREDIT_CARD">Cartão de crédito</option></select></label><label className="saas-check"><input type="checkbox" checked={integrator} disabled={busy} onChange={e => setIntegrator(e.target.checked)} /> Integrador de mensagens · {data.exempt ? "isento" : `${money(data.addonMonthlyCents)}/mês`}</label></div>
            {method === "CREDIT_CARD" ? <p>O cartão será cadastrado no provedor de pagamento após a homologação. Não informe número ou CVV aqui. A cobrança mensal automática ainda está desligada.</p> : <p>Pix e boleto serão emitidos no fechamento, após ativação da cobrança. Selecionar não gera pagamento agora.</p>}
            <button type="submit" disabled={busy}>Salvar preferência em preparação</button>
          </form>
        </section>
        <section className="saas-panel"><h2>Faturas</h2>{data.invoices.length ? <ul className="saas-invoices">{data.invoices.map(invoice => <li key={invoice.id}><strong>{new Date(`${invoice.period_start}T12:00:00`).toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" })} · {money(invoice.total_cents)}</strong><span>Vence em {new Date(`${invoice.due_on}T12:00:00`).toLocaleDateString("pt-BR")} · {statusName(invoice.status)}</span><span>{methodName(invoice.payment_method)}</span></li>)}</ul> : <p>Nenhuma fatura emitida. A tela não cria cobranças nem marca pagamentos manualmente.</p>}
          {data.total > data.pageSize ? <nav className="saas-actions" aria-label="Páginas de faturas"><button type="button" disabled={busy || page === 0} onClick={() => setPage(page-1)}>Anterior</button><span>Página {page+1}</span><button type="button" disabled={busy || (page+1)*data.pageSize >= data.total} onClick={() => setPage(page+1)}>Próxima</button></nav> : null}
        </section>
      </div>
      <section className="saas-panel"><h2>Tabela de preços</h2><ul className="saas-price-list">{data.bands.map(band => <li key={band.min}><span>{band.max === null ? `${band.min} alunos ou mais` : `De ${band.min} até ${band.max} alunos`}</span><strong>{money(band.monthlyCents)}/mês</strong></li>)}</ul><p>Integrador de mensagens: {money(data.addonMonthlyCents)}/mês, opcional e somado ao plano. Xpace Pay obrigatório: sem mensalidade de módulo. Tarifas de transação são separadas. {data.exempt ? "A XPACE é isenta do plano e dos adicionais." : ""}</p><a href={`/loja/${encodeURIComponent(companySlug)}`}>Abrir loja e simular</a></section>
    </> : null}
  </section>;
}

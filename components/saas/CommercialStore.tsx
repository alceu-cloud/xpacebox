"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { emptyPricebook, pricebookBlockers, type Pricebook } from "@/lib/saas/commercial";
import "./commercial-store.css";

type Quote = { exempt: boolean; monthlyCents: number | null; blockers: string[]; lines: { code: string; monthlyCents: number | null }[] };
type Payload = { company: { name: string }; exempt: boolean; canManage: boolean; canManagePrices: boolean; book: { id: string | null; revision: number; config: Pricebook }; account: { account_mode: string; status: string }; whatsappConfigured: boolean; drafts: { id: string; quote: Quote; created_at: string }[] };
const money = (cents: number | null) => cents === null ? "A definir" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
function parseMoney(value: string) { if (!value.trim()) return null; const normalized = value.trim().replace(",", "."); if (!/^\d+(\.\d{1,2})?$/.test(normalized)) throw new Error("USE PREÇO COMO 49,90, SEM SEPARADOR DE MILHAR."); return Math.round(Number(normalized) * 100); }
const priceValue = (cents: number | null) => cents === null ? "" : (cents / 100).toFixed(2).replace(".", ",");

async function request(company: string, endpoint: "store" | "whatsapp", input?: object) {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("ENTRE NA SUA CONTA PARA ABRIR A LOJA.");
  const response = await fetch(`/api/saas/${endpoint}?company=${encodeURIComponent(company)}`, { method: input ? "POST" : "GET", cache: "no-store", headers: { Authorization: `Bearer ${data.session.access_token}`, ...(input ? { "Content-Type": "application/json" } : {}) }, ...(input ? { body: JSON.stringify(input) } : {}) });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "NÃO FOI POSSÍVEL CARREGAR A LOJA.");
  return result;
}
export default function CommercialStore({ companySlug }: { companySlug: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [config, setConfig] = useState<Pricebook>(emptyPricebook);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [count, setCount] = useState("0");
  const [whatsapp, setWhatsapp] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [requestId, setRequestId] = useState("");
  const [editing, setEditing] = useState(false);
  const [credentials, setCredentials] = useState({ instanceId: "", instanceToken: "", clientToken: "" });
  const [qr, setQr] = useState("");
  useEffect(() => { let active = true; setData(null); setError(""); void request(companySlug, "store").then(result => { if (active) { setData(result); setConfig(result.book.config); } }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [companySlug]);
  useEffect(() => { setQuote(null); setRequestId(""); }, [count, whatsapp, data?.book.id]);
  async function run(action: () => Promise<void>) {
    setBusy(true); setError(""); setNotice("");
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : "NÃO FOI POSSÍVEL CONCLUIR."); } finally { setBusy(false); }
  }
  async function reload() { const result = await request(companySlug, "store"); setData(result); setConfig(result.book.config); }
  async function simulate(save: boolean) {
    const id = requestId || crypto.randomUUID(); setRequestId(id);
    const result = await request(companySlug, "store", { action: save ? "SAVE_DRAFT" : "QUOTE", pricebookId: data?.book.id, requestId: id, studentCount: Number(count), addons: whatsapp ? ["WHATSAPP"] : [] });
    setQuote(result.quote || result.draft.quote);
    if (save) { await reload(); setNotice("SIMULAÇÃO SALVA. NÃO É ASSINATURA NEM COBRANÇA."); }
  }
  function updateBand(index: number, field: "min" | "max" | "monthlyCents", value: string) {
    try { setConfig({ ...config, bands: config.bands.map((b, i) => i !== index ? b : { ...b, [field]: field === "monthlyCents" ? parseMoney(value) : field === "max" && !value ? null : Number(value) }) }); setError(""); } catch (e) { setError((e as Error).message); }
  }
  return <section className="saas-store" aria-busy={busy}>
    <header><span>LOJA · ASSINATURAS</span><h1>{data?.company.name || "XPACEBOX"}</h1><p>Preparação comercial. Nenhuma cobrança automática está ativa.</p></header>
    {error ? <p className="saas-error" role="alert">{error}</p> : null}
    {notice ? <p className="saas-notice" role="status">{notice}</p> : null}
    {!data && !error ? <p role="status">Carregando configuração...</p> : null}
    {data ? <>
      <p className="saas-notice">{data.exempt ? "XPACE ISENTA DE MENSALIDADE · CONTA MÃE ASAAS" : "MENSALIDADE POR ALUNOS · SUBCONTA ASAAS PRÓPRIA"}. Tarifas de transação e de terceiros são separadas.</p>
      <div className="saas-products">
        <article><h2>Gestão da escola</h2><strong>{data.exempt ? "Isento" : "Mensalidade por faixa de alunos"}</strong><p>Agenda, alunos e operação da escola. Faixas e preços definidos pela plataforma.</p></article>
        <article><h2>Xpace Pay</h2><strong>Obrigatório · R$ 0,00/mês de módulo</strong><p>Recebimentos e conciliação. {data.exempt ? "A mesma conta principal da XPACEBOX." : "Uma subconta exclusiva desta empresa."} Isso não elimina as tarifas Asaas.</p></article>
        <article><h2>Integrador de mensagens</h2><strong>{data.exempt ? "Isento" : `${money(data.book.config.addons.WHATSAPP)} / mês`}</strong><p>Adicional opcional, somado à mensalidade da escola. Conecte o WhatsApp da sua empresa.</p></article>
      </div>
      {data.canManage ? <section className="saas-panel"><h2>Simular mensalidade</h2><p>Quantidade informada só para simulação. A cobrança futura usará uma medição validada no servidor.</p><div className="saas-fields"><label>Alunos para simulação<input type="number" min="0" max="1000000" step="1" value={count} onChange={e => setCount(e.target.value)} /></label><label className="saas-check"><input type="checkbox" checked={whatsapp} onChange={e => setWhatsapp(e.target.checked)} /> Incluir WhatsApp</label></div><div className="saas-actions"><button disabled={busy || !data.book.id || !count} onClick={() => void run(() => simulate(false))}>Simular</button><button disabled={busy || !data.book.id || !count} onClick={() => void run(() => simulate(true))}>Salvar simulação</button><button disabled={busy} onClick={() => void run(async () => { const result = await request(companySlug, "store", { action: "PREPARE_ACCOUNT" }); await reload(); setNotice(result.message); })}>Preparar {data.exempt ? "conta mãe" : "subconta"}</button></div>{!data.book.id ? <p>O dono da plataforma precisa salvar a primeira tabela. Os preços podem continuar em branco.</p> : null}<p>Conta: {data.account.status === "PREPARATION" ? "preparação registrada, sem criação no provedor" : "aguardando preparação"}.</p>{quote ? <div role="status"><strong>Total simulado: {money(quote.monthlyCents)} / mês</strong>{quote.blockers.length ? <ul>{quote.blockers.map(b => <li key={b}>{b}</li>)}</ul> : null}<p>Nenhum pagamento foi criado. Nenhum módulo foi ativado por essa simulação.</p></div> : null}</section> : null}
      {data.canManagePrices ? <section className="saas-panel"><h2>Preços da plataforma</h2><button aria-expanded={editing} aria-controls="saas-price-form" disabled={busy} onClick={() => setEditing(!editing)}>{editing ? "Fechar configuração" : "Configurar faixas e adicionais"}</button>{editing ? <form key={data.book.id} id="saas-price-form" onSubmit={e => { e.preventDefault(); void run(async () => { await request(companySlug, "store", { action: "SAVE_PRICEBOOK", expectedPricebookId: data.book.id, config }); await reload(); setNotice("NOVA VERSÃO SALVA. CLIENTES NÃO FORAM COBRADOS."); }); }}>
        <p>Versão {data.book.revision}. Campo vazio significa pendente, não gratuito. Valores de mensalidade em reais.</p>
        {config.bands.map((b, i) => <fieldset key={i}><legend>Faixa {i + 1}</legend><div className="saas-fields"><label>De<input type="number" min="0" step="1" value={b.min} required onChange={e => updateBand(i, "min", e.target.value)} /></label><label>Até (vazio = sem limite)<input type="number" min={b.min} step="1" value={b.max ?? ""} onChange={e => updateBand(i, "max", e.target.value)} /></label><label>Mensalidade (R$)<input key={`${i}:${b.monthlyCents}`} type="text" inputMode="decimal" defaultValue={priceValue(b.monthlyCents)} onBlur={e => updateBand(i, "monthlyCents", e.target.value)} /></label></div><button type="button" disabled={busy} onClick={() => setConfig({ ...config, bands: config.bands.filter((_, j) => j !== i) })}>Remover faixa {i + 1}</button></fieldset>)}
        <button type="button" disabled={busy || config.bands.length >= 100} onClick={() => setConfig({ ...config, bands: [...config.bands, { min: (config.bands.at(-1)?.max ?? -1) + 1, max: null, monthlyCents: null }] })}>Adicionar faixa</button>
        <div className="saas-fields"><label>Integrador mensal (R$)<input inputMode="decimal" defaultValue={priceValue(config.addons.WHATSAPP)} onBlur={e => { try { setConfig({ ...config, addons: { WHATSAPP: parseMoney(e.target.value) } }); setError(""); } catch (err) { setError((err as Error).message); } }} /></label><label>Alunos faturáveis<select value={config.studentMetric} onChange={e => setConfig({ ...config, studentMetric: e.target.value as Pricebook["studentMetric"] })}><option value="PENDING">A definir</option><option value="ACTIVE_STUDENTS">Cadastros ativos marcados como alunos</option></select></label><label>Tolerância em dias<input type="number" min="0" max="90" value={config.graceDays ?? ""} onChange={e => setConfig({ ...config, graceDays: e.target.value ? Number(e.target.value) : null })} /></label><label>Mudança de faixa<select value={config.rangeChange} onChange={e => setConfig({ ...config, rangeChange: e.target.value as Pricebook["rangeChange"] })}><option value="PENDING">A definir</option><option value="NEXT_CYCLE">Próximo ciclo mensal</option></select></label></div><p>Fechamento: último dia do mês. Plano e adicionais em uma mensalidade única.</p>
        <ul>{pricebookBlockers(config).map(b => <li key={b}>{b}</li>)}</ul><button type="submit" disabled={busy || Boolean(error)}>Salvar nova versão em preparação</button><p>Salvar não publica preços nem cria assinaturas. A ativação financeira exige a homologação e um teste aprovado.</p>
      </form> : null}</section> : null}
      {data.canManage ? <details className="saas-panel"><summary>Conectar WhatsApp · preparação</summary><p>Escaneie o QR pelo WhatsApp da empresa em Dispositivos conectados. No mesmo celular, abra esta tela em outro dispositivo.</p>{data.canManagePrices && !data.whatsappConfigured ? <form onSubmit={e => { e.preventDefault(); void run(async () => { await request(companySlug, "whatsapp", { action: "SAVE", ...credentials }); setCredentials({ instanceId: "", instanceToken: "", clientToken: "" }); await reload(); setNotice("CREDENCIAIS SALVAS NO SERVIDOR SEM DISPARAR MENSAGENS."); }); }}><p>Administração técnica da plataforma: registre apenas instância exclusiva já contratada. Preserve a conexão atual da XPACE.</p><div className="saas-fields">{(["instanceId", "instanceToken", "clientToken"] as const).map(key => <label key={key}>{key}<input type="password" autoComplete="off" required minLength={16} maxLength={200} value={credentials[key]} onChange={e => setCredentials({ ...credentials, [key]: e.target.value })} /></label>)}</div><button disabled={busy} type="submit">Registrar conexão</button></form> : null}<p>{data.whatsappConfigured ? "Conexão preparada." : "Aguardando preparação da conexão."}</p><button disabled={busy || !data.whatsappConfigured || data.exempt} onClick={() => void run(async () => { setQr(""); const result = await request(companySlug, "whatsapp", { action: "PAIR" }); setQr(result.image); })}>Consultar QR para teste autorizado</button><p>O pareamento começa bloqueado até o teste autorizado. O QR não comprova entrega de mensagens.</p>{qr ? <img src={qr} width="260" height="260" alt="QR temporário para conectar o WhatsApp desta empresa" /> : null}</details> : null}
      {data.drafts.length ? <section className="saas-panel"><h2>Últimas 5 simulações</h2><ul>{data.drafts.map(d => <li key={d.id}>{new Date(d.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} · {money(d.quote.monthlyCents)} / mês · não cobrado</li>)}</ul></section> : null}
    </> : null}
  </section>;
}

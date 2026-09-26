"use client";

import { ArrowLeft, ArrowUpRight, Banknote, Check, ChevronLeft, ChevronRight, CircleDollarSign, Clock3, CreditCard, Filter, Landmark, Plus, Search, WalletCards, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { supabase } from "@/lib/supabase";
import { shiftedFinanceDate, type RecurrenceFrequency } from "@/lib/xpace/finance-recurrence";

type View = "HUB" | "PAGAR" | "RECEBER" | "CONTAS";
type DateBy = "VENCIMENTO" | "PAGAMENTO" | "COMPETENCIA";
type StatusFilter = "TODOS" | "ABERTOS" | "FECHADOS";
type FinanceItem = { id: string; source: "MANUAL" | "XPAY"; counterparty: string; description: string; categoryName: string | null; competenceOn: string; dueOn: string; amountCents: number; paidAmountCents: number; paidOn: string | null; status: "ABERTO" | "ANDAMENTO" | "PARCIAL" | "PAGO" };
type Account = { id: string; description: string; accountType: string; bankName: string | null; active: boolean; agencyNumber?: string | null; accountNumber?: string | null };
type ExpenseCategory = { id: string; name: string; active: boolean };
type EntryResponse = { success: true; canManage: boolean; metrics: { total: number; paid: number; open: number; inProgress: number }; items: FinanceItem[]; totalRows: number; page: number; pageSize: number; accounts: Array<{ id: string; description: string }>; categories: ExpenseCategory[] };
type AccountsResponse = { success: true; canManage: boolean; accounts: Account[] };
type Filters = { q: string; dateBy: DateBy; from: string; to: string; status: StatusFilter };

function today() { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()); }
function initialFilters(): Filters {
  const current = today();
  const [year, month] = current.split("-").map(Number);
  return { q: "", dateBy: "VENCIMENTO", from: `${year}-${String(month).padStart(2, "0")}-01`, to: new Date(Date.UTC(year, month, 0, 12)).toISOString().slice(0, 10), status: "TODOS" };
}
function money(cents: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100); }
function date(value: string | null) { return value ? value.split("-").reverse().join("/") : "—"; }
function amountToCents(value: string) { const parsed = Number(value.replace(",", ".")); return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0; }
function accountType(value: string) { return ({ CONTA_CORRENTE: "Conta corrente", POUPANCA: "Poupança", CAIXA: "Caixa", CARTEIRA_DIGITAL: "Carteira digital", OUTRA: "Outra" } as Record<string, string>)[value] ?? value; }
function statusLabel(value: FinanceItem["status"], receive: boolean) { return value === "PAGO" ? receive ? "Recebido" : "Pago" : value === "ANDAMENTO" ? "Em andamento" : value === "PARCIAL" ? "Parcial" : "Em aberto"; }

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Sua sessão expirou. Entre novamente para usar o financeiro.");
  const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${session.access_token}`, ...(init?.headers ?? {}) }, cache: "no-store" });
  const data = await response.json().catch(() => null) as (T & { message?: string }) | null;
  if (!response.ok || !data) throw new Error(data?.message || "Não foi possível carregar os dados financeiros.");
  return data;
}

export default function FinanceWorkspace({ onBack }: { onBack: () => void }) {
  const [view, setView] = useState<View>("HUB");
  const [draft, setDraft] = useState<Filters>(initialFilters);
  const [applied, setApplied] = useState<Filters>(initialFilters);
  const [page, setPage] = useState(0);
  const [entries, setEntries] = useState<EntryResponse | null>(null);
  const [accountData, setAccountData] = useState<AccountsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [modal, setModal] = useState<"ACCOUNT" | "ENTRY" | "SETTLE" | null>(null);
  const [selected, setSelected] = useState<FinanceItem | null>(null);

  const load = useCallback(async (nextView: View, filters: Filters, nextPage: number) => {
    if (nextView === "HUB") return;
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ view: nextView, q: filters.q, page: String(nextPage) });
      if (nextView !== "CONTAS") {
        params.set("dateBy", filters.dateBy); params.set("from", filters.from);
        params.set("to", filters.to); params.set("status", filters.status);
        setEntries(await api<EntryResponse>(`/api/xpace/finance?${params}`));
      } else setAccountData(await api<AccountsResponse>(`/api/xpace/finance?${params}`));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar o financeiro."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(view, applied, page); }, [view, applied, page, load]);

  function open(next: View) {
    setView(next); setPage(0); setError(""); setSuccess(""); setEntries(null); setAccountData(null);
    const filters = initialFilters(); setDraft(filters); setApplied(filters);
  }

  function apply() {
    if (view !== "CONTAS" && draft.from && draft.to && draft.from > draft.to) { setError("A data inicial não pode ser maior que a final."); return; }
    setPage(0); setApplied({ ...draft });
  }

  async function save(body: Record<string, unknown>) {
    const result = await api<{ success: true; createdCount?: number }>("/api/xpace/finance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (body.action === "createEntry") setSuccess(result.createdCount && result.createdCount > 1 ? `${result.createdCount} contas cadastradas, incluindo a primeira.` : "Conta cadastrada com sucesso.");
    else if (body.action === "saveCategory") setSuccess("Categoria salva com sucesso.");
    else setSuccess(body.action === "createAccount" ? "Conta financeira cadastrada." : "Baixa registrada com sucesso.");
    setModal(null); setSelected(null);
    await load(view, applied, page);
  }

  if (view === "HUB") return <section className="xdf-hub"><header><span>FINANCEIRO XPACE</span><h1>O ritmo das suas contas.</h1><p>Acompanhe pagamentos, recebimentos e as contas da escola sem misturar lançamentos manuais às cobranças XPay.</p></header><div className="xdf-hub-grid">
    <button type="button" onClick={() => open("PAGAR")}><span className="xdf-hub-icon xdf-hub-icon--orange"><Banknote size={24} /></span><strong>CONTAS A PAGAR</strong><small>Despesas e pagamentos da escola</small><ArrowUpRight size={19} /></button>
    <button type="button" onClick={() => open("RECEBER")}><span className="xdf-hub-icon xdf-hub-icon--green"><CircleDollarSign size={24} /></span><strong>CONTAS A RECEBER</strong><small>Cobranças XPay e contas manuais</small><ArrowUpRight size={19} /></button>
    <button type="button" onClick={() => open("CONTAS")}><span className="xdf-hub-icon xdf-hub-icon--blue"><Landmark size={24} /></span><strong>CONTAS FINANCEIRAS</strong><small>Banco, caixa e carteiras</small><ArrowUpRight size={19} /></button>
    <div className="xdf-hub-soon"><span className="xdf-hub-icon"><WalletCards size={24} /></span><strong>CAIXA E XPAY</strong><small>Outras visões seguem em preparação.</small></div>
  </div><button type="button" className="xdf-back" onClick={onBack}><ArrowLeft size={17} /> Voltar à XPACE</button></section>;

  const receive = view === "RECEBER";
  const data = view === "CONTAS" ? accountData : entries;
  const canManage = data?.canManage ?? false;
  return <section className="xdf-workspace">
    <button type="button" className="xdf-back" onClick={() => open("HUB")}><ArrowLeft size={17} /> Voltar ao financeiro</button>
    <div className="xdf-heading"><div><span>FINANCEIRO XPACE</span><h1>{view === "CONTAS" ? "Contas financeiras" : receive ? "Contas a receber" : "Contas a pagar"}</h1><p>{view === "CONTAS" ? "Bancos, caixa e carteiras usados pela escola. Não são subcontas Asaas." : receive ? "Pagamento confirmado aparece como recebido, inclusive no cartão; repasse será tratado em relatório próprio." : "Acompanhe despesas e registre baixas sem alterar cobranças da escola."}</p></div>{canManage ? <button type="button" className="xdf-primary" onClick={() => setModal(view === "CONTAS" ? "ACCOUNT" : "ENTRY")}><Plus size={19} /> {view === "CONTAS" ? "Conta financeira" : receive ? "Conta a receber" : "Conta a pagar"}</button> : null}</div>
    <form className="xdf-filters" onSubmit={(event) => { event.preventDefault(); apply(); }}>
      <label className="xdf-search"><Search size={18} /><input aria-label={view === "CONTAS" ? "Pesquisar conta financeira" : "Pesquisar conta"} value={draft.q} onChange={(event) => setDraft({ ...draft, q: event.target.value })} placeholder={view === "CONTAS" ? "Pesquisar conta financeira" : "Pesquisar descrição ou pessoa"} /></label>
      {view !== "CONTAS" ? <><label><span>Pesquisar por</span><select value={draft.dateBy} onChange={(event) => setDraft({ ...draft, dateBy: event.target.value as DateBy })}><option value="VENCIMENTO">Vencimento</option><option value="PAGAMENTO">{receive ? "Recebimento" : "Pagamento"}</option><option value="COMPETENCIA">Competência</option></select></label><label><span>Data inicial</span><input type="date" value={draft.from} onChange={(event) => setDraft({ ...draft, from: event.target.value })} /></label><label><span>Data final</span><input type="date" value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} /></label><label className="xdf-status-filter"><span><Filter size={14} /> Situação</span><select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as StatusFilter })}><option value="TODOS">Abertos e fechados</option><option value="ABERTOS">Só abertos</option><option value="FECHADOS">Só fechados</option></select></label></> : null}
      <button type="submit" className="xdf-apply">Aplicar filtros</button>
    </form>
    {error ? <div className="xdf-error" role="alert"><span>{error}</span><button type="button" onClick={() => void load(view, applied, page)}>Tentar novamente</button></div> : null}
    {success ? <p className="xdf-success" role="status">{success}</p> : null}
    {view === "CONTAS" ? <div className="xdf-table-wrap"><div className="xdf-account-head"><span>DESCRIÇÃO</span><span>TIPO</span><span>BANCO</span></div>{accountData?.accounts.length ? accountData.accounts.map((account) => <div className="xdf-account-row" key={account.id}><strong>{account.description}</strong><span className="xdf-account-type">{accountType(account.accountType)}</span><span>{account.bankName || "—"}</span></div>) : <p className="xdf-empty">{loading ? "Carregando contas..." : error ? "" : "Nenhuma conta financeira cadastrada."}</p>}</div> : <>
      <div className={`xdf-metrics${receive ? " xdf-metrics--four" : ""}`}>
        {receive ? <Metric icon={<CircleDollarSign size={22} />} label="Valor" value={entries?.metrics.total} tone="neutral" /> : null}
        <Metric icon={<Check size={22} />} label={receive ? "Valor recebido" : "Total pago"} value={entries?.metrics.paid} tone="green" />
        <Metric icon={<Banknote size={22} />} label={receive ? "Valor em aberto" : "Total a pagar"} value={entries?.metrics.open} tone="orange" />
        {receive ? <Metric icon={<Clock3 size={22} />} label="Em andamento" value={entries?.metrics.inProgress} tone="blue" /> : null}
      </div>
      <div className="xdf-table-wrap"><div className="xdf-table-scroll"><div className="xdf-entry-head"><span>{receive ? "CLIENTE" : "FAVORECIDO"}</span><span>DESCRIÇÃO</span><span>VENCIMENTO</span><span>{receive ? "RECEBIMENTO" : "PAGAMENTO"}</span><span>VALOR</span><span>{receive ? "RECEBIDO" : "PAGO"}</span><span>SITUAÇÃO</span><span>AÇÃO</span></div>{entries?.items.length ? entries.items.map((item) => <div className="xdf-entry-row" key={`${item.source}-${item.id}`}><strong title={item.counterparty} data-label={receive ? "CLIENTE" : "FAVORECIDO"}>{item.counterparty}</strong><span title={item.description} data-label="DESCRIÇÃO">{item.description}{item.source === "XPAY" ? <small>XPAY</small> : item.categoryName ? <small>{item.categoryName}</small> : null}</span><span data-label="VENCIMENTO">{date(item.dueOn)}</span><span data-label={receive ? "RECEBIMENTO" : "PAGAMENTO"}>{date(item.paidOn)}</span><span data-label="VALOR">{money(item.amountCents)}</span><span data-label={receive ? "RECEBIDO" : "PAGO"}>{money(item.paidAmountCents)}</span><span data-label="SITUAÇÃO"><b className={`xdf-chip xdf-chip--${item.status.toLowerCase()}`}>{statusLabel(item.status, receive)}</b></span><span data-label="AÇÃO">{canManage && item.source === "MANUAL" && item.status !== "PAGO" ? <button type="button" className="xdf-row-action" onClick={() => { setSelected(item); setModal("SETTLE"); }}>{receive ? "Receber" : "Pagar"}</button> : "—"}</span></div>) : <p className="xdf-empty">{loading ? "Carregando lançamentos..." : error ? "" : "Nenhum lançamento neste filtro."}</p>}</div><footer className="xdf-pagination"><span>{entries?.totalRows ? `${page * (entries?.pageSize ?? 20) + 1}–${Math.min(entries.totalRows, (page + 1) * entries.pageSize)} de ${entries.totalRows}` : "0 lançamentos"}</span><div><button type="button" disabled={loading || page === 0} aria-label="Página anterior" onClick={() => setPage(page - 1)}><ChevronLeft size={18} /></button><span>Página {page + 1}</span><button type="button" disabled={loading || (page + 1) * (entries?.pageSize ?? 20) >= (entries?.totalRows ?? 0)} aria-label="Próxima página" onClick={() => setPage(page + 1)}><ChevronRight size={18} /></button></div></footer></div>
      {receive ? <p className="xdf-note"><CreditCard size={16} /> Cobranças XPay são somente leitura aqui. Cartão confirmado pelo Asaas entra em “Recebido”; repasse bancário não é considerado nesta tela.</p> : null}
    </>}
    {modal === "ACCOUNT" ? <AccountModal onClose={() => setModal(null)} onSave={save} /> : null}
    {modal === "ENTRY" ? <EntryModal direction={view as "PAGAR" | "RECEBER"} categories={entries?.categories ?? []} onClose={() => setModal(null)} onSave={save} /> : null}
    {modal === "SETTLE" && selected ? <SettlementModal item={selected} direction={view as "PAGAR" | "RECEBER"} accounts={entries?.accounts ?? []} onClose={() => { setModal(null); setSelected(null); }} onSave={save} /> : null}
  </section>;
}

function Metric({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value?: number; tone: string }) {
  return <div className="xdf-metric"><span className={`xdf-metric-icon xdf-metric-icon--${tone}`}>{icon}</span><div><small>{label}</small><strong>{value === undefined ? "—" : money(value)}</strong></div></div>;
}

function Modal({ title, icon, children, onClose }: { title: string; icon: React.ReactNode; children: React.ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className="xdf-dialog" onCancel={(event) => { event.preventDefault(); onClose(); }}><div className="xdf-dialog-head"><span className="xdf-dialog-icon">{icon}</span><h2>{title}</h2><button type="button" aria-label="Fechar" onClick={onClose}><X size={22} /></button></div>{children}</dialog>;
}

function AccountModal({ onClose, onSave }: { onClose: () => void; onSave: (body: Record<string, unknown>) => Promise<void> }) {
  const [form, setForm] = useState({ description: "", accountType: "CONTA_CORRENTE", bankName: "", agencyNumber: "", agencyDigit: "", accountNumber: "", accountDigit: "", differentHolder: false, holderName: "", holderDocument: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent) { event.preventDefault(); setSaving(true); setError(""); try { await onSave({ action: "createAccount", ...form }); } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar."); } finally { setSaving(false); } }
  return <Modal title="Nova conta financeira" icon={<Landmark size={23} />} onClose={onClose}><form onSubmit={submit} className="xdf-form"><div className="xdf-form-grid"><label><span>Descrição *</span><input autoFocus required minLength={2} maxLength={120} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Ex.: Banco da escola" /></label><label><span>Tipo *</span><select value={form.accountType} onChange={(event) => setForm({ ...form, accountType: event.target.value })}><option value="CONTA_CORRENTE">Conta corrente</option><option value="POUPANCA">Poupança</option><option value="CAIXA">Caixa</option><option value="CARTEIRA_DIGITAL">Carteira digital</option><option value="OUTRA">Outra</option></select></label><label className="xdf-span-2"><span>Banco</span><input value={form.bankName} onChange={(event) => setForm({ ...form, bankName: event.target.value })} placeholder="Escolha ou digite o banco" list="xdf-bank-options" /><datalist id="xdf-bank-options"><option value="Banco do Brasil" /><option value="Caixa Econômica Federal" /><option value="Itaú" /><option value="Bradesco" /><option value="Santander" /><option value="Inter" /><option value="Nubank" /><option value="Sicredi" /><option value="Sicoob" /></datalist></label><div className="xdf-inline"><label><span>Agência</span><input value={form.agencyNumber} onChange={(event) => setForm({ ...form, agencyNumber: event.target.value })} /></label><label><span>Dígito</span><input value={form.agencyDigit} onChange={(event) => setForm({ ...form, agencyDigit: event.target.value })} /></label></div><div className="xdf-inline"><label><span>Conta</span><input value={form.accountNumber} onChange={(event) => setForm({ ...form, accountNumber: event.target.value })} /></label><label><span>Dígito</span><input value={form.accountDigit} onChange={(event) => setForm({ ...form, accountDigit: event.target.value })} /></label></div><label className="xdf-check xdf-span-2"><input type="checkbox" checked={form.differentHolder} onChange={(event) => setForm({ ...form, differentHolder: event.target.checked })} /><span>O titular da conta é diferente da XPACE?</span></label>{form.differentHolder ? <><label><span>Nome do titular *</span><input required value={form.holderName} onChange={(event) => setForm({ ...form, holderName: event.target.value })} /></label><label><span>CPF ou CNPJ *</span><input required value={form.holderDocument} onChange={(event) => setForm({ ...form, holderDocument: event.target.value })} /></label></> : null}</div><p className="xdf-form-hint">Esta conta organiza lançamentos internos. Cadastrá-la não cria nem altera uma subconta Asaas.</p>{error ? <p className="xdf-form-error" role="alert">{error}</p> : null}<div className="xdf-form-actions"><button type="button" onClick={onClose}>Cancelar</button><button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar conta"}</button></div></form></Modal>;
}

function EntryModal({ direction, categories, onClose, onSave }: { direction: "PAGAR" | "RECEBER"; categories: ExpenseCategory[]; onClose: () => void; onSave: (body: Record<string, unknown>) => Promise<void> }) {
  const [groupId] = useState(() => crypto.randomUUID());
  const [form, setForm] = useState({ description: "", counterpartyName: "", expenseCategoryId: "", clientId: "", competenceOn: today(), dueOn: today(), amount: "", note: "", recurring: false, recurrenceFrequency: "MENSAL" as RecurrenceFrequency, recurrenceCount: "12" });
  const [clientSearch, setClientSearch] = useState("");
  const [clients, setClients] = useState<Array<{ id: string; name: string; number: number }>>([]);
  const [clientLoading, setClientLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (direction !== "RECEBER") return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setClientLoading(true);
      void api<{ clients: Array<{ id: string; name: string; number: number }> }>(`/api/xpace/finance?${new URLSearchParams({ view: "CLIENTES", q: clientSearch })}`)
        .then((result) => { if (!cancelled) { setClients(result.clients); setError(""); } })
        .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Não foi possível buscar os clientes."); })
        .finally(() => { if (!cancelled) setClientLoading(false); });
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [clientSearch, direction]);

  const count = Number(form.recurrenceCount);
  let finalDue = "";
  if (form.recurring && Number.isInteger(count) && count >= 1 && count <= 120) {
    try { finalDue = shiftedFinanceDate(form.dueOn, form.recurrenceFrequency, count - 1); } catch { /* A validação do formulário mostrará a data inválida. */ }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError("");
    const amountCents = amountToCents(form.amount);
    if (amountCents <= 0) { setError("Informe um valor maior que zero."); return; }
    if (direction === "PAGAR" && !form.expenseCategoryId) { setError("Selecione uma categoria de despesa."); return; }
    if (direction === "RECEBER" && !form.clientId) { setError("Selecione um cliente cadastrado."); return; }
    if (form.recurring && (!finalDue || count < 1 || count > 120)) { setError("Revise a quantidade e a data final da recorrência."); return; }
    setSaving(true);
    try {
      await onSave({ action: "createEntry", direction, description: form.description, counterpartyName: form.counterpartyName,
        expenseCategoryId: form.expenseCategoryId, clientId: form.clientId, competenceOn: form.competenceOn,
        dueOn: form.dueOn, amountCents, note: form.note, recurrenceGroupId: groupId,
        recurring: direction === "PAGAR" && form.recurring, recurrenceFrequency: form.recurrenceFrequency,
        recurrenceCount: count });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar."); }
    finally { setSaving(false); }
  }

  return <Modal title={direction === "PAGAR" ? "Nova conta a pagar" : "Nova conta a receber"} icon={<Banknote size={23} />} onClose={onClose}>
    <form className="xdf-form" onSubmit={submit}>
      <div className="xdf-form-grid">
        <label className="xdf-span-2"><span>Descrição *</span><input autoFocus required minLength={2} maxLength={180} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder={direction === "PAGAR" ? "Ex.: Aluguel da sala" : "Ex.: Mensalidade avulsa"} /></label>
        {direction === "PAGAR" ? <>
          <label><span>Favorecido *</span><input required minLength={2} maxLength={180} value={form.counterpartyName} onChange={(event) => setForm({ ...form, counterpartyName: event.target.value })} placeholder="Quem vai receber" /></label>
          <label><span>Categoria de despesa *</span><select required value={form.expenseCategoryId} onChange={(event) => setForm({ ...form, expenseCategoryId: event.target.value })}><option value="">Selecione a categoria</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        </> : <>
          <label><span>Pesquisar cliente</span><input type="search" value={clientSearch} onChange={(event) => { setClientSearch(event.target.value); setForm({ ...form, clientId: "" }); }} placeholder="Digite o nome do aluno" /></label>
          <label><span>Cliente cadastrado *</span><select required value={form.clientId} onChange={(event) => setForm({ ...form, clientId: event.target.value })}><option value="">{clientLoading ? "Buscando..." : "Selecione na lista"}</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name} · #{client.number}</option>)}</select></label>
        </>}
        <label><span>Competência *</span><input type="date" required value={form.competenceOn} onChange={(event) => setForm({ ...form, competenceOn: event.target.value })} /></label>
        <label><span>Vencimento *</span><input type="date" required value={form.dueOn} onChange={(event) => setForm({ ...form, dueOn: event.target.value })} /></label>
        <label><span>Valor (R$) *</span><input type="number" required min="0.01" step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></label>
        <label><span>Observação</span><input value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></label>
        {direction === "PAGAR" ? <><label className="xdf-check xdf-span-2"><input type="checkbox" checked={form.recurring} onChange={(event) => setForm({ ...form, recurring: event.target.checked })} /><span>Esta conta é recorrente</span></label>{form.recurring ? <><label><span>Frequência *</span><select value={form.recurrenceFrequency} onChange={(event) => setForm({ ...form, recurrenceFrequency: event.target.value as RecurrenceFrequency })}><option value="DIARIA">Diária</option><option value="MENSAL">Mensal</option><option value="BIMESTRAL">Bimestral</option><option value="TRIMESTRAL">Trimestral</option><option value="SEMESTRAL">Semestral</option><option value="ANUAL">Anual</option></select></label><label><span>Quantidade de contas *</span><input type="number" required min="1" max="120" step="1" value={form.recurrenceCount} onChange={(event) => setForm({ ...form, recurrenceCount: event.target.value })} /></label></> : null}</> : null}
      </div>
      {form.recurring && direction === "PAGAR" ? <p className="xdf-recurrence-preview">{finalDue ? `Serão criadas ${count} contas, da primeira em ${date(form.dueOn)} até a última em ${date(finalDue)}.` : "Revise a data e a quantidade de contas."} A primeira já conta no total.</p> : null}
      {direction === "PAGAR" && !categories.length ? <p className="xdf-form-error">Nenhuma categoria ativa. Cadastre uma em Configurações → Financeiro.</p> : null}
      {direction === "RECEBER" && !clientLoading && !clients.length ? <p className="xdf-form-hint">Nenhum cliente encontrado. Cadastre o aluno em Clientes antes de lançar a conta.</p> : null}
      <p className="xdf-form-hint">Lançamento manual: não emite cobrança no Asaas nem altera contratos existentes.</p>
      {error ? <p className="xdf-form-error" role="alert">{error}</p> : null}
      <div className="xdf-form-actions"><button type="button" onClick={onClose}>Cancelar</button><button type="submit" disabled={saving}>{saving ? "Salvando..." : form.recurring && direction === "PAGAR" ? `Cadastrar ${count || ""} contas` : "Cadastrar conta"}</button></div>
    </form>
  </Modal>;
}

function SettlementModal({ item, direction, accounts, onClose, onSave }: { item: FinanceItem; direction: "PAGAR" | "RECEBER"; accounts: Array<{ id: string; description: string }>; onClose: () => void; onSave: (body: Record<string, unknown>) => Promise<void> }) {
  const remaining = Math.max(0, item.amountCents - item.paidAmountCents);
  const [form, setForm] = useState({ amount: (remaining / 100).toFixed(2), settledOn: today(), financialAccountId: "", note: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent) { event.preventDefault(); setError(""); const amountCents = amountToCents(form.amount); if (amountCents <= 0 || amountCents > remaining) { setError(`Informe até ${money(remaining)}.`); return; } setSaving(true); try { await onSave({ action: "settleEntry", entryId: item.id, amountCents, settledOn: form.settledOn, financialAccountId: form.financialAccountId, note: form.note }); } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível registrar a baixa."); } finally { setSaving(false); } }
  return <Modal title={direction === "PAGAR" ? "Registrar pagamento" : "Registrar recebimento"} icon={<Check size={23} />} onClose={onClose}><form className="xdf-form" onSubmit={submit}><p className="xdf-settlement-copy"><strong>{item.description}</strong><span>Saldo restante: {money(remaining)}</span></p><div className="xdf-form-grid"><label><span>Valor (R$) *</span><input autoFocus type="number" required min="0.01" max={(remaining / 100).toFixed(2)} step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></label><label><span>Data *</span><input type="date" required max={today()} value={form.settledOn} onChange={(event) => setForm({ ...form, settledOn: event.target.value })} /></label><label className="xdf-span-2"><span>Conta financeira</span><select value={form.financialAccountId} onChange={(event) => setForm({ ...form, financialAccountId: event.target.value })}><option value="">Não informada</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.description}</option>)}</select></label><label className="xdf-span-2"><span>Observação</span><input value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></label></div><p className="xdf-form-hint">A baixa manual fica registrada no histórico. Cobranças XPay não podem ser baixadas por aqui.</p>{error ? <p className="xdf-form-error" role="alert">{error}</p> : null}<div className="xdf-form-actions"><button type="button" onClick={onClose}>Cancelar</button><button type="submit" disabled={saving}>{saving ? "Salvando..." : "Confirmar baixa"}</button></div></form></Modal>;
}

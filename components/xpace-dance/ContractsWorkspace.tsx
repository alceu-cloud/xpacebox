"use client";

import { BadgeDollarSign, CalendarClock, CheckCircle2, FilePlus2, PauseCircle, Plus, Search, SlidersHorizontal, UserRoundPlus, XCircle } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { supabase } from "@/lib/supabase";

type Plan = { id: string; name: string; description: string; billingInterval: string; durationMonths: number; amountCents: number; renewsAutomatically: boolean; active: boolean; createdAt: string };
type Student = { id: string; personNumber: number; name: string; mobile: string };
type Contract = { id: string; contractNumber: number; studentId: string; studentName: string; studentMobile: string; planId: string | null; planName: string; billingInterval: string; durationMonths: number; baseAmountCents: number; amountCents: number; benefitName: string; renewsAutomatically: boolean; startsOn: string; endsOn: string; status: Status; statusNote: string; createdAt: string };
type Status = "AGENDADO" | "ATIVO" | "PAUSADO" | "CANCELADO" | "ENCERRADO";
type View = "CONTRACTS" | "PLANS" | "NEW_PLAN" | "NEW_CONTRACT";

const statuses: Array<Status | "TODOS"> = ["TODOS", "ATIVO", "AGENDADO", "PAUSADO", "ENCERRADO", "CANCELADO"];
const intervals = ["MENSAL", "TRIMESTRAL", "SEMESTRAL", "ANUAL"];

export default function ContractsWorkspace() {
  const [view, setView] = useState<View>("CONTRACTS");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<Status | "TODOS">("ATIVO");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [planDraft, setPlanDraft] = useState({ name: "", description: "", billingInterval: "MENSAL", durationMonths: "1", amount: "", renewsAutomatically: true });
  const [contractDraft, setContractDraft] = useState({ studentId: "", planId: "", startsOn: todayIso(), amount: "", renewsAutomatically: true });
  const [editingStatus, setEditingStatus] = useState<{ id: string; status: Status; note: string } | null>(null);

  useEffect(() => { void loadWorkspace(); }, []);

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("SESSÃO NÃO ENCONTRADA.");
    const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init?.headers } });
    const payload = await response.json().catch(() => ({})) as { success?: boolean; message?: string } & T;
    if (!response.ok || !payload.success) throw new Error(payload.message || "NÃO FOI POSSÍVEL CONCLUIR A OPERAÇÃO.");
    return payload;
  }

  async function loadWorkspace() {
    setLoading(true);
    try {
      const payload = await request<{ plans: Plan[]; students: Student[]; contracts: Contract[] }>("/api/xpace/contratos");
      setPlans(payload.plans); setStudents(payload.students); setContracts(payload.contracts);
    } catch (error) { setNotice(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL CARREGAR OS CONTRATOS."); }
    finally { setLoading(false); }
  }

  const visibleContracts = useMemo(() => {
    const term = normalize(search);
    return contracts.filter((contract) => (status === "TODOS" || contract.status === status) && (!term || normalize(`${contract.studentName} ${contract.planName} ${contract.contractNumber}`).includes(term)));
  }, [contracts, search, status]);
  const activePlans = plans.filter((plan) => plan.active);

  function startPlan() { setPlanDraft({ name: "", description: "", billingInterval: "MENSAL", durationMonths: "1", amount: "", renewsAutomatically: true }); setNotice(""); setView("NEW_PLAN"); }
  function startContract() { setContractDraft({ studentId: students[0]?.id ?? "", planId: activePlans[0]?.id ?? "", startsOn: todayIso(), amount: activePlans[0] ? centsToInput(activePlans[0].amountCents) : "", renewsAutomatically: activePlans[0]?.renewsAutomatically ?? true }); setNotice(""); setView("NEW_CONTRACT"); }

  async function createPlan(event: FormEvent) {
    event.preventDefault(); setSaving(true); setNotice("");
    try {
      await request("/api/xpace/contratos", { method: "POST", body: JSON.stringify({ action: "CREATE_PLAN", plan: { ...planDraft, durationMonths: Number(planDraft.durationMonths), amountCents: inputToCents(planDraft.amount) } }) });
      await loadWorkspace(); setView("PLANS"); setNotice("PLANO CADASTRADO. OS NOVOS CONTRATOS JÁ PODEM USÁ-LO.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL CADASTRAR O PLANO."); }
    finally { setSaving(false); }
  }

  async function createContract(event: FormEvent) {
    event.preventDefault(); setSaving(true); setNotice("");
    try {
      await request("/api/xpace/contratos", { method: "POST", body: JSON.stringify({ action: "CREATE_CONTRACT", contract: { ...contractDraft, amountCents: inputToCents(contractDraft.amount) } }) });
      await loadWorkspace(); setView("CONTRACTS"); setStatus("ATIVO"); setNotice("CONTRATO REGISTRADO. O VALOR E AS CONDIÇÕES FICARAM PRESERVADOS NO HISTÓRICO.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL REGISTRAR O CONTRATO."); }
    finally { setSaving(false); }
  }

  async function setPlanActive(plan: Plan) {
    setSaving(true); setNotice("");
    try {
      await request("/api/xpace/contratos", { method: "PATCH", body: JSON.stringify({ action: "SET_PLAN_ACTIVE", plan: { id: plan.id, active: !plan.active } }) });
      await loadWorkspace(); setNotice(plan.active ? "PLANO ARQUIVADO. OS CONTRATOS EXISTENTES FORAM PRESERVADOS." : "PLANO REATIVADO PARA NOVAS MATRÍCULAS.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL ATUALIZAR O PLANO."); }
    finally { setSaving(false); }
  }

  async function saveStatus(event: FormEvent) {
    event.preventDefault();
    if (!editingStatus) return;
    setSaving(true); setNotice("");
    try {
      await request("/api/xpace/contratos", { method: "PATCH", body: JSON.stringify({ action: "SET_CONTRACT_STATUS", contract: { id: editingStatus.id, status: editingStatus.status, statusNote: editingStatus.note } }) });
      await loadWorkspace(); setEditingStatus(null); setNotice("STATUS DO CONTRATO ATUALIZADO E REGISTRADO NO HISTÓRICO.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL ATUALIZAR O STATUS."); }
    finally { setSaving(false); }
  }

  const selectedPlan = activePlans.find((plan) => plan.id === contractDraft.planId);

  if (view === "NEW_PLAN") return <section className="xd-contracts"><ModuleHeader eyebrow="CATÁLOGO DE PLANOS" title="NOVO PLANO." copy="O plano é uma regra comercial reutilizável. Contratos já emitidos não mudam quando este cadastro mudar." back={() => setView("PLANS")} />
    <form className="xd-contract-form" onSubmit={createPlan}>
      <div className="xd-contract-form-grid xd-contract-form-grid--plan">
        <Field label="NOME DO PLANO" value={planDraft.name} onChange={(value) => setPlanDraft({ ...planDraft, name: value })} required />
        <label>CICLO<select value={planDraft.billingInterval} onChange={(event) => setPlanDraft({ ...planDraft, billingInterval: event.target.value })}>{intervals.map((item) => <option key={item}>{item}</option>)}</select></label>
        <Field label="DURAÇÃO (MESES)" type="number" min="1" max="60" value={planDraft.durationMonths} onChange={(value) => setPlanDraft({ ...planDraft, durationMonths: value })} required />
        <Field label="VALOR DO CICLO (R$)" type="number" min="0" step="0.01" value={planDraft.amount} onChange={(value) => setPlanDraft({ ...planDraft, amount: value })} required />
        <label className="xd-contract-wide">DESCRIÇÃO<input value={planDraft.description} onChange={(event) => setPlanDraft({ ...planDraft, description: event.target.value })} placeholder="EX.: 2 AULAS SEMANAIS, MODALIDADES LIVRES..." /></label>
        <label className="xd-contract-renew"><input type="checkbox" checked={planDraft.renewsAutomatically} onChange={(event) => setPlanDraft({ ...planDraft, renewsAutomatically: event.target.checked })} /> RENOVAR AUTOMATICAMENTE ATÉ CANCELAMENTO</label>
      </div>
      <FormActions back={() => setView("PLANS")} saving={saving} label="SALVAR PLANO" />
    </form>{notice ? <p className="xd-feedback">{notice}</p> : null}</section>;

  if (view === "NEW_CONTRACT") return <section className="xd-contracts"><ModuleHeader eyebrow="MATRÍCULA E VIGÊNCIA" title="NOVO CONTRATO." copy="Selecione o aluno e o plano. As condições são copiadas para o contrato e ficam preservadas mesmo quando o catálogo for atualizado." back={() => setView("CONTRACTS")} />
    {!students.length || !activePlans.length ? <EmptySetup students={students.length} plans={activePlans.length} onPlans={() => setView("PLANS")} onStudents={() => setView("CONTRACTS")} /> : <form className="xd-contract-form" onSubmit={createContract}>
      <div className="xd-contract-form-grid xd-contract-form-grid--contract">
        <label className="xd-contract-wide">ALUNO<select value={contractDraft.studentId} onChange={(event) => setContractDraft({ ...contractDraft, studentId: event.target.value })}>{students.map((student) => <option key={student.id} value={student.id}>{student.name} · {student.mobile || "SEM CELULAR"}</option>)}</select></label>
        <label>PLANO<select value={contractDraft.planId} onChange={(event) => { const plan = activePlans.find((item) => item.id === event.target.value); setContractDraft({ ...contractDraft, planId: event.target.value, amount: plan ? centsToInput(plan.amountCents) : "", renewsAutomatically: plan?.renewsAutomatically ?? false }); }}>{activePlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {formatCurrency(plan.amountCents)}</option>)}</select></label>
        <Field label="INÍCIO DA VIGÊNCIA" type="date" value={contractDraft.startsOn} onChange={(value) => setContractDraft({ ...contractDraft, startsOn: value })} required />
        <Field label="VALOR CONTRATADO (R$)" type="number" min="0" step="0.01" value={contractDraft.amount} onChange={(value) => setContractDraft({ ...contractDraft, amount: value })} required />
        <label className="xd-contract-renew"><input type="checkbox" checked={contractDraft.renewsAutomatically} onChange={(event) => setContractDraft({ ...contractDraft, renewsAutomatically: event.target.checked })} /> RENOVA AUTOMATICAMENTE</label>
      </div>
      {selectedPlan ? <div className="xd-contract-preview"><CalendarClock size={19} /><span><small>{contractDraft.renewsAutomatically ? "RENOVAÇÃO PROGRAMADA" : "VIGÊNCIA CALCULADA"}</small><strong>{contractDraft.renewsAutomatically ? `RENOVA A CADA ${selectedPlan.billingInterval} ATÉ CANCELAMENTO` : `${selectedPlan.durationMonths} ${selectedPlan.durationMonths === 1 ? "MÊS" : "MESES"} · ${selectedPlan.billingInterval}`}</strong></span><b>{formatCurrency(inputToCents(contractDraft.amount))}</b></div> : null}
      <FormActions back={() => setView("CONTRACTS")} saving={saving} label="REGISTRAR CONTRATO" />
    </form>}{notice ? <p className="xd-feedback">{notice}</p> : null}</section>;

  return <section className="xd-contracts">
    <div className="xd-contract-title"><div><span>VITRINE · MATRÍCULAS</span><h1>PLANOS E CONTRATOS.</h1><p>Condições comerciais, vigência e situação de cada aluno em uma mesma operação.</p></div><div className="xd-contract-title-actions"><button type="button" className="xd-secondary" onClick={() => setView(view === "PLANS" ? "CONTRACTS" : "PLANS")}><SlidersHorizontal size={16} /> {view === "PLANS" ? "CONTRATOS" : "CATÁLOGO"}</button><button type="button" className="xd-primary" onClick={startContract}><UserRoundPlus size={17} /> NOVO CONTRATO</button></div></div>
    {notice ? <p className="xd-feedback">{notice}</p> : null}
    {view === "PLANS" ? <PlansList plans={plans} saving={saving} onCreate={startPlan} onToggle={setPlanActive} /> : <>
      <div className="xd-contract-tools"><label><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="BUSCAR POR ALUNO, PLANO OU Nº" /></label><label><CheckCircle2 size={16} /><select value={status} onChange={(event) => setStatus(event.target.value as Status | "TODOS")}>{statuses.map((item) => <option value={item} key={item}>{item}</option>)}</select></label></div>
      <div className="xd-contract-stats"><Stat value={contracts.filter((contract) => contract.status === "ATIVO").length} label="EM VIGOR" /><Stat value={contracts.filter((contract) => contract.status === "AGENDADO").length} label="AGENDADOS" /><Stat value={contracts.filter((contract) => contract.status === "PAUSADO").length} label="PAUSADOS" /></div>
      {loading ? <p className="xd-contract-loading">CARREGANDO CONTRATOS...</p> : <div className="xd-contract-list">{visibleContracts.length ? visibleContracts.map((contract) => <ContractRow key={contract.id} contract={contract} onStatus={() => setEditingStatus({ id: contract.id, status: contract.status, note: contract.statusNote })} />) : <p className="xd-empty-community">NENHUM CONTRATO ENCONTRADO NESTE FILTRO.</p>}</div>}
    </>}
    {editingStatus ? <div className="xd-contract-overlay" role="presentation"><form className="xd-status-dialog" onSubmit={saveStatus}><span>ALTERAR STATUS</span><h2>CONTRATO #{String(contracts.find((contract) => contract.id === editingStatus.id)?.contractNumber ?? "").padStart(5, "0")}</h2><label>SITUAÇÃO<select value={editingStatus.status} onChange={(event) => setEditingStatus({ ...editingStatus, status: event.target.value as Status })}>{statuses.filter((item): item is Status => item !== "TODOS").map((item) => <option value={item} key={item}>{item}</option>)}</select></label><label>{editingStatus.status === "CANCELADO" ? "MOTIVO DO CANCELAMENTO *" : "OBSERVAÇÃO"}<input value={editingStatus.note} onChange={(event) => setEditingStatus({ ...editingStatus, note: event.target.value })} required={editingStatus.status === "CANCELADO"} placeholder={editingStatus.status === "CANCELADO" ? "INFORME O MOTIVO" : "OPCIONAL"} /></label><footer><button type="button" className="xd-secondary" onClick={() => setEditingStatus(null)}>CANCELAR</button><button type="submit" className="xd-primary" disabled={saving}>SALVAR STATUS</button></footer></form></div> : null}
  </section>;
}

function PlansList({ plans, saving, onCreate, onToggle }: { plans: Plan[]; saving: boolean; onCreate: () => void; onToggle: (plan: Plan) => void }) { return <div className="xd-plans"><header><div><span>CONFIGURAÇÃO COMERCIAL</span><h2>CATÁLOGO DE PLANOS.</h2></div><button type="button" className="xd-primary" onClick={onCreate}><Plus size={17} /> NOVO PLANO</button></header>{plans.length ? <div>{plans.map((plan) => <article className={!plan.active ? "is-archived" : ""} key={plan.id}><div className="xd-plan-icon"><BadgeDollarSign size={20} /></div><div><strong>{plan.name}</strong><small>{plan.description || "SEM DESCRIÇÃO"}</small></div><span>{plan.renewsAutomatically ? `RENOVÁVEL · ${plan.billingInterval}` : `${plan.durationMonths} ${plan.durationMonths === 1 ? "MÊS" : "MESES"} · ${plan.billingInterval}`}</span><b>{formatCurrency(plan.amountCents)}</b><button type="button" className="xd-secondary" disabled={saving} onClick={() => onToggle(plan)}>{plan.active ? "ARQUIVAR" : "REATIVAR"}</button></article>)}</div> : <p className="xd-empty-community">NENHUM PLANO CADASTRADO. CRIE O PRIMEIRO PARA COMEÇAR AS MATRÍCULAS.</p>}</div>; }
function ContractRow({ contract, onStatus }: { contract: Contract; onStatus: () => void }) { return <article className="xd-contract-row"><div className="xd-contract-ident"><span>#{String(contract.contractNumber).padStart(5, "0")}</span><strong>{contract.studentName}</strong><small>{contract.studentMobile || "SEM CELULAR"}</small></div><div className="xd-contract-plan"><strong>{contract.planName}</strong><small>{contract.renewsAutomatically ? `RENOVA A CADA ${contract.billingInterval}` : `${contract.durationMonths} ${contract.durationMonths === 1 ? "MÊS" : "MESES"} · ${contract.billingInterval}`}</small></div><div className="xd-contract-period"><small>{contract.renewsAutomatically ? "INÍCIO DA RECORRÊNCIA" : "VIGÊNCIA"}</small><strong>{contract.renewsAutomatically ? formatDate(contract.startsOn) : `${formatDate(contract.startsOn)} — ${formatDate(contract.endsOn)}`}</strong></div><b>{formatCurrency(contract.amountCents)}</b><button type="button" className={`xd-contract-status xd-contract-status--${contract.status.toLowerCase()}`} onClick={onStatus}>{contract.status === "ATIVO" ? <CheckCircle2 size={15} /> : contract.status === "PAUSADO" ? <PauseCircle size={15} /> : contract.status === "CANCELADO" ? <XCircle size={15} /> : <FilePlus2 size={15} />}{contract.status}</button></article>; }
function ModuleHeader({ eyebrow, title, copy, back }: { eyebrow: string; title: string; copy: string; back: () => void }) { return <header className="xd-module-heading"><button type="button" className="xd-return" onClick={back}>VOLTAR A PLANOS E CONTRATOS</button><span>{eyebrow}</span><h1>{title}</h1><p>{copy}</p></header>; }
function Field({ label, value, onChange, type = "text", min, max, step, required }: { label: string; value: string; onChange: (value: string) => void; type?: string; min?: string; max?: string; step?: string; required?: boolean }) { return <label>{label}<input type={type} min={min} max={max} step={step} value={value} onChange={(event) => onChange(event.target.value)} required={required} /></label>; }
function FormActions({ back, saving, label }: { back: () => void; saving: boolean; label: string }) { return <footer className="xd-contract-form-actions"><button type="button" className="xd-secondary" onClick={back}>CANCELAR</button><button type="submit" className="xd-primary" disabled={saving}>{saving ? "SALVANDO..." : label}</button></footer>; }
function EmptySetup({ students, plans, onPlans, onStudents }: { students: number; plans: number; onPlans: () => void; onStudents: () => void }) { return <div className="xd-contract-empty-setup"><strong>AINDA NÃO É POSSÍVEL EMITIR ESTE CONTRATO.</strong><span>{!students ? "CADASTRE AO MENOS UM ALUNO NA COMUNIDADE." : "CADASTRE AO MENOS UM PLANO ATIVO NO CATÁLOGO."}</span><button type="button" className="xd-primary" onClick={!students ? onStudents : onPlans}>{!students ? "VOLTAR" : "ABRIR CATÁLOGO"}</button></div>; }
function Stat({ value, label }: { value: number; label: string }) { return <span><b>{value}</b><small>{label}</small></span>; }
function normalize(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR"); }
function formatCurrency(cents: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((Number.isFinite(cents) ? cents : 0) / 100); }
function inputToCents(value: string) { const number = Number(value.replace(",", ".")); return Number.isFinite(number) ? Math.round(number * 100) : 0; }
function centsToInput(cents: number) { return (cents / 100).toFixed(2); }
function formatDate(value: string) { if (!value) return "—"; const [year, month, day] = value.split("-"); return `${day}/${month}/${year}`; }
function todayIso() { const parts = new Intl.DateTimeFormat("en", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()); const take = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ""; return `${take("year")}-${take("month")}-${take("day")}`; }

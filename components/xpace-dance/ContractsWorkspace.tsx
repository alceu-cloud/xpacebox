"use client";

import { BadgeDollarSign, FileText, FileUp, Filter, Landmark, Plus, Search, Settings2, ShieldCheck } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { supabase } from "@/lib/supabase";

type CatalogSettings = {
  allowManualRenewal: boolean;
  allowInstallments: boolean;
  allowAppSale: boolean;
  sendForSignature: boolean;
  limitSalePeriod: boolean;
  maxSuspensions: number;
  maxSuspensionDays: number;
  allowPreSale: boolean;
  limitAgeRange: boolean;
  enrollmentFeeEnabled: boolean;
  salesCommissionEnabled: boolean;
  revenueCategory: string;
  durationUnit: "DIA" | "SEMANA" | "MÊS";
};
type Plan = { id: string; name: string; description: string; billingInterval: string; durationMonths: number; amountCents: number; renewsAutomatically: boolean; modalities: string[]; catalogSettings: Partial<CatalogSettings>; active: boolean };
type PlanDraft = { name: string; description: string; duration: string; amount: string; modalities: string; renewsAutomatically: boolean; settings: CatalogSettings };

const durationUnits: CatalogSettings["durationUnit"][] = ["DIA", "SEMANA", "MÊS"];
const defaultSettings = (): CatalogSettings => ({ allowManualRenewal: true, allowInstallments: false, allowAppSale: false, sendForSignature: false, limitSalePeriod: false, maxSuspensions: 0, maxSuspensionDays: 0, allowPreSale: false, limitAgeRange: false, enrollmentFeeEnabled: false, salesCommissionEnabled: false, revenueCategory: "VENDAS", durationUnit: "MÊS" });
const emptyDraft = (): PlanDraft => ({ name: "", description: "", duration: "1", amount: "", modalities: "", renewsAutomatically: true, settings: defaultSettings() });

export default function ContractsWorkspace() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"CATALOG" | "NEW">("CATALOG");
  const [draft, setDraft] = useState<PlanDraft>(emptyDraft);
  const [dialog, setDialog] = useState<"PERMISSIONS" | "FINANCE" | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => { void loadCatalog(); }, []);

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("SESSÃO NÃO ENCONTRADA.");
    const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init?.headers } });
    const payload = await response.json().catch(() => ({})) as { success?: boolean; message?: string } & T;
    if (!response.ok || !payload.success) throw new Error(payload.message || "NÃO FOI POSSÍVEL CONCLUIR A OPERAÇÃO.");
    return payload;
  }

  async function loadCatalog() {
    setLoading(true);
    try {
      const payload = await request<{ plans: Plan[] }>("/api/xpace/contratos");
      setPlans(payload.plans);
    } catch (error) { setNotice(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL CARREGAR OS CONTRATOS."); }
    finally { setLoading(false); }
  }

  const visiblePlans = useMemo(() => {
    const term = normalize(search);
    return plans.filter((plan) => !term || normalize(`${plan.name} ${plan.description} ${plan.modalities.join(" ")}`).includes(term));
  }, [plans, search]);

  function startNew() { setDraft(emptyDraft()); setNotice(""); setView("NEW"); }

  async function createPlan(event: FormEvent) {
    event.preventDefault();
    setSaving(true); setNotice("");
    try {
      await request("/api/xpace/contratos", {
        method: "POST",
        body: JSON.stringify({
          action: "CREATE_PLAN",
          plan: {
            name: draft.name,
            description: draft.description,
            billingInterval: "MENSAL",
            durationMonths: Number(draft.duration),
            amountCents: inputToCents(draft.amount),
            renewsAutomatically: draft.renewsAutomatically,
            modalities: draft.modalities.split(","),
            catalogSettings: draft.settings,
          },
        }),
      });
      await loadCatalog(); setView("CATALOG"); setNotice("CONTRATO CADASTRADO NO CATÁLOGO.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL CADASTRAR O CONTRATO."); }
    finally { setSaving(false); }
  }

  async function setPlanActive(plan: Plan) {
    setSaving(true); setNotice("");
    try {
      await request("/api/xpace/contratos", { method: "PATCH", body: JSON.stringify({ action: "SET_PLAN_ACTIVE", plan: { id: plan.id, active: !plan.active } }) });
      await loadCatalog(); setNotice(plan.active ? "CONTRATO ARQUIVADO. AS VENDAS JÁ REALIZADAS FORAM PRESERVADAS." : "CONTRATO DISPONÍVEL NOVAMENTE PARA NOVAS VENDAS.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL ATUALIZAR O CONTRATO."); }
    finally { setSaving(false); }
  }

  if (view === "NEW") return <section className="xd-contracts">
    <ModuleHeader title="NOVO CONTRATO." copy="Defina o contrato que poderá ser vendido depois no perfil do aluno." back={() => setView("CATALOG")} />
    <form className="xd-contract-builder" onSubmit={createPlan}>
      <fieldset className="xd-contract-builder-section"><legend><FileText size={18} /> DADOS DO CONTRATO</legend><div className="xd-contract-form-grid xd-contract-form-grid--plan">
        <Field label="DESCRIÇÃO" value={draft.name} onChange={(name) => setDraft({ ...draft, name })} placeholder="EX.: BALLET MENSAL" required />
        <Field label="VALOR TOTAL (R$)" type="number" min="0" step="0.01" value={draft.amount} onChange={(amount) => setDraft({ ...draft, amount })} required />
        <Field label="DURAÇÃO" type="number" min="1" max="60" value={draft.duration} onChange={(duration) => setDraft({ ...draft, duration })} required />
        <label>TIPO DE DURAÇÃO<select value={draft.settings.durationUnit} onChange={(event) => setDraft({ ...draft, settings: { ...draft.settings, durationUnit: event.target.value as CatalogSettings["durationUnit"] } })}>{durationUnits.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select></label>
        <label className="xd-contract-wide">DETALHES<input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="EX.: 2 AULAS POR SEMANA" /></label>
      </div></fieldset>
      <fieldset className="xd-contract-builder-section"><legend><BadgeDollarSign size={18} /> MODALIDADES</legend><label className="xd-contract-modalities">MODALIDADES VINCULADAS<input value={draft.modalities} onChange={(event) => setDraft({ ...draft, modalities: event.target.value })} placeholder="EX.: BALLET, DANÇAS URBANAS" /></label></fieldset>
      <fieldset className="xd-contract-builder-section"><legend><Settings2 size={18} /> CONFIGURAÇÕES</legend><div className="xd-contract-settings">
        <Toggle label="PERMITE RENOVAR" checked={draft.settings.allowManualRenewal} onChange={(allowManualRenewal) => setDraft({ ...draft, settings: { ...draft.settings, allowManualRenewal } })} />
        <Toggle label="RENOVAR AUTOMATICAMENTE" checked={draft.renewsAutomatically} disabled={!draft.settings.allowManualRenewal} onChange={(renewsAutomatically) => setDraft({ ...draft, renewsAutomatically })} />
        <Toggle label="PERMITE RECEBER PARCELADO" checked={draft.settings.allowInstallments} onChange={(allowInstallments) => setDraft({ ...draft, settings: { ...draft.settings, allowInstallments } })} />
        <Toggle label="VENDER PELO APP" checked={draft.settings.allowAppSale} onChange={(allowAppSale) => setDraft({ ...draft, settings: { ...draft.settings, allowAppSale } })} />
        <Toggle label="ENVIAR PARA ASSINATURA ONLINE" checked={draft.settings.sendForSignature} onChange={(sendForSignature) => setDraft({ ...draft, settings: { ...draft.settings, sendForSignature } })} />
      </div><div className="xd-contract-template"><span>MODELO DE CONTRATO</span><button type="button" className="xd-secondary" disabled title="Disponível quando o repositório de modelos e a assinatura eletrônica forem configurados."><FileUp size={16} /> IMPORTAR ARQUIVO</button></div></fieldset>
      <fieldset className="xd-contract-builder-section"><legend><Settings2 size={18} /> CONFIGURAÇÕES AVANÇADAS <small>(OPCIONAL)</small></legend><div className="xd-contract-advanced-list"><article><div><strong>PERMISSÕES E RESTRIÇÕES</strong><p>Defina período de venda, pré-venda, faixa etária e regras de suspensão deste contrato.</p></div><button type="button" onClick={() => setDialog("PERMISSIONS")} aria-label="Configurar permissões e restrições" title="Configurar permissões e restrições"><Settings2 size={18} /></button></article><article><div><strong>FINANCEIRO</strong><p>Defina adesão, comissão e a categoria de receita deste contrato.</p></div><button type="button" onClick={() => setDialog("FINANCE")} aria-label="Configurar financeiro" title="Configurar financeiro"><Landmark size={18} /></button></article></div></fieldset>
      <footer className="xd-contract-form-actions"><button type="button" className="xd-secondary" onClick={() => setView("CATALOG")}>CANCELAR</button><button type="submit" className="xd-primary" disabled={saving}>{saving ? "SALVANDO..." : "SALVAR CONTRATO"}</button></footer>
    </form>
    {notice ? <p className="xd-feedback">{notice}</p> : null}
    {dialog ? <SettingsDialog kind={dialog} settings={draft.settings} onChange={(settings) => setDraft({ ...draft, settings })} onClose={() => setDialog(null)} /> : null}
  </section>;

  return <section className="xd-contracts">
    <div className="xd-contract-title"><div><span>ADMINISTRATIVO · CATÁLOGO</span><h1>CONTRATOS.</h1><p>Cadastre as opções que poderão ser vendidas depois para cada aluno.</p></div><button type="button" className="xd-primary" onClick={startNew}><Plus size={17} /> ADICIONAR CONTRATO</button></div>
    <div className="xd-contract-tools"><label><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="PESQUISAR CONTRATO" /></label><button type="button" className="xd-secondary" disabled title="Filtros em preparação"><Filter size={16} /> FILTROS</button></div>
    {notice ? <p className="xd-feedback">{notice}</p> : null}
    {loading ? <p className="xd-contract-loading">CARREGANDO CONTRATOS...</p> : <div className="xd-plans"><header><div><span>CONTRATOS CADASTRADOS</span><h2>{plans.length} {plans.length === 1 ? "CONTRATO" : "CONTRATOS"}</h2></div></header>{visiblePlans.length ? <div>{visiblePlans.map((plan) => <article className={!plan.active ? "is-archived" : ""} key={plan.id}><div className="xd-plan-icon"><BadgeDollarSign size={20} /></div><div><strong>{plan.name}</strong><small>{plan.modalities.length ? plan.modalities.join(" · ") : plan.description || "SEM MODALIDADE VINCULADA"}</small></div><span>{plan.durationMonths} {formatDurationUnit(plan.catalogSettings.durationUnit, plan.durationMonths)}</span><b>{formatCurrency(plan.amountCents)}</b><button type="button" className="xd-secondary" disabled={saving} onClick={() => void setPlanActive(plan)}>{plan.active ? "ARQUIVAR" : "REATIVAR"}</button></article>)}</div> : <p className="xd-empty-community">NENHUM CONTRATO ENCONTRADO.</p>}</div>}
  </section>;
}

function SettingsDialog({ kind, settings, onChange, onClose }: { kind: "PERMISSIONS" | "FINANCE"; settings: CatalogSettings; onChange: (settings: CatalogSettings) => void; onClose: () => void }) {
  const isPermissions = kind === "PERMISSIONS";
  return <div className="xd-contract-overlay" role="presentation"><section className="xd-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="xd-settings-title"><header><span>{isPermissions ? <ShieldCheck size={21} /> : <Landmark size={21} />}</span><h2 id="xd-settings-title">{isPermissions ? "PERMISSÕES E RESTRIÇÕES" : "FINANCEIRO"}</h2><button type="button" onClick={onClose} aria-label="Fechar">×</button></header>{isPermissions ? <div className="xd-settings-dialog-content"><Toggle label="LIMITA O PERÍODO DE VENDA" checked={settings.limitSalePeriod} onChange={(limitSalePeriod) => onChange({ ...settings, limitSalePeriod })} /><Field label="QUANTIDADE MÁXIMA DE SUSPENSÃO" type="number" min="0" value={String(settings.maxSuspensions)} onChange={(value) => onChange({ ...settings, maxSuspensions: Number(value) })} /><Field label="QUANTIDADE MÁXIMA DE DIAS DA SUSPENSÃO" type="number" min="0" value={String(settings.maxSuspensionDays)} onChange={(value) => onChange({ ...settings, maxSuspensionDays: Number(value) })} /><Toggle label="PERMITE PRÉ-VENDA" checked={settings.allowPreSale} onChange={(allowPreSale) => onChange({ ...settings, allowPreSale })} /><Toggle label="LIMITA A FAIXA ETÁRIA DE VENDA" checked={settings.limitAgeRange} onChange={(limitAgeRange) => onChange({ ...settings, limitAgeRange })} /></div> : <div className="xd-settings-dialog-content"><Toggle label="POSSUI VALOR DE ADESÃO OU MATRÍCULA" checked={settings.enrollmentFeeEnabled} onChange={(enrollmentFeeEnabled) => onChange({ ...settings, enrollmentFeeEnabled })} /><Toggle label="COMISSIONAR CONSULTOR DE VENDAS" checked={settings.salesCommissionEnabled} onChange={(salesCommissionEnabled) => onChange({ ...settings, salesCommissionEnabled })} /><Field label="CATEGORIA DE RECEITA" value={settings.revenueCategory} onChange={(revenueCategory) => onChange({ ...settings, revenueCategory })} /></div>}<footer><button type="button" className="xd-secondary" onClick={onClose}>CANCELAR</button><button type="button" className="xd-primary" onClick={onClose}>SALVAR</button></footer></section></div>;
}

function ModuleHeader({ title, copy, back }: { title: string; copy: string; back: () => void }) { return <header className="xd-module-heading"><button type="button" className="xd-return" onClick={back}>CONTRATOS</button><span>ADMINISTRATIVO · CATÁLOGO</span><h1>{title}</h1><p>{copy}</p></header>; }
function Toggle({ label, checked, onChange, disabled = false }: { label: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) { return <label className="xd-setting-toggle"><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} /><span aria-hidden="true" /><strong>{label}</strong></label>; }
function Field({ label, value, onChange, type = "text", min, max, step, placeholder, required }: { label: string; value: string; onChange: (value: string) => void; type?: string; min?: string; max?: string; step?: string; placeholder?: string; required?: boolean }) { return <label>{label}<input type={type} min={min} max={max} step={step} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} required={required} /></label>; }
function normalize(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR"); }
function formatCurrency(cents: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((Number.isFinite(cents) ? cents : 0) / 100); }
function inputToCents(value: string) { const number = Number(value.replace(",", ".")); return Number.isFinite(number) ? Math.round(number * 100) : 0; }
function formatDurationUnit(unit: unknown, value: number) { const normalized = unit === "DIA" || unit === "SEMANA" || unit === "MÊS" ? unit : "MÊS"; if (value === 1) return normalized; return normalized === "MÊS" ? "MESES" : `${normalized}S`; }

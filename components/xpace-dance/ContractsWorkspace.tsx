"use client";

import { BadgeDollarSign, FileText, FileUp, Filter, Landmark, Plus, Search, Settings2, ShieldCheck } from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { supabase } from "@/lib/supabase";

type CatalogSettings = {
  allowManualRenewal: boolean;
  allowInstallments: boolean;
  allowAppSale: boolean;
  sendForSignature: boolean;
  limitSalePeriod: boolean;
  saleStartsOn: string;
  saleEndsOn: string;
  maxSuspensions: number;
  maxSuspensionDays: number;
  allowPreSale: boolean;
  limitAgeRange: boolean;
  minAge: number;
  maxAge: number;
  enrollmentFeeEnabled: boolean;
  salesCommissionEnabled: boolean;
  revenueCategory: string;
  durationUnit: "DIA" | "SEMANA" | "MÊS";
};
type AccessPeriod = "SEM_LIMITE" | "DIA" | "SEMANA" | "MES";
type PlanModalityRule = { modalityId: string; sessionsPerWeek: number; accessPeriod: AccessPeriod; accessLimit: number | null; allowEarlyAccess: boolean; allowReschedule: boolean; requiresEnrollment: boolean; limitPromotionalTimes: boolean };
type Plan = { id: string; name: string; description: string; billingInterval: string; durationMonths: number; amountCents: number; renewsAutomatically: boolean; modalities: string[]; modalityRules: PlanModalityRule[]; catalogSettings: Partial<CatalogSettings>; active: boolean };
type PlanDraft = { name: string; duration: string; amount: string; modalityRules: PlanModalityRule[]; renewsAutomatically: boolean; settings: CatalogSettings };
type Modality = { id: string; name: string; active: boolean };

const durationUnits: CatalogSettings["durationUnit"][] = ["DIA", "SEMANA", "MÊS"];
const defaultSettings = (): CatalogSettings => ({ allowManualRenewal: true, allowInstallments: false, allowAppSale: false, sendForSignature: false, limitSalePeriod: false, saleStartsOn: "", saleEndsOn: "", maxSuspensions: 0, maxSuspensionDays: 0, allowPreSale: false, limitAgeRange: false, minAge: 0, maxAge: 120, enrollmentFeeEnabled: false, salesCommissionEnabled: false, revenueCategory: "VENDAS", durationUnit: "MÊS" });
const emptyDraft = (): PlanDraft => ({ name: "", duration: "1", amount: "", modalityRules: [], renewsAutomatically: true, settings: defaultSettings() });

export default function ContractsWorkspace() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [modalities, setModalities] = useState<Modality[]>([]);
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const templateInput = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"CATALOG" | "NEW">("CATALOG");
  const [draft, setDraft] = useState<PlanDraft>(emptyDraft);
  const [dialog, setDialog] = useState<"PERMISSIONS" | "FINANCE" | null>(null);
  const [modalitiesDialogOpen, setModalitiesDialogOpen] = useState(false);
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
      const payload = await request<{ plans: Plan[]; modalities: Modality[] }>("/api/xpace/contratos");
      setPlans(payload.plans);
      setModalities(payload.modalities);
    } catch (error) { setNotice(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL CARREGAR OS CONTRATOS."); }
    finally { setLoading(false); }
  }

  const visiblePlans = useMemo(() => {
    const term = normalize(search);
    return plans.filter((plan) => !term || normalize(`${plan.name} ${plan.description} ${plan.modalities.join(" ")}`).includes(term));
  }, [plans, search]);

  function startNew() { setDraft(emptyDraft()); setTemplateFile(null); setNotice(""); setView("NEW"); }
  function addModalityRule(rule: PlanModalityRule) { setDraft({ ...draft, modalityRules: [...draft.modalityRules, rule] }); setModalitiesDialogOpen(false); }
  function removeModalityRule(modalityId: string) { setDraft({ ...draft, modalityRules: draft.modalityRules.filter((rule) => rule.modalityId !== modalityId) }); }

  async function createPlan(event: FormEvent) {
    event.preventDefault();
    setSaving(true); setNotice("");
    try {
      const created = await request<{ plan: { id: string } }>("/api/xpace/contratos", {
        method: "POST",
        body: JSON.stringify({
          action: "CREATE_PLAN",
          plan: {
            name: draft.name,
            description: "",
            billingInterval: "MENSAL",
            durationMonths: Number(draft.duration),
            amountCents: inputToCents(draft.amount),
            renewsAutomatically: draft.renewsAutomatically,
            modalityRules: draft.modalityRules,
            catalogSettings: draft.settings,
          },
        }),
      });
      if (templateFile) {
        const { data } = await supabase.auth.getSession();
        const response = await fetch(`/api/xpace/contratos/${created.plan.id}/modelo`, { method: "POST", headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` }, body: (() => { const form = new FormData(); form.set("file", templateFile); return form; })() });
        const payload = await response.json().catch(() => ({})) as { success?: boolean; message?: string };
        if (!response.ok || !payload.success) throw new Error(payload.message || "O CONTRATO FOI CRIADO, MAS O MODELO NÃO FOI ENVIADO.");
      }
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
  async function deletePlan(plan: Plan) {
    if (!window.confirm(`Excluir o contrato ${plan.name}? Essa ação só será permitida se ele não tiver sido vinculado a aluno.`)) return;
    setSaving(true); setNotice("");
    try {
      await request("/api/xpace/contratos", { method: "DELETE", body: JSON.stringify({ action: "DELETE_PLAN", plan: { id: plan.id } }) });
      await loadCatalog(); setNotice("CONTRATO EXCLUÍDO.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL EXCLUIR O CONTRATO."); }
    finally { setSaving(false); }
  }

  if (view === "NEW") return <section className="xd-contracts">
    <ModuleHeader title="NOVO CONTRATO." copy="Defina o contrato que poderá ser vendido depois no perfil do aluno." />
    <form className="xd-contract-builder" onSubmit={createPlan}>
      <fieldset className="xd-contract-builder-section"><legend><FileText size={18} /> DADOS DO CONTRATO</legend><div className="xd-contract-form-grid xd-contract-form-grid--plan">
        <Field label="DESCRIÇÃO" value={draft.name} onChange={(name) => setDraft({ ...draft, name })} placeholder="EX.: BALLET MENSAL" required />
        <label>VALOR TOTAL (R$)<input inputMode="numeric" value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: currencyInput(event.target.value) })} placeholder="R$ 0,00" required /></label>
        <Field label="DURAÇÃO" type="number" min="1" max="60" value={draft.duration} onChange={(duration) => setDraft({ ...draft, duration })} required />
        <label>TIPO DE DURAÇÃO<select value={draft.settings.durationUnit} onChange={(event) => setDraft({ ...draft, settings: { ...draft.settings, durationUnit: event.target.value as CatalogSettings["durationUnit"] } })}>{durationUnits.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select></label>
      </div></fieldset>
      <fieldset className="xd-contract-builder-section"><legend><BadgeDollarSign size={18} /> MODALIDADES</legend><div className="xd-contract-modalities"><span>MODALIDADES VINCULADAS</span><button type="button" className="xd-secondary" onClick={() => setModalitiesDialogOpen(true)}>ADICIONAR MODALIDADE</button>{draft.modalityRules.length ? <div className="xd-plan-modality-rules">{draft.modalityRules.map((rule) => { const modality = modalities.find((item) => item.id === rule.modalityId); return <article key={rule.modalityId}><div><strong>{modality?.name ?? "MODALIDADE"}</strong><small>{rule.sessionsPerWeek} SESSÃO(ÕES)/SEMANA · {formatAccessPeriod(rule.accessPeriod, rule.accessLimit)}</small></div><button type="button" className="xd-danger-link" onClick={() => removeModalityRule(rule.modalityId)}>REMOVER</button></article>; })}</div> : <small>NENHUMA MODALIDADE ADICIONADA. O CONTRATO PRECISA TER AO MENOS UMA.</small>}</div></fieldset>
      <fieldset className="xd-contract-builder-section"><legend><Settings2 size={18} /> CONFIGURAÇÕES</legend><div className="xd-contract-settings">
        <Toggle label="PERMITE RENOVAR" checked={draft.settings.allowManualRenewal} onChange={(allowManualRenewal) => setDraft({ ...draft, settings: { ...draft.settings, allowManualRenewal } })} />
        <Toggle label="RENOVAR AUTOMATICAMENTE" checked={draft.renewsAutomatically} disabled={!draft.settings.allowManualRenewal} onChange={(renewsAutomatically) => setDraft({ ...draft, renewsAutomatically })} />
        <Toggle label="PERMITE RECEBER PARCELADO" checked={draft.settings.allowInstallments} onChange={(allowInstallments) => setDraft({ ...draft, settings: { ...draft.settings, allowInstallments } })} />
        <Toggle label="VENDER PELO APP" checked={draft.settings.allowAppSale} onChange={(allowAppSale) => setDraft({ ...draft, settings: { ...draft.settings, allowAppSale } })} />
        <Toggle label="ENVIAR PARA ASSINATURA ONLINE" checked={draft.settings.sendForSignature} onChange={(sendForSignature) => setDraft({ ...draft, settings: { ...draft.settings, sendForSignature } })} />
      </div><div className="xd-contract-template"><span>MODELO DE CONTRATO{templateFile ? ` · ${templateFile.name}` : ""}</span><input ref={templateInput} type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden onChange={(event: ChangeEvent<HTMLInputElement>) => setTemplateFile(event.target.files?.[0] ?? null)} /><button type="button" className="xd-secondary" onClick={() => templateInput.current?.click()}><FileUp size={16} /> IMPORTAR ARQUIVO</button></div></fieldset>
      <fieldset className="xd-contract-builder-section"><legend><Settings2 size={18} /> CONFIGURAÇÕES AVANÇADAS <small>(OPCIONAL)</small></legend><div className="xd-contract-advanced-list"><article><div><strong>PERMISSÕES E RESTRIÇÕES</strong><p>Defina período de venda, pré-venda, faixa etária e regras de suspensão deste contrato.</p></div><button type="button" onClick={() => setDialog("PERMISSIONS")} aria-label="Configurar permissões e restrições" title="Configurar permissões e restrições"><Settings2 size={18} /></button></article><article><div><strong>FINANCEIRO</strong><p>Defina adesão, comissão e a categoria de receita deste contrato.</p></div><button type="button" onClick={() => setDialog("FINANCE")} aria-label="Configurar financeiro" title="Configurar financeiro"><Landmark size={18} /></button></article></div></fieldset>
      <footer className="xd-contract-form-actions"><button type="button" className="xd-secondary" onClick={() => setView("CATALOG")}>CANCELAR</button><button type="submit" className="xd-primary" disabled={saving}>{saving ? "SALVANDO..." : "SALVAR CONTRATO"}</button></footer>
    </form>
    {notice ? <p className="xd-feedback">{notice}</p> : null}
    {dialog ? <SettingsDialog kind={dialog} settings={draft.settings} onChange={(settings) => setDraft({ ...draft, settings })} onClose={() => setDialog(null)} /> : null}
    {modalitiesDialogOpen ? <PlanModalityDialog modalities={modalities} existingIds={draft.modalityRules.map((rule) => rule.modalityId)} onAdd={addModalityRule} onClose={() => setModalitiesDialogOpen(false)} /> : null}
  </section>;

  return <section className="xd-contracts">
    <div className="xd-contract-title"><div><span>ADMINISTRATIVO · CATÁLOGO</span><h1>CONTRATOS.</h1><p>Cadastre as opções que poderão ser vendidas depois para cada aluno.</p></div><button type="button" className="xd-primary" onClick={startNew}><Plus size={17} /> ADICIONAR CONTRATO</button></div>
    <div className="xd-contract-tools"><label><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="PESQUISAR CONTRATO" /></label><button type="button" className="xd-secondary" disabled title="Filtros em preparação"><Filter size={16} /> FILTROS</button></div>
    {notice ? <p className="xd-feedback">{notice}</p> : null}
    {loading ? <p className="xd-contract-loading">CARREGANDO CONTRATOS...</p> : <div className="xd-plans"><header><div><span>CONTRATOS CADASTRADOS</span><h2>{plans.length} {plans.length === 1 ? "CONTRATO" : "CONTRATOS"}</h2></div></header>{visiblePlans.length ? <div>{visiblePlans.map((plan) => <article className={!plan.active ? "is-archived" : ""} key={plan.id}><div className="xd-plan-icon"><BadgeDollarSign size={20} /></div><div><strong>{plan.name}</strong><small>{plan.modalities.length ? plan.modalities.join(" · ") : plan.description || "SEM MODALIDADE VINCULADA"}</small></div><span>{plan.durationMonths} {formatDurationUnit(plan.catalogSettings.durationUnit, plan.durationMonths)}</span><b>{formatCurrency(plan.amountCents)}</b><div className="xd-room-actions"><button type="button" className="xd-secondary" disabled={saving} onClick={() => void setPlanActive(plan)}>{plan.active ? "ARQUIVAR" : "REATIVAR"}</button><button type="button" className="xd-quiet-action xd-danger-link" disabled={saving} onClick={() => void deletePlan(plan)}>EXCLUIR</button></div></article>)}</div> : <p className="xd-empty-community">NENHUM CONTRATO ENCONTRADO.</p>}</div>}
  </section>;
}

function SettingsDialog({ kind, settings, onChange, onClose }: { kind: "PERMISSIONS" | "FINANCE"; settings: CatalogSettings; onChange: (settings: CatalogSettings) => void; onClose: () => void }) {
  const isPermissions = kind === "PERMISSIONS";
  return <div className="xd-contract-overlay" role="presentation"><section className="xd-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="xd-settings-title"><header><span>{isPermissions ? <ShieldCheck size={21} /> : <Landmark size={21} />}</span><h2 id="xd-settings-title">{isPermissions ? "PERMISSÕES E RESTRIÇÕES" : "FINANCEIRO"}</h2><button type="button" onClick={onClose} aria-label="Fechar">×</button></header>{isPermissions ? <div className="xd-settings-dialog-content"><Toggle label="LIMITA O PERÍODO DE VENDA" checked={settings.limitSalePeriod} onChange={(limitSalePeriod) => onChange({ ...settings, limitSalePeriod })} />{settings.limitSalePeriod ? <div className="xd-restriction-fields"><Field label="INÍCIO DAS VENDAS" type="date" value={settings.saleStartsOn} onChange={(saleStartsOn) => onChange({ ...settings, saleStartsOn })} /><Field label="FIM DAS VENDAS" type="date" value={settings.saleEndsOn} onChange={(saleEndsOn) => onChange({ ...settings, saleEndsOn })} /></div> : null}<Field label="QUANTIDADE MÁXIMA DE SUSPENSÃO" type="number" min="0" value={String(settings.maxSuspensions)} onChange={(value) => onChange({ ...settings, maxSuspensions: Number(value) })} /><Field label="QUANTIDADE MÁXIMA DE DIAS DA SUSPENSÃO" type="number" min="0" value={String(settings.maxSuspensionDays)} onChange={(value) => onChange({ ...settings, maxSuspensionDays: Number(value) })} /><Toggle label="PERMITE PRÉ-VENDA" checked={settings.allowPreSale} onChange={(allowPreSale) => onChange({ ...settings, allowPreSale })} /><Toggle label="LIMITA A FAIXA ETÁRIA DE VENDA" checked={settings.limitAgeRange} onChange={(limitAgeRange) => onChange({ ...settings, limitAgeRange })} />{settings.limitAgeRange ? <div className="xd-restriction-fields"><Field label="IDADE MÍNIMA" type="number" min="0" max="120" value={String(settings.minAge)} onChange={(minAge) => onChange({ ...settings, minAge: Number(minAge) })} /><Field label="IDADE MÁXIMA" type="number" min="0" max="120" value={String(settings.maxAge)} onChange={(maxAge) => onChange({ ...settings, maxAge: Number(maxAge) })} /></div> : null}</div> : <div className="xd-settings-dialog-content"><Toggle label="POSSUI VALOR DE ADESÃO OU MATRÍCULA" checked={settings.enrollmentFeeEnabled} onChange={(enrollmentFeeEnabled) => onChange({ ...settings, enrollmentFeeEnabled })} /><Toggle label="COMISSIONAR CONSULTOR DE VENDAS" checked={settings.salesCommissionEnabled} onChange={(salesCommissionEnabled) => onChange({ ...settings, salesCommissionEnabled })} /><Field label="CATEGORIA DE RECEITA" value={settings.revenueCategory} onChange={(revenueCategory) => onChange({ ...settings, revenueCategory })} /></div>}<footer><button type="button" className="xd-secondary" onClick={onClose}>CANCELAR</button><button type="button" className="xd-primary" onClick={onClose}>SALVAR</button></footer></section></div>;
}

function PlanModalityDialog({ modalities, existingIds, onAdd, onClose }: { modalities: Modality[]; existingIds: string[]; onAdd: (rule: PlanModalityRule) => void; onClose: () => void }) {
  const [search, setSearch] = useState(""); const [advancedOpen, setAdvancedOpen] = useState(false); const [notice, setNotice] = useState(""); const [rule, setRule] = useState<PlanModalityRule>({ modalityId: "", sessionsPerWeek: 1, accessPeriod: "SEM_LIMITE", accessLimit: null, allowEarlyAccess: false, allowReschedule: false, requiresEnrollment: false, limitPromotionalTimes: false });
  const visibleModalities = modalities.filter((modality) => normalize(modality.name).includes(normalize(search)) && !existingIds.includes(modality.id));
  function submit(event: FormEvent) { event.preventDefault(); if (!rule.modalityId || !Number.isInteger(rule.sessionsPerWeek) || rule.sessionsPerWeek < 1 || rule.sessionsPerWeek > 14) { setNotice("SELECIONE A MODALIDADE E INFORME DE 1 A 14 SESSÕES POR SEMANA."); return; } if (rule.accessPeriod !== "SEM_LIMITE" && (!Number.isInteger(rule.accessLimit) || !rule.accessLimit || rule.accessLimit < 1 || rule.accessLimit > 100)) { setNotice("INFORME A QUANTIDADE DE ACESSOS DO PERÍODO."); return; } onAdd({ ...rule, accessLimit: rule.accessPeriod === "SEM_LIMITE" ? null : rule.accessLimit }); }
  return <div className="xd-contract-overlay" role="presentation"><form className="xd-settings-dialog xd-modalities-picker" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="xd-modalities-picker-title"><header><span><BadgeDollarSign size={21} /></span><h2 id="xd-modalities-picker-title">ADICIONAR MODALIDADE</h2><button type="button" onClick={onClose} aria-label="Fechar">×</button></header><p>Defina as aulas do pacote e as regras que serão usadas no acesso futuro à catraca.</p><div className="xd-modalities-picker-fields"><label>BUSCAR MODALIDADE<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="DIGITE PARA BUSCAR" /></label><label>MODALIDADE *<select value={rule.modalityId} onChange={(event) => setRule({ ...rule, modalityId: event.target.value })} required><option value="">SELECIONE A MODALIDADE</option>{visibleModalities.map((modality) => <option key={modality.id} value={modality.id}>{modality.name}</option>)}</select></label><label>SESSÕES POR SEMANA *<input type="number" min="1" max="14" value={rule.sessionsPerWeek} onChange={(event) => setRule({ ...rule, sessionsPerWeek: Number(event.target.value) })} required /></label><label>TIPO DE ACESSO POR PERÍODO *<select value={rule.accessPeriod} onChange={(event) => { const accessPeriod = event.target.value as AccessPeriod; setRule({ ...rule, accessPeriod, accessLimit: accessPeriod === "SEM_LIMITE" ? null : 1 }); }}><option value="SEM_LIMITE">SEM LIMITE</option><option value="DIA">POR DIA</option><option value="SEMANA">POR SEMANA</option><option value="MES">POR MÊS</option></select></label>{rule.accessPeriod !== "SEM_LIMITE" ? <label>ACESSOS POR {rule.accessPeriod === "MES" ? "MÊS" : rule.accessPeriod} *<input type="number" min="1" max="100" value={rule.accessLimit ?? 1} onChange={(event) => setRule({ ...rule, accessLimit: Number(event.target.value) })} required /></label> : null}</div><section className="xd-modality-rule-settings"><h3>CONFIGURAÇÕES</h3><Toggle label="PERMITE ANTECIPAÇÕES" checked={rule.allowEarlyAccess} onChange={(allowEarlyAccess) => setRule({ ...rule, allowEarlyAccess })} /><Toggle label="PERMITE REAGENDAMENTOS" checked={rule.allowReschedule} onChange={(allowReschedule) => setRule({ ...rule, allowReschedule })} /></section><section className="xd-modality-rule-advanced"><button type="button" onClick={() => setAdvancedOpen(!advancedOpen)}>CONFIGURAÇÕES AVANÇADAS <small>(OPCIONAL)</small><span>{advancedOpen ? "⌃" : "⌄"}</span></button>{advancedOpen ? <div><Toggle label="MATRÍCULA OBRIGATÓRIA NO ATO DA VENDA" checked={rule.requiresEnrollment} onChange={(requiresEnrollment) => setRule({ ...rule, requiresEnrollment })} /><Toggle label="LIMITAR DIAS E HORÁRIOS PROMOCIONAIS" checked={rule.limitPromotionalTimes} onChange={(limitPromotionalTimes) => setRule({ ...rule, limitPromotionalTimes })} /></div> : null}</section>{notice ? <p className="xd-feedback">{notice}</p> : null}<footer><button type="button" className="xd-secondary" onClick={onClose}>CANCELAR</button><button type="submit" className="xd-primary" disabled={!modalities.length}>ADICIONAR</button></footer></form></div>;
}

function ModuleHeader({ title, copy }: { title: string; copy: string }) { return <header className="xd-module-heading"><span>ADMINISTRATIVO · CATÁLOGO</span><h1>{title}</h1><p>{copy}</p></header>; }
function Toggle({ label, checked, onChange, disabled = false }: { label: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) { return <label className="xd-setting-toggle"><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} /><span aria-hidden="true" /><strong>{label}</strong></label>; }
function Field({ label, value, onChange, type = "text", min, max, step, placeholder, required }: { label: string; value: string; onChange: (value: string) => void; type?: string; min?: string; max?: string; step?: string; placeholder?: string; required?: boolean }) { return <label>{label}<input type={type} min={min} max={max} step={step} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} required={required} /></label>; }
function normalize(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR"); }
function formatCurrency(cents: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((Number.isFinite(cents) ? cents : 0) / 100); }
function inputToCents(value: string) { const digits = value.replace(/\D/g, ""); return digits ? Number(digits) : 0; }
function currencyInput(value: string) { const digits = value.replace(/\D/g, "").replace(/^0+(?=\d)/, ""); if (!digits) return ""; return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(digits) / 100); }
function formatDurationUnit(unit: unknown, value: number) { const normalized = unit === "DIA" || unit === "SEMANA" || unit === "MÊS" ? unit : "MÊS"; if (value === 1) return normalized; return normalized === "MÊS" ? "MESES" : `${normalized}S`; }
function formatAccessPeriod(period: AccessPeriod, limit: number | null) { if (period === "SEM_LIMITE") return "ACESSO SEM LIMITE"; return `${limit ?? 0} ACESSO(S) POR ${period === "MES" ? "MÊS" : period}`; }

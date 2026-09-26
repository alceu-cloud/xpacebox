"use client";

import { ArrowLeft, Building2, CircleCheck, CircleX, MapPinned, Plus, Tags, WalletCards } from "lucide-react";
import { FormEvent, type ReactNode, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";

type Profile = {
  legalName: string;
  tradeName: string;
  cnpj: string;
  postalCode: string;
  street: string;
  streetNumber: string;
  complement: string;
  district: string;
  city: string;
  state: string;
};

const empty: Profile = {
  legalName: "", tradeName: "", cnpj: "", postalCode: "", street: "", streetNumber: "", complement: "", district: "", city: "", state: "",
};

export default function SettingsWorkspace() {
  const [view, setView] = useState<"HOME" | "PROFILE_MENU" | "CRM_MENU" | "FINANCE_MENU" | "SCHOOL_PROFILE" | "CRM_REASONS" | "EXPENSE_CATEGORIES">("HOME");

  if (view === "SCHOOL_PROFILE") return <SchoolProfile onBack={() => setView("PROFILE_MENU")} />;
  if (view === "CRM_REASONS") return <CrmRegistries onBack={() => setView("CRM_MENU")} />;
  if (view === "EXPENSE_CATEGORIES") return <ExpenseCategories onBack={() => setView("FINANCE_MENU")} />;

  if (view !== "HOME") {
    const menu = view === "PROFILE_MENU" ? { title: "PERFIL", description: "Dados oficiais da escola.", icon: Building2, item: "PERFIL DA ESCOLA", detail: "Razão social, CNPJ e endereço", next: "SCHOOL_PROFILE" as const }
      : view === "CRM_MENU" ? { title: "CRM", description: "Cadastros usados no relacionamento com leads.", icon: MapPinned, item: "MOTIVOS DE GANHO/PERDA", detail: "Motivos e origens do lead", next: "CRM_REASONS" as const }
      : { title: "FINANCEIRO", description: "Parâmetros dos lançamentos da escola.", icon: WalletCards, item: "CATEGORIAS DE DESPESA", detail: "Organize as contas a pagar", next: "EXPENSE_CATEGORIES" as const };
    const Icon = menu.icon;
    return <section className="xd-administration"><header className="xd-administration-title xd-settings-title-with-action"><button type="button" className="xd-settings-back" onClick={() => setView("HOME")} aria-label="Voltar para Configurações"><ArrowLeft size={18} /></button><div><span>CONFIGURAÇÕES</span><h1>{menu.title}.</h1><p>{menu.description}</p></div></header><div className="xd-administration-grid xd-administration-grid--single"><button type="button" className="xd-administration-card" onClick={() => setView(menu.next)}><span><Icon size={22} /></span><strong>{menu.item}</strong><small>{menu.detail}</small></button></div></section>;
  }

  return <section className="xd-administration">
    <header className="xd-administration-title">
      <span>PREFERÊNCIAS DA ESCOLA</span>
      <h1>CONFIGURAÇÕES.</h1>
      <p>Organize os dados e parâmetros gerais usados pela escola.</p>
    </header>
    <div className="xd-administration-grid xd-administration-grid--single">
      <button type="button" className="xd-administration-card" onClick={() => setView("PROFILE_MENU")}>
        <span><Building2 size={22} /></span>
        <strong>PERFIL</strong>
        <small>PERFIL DA ESCOLA</small>
      </button>
      <button type="button" className="xd-administration-card" onClick={() => setView("CRM_MENU")}>
        <span><MapPinned size={22} /></span>
        <strong>CRM</strong>
        <small>MOTIVOS DE GANHO E PERDA</small>
      </button>
      <button type="button" className="xd-administration-card" onClick={() => setView("FINANCE_MENU")}>
        <span><WalletCards size={22} /></span>
        <strong>FINANCEIRO</strong>
        <small>CATEGORIAS DE DESPESA</small>
      </button>
    </div>
  </section>;
}

type Registry = { id: string; name: string; active: boolean };
function CrmRegistries({ onBack }: { onBack: () => void }) {
  const [sources, setSources] = useState<Registry[]>([]); const [reasons, setReasons] = useState<Registry[]>([]); const [winReasons, setWinReasons] = useState<Registry[]>([]); const [sourceName, setSourceName] = useState(""); const [reasonName, setReasonName] = useState(""); const [winReasonName, setWinReasonName] = useState(""); const [notice, setNotice] = useState(""); const [canManage, setCanManage] = useState(false);
  async function load() { try { const payload = await request<{ sources: Registry[]; lossReasons: Registry[]; winReasons: Registry[]; canManage: boolean }>("/api/xpace/leads"); setSources(payload.sources); setReasons(payload.lossReasons); setWinReasons(payload.winReasons); setCanManage(payload.canManage); } catch (error) { setNotice(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL CARREGAR OS CADASTROS."); } }
  useEffect(() => { void load(); }, []);
  async function save(action: "SAVE_SOURCE" | "SAVE_LOSS_REASON" | "SAVE_WIN_REASON", setting: Partial<Registry>, done: () => void) { try { setNotice(""); await request("/api/xpace/leads", { method: "POST", body: JSON.stringify({ action, setting }) }); done(); await load(); } catch (error) { setNotice(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL SALVAR O CADASTRO."); } }
  return <section className="xd-administration"><header className="xd-administration-title xd-settings-title-with-action"><button type="button" className="xd-settings-back" onClick={onBack} title="Voltar para CRM" aria-label="Voltar para CRM"><ArrowLeft size={18} /></button><div><span>CONFIGURAÇÕES · CRM</span><h1>MOTIVOS DE GANHO/PERDA.</h1><p>Cadastros reutilizados no funil de leads. As origens existentes continuam aqui.</p></div></header><div className="xd-crm-registries">{notice ? <p className="xd-feedback">{notice}</p> : null}<RegistryEditor icon={<MapPinned size={18} />} title="ORIGENS DO LEAD" description="Como a pessoa conheceu a XPACE." items={sources} value={sourceName} onChange={setSourceName} add={() => save("SAVE_SOURCE", { name: sourceName, active: true }, () => setSourceName(""))} toggle={(item) => save("SAVE_SOURCE", { id: item.id, name: item.name, active: !item.active }, () => undefined)} canManage={canManage} /><RegistryEditor icon={<CircleCheck size={18} />} title="MOTIVOS DE GANHO" description="O que ajudou a concretizar a matrícula." items={winReasons} value={winReasonName} onChange={setWinReasonName} add={() => save("SAVE_WIN_REASON", { name: winReasonName, active: true }, () => setWinReasonName(""))} toggle={(item) => save("SAVE_WIN_REASON", { id: item.id, name: item.name, active: !item.active }, () => undefined)} canManage={canManage} /><RegistryEditor icon={<CircleX size={18} />} title="MOTIVOS DE PERDA" description="Por que o lead não avançou para matrícula." items={reasons} value={reasonName} onChange={setReasonName} add={() => save("SAVE_LOSS_REASON", { name: reasonName, active: true }, () => setReasonName(""))} toggle={(item) => save("SAVE_LOSS_REASON", { id: item.id, name: item.name, active: !item.active }, () => undefined)} canManage={canManage} /></div></section>;
}

function RegistryEditor({ icon, title, description, items, value, onChange, add, toggle, canManage }: { icon: ReactNode; title: string; description: string; items: Registry[]; value: string; onChange: (value: string) => void; add: () => void; toggle: (item: Registry) => void; canManage: boolean }) {
  return <section><header><span>{icon}</span><div><strong>{title}</strong><small>{description}</small></div></header>{canManage ? <div className="xd-crm-registry-add"><input value={value} onChange={(event) => onChange(event.target.value)} placeholder="NOVO CADASTRO" /><button type="button" className="xd-primary" disabled={!value.trim()} onClick={add}><Plus size={15} /> ADICIONAR</button></div> : null}<div className="xd-crm-registry-list">{items.length ? items.map((item) => <article key={item.id} className={item.active ? "" : "is-inactive"}><strong>{item.name}</strong>{canManage ? <button type="button" onClick={() => toggle(item)}>{item.active ? "DESATIVAR" : "ATIVAR"}</button> : <small>{item.active ? "ATIVA" : "INATIVA"}</small>}</article>) : <p>NENHUM CADASTRO AINDA.</p>}</div></section>;
}

function ExpenseCategories({ onBack }: { onBack: () => void }) {
  const [categories, setCategories] = useState<Registry[]>([]);
  const [name, setName] = useState("");
  const [canManage, setCanManage] = useState(false);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  async function load() {
    try {
      const payload = await request<{ categories: Registry[]; canManage: boolean }>("/api/xpace/finance?view=CATEGORIAS");
      setCategories(payload.categories); setCanManage(payload.canManage); setNotice("");
    } catch (error) { setNotice(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL CARREGAR AS CATEGORIAS."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  async function save(category: Partial<Registry>, done: () => void) {
    try {
      setNotice("");
      await request("/api/xpace/finance", { method: "POST", body: JSON.stringify({ action: "saveCategory", ...category }) });
      done(); await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL SALVAR A CATEGORIA."); }
  }
  return <section className="xd-administration"><header className="xd-administration-title xd-settings-title-with-action"><button type="button" className="xd-settings-back" onClick={onBack} title="Voltar para Financeiro" aria-label="Voltar para Financeiro"><ArrowLeft size={18} /></button><div><span>CONFIGURAÇÕES · FINANCEIRO</span><h1>CATEGORIAS DE DESPESA.</h1><p>Classifique as contas a pagar; as categorias iniciais já estão cadastradas para a XPACE.</p></div></header><div className="xd-crm-registries">{notice ? <p className="xd-feedback" role="alert">{notice}</p> : null}{loading ? <p className="xd-feedback">CARREGANDO CATEGORIAS...</p> : <RegistryEditor icon={<Tags size={18} />} title="CATEGORIAS DE DESPESA" description="Desativar preserva os lançamentos antigos, mas remove a categoria de novos cadastros." items={categories} value={name} onChange={setName} add={() => save({ name, active: true }, () => setName(""))} toggle={(item) => save({ id: item.id, name: item.name, active: !item.active }, () => undefined)} canManage={canManage} />}</div></section>;
}

function SchoolProfile({ onBack }: { onBack: () => void }) {
  const [profile, setProfile] = useState<Profile>(empty);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    void request<{ profile: Profile }>("/api/xpace/perfil-escola")
      .then((payload) => setProfile(payload.profile))
      .catch((error: unknown) => setNotice(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL CARREGAR O PERFIL."));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setNotice("");
    try {
      await request("/api/xpace/perfil-escola", { method: "PUT", body: JSON.stringify({ profile }) });
      setNotice("PERFIL DA ESCOLA ATUALIZADO.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL SALVAR O PERFIL.");
    } finally {
      setSaving(false);
    }
  }

  return <section className="xd-administration">
    <header className="xd-administration-title xd-settings-title-with-action">
      <button type="button" className="xd-settings-back" onClick={onBack} title="Voltar para Configurações" aria-label="Voltar para Configurações"><ArrowLeft size={18} /></button>
      <div><span>CONFIGURAÇÕES · PERFIL</span><h1>PERFIL DA ESCOLA.</h1><p>Dados usados nos contratos, cobranças e comunicações oficiais.</p></div>
    </header>
    <form className="xd-contract-builder" onSubmit={submit}>
      <fieldset className="xd-contract-builder-section">
        <legend><Building2 size={18} /> DADOS DA ESCOLA</legend>
        <div className="xd-contract-form-grid xd-contract-form-grid--plan">
          <Field label="RAZÃO SOCIAL" value={profile.legalName} onChange={(legalName) => setProfile({ ...profile, legalName })} />
          <Field label="NOME FANTASIA" value={profile.tradeName} onChange={(tradeName) => setProfile({ ...profile, tradeName })} />
          <Field label="CNPJ" value={formatCnpj(profile.cnpj)} onChange={(cnpj) => setProfile({ ...profile, cnpj: digits(cnpj) })} />
          <Field label="CEP" value={formatCep(profile.postalCode)} onChange={(postalCode) => setProfile({ ...profile, postalCode: digits(postalCode) })} />
          <Field label="ENDEREÇO" value={profile.street} onChange={(street) => setProfile({ ...profile, street })} />
          <Field label="NÚMERO" value={profile.streetNumber} onChange={(streetNumber) => setProfile({ ...profile, streetNumber })} />
          <Field label="COMPLEMENTO" value={profile.complement} onChange={(complement) => setProfile({ ...profile, complement })} />
          <Field label="BAIRRO" value={profile.district} onChange={(district) => setProfile({ ...profile, district })} />
          <Field label="CIDADE" value={profile.city} onChange={(city) => setProfile({ ...profile, city })} />
          <Field label="UF" value={profile.state} onChange={(state) => setProfile({ ...profile, state: state.toUpperCase().slice(0, 2) })} />
        </div>
      </fieldset>
      {notice ? <p className="xd-feedback">{notice}</p> : null}
      <footer className="xd-contract-form-actions"><button className="xd-primary" type="submit" disabled={saving}>{saving ? "SALVANDO..." : "SALVAR PERFIL"}</button></footer>
    </form>
  </section>;
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label>{label}<input value={value} onChange={(event) => onChange(event.target.value.toLocaleUpperCase("pt-BR"))} required={label !== "COMPLEMENTO"} /></label>;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("SESSÃO NÃO ENCONTRADA.");
  const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init?.headers } });
  const payload = await response.json().catch(() => ({})) as { success?: boolean; message?: string } & T;
  if (!response.ok || !payload.success) throw new Error(payload.message || "NÃO FOI POSSÍVEL CONCLUIR A OPERAÇÃO.");
  return payload;
}

function digits(value: string) { return value.replace(/\D/g, "").slice(0, 14); }
function formatCnpj(value: string) { const digitsValue = digits(value); return digitsValue.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2"); }
function formatCep(value: string) { const digitsValue = value.replace(/\D/g, "").slice(0, 8); return digitsValue.replace(/^(\d{5})(\d)/, "$1-$2"); }

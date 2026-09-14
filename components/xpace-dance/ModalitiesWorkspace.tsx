"use client";

import { ListChecks, Plus, ShieldCheck, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";

type MappingType = "AULA" | "CHECK_IN" | "PRESENÇA";
type Mapping = { reference: string; type: MappingType };
type Modality = { id: string; name: string; usesSchedule: boolean; requiresInstructor: boolean; wellhubMappings: Mapping[]; totalpassMappings: Mapping[]; active: boolean };
type Draft = { name: string; usesSchedule: boolean; requiresInstructor: boolean; wellhubMappings: Mapping[]; totalpassMappings: Mapping[] };

const mappingTypes: MappingType[] = ["AULA", "CHECK_IN", "PRESENÇA"];
const emptyDraft = (): Draft => ({ name: "", usesSchedule: false, requiresInstructor: false, wellhubMappings: [], totalpassMappings: [] });

export default function ModalitiesWorkspace() {
  const [view, setView] = useState<"NEW" | "LIST">("NEW");
  const [modalities, setModalities] = useState<Modality[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [wellhubDraft, setWellhubDraft] = useState<Mapping>({ reference: "", type: "AULA" });
  const [totalpassDraft, setTotalpassDraft] = useState<Mapping>({ reference: "", type: "AULA" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => { void loadModalities(); }, []);

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("SESSÃO NÃO ENCONTRADA.");
    const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init?.headers } });
    const payload = await response.json().catch(() => ({})) as { success?: boolean; message?: string } & T;
    if (!response.ok || !payload.success) throw new Error(payload.message || "NÃO FOI POSSÍVEL CONCLUIR A OPERAÇÃO.");
    return payload;
  }

  async function loadModalities() {
    setLoading(true);
    try { setModalities((await request<{ modalities: Modality[] }>("/api/xpace/modalidades")).modalities); }
    catch (error) { setNotice(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL CARREGAR AS MODALIDADES."); }
    finally { setLoading(false); }
  }

  function addMapping(provider: "wellhubMappings" | "totalpassMappings") {
    const next = provider === "wellhubMappings" ? wellhubDraft : totalpassDraft;
    if (!next.reference.trim() || draft[provider].some((item) => item.reference.toLocaleLowerCase("pt-BR") === next.reference.trim().toLocaleLowerCase("pt-BR") && item.type === next.type)) return;
    setDraft({ ...draft, [provider]: [...draft[provider], { reference: next.reference.trim(), type: next.type }] });
    if (provider === "wellhubMappings") setWellhubDraft({ reference: "", type: "AULA" }); else setTotalpassDraft({ reference: "", type: "AULA" });
  }

  function removeMapping(provider: "wellhubMappings" | "totalpassMappings", index: number) { setDraft({ ...draft, [provider]: draft[provider].filter((_, current) => current !== index) }); }

  async function createModality(event: FormEvent) {
    event.preventDefault();
    setSaving(true); setNotice("");
    try {
      await request("/api/xpace/modalidades", { method: "POST", body: JSON.stringify({ action: "CREATE_MODALITY", modality: draft }) });
      await loadModalities(); setView("LIST"); setNotice("MODALIDADE CADASTRADA.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL CADASTRAR A MODALIDADE."); }
    finally { setSaving(false); }
  }

  async function setActive(modality: Modality) {
    setSaving(true); setNotice("");
    try {
      await request("/api/xpace/modalidades", { method: "PATCH", body: JSON.stringify({ action: "SET_MODALITY_ACTIVE", modality: { id: modality.id, active: !modality.active } }) });
      await loadModalities(); setNotice(modality.active ? "MODALIDADE ARQUIVADA." : "MODALIDADE REATIVADA.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL ATUALIZAR A MODALIDADE."); }
    finally { setSaving(false); }
  }

  function startNew() { setDraft(emptyDraft()); setWellhubDraft({ reference: "", type: "AULA" }); setTotalpassDraft({ reference: "", type: "AULA" }); setNotice(""); setView("NEW"); }

  if (view === "NEW") return <section className="xd-modalities">
    <header className="xd-modalities-heading"><span>ADMINISTRATIVO · CATÁLOGO</span><h1>NOVA MODALIDADE.</h1><p>Cadastre a modalidade e os vínculos que poderão ser usados mais adiante nas integrações.</p></header>
    <form className="xd-modality-form" onSubmit={createModality}>
      <section className="xd-modality-section"><h2><ListChecks size={19} /> DADOS DA MODALIDADE</h2><label className="xd-modality-name">DESCRIÇÃO *<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="EX.: BALLET" required /></label><div className="xd-modality-toggles"><Toggle label="UTILIZA AGENDA" checked={draft.usesSchedule} onChange={(usesSchedule) => setDraft({ ...draft, usesSchedule })} /><Toggle label="DEFINIR PROFESSOR/INSTRUTOR RESPONSÁVEL" checked={draft.requiresInstructor} onChange={(requiresInstructor) => setDraft({ ...draft, requiresInstructor })} /></div></section>
      <Integration title="WELLHUB" referenceLabel="PRODUCT ID" draft={wellhubDraft} mappings={draft.wellhubMappings} onChange={setWellhubDraft} onAdd={() => addMapping("wellhubMappings")} onRemove={(index) => removeMapping("wellhubMappings", index)} />
      <Integration title="TOTALPASS" referenceLabel="PLANOS" draft={totalpassDraft} mappings={draft.totalpassMappings} onChange={setTotalpassDraft} onAdd={() => addMapping("totalpassMappings")} onRemove={(index) => removeMapping("totalpassMappings", index)} />
      <footer className="xd-contract-form-actions"><button type="button" className="xd-secondary" onClick={() => setView("LIST")}>CANCELAR</button><button type="submit" className="xd-primary" disabled={saving}>{saving ? "SALVANDO..." : "SALVAR MODALIDADE"}</button></footer>
    </form>
    {notice ? <p className="xd-feedback">{notice}</p> : null}
  </section>;

  return <section className="xd-modalities">
    <header className="xd-contract-title"><div><span>ADMINISTRATIVO · CATÁLOGO</span><h1>MODALIDADES.</h1><p>Organize as modalidades e os vínculos externos da escola.</p></div><button type="button" className="xd-primary" onClick={startNew}><Plus size={17} /> NOVA MODALIDADE</button></header>
    {notice ? <p className="xd-feedback">{notice}</p> : null}
    {loading ? <p className="xd-contract-loading">CARREGANDO MODALIDADES...</p> : <div className="xd-modality-list">{modalities.length ? modalities.map((modality) => <article key={modality.id} className={!modality.active ? "is-archived" : ""}><span><ListChecks size={20} /></span><div><strong>{modality.name}</strong><small>{modality.usesSchedule ? "USA AGENDA" : "SEM AGENDA"} · {modality.requiresInstructor ? "COM INSTRUTOR" : "SEM INSTRUTOR"}</small></div><em>{modality.wellhubMappings.length} WELLHUB · {modality.totalpassMappings.length} TOTALPASS</em><button type="button" className="xd-secondary" onClick={() => void setActive(modality)} disabled={saving}>{modality.active ? "ARQUIVAR" : "REATIVAR"}</button></article>) : <p className="xd-empty-community">NENHUMA MODALIDADE CADASTRADA.</p>}</div>}
  </section>;
}

function Integration({ title, referenceLabel, draft, mappings, onChange, onAdd, onRemove }: { title: string; referenceLabel: string; draft: Mapping; mappings: Mapping[]; onChange: (next: Mapping) => void; onAdd: () => void; onRemove: (index: number) => void }) {
  return <section className="xd-modality-section xd-modality-integration"><h2><ShieldCheck size={19} /> {title}</h2><div className="xd-modality-mapping-controls"><label>{referenceLabel}<input value={draft.reference} onChange={(event) => onChange({ ...draft, reference: event.target.value })} placeholder={referenceLabel} /></label><label>TIPO<select value={draft.type} onChange={(event) => onChange({ ...draft, type: event.target.value as MappingType })}>{mappingTypes.map((type) => <option key={type} value={type}>{type.replace("_", " ")}</option>)}</select></label><button type="button" className="xd-secondary" disabled={!draft.reference.trim()} onClick={onAdd}><Plus size={16} /> ADICIONAR</button></div>{mappings.length ? <div className="xd-modality-mappings">{mappings.map((mapping, index) => <span key={`${mapping.reference}-${mapping.type}`}><b>{mapping.reference}</b><small>{mapping.type.replace("_", " ")}</small><button type="button" aria-label={`Remover ${mapping.reference}`} onClick={() => onRemove(index)}><X size={14} /></button></span>)}</div> : <p className="xd-modality-empty">NENHUM VÍNCULO CONFIGURADO.</p>}</section>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) { return <label className="xd-setting-toggle"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span aria-hidden="true" /><strong>{label}</strong></label>; }

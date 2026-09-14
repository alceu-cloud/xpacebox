"use client";

import { FormEvent, useEffect, useState } from "react";
import { GraduationCap, Plus, UserRoundCheck } from "lucide-react";

import { supabase } from "@/lib/supabase";

type Instructor = { id: string; fullName: string; mobile: string; email: string; active: boolean };
const emptyDraft = () => ({ fullName: "", mobile: "", email: "" });

export default function InstructorsWorkspace() {
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => { void loadInstructors(); }, []);

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const { data } = await supabase.auth.getSession(); const token = data.session?.access_token;
    if (!token) throw new Error("SESSÃO NÃO ENCONTRADA.");
    const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init?.headers } });
    const payload = await response.json().catch(() => ({})) as { success?: boolean; message?: string } & T;
    if (!response.ok || !payload.success) throw new Error(payload.message || "NÃO FOI POSSÍVEL CONCLUIR A OPERAÇÃO.");
    return payload;
  }
  async function loadInstructors() { setLoading(true); try { setInstructors((await request<{ instructors: Instructor[] }>("/api/xpace/professores")).instructors); } catch (error) { setNotice(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL CARREGAR OS PROFESSORES."); } finally { setLoading(false); } }
  async function createInstructor(event: FormEvent) { event.preventDefault(); setSaving(true); setNotice(""); try { await request("/api/xpace/professores", { method: "POST", body: JSON.stringify({ action: "CREATE_INSTRUCTOR", instructor: draft }) }); setDraft(emptyDraft()); await loadInstructors(); setNotice("PROFESSOR CADASTRADO."); } catch (error) { setNotice(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL CADASTRAR O PROFESSOR."); } finally { setSaving(false); } }
  async function setActive(instructor: Instructor) { setSaving(true); setNotice(""); try { await request("/api/xpace/professores", { method: "PATCH", body: JSON.stringify({ action: "SET_INSTRUCTOR_ACTIVE", instructor: { id: instructor.id, active: !instructor.active } }) }); await loadInstructors(); setNotice(instructor.active ? "PROFESSOR ARQUIVADO." : "PROFESSOR REATIVADO."); } catch (error) { setNotice(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL ATUALIZAR O PROFESSOR."); } finally { setSaving(false); } }

  return <section className="xd-instructors"><header className="xd-contract-title"><div><span>CONFIGURAÇÕES · EQUIPE</span><h1>PROFESSORES.</h1><p>Cadastre os responsáveis que poderão ser vinculados às modalidades e às grades de aula.</p></div></header>{notice ? <p className="xd-feedback">{notice}</p> : null}<div className="xd-instructors-layout"><form className="xd-instructor-form" onSubmit={createInstructor}><header><span><GraduationCap size={18} /> NOVO PROFESSOR</span><small>CADASTRO SIMPLES</small></header><label>NOME *<input value={draft.fullName} onChange={(event) => setDraft({ ...draft, fullName: event.target.value })} required placeholder="EX.: ANA SILVA" /></label><label>CELULAR<input value={draft.mobile} onChange={(event) => setDraft({ ...draft, mobile: event.target.value })} placeholder="(00) 00000-0000" /></label><label>E-MAIL<input type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} placeholder="professor@escola.com" /></label><footer><button type="submit" className="xd-primary" disabled={saving}><Plus size={16} /> {saving ? "SALVANDO..." : "CADASTRAR PROFESSOR"}</button></footer></form><section className="xd-instructor-list"><header><span><UserRoundCheck size={18} /> PROFESSORES CADASTRADOS</span><small>{instructors.filter((item) => item.active).length} ATIVO(S)</small></header>{loading ? <p className="xd-agenda-empty">CARREGANDO PROFESSORES...</p> : instructors.length ? instructors.map((instructor) => <article key={instructor.id} className={!instructor.active ? "is-archived" : ""}><span><GraduationCap size={18} /></span><div><strong>{instructor.fullName}</strong><small>{instructor.mobile || instructor.email || "SEM CONTATO"}</small></div><button type="button" className="xd-secondary" onClick={() => void setActive(instructor)} disabled={saving}>{instructor.active ? "ARQUIVAR" : "REATIVAR"}</button></article>) : <p className="xd-agenda-empty">NENHUM PROFESSOR CADASTRADO.</p>}</section></div></section>;
}

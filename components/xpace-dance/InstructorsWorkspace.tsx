"use client";

import { FormEvent, useEffect, useState } from "react";
import { GraduationCap, Pencil, Plus, UserRoundCheck } from "lucide-react";

import { supabase } from "@/lib/supabase";

type Instructor = { id: string; fullName: string; mobile: string; email: string; active: boolean };
const emptyDraft = () => ({ fullName: "", mobile: "", email: "" });

function phoneInput(value: string) {
  const digits = value.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "").slice(0, 11);
  if (!digits) return "";
  if (digits.length < 3) return `(${digits}`;
  const number = digits.slice(2);
  const prefixLength = digits.length > 10 ? 5 : 4;
  return `(${digits.slice(0, 2)}) ${number.slice(0, prefixLength)}${number.length > prefixLength ? `-${number.slice(prefixLength)}` : ""}`;
}

export default function InstructorsWorkspace() {
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [editingInstructorId, setEditingInstructorId] = useState("");
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
  async function saveInstructor(event: FormEvent) { event.preventDefault(); setSaving(true); setNotice(""); try { const editing = Boolean(editingInstructorId); await request("/api/xpace/professores", { method: editing ? "PATCH" : "POST", body: JSON.stringify({ action: editing ? "UPDATE_INSTRUCTOR" : "CREATE_INSTRUCTOR", instructor: { ...draft, id: editingInstructorId || undefined } }) }); setDraft(emptyDraft()); setEditingInstructorId(""); await loadInstructors(); setNotice(editing ? "PROFESSOR ATUALIZADO." : "PROFESSOR CADASTRADO."); } catch (error) { setNotice(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL SALVAR O PROFESSOR."); } finally { setSaving(false); } }
  async function setActive(instructor: Instructor) { setSaving(true); setNotice(""); try { await request("/api/xpace/professores", { method: "PATCH", body: JSON.stringify({ action: "SET_INSTRUCTOR_ACTIVE", instructor: { id: instructor.id, active: !instructor.active } }) }); await loadInstructors(); setNotice(instructor.active ? "PROFESSOR ARQUIVADO." : "PROFESSOR REATIVADO."); } catch (error) { setNotice(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL ATUALIZAR O PROFESSOR."); } finally { setSaving(false); } }
  function startEdit(instructor: Instructor) { setEditingInstructorId(instructor.id); setDraft({ fullName: instructor.fullName, mobile: phoneInput(instructor.mobile), email: instructor.email }); setNotice(""); }
  function cancelEdit() { setEditingInstructorId(""); setDraft(emptyDraft()); }

  return <section className="xd-instructors"><header className="xd-contract-title"><div><span>ADMINISTRATIVO · EQUIPE</span><h1>PROFESSORES.</h1><p>Cadastre os responsáveis que poderão ser vinculados às modalidades e às grades de aula.</p></div></header>{notice ? <p className="xd-feedback">{notice}</p> : null}<div className="xd-instructors-layout"><form className="xd-instructor-form" onSubmit={saveInstructor}><header><span><GraduationCap size={18} /> {editingInstructorId ? "EDITAR PROFESSOR" : "NOVO PROFESSOR"}</span><small>{editingInstructorId ? "ALTERE E SALVE" : "CADASTRO SIMPLES"}</small></header><label>NOME *<input value={draft.fullName} onChange={(event) => setDraft({ ...draft, fullName: event.target.value })} required placeholder="EX.: ANA SILVA" /></label><label>CELULAR<input inputMode="tel" autoComplete="tel" maxLength={15} value={draft.mobile} onChange={(event) => setDraft({ ...draft, mobile: phoneInput(event.target.value) })} placeholder="(00) 00000-0000" /></label><label>E-MAIL<input type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} placeholder="professor@escola.com" /></label><footer>{editingInstructorId ? <button type="button" className="xd-secondary" onClick={cancelEdit} disabled={saving}>CANCELAR</button> : null}<button type="submit" className="xd-primary" disabled={saving}>{editingInstructorId ? <Pencil size={16} /> : <Plus size={16} />} {saving ? "SALVANDO..." : editingInstructorId ? "SALVAR ALTERAÇÕES" : "CADASTRAR PROFESSOR"}</button></footer></form><section className="xd-instructor-list"><header><span><UserRoundCheck size={18} /> PROFESSORES CADASTRADOS</span><small>{instructors.filter((item) => item.active).length} ATIVO(S)</small></header>{loading ? <p className="xd-agenda-empty">CARREGANDO PROFESSORES...</p> : instructors.length ? instructors.map((instructor) => <article key={instructor.id} className={!instructor.active ? "is-archived" : ""}><span><GraduationCap size={18} /></span><div><strong>{instructor.fullName}</strong><small>{instructor.mobile ? phoneInput(instructor.mobile) : instructor.email || "SEM CONTATO"}</small></div><div className="xd-room-actions"><button type="button" className="xd-secondary" onClick={() => startEdit(instructor)} disabled={saving}><Pencil size={14} /> EDITAR</button><button type="button" className="xd-secondary" onClick={() => void setActive(instructor)} disabled={saving}>{instructor.active ? "ARQUIVAR" : "REATIVAR"}</button></div></article>) : <p className="xd-agenda-empty">NENHUM PROFESSOR CADASTRADO.</p>}</section></div></section>;
}

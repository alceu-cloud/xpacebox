"use client";

import { CalendarDays, ChevronLeft, ChevronRight, Clock3, DoorOpen, LayoutList, Plus, Save, Settings2, UsersRound } from "lucide-react";
import { CSSProperties, FormEvent, useEffect, useMemo, useState } from "react";

import { supabase } from "@/lib/supabase";

type View = "AGENDA" | "LOCACAO" | "GRADES" | "OCUPACAO";
type GradeSettings = { maxClientsEnabled?: boolean; maxClients?: number | null; allowSpecialStudents?: boolean; allowLeads?: boolean; leadWelcomeVideoUrl?: string; checkIn?: { requireClass?: boolean; showInApp?: boolean; accessBeforeMinutes?: number; accessAfterStartMinutes?: number }; restrictions?: { gender?: string; freeSchedule?: boolean } };
type ClassLevel = "INICIANTE" | "INICIANTE_INTERMEDIARIO" | "INTERMEDIARIO" | "AVANCADO";
type AgeGroup = "BABY" | "KIDS" | "TEENS" | "ADULTO";
type ScheduleDraft = { id?: string; weekday: number; startsAt: string; endsAt: string; roomId: string; instructorId: string; ageGroup: AgeGroup; capacity: string; settings: GradeSettings };
type Group = { id: string; name: string; modality: string; modalityId: string; level: ClassLevel; instructorName: string; color: string; capacity: number | null; sourceType: "CONTRATO" | "SERVICO"; settings: GradeSettings; active: boolean; schedules: Array<{ id: string; weekday: number; startsAt: string; endsAt: string; roomName: string; roomId: string; instructorName: string; instructorId: string; ageGroup: AgeGroup; capacity: number | null; settings: GradeSettings }>; students: Array<{ id: string; studentId: string; studentName: string; mobile: string; startsOn: string }> };
type Workspace = { groups: Group[]; modalities: Array<{ id: string; name: string; instructorId: string; instructorName: string; requiresInstructor: boolean }>; instructors: Array<{ id: string; fullName: string }>; rooms: Array<{ id: string; name: string; capacity: number | null }>; students: Array<{ id: string; name: string; mobile: string }>; rentals: Array<{ id: string; roomName: string; renterName: string; startsAt: string; endsAt: string; amountCents: number; status: string; note: string }> };
type ClassDraft = { name: string; modalityId: string; level: ClassLevel; ageGroup: AgeGroup; roomId: string; instructorId: string; color: string; capacity: string; sourceType: "CONTRATO" | "SERVICO"; weekdays: number[]; startsAt: string; durationMinutes: string; schedules: ScheduleDraft[]; settings: GradeSettings };

const weekday = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
const classLevels: Array<{ value: ClassLevel; label: string }> = [{ value: "INICIANTE", label: "INICIANTE" }, { value: "INICIANTE_INTERMEDIARIO", label: "INICIANTE / INTERMEDIÁRIO" }, { value: "INTERMEDIARIO", label: "INTERMEDIÁRIO" }, { value: "AVANCADO", label: "AVANÇADO" }];
const ageGroups: Array<{ value: AgeGroup; label: string }> = [{ value: "BABY", label: "BABY (4 A 6)" }, { value: "KIDS", label: "KIDS (7 A 11)" }, { value: "TEENS", label: "TEENS (12 A 17)" }, { value: "ADULTO", label: "ADULTO (18+)" }];
const classLevelLabel = (level: ClassLevel) => classLevels.find((item) => item.value === level)?.label ?? "INICIANTE";
const ageGroupLabel = (ageGroup: AgeGroup) => ageGroups.find((item) => item.value === ageGroup)?.label ?? "ADULTO (18+)";
const emptyGradeSettings = (): GradeSettings => ({ maxClientsEnabled: false, maxClients: null, allowSpecialStudents: false, allowLeads: false, leadWelcomeVideoUrl: "", checkIn: { requireClass: false, showInApp: false, accessBeforeMinutes: 0, accessAfterStartMinutes: 0 }, restrictions: { gender: "TODOS", freeSchedule: false } });
const emptyScheduleDraft = (): ScheduleDraft => ({ weekday: 1, startsAt: "19:00", endsAt: "20:00", roomId: "", instructorId: "", ageGroup: "ADULTO", capacity: "", settings: emptyGradeSettings() });
const emptyClassDraft = (): ClassDraft => ({ name: "", modalityId: "", level: "INICIANTE", ageGroup: "ADULTO", roomId: "", instructorId: "", color: "#7435d9", capacity: "", sourceType: "CONTRATO", weekdays: [], startsAt: "19:00", durationMinutes: "60", schedules: [], settings: emptyGradeSettings() });

export default function AgendaWorkspace() {
  const [view, setView] = useState<View>("AGENDA");
  const [workspace, setWorkspace] = useState<Workspace>({ groups: [], modalities: [], instructors: [], rooms: [], students: [], rentals: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [classDraft, setClassDraft] = useState<ClassDraft>(emptyClassDraft);
  const [settingsGroup, setSettingsGroup] = useState<Group | null>(null);
  const [enrollment, setEnrollment] = useState({ classGroupId: "", studentId: "", startsOn: todayIso() });
  const [rental, setRental] = useState({ roomName: "", renterName: "", startsAt: toLocalInput(new Date()), endsAt: toLocalInput(new Date(Date.now() + 60 * 60 * 1000)), amount: "", note: "" });

  useEffect(() => { void loadWorkspace(); }, []);

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const { data } = await supabase.auth.getSession(); const token = data.session?.access_token;
    if (!token) throw new Error("SESSÃO NÃO ENCONTRADA.");
    const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init?.headers } });
    const payload = await response.json().catch(() => ({})) as { success?: boolean; message?: string } & T;
    if (!response.ok || !payload.success) throw new Error(payload.message || "NÃO FOI POSSÍVEL CONCLUIR A OPERAÇÃO.");
    return payload;
  }
  async function loadWorkspace() { setLoading(true); try { setWorkspace(await request<Workspace>("/api/xpace/agenda")); } catch (error) { setNotice(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL CARREGAR A AGENDA."); } finally { setLoading(false); } }
  async function submitClass(event: FormEvent): Promise<boolean> { event.preventDefault(); if (!classDraft.schedules.length) { setNotice("ADICIONE AO MENOS UM HORÁRIO CONFIGURADO PARA A GRADE."); return false; } setSaving(true); setNotice(""); try { await request("/api/xpace/agenda", { method: "POST", body: JSON.stringify({ action: "CREATE_CLASS", group: classDraft }) }); setClassDraft(emptyClassDraft()); await loadWorkspace(); setNotice("GRADE CADASTRADA E INSERIDA NA AGENDA."); return true; } catch (error) { setNotice(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL CADASTRAR A GRADE."); return false; } finally { setSaving(false); } }
  async function saveGrade(groupId: string, draft: ClassDraft): Promise<boolean> { setSaving(true); setNotice(""); try { await request("/api/xpace/agenda", { method: "PATCH", body: JSON.stringify({ action: "UPDATE_CLASS", group: { id: groupId, ...draft } }) }); await loadWorkspace(); setNotice("GRADE ATUALIZADA."); return true; } catch (error) { setNotice(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL SALVAR A GRADE."); return false; } finally { setSaving(false); } }
  async function deleteGrade(group: Group) { if (!window.confirm(`EXCLUIR A GRADE ${group.name}?\n\nOS HORÁRIOS DELA SERÃO REMOVIDOS. A EXCLUSÃO É BLOQUEADA QUANDO HÁ ALUNOS MATRICULADOS OU CONTRATOS VINCULADOS.`)) return; setSaving(true); setNotice(""); try { await request("/api/xpace/agenda", { method: "DELETE", body: JSON.stringify({ action: "DELETE_GRADE", group: { id: group.id } }) }); if (selectedGroup?.id === group.id) setSelectedGroup(null); await loadWorkspace(); setNotice("GRADE EXCLUÍDA. VOCÊ JÁ PODE CADASTRÁ-LA NOVAMENTE."); } catch (error) { setNotice(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL EXCLUIR A GRADE."); } finally { setSaving(false); } }
  async function submitEnrollment(event: FormEvent) { event.preventDefault(); setSaving(true); setNotice(""); try { await request("/api/xpace/agenda", { method: "POST", body: JSON.stringify({ action: "ENROLL_STUDENT", enrollment }) }); await loadWorkspace(); setNotice("ALUNO MATRICULADO NA GRADE."); } catch (error) { setNotice(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL MATRICULAR O ALUNO."); } finally { setSaving(false); } }
  async function submitRental(event: FormEvent) { event.preventDefault(); setSaving(true); setNotice(""); try { await request("/api/xpace/agenda", { method: "POST", body: JSON.stringify({ action: "CREATE_RENTAL", rental: { ...rental, startsAt: new Date(rental.startsAt).toISOString(), endsAt: new Date(rental.endsAt).toISOString(), amountCents: toCents(rental.amount) } }) }); await loadWorkspace(); setNotice("LOCAÇÃO RESERVADA."); } catch (error) { setNotice(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL RESERVAR A SALA."); } finally { setSaving(false); } }

  return <section className="xd-agenda"><header className="xd-agenda-title"><div><span>AGENDA · OPERAÇÃO DE AULAS</span><h1>AGENDA E GRADES.</h1><p>Uma agenda mensal alimentada pelas grades cadastradas, com alunos vinculados em cada turma.</p></div></header><nav className="xd-agenda-nav">{([{ id: "AGENDA", icon: CalendarDays, label: "AGENDA" }, { id: "LOCACAO", icon: DoorOpen, label: "LOCAÇÃO" }, { id: "GRADES", icon: LayoutList, label: "GRADES DE HORÁRIOS" }, { id: "OCUPACAO", icon: Clock3, label: "OCUPAÇÃO" }] as Array<{ id: View; icon: typeof CalendarDays; label: string }>).map(({ id, icon: Icon, label }) => <button key={id} type="button" className={view === id ? "is-active" : ""} onClick={() => setView(id)}><Icon size={17} /> {label}</button>)}</nav>{notice ? <p className="xd-feedback">{notice}</p> : null}{loading ? <p className="xd-profile-loading">CARREGANDO AGENDA...</p> : view === "AGENDA" ? <Calendar month={month} setMonth={setMonth} groups={workspace.groups} selected={selectedGroup} onSelect={setSelectedGroup} /> : null}{view === "GRADES" ? <Grades groups={workspace.groups} modalities={workspace.modalities} instructors={workspace.instructors} rooms={workspace.rooms} students={workspace.students} classDraft={classDraft} setClassDraft={setClassDraft} enrollment={enrollment} setEnrollment={setEnrollment} saving={saving} onClass={submitClass} onEnrollment={submitEnrollment} onSettings={setSettingsGroup} onDelete={deleteGrade} /> : null}{view === "LOCACAO" ? <Rentals rentals={workspace.rentals} draft={rental} setDraft={setRental} saving={saving} onSubmit={submitRental} /> : null}{view === "OCUPACAO" ? <Occupation groups={workspace.groups} rentals={workspace.rentals} /> : null}{settingsGroup ? <GradeSettingsDialog group={settingsGroup} modalities={workspace.modalities} instructors={workspace.instructors} rooms={workspace.rooms} saving={saving} onClose={() => setSettingsGroup(null)} onSave={(draft) => saveGrade(settingsGroup.id, draft)} /> : null}</section>;
}

function Calendar({ month, setMonth, groups, selected, onSelect }: { month: Date; setMonth: (value: Date) => void; groups: Group[]; selected: Group | null; onSelect: (group: Group | null) => void }) { const days = useMemo(() => monthDays(month), [month]); const eventsByDate = useMemo(() => new Map(days.map((day) => [isoDay(day), groups.flatMap((group) => group.schedules.filter((schedule) => schedule.weekday === day.getDay()).map((schedule) => ({ group, schedule })))])), [days, groups]); return <div className="xd-calendar-layout"><section className="xd-calendar"><header><div className="xd-calendar-month"><button type="button" title="Mês anterior" onClick={() => setMonth(addMonths(month, -1))}><ChevronLeft size={19} /></button><div><small>VISUALIZAÇÃO MENSAL</small><strong>{month.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }).toUpperCase()}</strong></div><button type="button" title="Próximo mês" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight size={19} /></button></div><button type="button" className="xd-secondary" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>HOJE</button></header><div className="xd-calendar-weekdays">{["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"].map((item) => <span key={item}>{item}</span>)}</div><div className="xd-calendar-grid">{calendarCells(month).map((day) => { const events = eventsByDate.get(isoDay(day)) ?? []; const outside = day.getMonth() !== month.getMonth(); return <article key={isoDay(day)} className={outside ? "is-outside" : ""}><time>{day.getDate()}</time><div>{events.map(({ group, schedule }) => <button type="button" key={`${group.id}-${schedule.id}-${isoDay(day)}`} onClick={() => onSelect(group)} title={`${group.name} · ${schedule.startsAt} às ${schedule.endsAt}`}><i style={{ background: group.color }} /><span>{schedule.startsAt}</span><strong>{group.name}</strong></button>)}</div></article>; })}</div></section><aside className="xd-calendar-detail">{selected ? <><header><div><span style={{ background: selected.color }} /><small>TURMA SELECIONADA</small><h2>{selected.name}</h2><p>{selected.modality || "SEM MODALIDADE"} · {classLevelLabel(selected.level)}{selected.instructorName ? ` · ${selected.instructorName}` : ""}</p></div><button type="button" title="Fechar detalhes" onClick={() => onSelect(null)}>×</button></header><div className="xd-detail-schedules">{selected.schedules.map((schedule) => <span key={schedule.id}>{weekday[schedule.weekday]} · {schedule.startsAt}–{schedule.endsAt}{schedule.roomName ? ` · ${schedule.roomName}` : ""}</span>)}</div><div className="xd-student-list"><strong><UsersRound size={16} /> ALUNOS ({selected.students.length}{selected.capacity ? `/${selected.capacity}` : ""})</strong>{selected.students.length ? selected.students.map((student) => <article key={student.id}><span>{student.studentName}</span><small>{student.mobile || "SEM CELULAR"}</small></article>) : <p>NENHUM ALUNO MATRICULADO NESTA GRADE.</p>}</div></> : <div className="xd-calendar-hint"><CalendarDays size={24} /><strong>ESCOLHA UMA AULA</strong><p>Clique em uma aula do calendário para ver os horários e os alunos da turma.</p></div>}</aside></div>; }
function LegacyGrades({ groups, modalities, instructors, rooms, students, classDraft, setClassDraft, enrollment, setEnrollment, saving, onClass, onEnrollment, onSettings, onDelete }: { groups: Group[]; modalities: Workspace["modalities"]; instructors: Workspace["instructors"]; rooms: Workspace["rooms"]; students: Workspace["students"]; classDraft: ClassDraft; setClassDraft: (value: ClassDraft) => void; enrollment: { classGroupId: string; studentId: string; startsOn: string }; setEnrollment: (value: { classGroupId: string; studentId: string; startsOn: string }) => void; saving: boolean; onClass: (event: FormEvent) => Promise<boolean>; onEnrollment: (event: FormEvent) => void; onSettings: (group: Group) => void; onDelete: (group: Group) => Promise<void> }) {
  const modality = modalities.find((item) => item.id === classDraft.modalityId);
  const [creating, setCreating] = useState(false);
  const [scheduleDraft, setScheduleDraft] = useState({ weekday: 1, startsAt: "19:00", durationMinutes: "60" });
  const scheduleEnd = endTime(scheduleDraft.startsAt, Number(scheduleDraft.durationMinutes));
  function addSchedule() { if (!scheduleEnd || !classDraft.roomId || !classDraft.instructorId) return; const next: ScheduleDraft = { weekday: scheduleDraft.weekday, startsAt: scheduleDraft.startsAt, endsAt: scheduleEnd, roomId: classDraft.roomId, instructorId: classDraft.instructorId, ageGroup: classDraft.ageGroup, capacity: classDraft.capacity, settings: classDraft.settings }; if (classDraft.schedules.some((item) => item.weekday === next.weekday && item.startsAt === next.startsAt && item.endsAt === next.endsAt)) return; setClassDraft({ ...classDraft, schedules: [...classDraft.schedules, next].sort((left, right) => left.weekday - right.weekday || left.startsAt.localeCompare(right.startsAt)) }); }
  return <div className="xd-agenda-stack"><header className="xd-grade-list"><span><LayoutList size={18} /> GRADES CADASTRADAS</span><small>{groups.length} GRADE(S)</small><button type="button" className="xd-primary" onClick={() => setCreating(true)}><Plus size={16} /> NOVA GRADE</button></header>{creating ? <div className="xd-contract-overlay" role="presentation"><form className="xd-settings-dialog xd-modalities-picker xd-grade-create-dialog" onSubmit={(event) => { void onClass(event).then((saved) => { if (saved) setCreating(false); }); }} role="dialog" aria-modal="true" aria-labelledby="xd-new-grade-title"><header><span><Plus size={20} /></span><h2 id="xd-new-grade-title">NOVA GRADE</h2><button type="button" onClick={() => setCreating(false)} aria-label="Fechar">×</button></header><div className="xd-agenda-two-columns" tabIndex={0} role="region" aria-label="Dados e configurações da grade">
    <div className="xd-agenda-form">
      <div className="xd-agenda-fields">
        <label>USO DA GRADE<select value={classDraft.sourceType} onChange={(event) => setClassDraft({ ...classDraft, sourceType: event.target.value === "SERVICO" ? "SERVICO" : "CONTRATO" })}><option value="CONTRATO">CONTRATO</option><option value="SERVICO">SERVIÇO (EM BREVE)</option></select></label>
        <label>NOME DA TURMA<input value={classDraft.name} onChange={(event) => setClassDraft({ ...classDraft, name: event.target.value })} required placeholder="EX.: JAZZ INFANTIL" /></label>
        <label>MODALIDADE<select value={classDraft.modalityId} onChange={(event) => { const selected = modalities.find((item) => item.id === event.target.value); setClassDraft({ ...classDraft, modalityId: event.target.value, instructorId: selected?.instructorId || classDraft.instructorId }); }} required><option value="">SELECIONE UMA MODALIDADE</option>{modalities.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>NÍVEL<select value={classDraft.level} onChange={(event) => setClassDraft({ ...classDraft, level: event.target.value as ClassLevel })}>{classLevels.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <label>PÚBLICO DESTE HORÁRIO<select value={classDraft.ageGroup} onChange={(event) => setClassDraft({ ...classDraft, ageGroup: event.target.value as AgeGroup })}>{ageGroups.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <label>PROFESSOR DESTE HORÁRIO<select value={classDraft.instructorId} onChange={(event) => setClassDraft({ ...classDraft, instructorId: event.target.value })} required><option value="">SELECIONE UM PROFESSOR</option>{instructors.map((instructor) => <option key={instructor.id} value={instructor.id}>{instructor.fullName}</option>)}</select></label>
        <label>SALA<select value={classDraft.roomId} onChange={(event) => { const room = rooms.find((item) => item.id === event.target.value); setClassDraft({ ...classDraft, roomId: event.target.value, capacity: room?.capacity ? String(room.capacity) : classDraft.capacity }); }} required><option value="">SELECIONE UMA SALA</option>{rooms.map((room) => <option key={room.id} value={room.id}>{room.name}{room.capacity ? ` · ${room.capacity} VAGAS` : ""}</option>)}</select></label>
        <label>COR<input type="color" value={classDraft.color} onChange={(event) => setClassDraft({ ...classDraft, color: event.target.value })} /></label>
        <label>VAGAS<input type="number" min="1" value={classDraft.capacity} onChange={(event) => setClassDraft({ ...classDraft, capacity: event.target.value })} /></label>
        <section className="xd-schedule-builder"><header><strong>DIAS E HORÁRIOS</strong><small>ADICIONE QUANTOS FOREM NECESSÁRIOS</small></header><div><label>DIA DA SEMANA<select value={scheduleDraft.weekday} onChange={(event) => setScheduleDraft({ ...scheduleDraft, weekday: Number(event.target.value) })}>{[1, 2, 3, 4, 5, 6, 0].map((day) => <option key={day} value={day}>{weekday[day]}</option>)}</select></label><label>HORA INICIAL<input type="time" value={scheduleDraft.startsAt} onChange={(event) => setScheduleDraft({ ...scheduleDraft, startsAt: event.target.value })} required /></label><label>DURAÇÃO (MIN.)<input type="number" min="15" max="720" step="5" value={scheduleDraft.durationMinutes} onChange={(event) => setScheduleDraft({ ...scheduleDraft, durationMinutes: event.target.value })} required /></label><button type="button" className="xd-secondary" disabled={!scheduleEnd} onClick={addSchedule}><Plus size={15} /> ADICIONAR</button></div></section>
      </div>
      <p className="xd-agenda-slot-note">Defina sala, professor, vagas e regras abaixo e clique em ADICIONAR. Cada horário guarda uma cópia própria dessa configuração.</p><GradeSettingsFields settings={classDraft.settings} onChange={(settings) => setClassDraft({ ...classDraft, settings })} capacity={classDraft.capacity ? Number(classDraft.capacity) : undefined} />
      <WeeklySchedulePreview draft={classDraft} rooms={rooms} onRemove={(index) => setClassDraft({ ...classDraft, schedules: classDraft.schedules.filter((_, itemIndex) => itemIndex !== index) })} />
      {!modalities.length || !rooms.length ? <p className="xd-agenda-empty">CADASTRE UMA MODALIDADE COM AGENDA, UM PROFESSOR E UMA SALA PARA CRIAR GRADES.</p> : null}
    </div>
  </div><footer><button type="button" className="xd-secondary" disabled={saving} onClick={() => setCreating(false)}>CANCELAR</button><button type="submit" className="xd-primary" disabled={saving || !modalities.length || !rooms.length || !classDraft.schedules.length}><Save size={16} /> {saving ? "SALVANDO..." : "SALVAR GRADE"}</button></footer></form></div> : null}<section className="xd-grade-list">{groups.length ? groups.map((group) => <article key={group.id}><i style={{ background: group.color }} /><div><strong>{group.name}</strong><small>{group.sourceType === "SERVICO" ? "SERVIÇO · " : "CONTRATO · "}{group.modality || "SEM MODALIDADE"} · {classLevelLabel(group.level)}{group.instructorName ? ` · ${group.instructorName}` : ""}</small></div><span>{group.schedules.map((schedule) => `${weekday[schedule.weekday]} ${schedule.startsAt}–${schedule.endsAt}${schedule.roomName ? ` · ${schedule.roomName}` : ""}`).join(" · ")}</span><b>{group.students.length}{group.capacity ? `/${group.capacity}` : ""} ALUNOS</b><div className="xd-grade-actions"><button type="button" className="xd-grade-edit" onClick={() => onSettings(group)}><Settings2 size={14} /> EDITAR</button><button type="button" className="xd-grade-delete" disabled={saving} onClick={() => { void onDelete(group); }}>EXCLUIR</button></div></article>) : <p className="xd-agenda-empty">NENHUMA GRADE CADASTRADA.</p>}</section></div>;
}
type ScheduleSelection = { weekdays: number[]; startsAt: string; durationMinutes: string };

function addSchedulesToDraft(draft: ClassDraft, selection: ScheduleSelection, endsAt: string) {
  const scheduleKey = (schedule: Pick<ScheduleDraft, "weekday" | "startsAt" | "endsAt" | "roomId" | "instructorId" | "ageGroup">) => [schedule.weekday, schedule.startsAt, schedule.endsAt, schedule.roomId, schedule.instructorId, schedule.ageGroup].join(":");
  const existing = new Set(draft.schedules.map(scheduleKey));
  const additions = [...new Set(selection.weekdays)]
    .filter((day) => !existing.has(scheduleKey({ weekday: day, startsAt: selection.startsAt, endsAt, roomId: draft.roomId, instructorId: draft.instructorId, ageGroup: draft.ageGroup })))
    .map((weekday): ScheduleDraft => ({
      weekday,
      startsAt: selection.startsAt,
      endsAt,
      roomId: draft.roomId,
      instructorId: draft.instructorId,
      ageGroup: draft.ageGroup,
      capacity: draft.capacity,
      settings: draft.settings,
    }));

  return {
    draft: { ...draft, schedules: [...draft.schedules, ...additions].sort((left, right) => left.weekday - right.weekday || left.startsAt.localeCompare(right.startsAt)) },
    added: additions.length,
  };
}

function ScheduleBuilder({ value, onChange, endsAt, canAdd, onAdd, feedback }: { value: ScheduleSelection; onChange: (value: ScheduleSelection) => void; endsAt: string; canAdd: boolean; onAdd: () => void; feedback?: string }) {
  const orderedDays = [1, 2, 3, 4, 5, 6, 0];
  const selectedCount = value.weekdays.length;
  function toggleDay(day: number) {
    const weekdays = value.weekdays.includes(day)
      ? value.weekdays.filter((item) => item !== day)
      : [...value.weekdays, day].sort((left, right) => orderedDays.indexOf(left) - orderedDays.indexOf(right));
    onChange({ ...value, weekdays });
  }

  return <section className="xd-schedule-builder">
    <header><div><strong>DIAS E HORÁRIOS</strong><small>UM BLOCO POR CONFIGURAÇÃO</small></div><small>{selectedCount ? `${selectedCount} DIA(S) MARCADO(S)` : "MARQUE AO MENOS UM DIA"}</small></header>
    <fieldset className="xd-schedule-days">
      <legend>DIAS DA SEMANA</legend>
      <div>{orderedDays.map((day) => <label key={day}><input type="checkbox" checked={value.weekdays.includes(day)} onChange={() => toggleDay(day)} /><span>{weekday[day]}</span></label>)}</div>
    </fieldset>
    <div className="xd-schedule-time-fields">
      <label>HORA INICIAL<input type="time" value={value.startsAt} onChange={(event) => onChange({ ...value, startsAt: event.target.value })} required /></label>
      <label>DURAÇÃO (MIN.)<input type="number" min="15" max="720" step="5" value={value.durationMinutes} onChange={(event) => onChange({ ...value, durationMinutes: event.target.value })} required /></label>
      <p>TERMINA ÀS <strong>{endsAt || "—"}</strong></p>
    </div>
    <p className="xd-agenda-slot-note">Ao adicionar, todos os dias marcados recebem o público, professor, sala, vagas e regras configurados acima. Depois altere o que precisar e adicione outro bloco.</p>
    <div className="xd-schedule-builder-actions"><button type="button" className="xd-secondary" disabled={!canAdd || !selectedCount} onClick={onAdd}><Plus size={15} /> ADICIONAR DIAS E HORÁRIOS</button></div>
    {feedback ? <p className="xd-schedule-feedback" role="status">{feedback}</p> : null}
  </section>;
}

function Grades({ groups, modalities, instructors, rooms, students, classDraft, setClassDraft, enrollment, setEnrollment, saving, onClass, onEnrollment, onSettings, onDelete }: { groups: Group[]; modalities: Workspace["modalities"]; instructors: Workspace["instructors"]; rooms: Workspace["rooms"]; students: Workspace["students"]; classDraft: ClassDraft; setClassDraft: (value: ClassDraft) => void; enrollment: { classGroupId: string; studentId: string; startsOn: string }; setEnrollment: (value: { classGroupId: string; studentId: string; startsOn: string }) => void; saving: boolean; onClass: (event: FormEvent) => Promise<boolean>; onEnrollment: (event: FormEvent) => void; onSettings: (group: Group) => void; onDelete: (group: Group) => Promise<void> }) {
  const [creating, setCreating] = useState(false);
  const [scheduleDraft, setScheduleDraft] = useState<ScheduleSelection>({ weekdays: [], startsAt: "19:00", durationMinutes: "60" });
  const [scheduleFeedback, setScheduleFeedback] = useState("");
  const scheduleEnd = endTime(scheduleDraft.startsAt, Number(scheduleDraft.durationMinutes));
  const canAddSchedule = Boolean(scheduleEnd && classDraft.roomId && classDraft.instructorId);
  function addSchedule() {
    if (!canAddSchedule || !scheduleDraft.weekdays.length) return;
    const result = addSchedulesToDraft(classDraft, scheduleDraft, scheduleEnd);
    if (!result.added) {
      setScheduleFeedback("ESSES HORÁRIOS JÁ ESTÃO NESTA GRADE COM A MESMA SALA, PROFESSOR E PÚBLICO.");
      return;
    }
    setClassDraft(result.draft);
    setScheduleDraft((current) => ({ ...current, weekdays: [] }));
    setScheduleFeedback(`${result.added} HORÁRIO(S) ADICIONADO(S). AGORA CLIQUE EM SALVAR GRADE.`);
  }

  return <div className="xd-agenda-stack">
    <header className="xd-grade-list"><span><LayoutList size={18} /> GRADES CADASTRADAS</span><small>{groups.length} GRADE(S)</small><button type="button" className="xd-primary" onClick={() => setCreating(true)}><Plus size={16} /> NOVA GRADE</button></header>
    {creating ? <div className="xd-contract-overlay" role="presentation"><form className="xd-settings-dialog xd-modalities-picker xd-grade-create-dialog" onSubmit={(event) => { void onClass(event).then((saved) => { if (saved) setCreating(false); }); }} role="dialog" aria-modal="true" aria-labelledby="xd-new-grade-title">
      <header><span><Plus size={20} /></span><h2 id="xd-new-grade-title">NOVA GRADE</h2><button type="button" onClick={() => setCreating(false)} aria-label="Fechar">×</button></header>
      <div className="xd-agenda-two-columns" tabIndex={0} role="region" aria-label="Dados e configurações da grade"><div className="xd-agenda-form">
        <div className="xd-agenda-fields">
          <label>USO DA GRADE<select value={classDraft.sourceType} onChange={(event) => setClassDraft({ ...classDraft, sourceType: event.target.value === "SERVICO" ? "SERVICO" : "CONTRATO" })}><option value="CONTRATO">CONTRATO</option><option value="SERVICO">SERVIÇO (EM BREVE)</option></select></label>
          <label>NOME DA TURMA<input value={classDraft.name} onChange={(event) => setClassDraft({ ...classDraft, name: event.target.value })} required placeholder="EX.: JAZZ INFANTIL" /></label>
          <label>MODALIDADE<select value={classDraft.modalityId} onChange={(event) => { const selected = modalities.find((item) => item.id === event.target.value); setClassDraft({ ...classDraft, modalityId: event.target.value, instructorId: selected?.instructorId || classDraft.instructorId }); }} required><option value="">SELECIONE UMA MODALIDADE</option>{modalities.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>NÍVEL<select value={classDraft.level} onChange={(event) => setClassDraft({ ...classDraft, level: event.target.value as ClassLevel })}>{classLevels.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label>PÚBLICO DESTE HORÁRIO<select value={classDraft.ageGroup} onChange={(event) => setClassDraft({ ...classDraft, ageGroup: event.target.value as AgeGroup })}>{ageGroups.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label>PROFESSOR DESTE HORÁRIO<select value={classDraft.instructorId} onChange={(event) => setClassDraft({ ...classDraft, instructorId: event.target.value })} required><option value="">SELECIONE UM PROFESSOR</option>{instructors.map((instructor) => <option key={instructor.id} value={instructor.id}>{instructor.fullName}</option>)}</select></label>
          <label>SALA<select value={classDraft.roomId} onChange={(event) => { const room = rooms.find((item) => item.id === event.target.value); setClassDraft({ ...classDraft, roomId: event.target.value, capacity: room?.capacity ? String(room.capacity) : classDraft.capacity }); }} required><option value="">SELECIONE UMA SALA</option>{rooms.map((room) => <option key={room.id} value={room.id}>{room.name}{room.capacity ? ` · ${room.capacity} VAGAS` : ""}</option>)}</select></label>
          <label>COR<input type="color" value={classDraft.color} onChange={(event) => setClassDraft({ ...classDraft, color: event.target.value })} /></label>
          <label>VAGAS<input type="number" min="1" value={classDraft.capacity} onChange={(event) => setClassDraft({ ...classDraft, capacity: event.target.value })} /></label>
        </div>
        <GradeSettingsFields settings={classDraft.settings} onChange={(settings) => setClassDraft({ ...classDraft, settings })} capacity={classDraft.capacity ? Number(classDraft.capacity) : undefined} />
        <ScheduleBuilder value={scheduleDraft} onChange={setScheduleDraft} endsAt={scheduleEnd} canAdd={canAddSchedule} onAdd={addSchedule} feedback={scheduleFeedback} />
        <WeeklySchedulePreview draft={classDraft} rooms={rooms} instructors={instructors} onRemove={(index) => setClassDraft({ ...classDraft, schedules: classDraft.schedules.filter((_, itemIndex) => itemIndex !== index) })} />
        {!modalities.length || !rooms.length || !instructors.length ? <p className="xd-agenda-empty">CADASTRE UMA MODALIDADE COM AGENDA, UM PROFESSOR E UMA SALA PARA CRIAR GRADES.</p> : null}
      </div></div>
      <footer><button type="button" className="xd-secondary" disabled={saving} onClick={() => setCreating(false)}>CANCELAR</button><button type="submit" className="xd-primary" disabled={saving || !modalities.length || !rooms.length || !instructors.length || !classDraft.name || !classDraft.modalityId || !classDraft.schedules.length}><Save size={16} /> {saving ? "SALVANDO..." : "SALVAR GRADE"}</button></footer>
    </form></div> : null}
    <section className="xd-grade-list">{groups.length ? groups.map((group) => <article className="xd-grade-card" key={group.id}><i style={{ background: group.color }} /><div className="xd-grade-card-title"><strong>{group.name}</strong><small>{group.sourceType === "SERVICO" ? "SERVIÇO · " : "CONTRATO · "}{group.modality || "SEM MODALIDADE"} · {classLevelLabel(group.level)}</small></div><GradeScheduleSummary schedules={group.schedules} /><b>{group.students.length} ALUNOS</b><div className="xd-grade-actions"><button type="button" className="xd-grade-edit" onClick={() => onSettings(group)}><Settings2 size={14} /> EDITAR</button><button type="button" className="xd-grade-delete" disabled={saving} onClick={() => { void onDelete(group); }}>EXCLUIR</button></div></article>) : <p className="xd-agenda-empty">NENHUMA GRADE CADASTRADA.</p>}</section>
  </div>;
}

function WeeklySchedulePreview({ draft, rooms, instructors = [], onRemove }: { draft: ClassDraft; rooms: Workspace["rooms"]; instructors?: Workspace["instructors"]; onRemove: (index: number) => void }) {
  const orderedDays = [1, 2, 3, 4, 5, 6, 0];
  return <section className="xd-schedule-preview" aria-label="Horários cadastrados para esta grade">
    <header><strong>HORÁRIOS DESTA GRADE</strong><small>{draft.schedules.length ? `${draft.schedules.length} HORÁRIO(S) ADICIONADO(S)` : "CONFIGURE E ADICIONE UM BLOCO ABAIXO"}</small></header>
    <div>{orderedDays.map((day) => {
      const schedules = draft.schedules.map((item, index) => ({ ...item, index })).filter((item) => item.weekday === day);
      return <article key={day} className={schedules.length ? "is-selected" : ""}>
        <b>{weekday[day]}</b>
        {schedules.length ? schedules.map((schedule) => {
          const roomName = rooms.find((room) => room.id === schedule.roomId)?.name;
          const instructorName = instructors.find((instructor) => instructor.id === schedule.instructorId)?.fullName;
          return <span key={`${schedule.weekday}-${schedule.startsAt}-${schedule.index}`} style={{ borderColor: draft.color }}>
            <button type="button" aria-label={`Remover horário ${schedule.startsAt}`} onClick={() => onRemove(schedule.index)}>×</button>
            <strong>{schedule.startsAt} – {schedule.endsAt}</strong>
            <small>{roomName || "SALA A DEFINIR"}</small>
            <small>{instructorName || "PROFESSOR A DEFINIR"}</small>
            <small>{ageGroupLabel(schedule.ageGroup)}</small>
            <em>{schedule.capacity ? `${schedule.capacity} VAGAS` : "VAGAS DA SALA"}</em>
          </span>;
        }) : <i>—</i>}
      </article>;
    })}</div>
  </section>;
}

function GradeScheduleSummary({ schedules }: { schedules: Group["schedules"] }) {
  const groupedSchedules = new Map<string, { schedule: Group["schedules"][number]; weekdays: number[] }>();
  for (const schedule of [...schedules].sort((left, right) => left.weekday - right.weekday || left.startsAt.localeCompare(right.startsAt))) {
    const key = [schedule.instructorId, schedule.startsAt, schedule.endsAt, schedule.roomId, schedule.ageGroup, schedule.capacity ?? "", JSON.stringify(schedule.settings)].join("|");
    const current = groupedSchedules.get(key);
    if (current) current.weekdays.push(schedule.weekday);
    else groupedSchedules.set(key, { schedule, weekdays: [schedule.weekday] });
  }
  const rows = [...groupedSchedules.values()];
  return <section className="xd-grade-schedule-summary" aria-label="Horários cadastrados da turma">
    <div className="xd-grade-schedule-table" role="table">
      <div className="xd-grade-schedule-table-header" role="row"><span role="columnheader">PROFESSOR</span><span role="columnheader">HORÁRIO</span><span role="columnheader">DIAS DA SEMANA</span><span role="columnheader">SALA</span><span role="columnheader">PÚBLICO</span></div>
      {rows.map(({ schedule, weekdays }) => <div className="xd-grade-schedule-table-row" role="row" key={`${schedule.id}-${weekdays.join("-")}`}>
        <strong role="cell">{schedule.instructorName || "A DEFINIR"}</strong>
        <strong role="cell">{schedule.startsAt} ÀS {schedule.endsAt}</strong>
        <strong role="cell">{weekdays.map((day) => weekday[day]).join(" E ")}</strong>
        <strong role="cell">{schedule.roomName || "A DEFINIR"}</strong>
        <strong role="cell">{ageGroupLabel(schedule.ageGroup)}</strong>
      </div>)}
    </div>
  </section>;
}

function GradeSettingsFields({ settings, onChange, capacity }: { settings: GradeSettings; onChange: (settings: GradeSettings) => void; capacity?: number }) {
  const checkIn = settings.checkIn ?? {};
  const restrictions = settings.restrictions ?? {};
  return <section className="xd-grade-settings-fields"><header><div><small>REGRAS DA GRADE</small><h3>CONFIGURAÇÕES DE ACESSO</h3></div><p>Já ficam salvas ao cadastrar a turma.</p></header><div className="xd-grade-settings-cards"><section><h4>PERMISSÕES</h4><label className="xd-grade-toggle"><input type="checkbox" checked={Boolean(settings.maxClientsEnabled)} onChange={(event) => onChange({ ...settings, maxClientsEnabled: event.target.checked })} /><span><strong>LIMITE DE ALUNOS</strong><small>Controla as vagas da turma.</small></span></label>{settings.maxClientsEnabled ? <label className="xd-grade-number">VAGAS MÁXIMAS<input type="number" min="1" max={capacity ?? 10000} value={settings.maxClients ?? ""} onChange={(event) => onChange({ ...settings, maxClients: Number(event.target.value) || null })} /></label> : null}<label className="xd-grade-toggle"><input type="checkbox" checked={Boolean(settings.allowSpecialStudents)} onChange={(event) => onChange({ ...settings, allowSpecialStudents: event.target.checked })} /><span><strong>ALUNO ESPECIAL</strong><small>Permite aluno sem contrato.</small></span></label><label className="xd-grade-toggle"><input type="checkbox" checked={Boolean(settings.allowLeads)} onChange={(event) => onChange({ ...settings, allowLeads: event.target.checked })} /><span><strong>PERMITIR LEADS</strong><small>Libera a grade para experimentação.</small></span></label>{settings.allowLeads ? <label className="xd-grade-video">VÍDEO DE BOAS-VINDAS<input type="url" value={settings.leadWelcomeVideoUrl ?? ""} onChange={(event) => onChange({ ...settings, leadWelcomeVideoUrl: event.target.value })} placeholder="https://..." /><small>O CRM registra o envio pendente ao reservar esta turma.</small></label> : null}</section><section><h4>CHECK-IN E ACESSO</h4><label className="xd-grade-toggle"><input type="checkbox" checked={Boolean(checkIn.requireClass)} onChange={(event) => onChange({ ...settings, checkIn: { ...checkIn, requireClass: event.target.checked } })} /><span><strong>EXIGIR VÍNCULO</strong><small>Check-in somente para quem está na grade.</small></span></label><label className="xd-grade-toggle"><input type="checkbox" checked={Boolean(checkIn.showInApp)} onChange={(event) => onChange({ ...settings, checkIn: { ...checkIn, showInApp: event.target.checked } })} /><span><strong>EXIBIR NO APLICATIVO</strong><small>Mostra esta turma ao aluno.</small></span></label><div className="xd-grade-number-pair"><label>ENTRAR ANTES<input type="number" min="0" max="1440" value={checkIn.accessBeforeMinutes ?? 0} onChange={(event) => onChange({ ...settings, checkIn: { ...checkIn, accessBeforeMinutes: Number(event.target.value) || 0 } })} /><small>MINUTOS</small></label><label>ENTRAR APÓS<input type="number" min="0" max="1440" value={checkIn.accessAfterStartMinutes ?? 0} onChange={(event) => onChange({ ...settings, checkIn: { ...checkIn, accessAfterStartMinutes: Number(event.target.value) || 0 } })} /><small>MINUTOS</small></label></div></section><section><h4>RESTRIÇÕES AVANÇADAS</h4><label className="xd-grade-select">GÊNERO<select value={restrictions.gender ?? "TODOS"} onChange={(event) => onChange({ ...settings, restrictions: { ...restrictions, gender: event.target.value } })}><option value="TODOS">TODOS</option><option value="FEMININO">SOMENTE FEMININO</option><option value="MASCULINO">SOMENTE MASCULINO</option></select></label><label className="xd-grade-toggle"><input type="checkbox" checked={Boolean(restrictions.freeSchedule)} onChange={(event) => onChange({ ...settings, restrictions: { ...restrictions, freeSchedule: event.target.checked } })} /><span><strong>AGENDA LIVRE</strong><small>Não desconta sessão do contrato.</small></span></label></section></div></section>;
}
function LegacyGradeSettingsDialog({ group, modalities, instructors, rooms, saving, onClose, onSave }: { group: Group; modalities: Workspace["modalities"]; instructors: Workspace["instructors"]; rooms: Workspace["rooms"]; saving: boolean; onClose: () => void; onSave: (draft: ClassDraft) => Promise<boolean> }) {
  const [draft, setDraft] = useState<ClassDraft>({ name: group.name, modalityId: group.modalityId, level: group.level, ageGroup: group.schedules[0]?.ageGroup ?? "ADULTO", roomId: group.schedules[0]?.roomId ?? "", instructorId: group.schedules[0]?.instructorId ?? "", color: group.color, capacity: group.schedules[0]?.capacity ? String(group.schedules[0].capacity) : "", sourceType: group.sourceType, weekdays: group.schedules.map((schedule) => schedule.weekday), startsAt: group.schedules[0]?.startsAt ?? "19:00", durationMinutes: String(minutesBetween(group.schedules[0]?.startsAt, group.schedules[0]?.endsAt) ?? 60), schedules: group.schedules.map((schedule) => ({ id: schedule.id, weekday: schedule.weekday, startsAt: schedule.startsAt, endsAt: schedule.endsAt, roomId: schedule.roomId, instructorId: schedule.instructorId, ageGroup: schedule.ageGroup, capacity: schedule.capacity ? String(schedule.capacity) : "", settings: schedule.settings })), settings: group.schedules[0]?.settings ?? group.settings });
  const [scheduleDraft, setScheduleDraft] = useState({ weekday: 1, startsAt: "19:00", durationMinutes: "60" });
  const modality = modalities.find((item) => item.id === draft.modalityId);
  const scheduleEnd = endTime(scheduleDraft.startsAt, Number(scheduleDraft.durationMinutes));
  function addSchedule() { if (!scheduleEnd || !draft.roomId || !draft.instructorId) return; const next: ScheduleDraft = { weekday: scheduleDraft.weekday, startsAt: scheduleDraft.startsAt, endsAt: scheduleEnd, roomId: draft.roomId, instructorId: draft.instructorId, ageGroup: draft.ageGroup, capacity: draft.capacity, settings: draft.settings }; if (draft.schedules.some((item) => item.weekday === next.weekday && item.startsAt === next.startsAt && item.endsAt === next.endsAt)) return; setDraft({ ...draft, schedules: [...draft.schedules, next].sort((left, right) => left.weekday - right.weekday || left.startsAt.localeCompare(right.startsAt)) }); }
  async function submit(event: FormEvent) { event.preventDefault(); if (await onSave(draft)) onClose(); }
  return <div className="xd-contract-overlay" role="presentation"><form className="xd-settings-dialog xd-grade-create-dialog xd-grade-edit-dialog" onSubmit={(event) => { void submit(event); }} role="dialog" aria-modal="true" aria-labelledby="xd-edit-grade-title"><header><span><Settings2 size={20} /></span><h2 id="xd-edit-grade-title">EDITAR GRADE</h2><button type="button" onClick={onClose} aria-label="Fechar">×</button></header><div className="xd-agenda-two-columns" tabIndex={0} role="region" aria-label="Dados e configurações da grade"><div className="xd-agenda-form"><div className="xd-agenda-fields"><label>USO DA GRADE<select value={draft.sourceType} onChange={(event) => setDraft({ ...draft, sourceType: event.target.value === "SERVICO" ? "SERVICO" : "CONTRATO" })}><option value="CONTRATO">CONTRATO</option><option value="SERVICO">SERVIÇO (EM BREVE)</option></select></label><label>NOME DA TURMA<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required /></label><label>MODALIDADE<select value={draft.modalityId} onChange={(event) => setDraft({ ...draft, modalityId: event.target.value })} required><option value="">SELECIONE UMA MODALIDADE</option>{modalities.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>NÍVEL<select value={draft.level} onChange={(event) => setDraft({ ...draft, level: event.target.value as ClassLevel })}>{classLevels.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label>PROFESSOR<input value={modality?.instructorName || "SELECIONE A MODALIDADE"} disabled /></label><label>SALA<select value={draft.roomId} onChange={(event) => { const room = rooms.find((item) => item.id === event.target.value); setDraft({ ...draft, roomId: event.target.value, capacity: room?.capacity ? String(room.capacity) : draft.capacity }); }} required><option value="">SELECIONE UMA SALA</option>{rooms.map((room) => <option key={room.id} value={room.id}>{room.name}{room.capacity ? ` · ${room.capacity} VAGAS` : ""}</option>)}</select></label><label>COR<input type="color" value={draft.color} onChange={(event) => setDraft({ ...draft, color: event.target.value })} /></label><label>VAGAS<input type="number" min="1" value={draft.capacity} onChange={(event) => setDraft({ ...draft, capacity: event.target.value })} /></label><section className="xd-schedule-builder"><header><strong>DIAS E HORÁRIOS</strong><small>ADICIONE QUANTOS FOREM NECESSÁRIOS</small></header><div><label>DIA DA SEMANA<select value={scheduleDraft.weekday} onChange={(event) => setScheduleDraft({ ...scheduleDraft, weekday: Number(event.target.value) })}>{[1, 2, 3, 4, 5, 6, 0].map((day) => <option key={day} value={day}>{weekday[day]}</option>)}</select></label><label>HORA INICIAL<input type="time" value={scheduleDraft.startsAt} onChange={(event) => setScheduleDraft({ ...scheduleDraft, startsAt: event.target.value })} required /></label><label>DURAÇÃO (MIN.)<input type="number" min="15" max="720" step="5" value={scheduleDraft.durationMinutes} onChange={(event) => setScheduleDraft({ ...scheduleDraft, durationMinutes: event.target.value })} required /></label><button type="button" className="xd-secondary" disabled={!scheduleEnd} onClick={addSchedule}><Plus size={15} /> ADICIONAR</button></div></section></div><GradeSettingsFields settings={draft.settings} onChange={(settings) => setDraft({ ...draft, settings })} capacity={draft.capacity ? Number(draft.capacity) : undefined} /><WeeklySchedulePreview draft={draft} rooms={rooms} onRemove={(index) => setDraft({ ...draft, schedules: draft.schedules.filter((_, itemIndex) => itemIndex !== index) })} /><section className="xd-grade-students"><header><div><small>ALUNOS VINCULADOS</small><h3>{group.students.length} ALUNO(S) NESTA AGENDA</h3></div></header>{group.students.length ? <div>{group.students.map((student) => <article key={student.id}><strong>{student.studentName}</strong><small>{student.mobile || "SEM CELULAR"}</small></article>)}</div> : <p>NENHUM ALUNO MATRICULADO NESTA GRADE.</p>}</section></div></div><footer><button type="button" className="xd-secondary" disabled={saving} onClick={onClose}>CANCELAR</button><button type="submit" className="xd-primary" disabled={saving || !draft.name || !draft.modalityId || !draft.roomId || !draft.schedules.length}><Save size={16} /> {saving ? "SALVANDO..." : "SALVAR ALTERAÇÕES"}</button></footer></form></div>;
}
function GradeSettingsDialog({ group, modalities, instructors, rooms, saving, onClose, onSave }: { group: Group; modalities: Workspace["modalities"]; instructors: Workspace["instructors"]; rooms: Workspace["rooms"]; saving: boolean; onClose: () => void; onSave: (draft: ClassDraft) => Promise<boolean> }) {
  const [draft, setDraft] = useState<ClassDraft>({
    name: group.name,
    modalityId: group.modalityId,
    level: group.level,
    ageGroup: group.schedules[0]?.ageGroup ?? "ADULTO",
    roomId: group.schedules[0]?.roomId ?? "",
    instructorId: group.schedules[0]?.instructorId ?? "",
    color: group.color,
    capacity: group.schedules[0]?.capacity ? String(group.schedules[0].capacity) : "",
    sourceType: group.sourceType,
    weekdays: group.schedules.map((schedule) => schedule.weekday),
    startsAt: group.schedules[0]?.startsAt ?? "19:00",
    durationMinutes: String(minutesBetween(group.schedules[0]?.startsAt, group.schedules[0]?.endsAt) ?? 60),
    schedules: group.schedules.map((schedule) => ({ id: schedule.id, weekday: schedule.weekday, startsAt: schedule.startsAt, endsAt: schedule.endsAt, roomId: schedule.roomId, instructorId: schedule.instructorId, ageGroup: schedule.ageGroup, capacity: schedule.capacity ? String(schedule.capacity) : "", settings: schedule.settings })),
    settings: group.schedules[0]?.settings ?? group.settings,
  });
  const [scheduleDraft, setScheduleDraft] = useState<ScheduleSelection>({ weekdays: [], startsAt: "19:00", durationMinutes: "60" });
  const [scheduleFeedback, setScheduleFeedback] = useState("");
  const scheduleEnd = endTime(scheduleDraft.startsAt, Number(scheduleDraft.durationMinutes));
  const canAddSchedule = Boolean(scheduleEnd && draft.roomId && draft.instructorId);
  function addSchedule() {
    if (!canAddSchedule || !scheduleDraft.weekdays.length) return;
    const result = addSchedulesToDraft(draft, scheduleDraft, scheduleEnd);
    if (!result.added) {
      setScheduleFeedback("ESSES HORÁRIOS JÁ ESTÃO NESTA GRADE COM A MESMA SALA, PROFESSOR E PÚBLICO.");
      return;
    }
    setDraft(result.draft);
    setScheduleDraft((current) => ({ ...current, weekdays: [] }));
    setScheduleFeedback(`${result.added} HORÁRIO(S) ADICIONADO(S). AGORA CLIQUE EM SALVAR ALTERAÇÕES.`);
  }
  async function submit(event: FormEvent) { event.preventDefault(); if (await onSave(draft)) onClose(); }

  return <div className="xd-contract-overlay" role="presentation"><form className="xd-settings-dialog xd-grade-create-dialog xd-grade-edit-dialog" onSubmit={(event) => { void submit(event); }} role="dialog" aria-modal="true" aria-labelledby="xd-edit-grade-title">
    <header><span><Settings2 size={20} /></span><h2 id="xd-edit-grade-title">EDITAR GRADE</h2><button type="button" onClick={onClose} aria-label="Fechar">×</button></header>
    <div className="xd-agenda-two-columns" tabIndex={0} role="region" aria-label="Dados e configurações da grade"><div className="xd-agenda-form">
      <div className="xd-agenda-fields">
        <label>USO DA GRADE<select value={draft.sourceType} onChange={(event) => setDraft({ ...draft, sourceType: event.target.value === "SERVICO" ? "SERVICO" : "CONTRATO" })}><option value="CONTRATO">CONTRATO</option><option value="SERVICO">SERVIÇO (EM BREVE)</option></select></label>
        <label>NOME DA TURMA<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required /></label>
        <label>MODALIDADE<select value={draft.modalityId} onChange={(event) => setDraft({ ...draft, modalityId: event.target.value })} required><option value="">SELECIONE UMA MODALIDADE</option>{modalities.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>NÍVEL<select value={draft.level} onChange={(event) => setDraft({ ...draft, level: event.target.value as ClassLevel })}>{classLevels.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <label>PÚBLICO DESTE HORÁRIO<select value={draft.ageGroup} onChange={(event) => setDraft({ ...draft, ageGroup: event.target.value as AgeGroup })}>{ageGroups.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <label>PROFESSOR DESTE HORÁRIO<select value={draft.instructorId} onChange={(event) => setDraft({ ...draft, instructorId: event.target.value })} required><option value="">SELECIONE UM PROFESSOR</option>{instructors.map((instructor) => <option key={instructor.id} value={instructor.id}>{instructor.fullName}</option>)}</select></label>
        <label>SALA<select value={draft.roomId} onChange={(event) => { const room = rooms.find((item) => item.id === event.target.value); setDraft({ ...draft, roomId: event.target.value, capacity: room?.capacity ? String(room.capacity) : draft.capacity }); }} required><option value="">SELECIONE UMA SALA</option>{rooms.map((room) => <option key={room.id} value={room.id}>{room.name}{room.capacity ? ` · ${room.capacity} VAGAS` : ""}</option>)}</select></label>
        <label>COR<input type="color" value={draft.color} onChange={(event) => setDraft({ ...draft, color: event.target.value })} /></label>
        <label>VAGAS<input type="number" min="1" value={draft.capacity} onChange={(event) => setDraft({ ...draft, capacity: event.target.value })} /></label>
      </div>
      <GradeSettingsFields settings={draft.settings} onChange={(settings) => setDraft({ ...draft, settings })} capacity={draft.capacity ? Number(draft.capacity) : undefined} />
      <ScheduleBuilder value={scheduleDraft} onChange={setScheduleDraft} endsAt={scheduleEnd} canAdd={canAddSchedule} onAdd={addSchedule} feedback={scheduleFeedback} />
      <WeeklySchedulePreview draft={draft} rooms={rooms} instructors={instructors} onRemove={(index) => setDraft({ ...draft, schedules: draft.schedules.filter((_, itemIndex) => itemIndex !== index) })} />
      <section className="xd-grade-students"><header><div><small>ALUNOS VINCULADOS</small><h3>{group.students.length} ALUNO(S) NESTA AGENDA</h3></div></header>{group.students.length ? <div>{group.students.map((student) => <article key={student.id}><strong>{student.studentName}</strong><small>{student.mobile || "SEM CELULAR"}</small></article>)}</div> : <p>NENHUM ALUNO MATRICULADO NESTA GRADE.</p>}</section>
    </div></div>
    <footer><button type="button" className="xd-secondary" disabled={saving} onClick={onClose}>CANCELAR</button><button type="submit" className="xd-primary" disabled={saving || !draft.name || !draft.modalityId || !draft.schedules.length}><Save size={16} /> {saving ? "SALVANDO..." : "SALVAR ALTERAÇÕES"}</button></footer>
  </form></div>;
}

function Rentals({ rentals, draft, setDraft, saving, onSubmit }: { rentals: Workspace["rentals"]; draft: { roomName: string; renterName: string; startsAt: string; endsAt: string; amount: string; note: string }; setDraft: (value: { roomName: string; renterName: string; startsAt: string; endsAt: string; amount: string; note: string }) => void; saving: boolean; onSubmit: (event: FormEvent) => void }) {
  const [creating, setCreating] = useState(false);

  return <div className="xd-agenda-stack">
    <header className="xd-section-toolbar"><span><DoorOpen size={18} /> LOCAÇÕES</span><small>{rentals.length} RESERVA(S)</small><button type="button" className="xd-primary" onClick={() => setCreating(true)}><Plus size={16} /> NOVA LOCAÇÃO</button></header>
    {creating ? <div className="xd-contract-overlay" role="presentation"><form className="xd-settings-dialog xd-rental-dialog" onSubmit={onSubmit} role="dialog" aria-modal="true"><header><span><DoorOpen size={20} /></span><h2>NOVA LOCAÇÃO</h2><button type="button" onClick={() => setCreating(false)} aria-label="Fechar">×</button></header><div className="xd-rental-dialog-content"><p>Reserve uma sala para um período específico. A operação impede conflito com outras locações.</p><div className="xd-agenda-fields"><label>SALA<input value={draft.roomName} onChange={(event) => setDraft({ ...draft, roomName: event.target.value })} required placeholder="EX.: SALA 02" /></label><label>LOCATÁRIO<input value={draft.renterName} onChange={(event) => setDraft({ ...draft, renterName: event.target.value })} required /></label><label>INÍCIO<input type="datetime-local" value={draft.startsAt} onChange={(event) => setDraft({ ...draft, startsAt: event.target.value })} required /></label><label>FIM<input type="datetime-local" value={draft.endsAt} onChange={(event) => setDraft({ ...draft, endsAt: event.target.value })} required /></label><label>VALOR (R$)<input type="number" step="0.01" min="0" value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} /></label><label className="xd-agenda-wide">OBSERVAÇÃO<input value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} /></label></div></div><footer><button type="button" className="xd-secondary" onClick={() => setCreating(false)}>CANCELAR</button><button type="submit" className="xd-primary" disabled={saving}>RESERVAR SALA</button></footer></form></div> : null}
    <section className="xd-grade-list">{rentals.length ? rentals.map((item) => <article key={item.id}><i /><div><strong>{item.roomName}</strong><small>{item.renterName}</small></div><span>{dateTime(item.startsAt)} — {dateTime(item.endsAt)}</span><b>{currency(item.amountCents)}</b></article>) : <p className="xd-agenda-empty">NENHUMA LOCAÇÃO RESERVADA.</p>}</section>
  </div>;
}
type OccupationSlot = { id: string; roomName: string; weekday: number; startsAt: string; endsAt: string; label: string; modality: string; color: string; students: number; capacity: number | null };
function Occupation({ groups, rentals }: { groups: Group[]; rentals: Workspace["rentals"] }) {
  const slots = groups.flatMap((group) => group.schedules.map((schedule) => ({ id: schedule.id, roomName: schedule.roomName || "SALA A DEFINIR", weekday: schedule.weekday, startsAt: schedule.startsAt, endsAt: schedule.endsAt, label: group.name, modality: group.modality, color: group.color, students: group.students.length, capacity: group.capacity })));
  const areas = Array.from(new Set(slots.map((slot) => slot.roomName))).sort((left, right) => left.localeCompare(right));
  return <div className="xd-agenda-stack"><section className="xd-occupation"><header><span><Clock3 size={18} /> OCUPAÇÃO DE HORÁRIOS</span><small>{areas.length ? `${areas.length} ÁREA(S) CADASTRADA(S)` : "SEM ÁREAS CADASTRADAS"}</small></header>{slots.length ? <div className="xd-occupation-areas">{areas.map((area) => <OccupationArea key={area} name={area} slots={slots.filter((slot) => slot.roomName === area)} />)}</div> : <p className="xd-agenda-empty">CADASTRE GRADES COM SALA E HORÁRIOS PARA VISUALIZAR A OCUPAÇÃO.</p>}</section>{rentals.length ? <section className="xd-occupation-rentals"><header><span>LOCAÇÕES AVULSAS</span><small>EVENTOS POR DATA</small></header>{rentals.map((rental) => <article key={rental.id}><i /><div><strong>{rental.roomName} · {rental.renterName}</strong><small>{dateTime(rental.startsAt)} — {dateTime(rental.endsAt)}</small></div></article>)}</section> : null}</div>;
}
function OccupationArea({ name, slots }: { name: string; slots: OccupationSlot[] }) {
  const visibleDays = [1, 2, 3, 4, 5, 6, 0];
  const earliest = Math.max(0, Math.min(8 * 60, ...slots.map((slot) => timeMinutes(slot.startsAt))));
  const latest = Math.min(24 * 60, Math.max(21 * 60, ...slots.map((slot) => timeMinutes(slot.endsAt))));
  const startsAt = Math.floor(earliest / 60) * 60;
  const endsAt = Math.min(24 * 60, Math.ceil(latest / 60) * 60);
  const pixelsPerHour = 88;
  const boardHeight = Math.max(352, ((endsAt - startsAt) / 60) * pixelsPerHour);
  return <section className="xd-occupation-area"><header><div><small>ÁREA</small><h2>{name}</h2></div><span>{slots.length} HORÁRIO(S) RECORRENTE(S)</span></header><div className="xd-occupation-scroll"><div className="xd-occupation-board" style={{ "--occupation-height": `${boardHeight}px`, "--occupation-hour": `${pixelsPerHour}px` } as CSSProperties}><aside>{Array.from({ length: (endsAt - startsAt) / 60 + 1 }, (_, index) => <time key={startsAt + index * 60} style={{ top: `${38 + index * pixelsPerHour}px` }}>{formatHour(startsAt + index * 60)}</time>)}</aside>{visibleDays.map((day) => <OccupationDay key={day} day={day} slots={slots.filter((slot) => slot.weekday === day)} startsAt={startsAt} pixelsPerHour={pixelsPerHour} />)}</div></div></section>;
}
function OccupationDay({ day, slots, startsAt, pixelsPerHour }: { day: number; slots: OccupationSlot[]; startsAt: number; pixelsPerHour: number }) {
  const positioned = positionOccupationSlots(slots);
  return <section className="xd-occupation-day"><header>{weekday[day]}</header><div>{positioned.map(({ slot, lane, lanes }) => { const start = timeMinutes(slot.startsAt); const end = timeMinutes(slot.endsAt); const width = `calc(${100 / lanes}% - 6px)`; return <article key={slot.id} title={`${slot.label} · ${slot.startsAt}–${slot.endsAt}`} style={{ top: `${((start - startsAt) / 60) * pixelsPerHour}px`, height: `${Math.max(42, ((end - start) / 60) * pixelsPerHour - 4)}px`, left: `calc(${(lane / lanes) * 100}% + 3px)`, width, background: slot.color }}><time>{slot.startsAt} – {slot.endsAt}</time><strong>{slot.label}</strong>{slot.modality ? <span>{slot.modality}</span> : null}<small>{slot.students}{slot.capacity ? ` / ${slot.capacity}` : ""} ALUNOS</small></article>; })}</div></section>;
}
function positionOccupationSlots(slots: OccupationSlot[]) {
  const ordered = [...slots].sort((left, right) => timeMinutes(left.startsAt) - timeMinutes(right.startsAt) || timeMinutes(left.endsAt) - timeMinutes(right.endsAt));
  const laneEnds: number[] = [];
  const positioned = ordered.map((slot) => { const start = timeMinutes(slot.startsAt); const lane = laneEnds.findIndex((endsAt) => endsAt <= start); const index = lane === -1 ? laneEnds.length : lane; laneEnds[index] = timeMinutes(slot.endsAt); return { slot, lane: index }; });
  return positioned.map((item) => ({ ...item, lanes: Math.max(1, laneEnds.length) }));
}
function monthDays(month: Date) { const last = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate(); return Array.from({ length: last }, (_, index) => new Date(month.getFullYear(), month.getMonth(), index + 1)); }
function calendarCells(month: Date) { const first = new Date(month.getFullYear(), month.getMonth(), 1); const offset = (first.getDay() + 6) % 7; return Array.from({ length: 42 }, (_, index) => new Date(month.getFullYear(), month.getMonth(), index - offset + 1)); }
function isoDay(value: Date) { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`; }
function addMonths(value: Date, amount: number) { return new Date(value.getFullYear(), value.getMonth() + amount, 1); }
function todayIso() { return isoDay(new Date()); }
function toLocalInput(value: Date) { const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000); return local.toISOString().slice(0, 16); }
function endTime(startsAt: string, durationMinutes: number) { if (!/^\d{2}:\d{2}$/.test(startsAt) || !Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 720) return ""; const [hours, minutes] = startsAt.split(":").map(Number); const total = hours * 60 + minutes + durationMinutes; if (total >= 24 * 60) return ""; return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`; }
function timeMinutes(value?: string) { if (!value || !/^\d{2}:\d{2}$/.test(value)) return 0; const [hours, minutes] = value.split(":").map(Number); return hours * 60 + minutes; }
function minutesBetween(startsAt?: string, endsAt?: string) { const duration = timeMinutes(endsAt) - timeMinutes(startsAt); return duration > 0 ? duration : null; }
function formatHour(minutes: number) { return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:00`; }
function toCents(value: string) { const numeric = Number(value.replace(",", ".")); return Number.isFinite(numeric) ? Math.round(numeric * 100) : 0; }
function currency(value: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value / 100); }
function dateTime(value: string) { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); }

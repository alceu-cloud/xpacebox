"use client";

import { Clock3, Music2, Phone, UserRound } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

type ClassLevel = "INICIANTE" | "INICIANTE_INTERMEDIARIO" | "INTERMEDIARIO" | "AVANCADO";
type AgeGroup = "BABY" | "KIDS" | "TEENS" | "ADULTO";
type Slot = { classGroupId: string; classScheduleId: string; scheduledOn: string; startsAt: string; endsAt: string; className: string; modality: string; level: ClassLevel; ageGroup: AgeGroup; instructorName: string; roomName: string; remainingSeats: number | null };

const classLevels: Array<{ value: ClassLevel; label: string }> = [{ value: "INICIANTE", label: "INICIANTE" }, { value: "INICIANTE_INTERMEDIARIO", label: "INICIANTE / INTERMEDIÁRIO" }, { value: "INTERMEDIARIO", label: "INTERMEDIÁRIO" }, { value: "AVANCADO", label: "AVANÇADO" }];
const ageGroups: Array<{ value: AgeGroup; label: string }> = [{ value: "BABY", label: "BABY (4 A 6)" }, { value: "KIDS", label: "KIDS (7 A 11)" }, { value: "TEENS", label: "TEENS (12 A 17)" }, { value: "ADULTO", label: "ADULTO (18+)" }];

export default function TrialBookingPage() {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [schoolName, setSchoolName] = useState("XPACE");
  const [selectedAgeGroup, setSelectedAgeGroup] = useState<AgeGroup | "">("");
  const [selectedModality, setSelectedModality] = useState("");
  const [selectedLevel, setSelectedLevel] = useState<ClassLevel | "">("");
  const [selectedWeekday, setSelectedWeekday] = useState<number | null>(null);
  const [selected, setSelected] = useState("");
  const [form, setForm] = useState({ fullName: "", mobile: "", email: "", website: "" });
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => { void loadSlots(); }, []);
  const ageGroupSlots = useMemo(() => slots.filter((slot) => slot.ageGroup === selectedAgeGroup), [selectedAgeGroup, slots]);
  const modalities = useMemo(() => Array.from(new Set(ageGroupSlots.map((slot) => slot.modality))).sort((left, right) => left.localeCompare(right)), [ageGroupSlots]);
  const modalitySlots = useMemo(() => ageGroupSlots.filter((slot) => slot.modality === selectedModality), [ageGroupSlots, selectedModality]);
  const levels = useMemo(() => classLevels.filter((level) => modalitySlots.some((slot) => slot.level === level.value)), [modalitySlots]);
  const levelSlots = useMemo(() => modalitySlots.filter((slot) => supportsSelectedLevel(slot.level, selectedLevel)), [modalitySlots, selectedLevel]);
  const weekdays = useMemo(() => Array.from(new Set(levelSlots.map((slot) => weekdayOf(slot.scheduledOn)))).sort((left, right) => weekdayOrder(left) - weekdayOrder(right)), [levelSlots]);
  const timeSlots = useMemo(() => levelSlots.filter((slot) => weekdayOf(slot.scheduledOn) === selectedWeekday), [levelSlots, selectedWeekday]);
  const chosen = useMemo(() => slots.find((slot) => slotKey(slot) === selected), [selected, slots]);

  async function loadSlots() {
    setLoading(true);
    try {
      const response = await fetch("/api/public/xpace/aula-experimental", { cache: "no-store" });
      const payload = await response.json() as { success?: boolean; message?: string; schoolName?: string; slots?: Slot[] };
      if (!response.ok || !payload.success) throw new Error(payload.message || "NÃO FOI POSSÍVEL CARREGAR OS HORÁRIOS.");
      setSlots(payload.slots ?? []); setSchoolName(payload.schoolName || "XPACE");
    } catch (error) { setNotice(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL CARREGAR OS HORÁRIOS."); }
    finally { setLoading(false); }
  }

  function chooseAgeGroup(ageGroup: AgeGroup) { setSelectedAgeGroup(ageGroup); setSelectedModality(""); setSelectedLevel(""); setSelectedWeekday(null); setSelected(""); }
  function chooseModality(modality: string) { setSelectedModality(modality); setSelectedLevel(""); setSelectedWeekday(null); setSelected(""); }
  function chooseLevel(level: ClassLevel) { setSelectedLevel(level); setSelectedWeekday(null); setSelected(""); }
  function chooseWeekday(day: number) { setSelectedWeekday(day); setSelected(""); }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!chosen) { setNotice("ESCOLHA UMA AULA EXPERIMENTAL DISPONÍVEL."); return; }
    setSending(true); setNotice("");
    try {
      const response = await fetch("/api/public/xpace/aula-experimental", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, classGroupId: chosen.classGroupId, classScheduleId: chosen.classScheduleId, scheduledOn: chosen.scheduledOn }) });
      const payload = await response.json() as { success?: boolean; message?: string };
      if (!response.ok || !payload.success) throw new Error(payload.message || "NÃO FOI POSSÍVEL CONCLUIR O AGENDAMENTO.");
      setNotice(payload.message || "AULA EXPERIMENTAL AGENDADA!"); setSelected(""); setSelectedWeekday(null); setSelectedLevel(""); setSelectedModality(""); setSelectedAgeGroup(""); setForm({ fullName: "", mobile: "", email: "", website: "" }); await loadSlots();
    } catch (error) { setNotice(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL CONCLUIR O AGENDAMENTO."); }
    finally { setSending(false); }
  }

  return <main className="xpace-public-booking"><section className="xpace-public-booking-card">
    <header><span><Music2 size={18} /> {schoolName}</span><h1>SUA AULA<br />COMEÇA AQUI.</h1><p>Escolha uma aula experimental e a nossa equipe confirma os detalhes com você.</p></header>
    <form onSubmit={submit}>
      <section className="xpace-public-booking-steps" aria-label="Escolha da aula">
        <div><strong>1. PARA QUEM É A AULA?</strong><p>Escolha a faixa etária de quem vai experimentar.</p><nav>{loading ? <span>CARREGANDO HORÁRIOS...</span> : ageGroups.filter((ageGroup) => slots.some((slot) => slot.ageGroup === ageGroup.value)).map((ageGroup) => <button key={ageGroup.value} type="button" className={selectedAgeGroup === ageGroup.value ? "is-selected" : ""} onClick={() => chooseAgeGroup(ageGroup.value)}>{ageGroup.label}</button>)}</nav></div>
        {selectedAgeGroup ? <div><strong>2. MODALIDADE</strong><p>Escolha o estilo que quer experimentar.</p><nav>{modalities.length ? modalities.map((modality) => <button key={modality} type="button" className={selectedModality === modality ? "is-selected" : ""} onClick={() => chooseModality(modality)}>{modality}</button>) : <span>NENHUMA MODALIDADE DISPONÍVEL PARA ESTA FAIXA.</span>}</nav></div> : null}
        {selectedModality ? <div><strong>3. NÍVEL</strong><p>Escolha o nível da turma.</p><nav>{levels.map((level) => <button key={level.value} type="button" className={selectedLevel === level.value ? "is-selected" : ""} onClick={() => chooseLevel(level.value)}>{level.label}</button>)}</nav></div> : null}
        {selectedLevel ? <div><strong>4. DIA DA SEMANA</strong><p>Veja somente os dias que têm {selectedModality} para {classLevelLabel(selectedLevel)}.</p><nav>{weekdays.map((day) => <button key={day} type="button" className={selectedWeekday === day ? "is-selected" : ""} onClick={() => chooseWeekday(day)}>{weekdayLabel(day)}</button>)}</nav></div> : null}
        {selectedWeekday !== null ? <div><strong>5. HORÁRIO</strong><p>Escolha uma aula disponível.</p><nav className="xpace-public-booking-times">{timeSlots.map((slot) => <button key={slotKey(slot)} type="button" className={selected === slotKey(slot) ? "is-selected" : ""} onClick={() => setSelected(slotKey(slot))}><b>{slot.startsAt}–{slot.endsAt}</b><small>{formatDate(slot.scheduledOn)} · {slot.className} · {classLevelLabel(slot.level)}{slot.remainingSeats === null ? "" : ` · ${slot.remainingSeats} vaga(s)`}</small></button>)}</nav></div> : null}
      </section>
      {chosen ? <aside><Clock3 size={18} /><div><strong>{chosen.className} · {chosen.modality} · {ageGroupLabel(chosen.ageGroup)} · {classLevelLabel(chosen.level)}</strong><small>{formatDate(chosen.scheduledOn)} · {chosen.startsAt}–{chosen.endsAt} · Prof. {chosen.instructorName}{chosen.roomName ? ` · ${chosen.roomName}` : ""}</small></div></aside> : null}
      <label><UserRound size={16} /> NOME COMPLETO<input value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} autoComplete="name" required /></label>
      <label><Phone size={16} /> TELEFONE / WHATSAPP<input value={form.mobile} onChange={(event) => setForm({ ...form, mobile: event.target.value })} inputMode="tel" autoComplete="tel" required /></label>
      <label><span className="xpace-public-booking-mail">@</span> E-MAIL<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} autoComplete="email" required /></label>
      <label className="xpace-public-booking-honeypot" aria-hidden="true">SITE<input value={form.website} onChange={(event) => setForm({ ...form, website: event.target.value })} tabIndex={-1} autoComplete="off" /></label>
      {notice ? <p className="xpace-public-booking-notice" role="status">{notice}</p> : null}
      <button type="submit" disabled={sending || loading || !chosen}>{sending ? "AGENDANDO..." : "AGENDAR AULA EXPERIMENTAL"}</button>
    </form>
    <footer>VOCÊ PODE REALIZAR ATÉ DUAS AULAS EXPERIMENTAIS. A TERCEIRA POSSUI TAXA.</footer>
  </section></main>;
}

function supportsSelectedLevel(slotLevel: ClassLevel, selectedLevel: ClassLevel | "") { return selectedLevel === "INICIANTE_INTERMEDIARIO" ? slotLevel === "INICIANTE" || slotLevel === "INICIANTE_INTERMEDIARIO" : Boolean(selectedLevel) && slotLevel === selectedLevel; }
function classLevelLabel(level: ClassLevel) { return classLevels.find((item) => item.value === level)?.label ?? "INICIANTE"; }
function ageGroupLabel(ageGroup: AgeGroup) { return ageGroups.find((item) => item.value === ageGroup)?.label ?? "ADULTO (18+)"; }
function slotKey(slot: Slot) { return `${slot.classGroupId}:${slot.classScheduleId}:${slot.scheduledOn}`; }
function weekdayOf(iso: string) { return new Date(`${iso}T12:00:00`).getDay(); }
function weekdayOrder(day: number) { return day === 0 ? 7 : day; }
function weekdayLabel(day: number) { return ["DOMINGO", "SEGUNDA", "TERÇA", "QUARTA", "QUINTA", "SEXTA", "SÁBADO"][day]; }
function formatDate(iso: string) { return new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" }).format(new Date(`${iso}T12:00:00`)); }

"use client";

import { ChevronLeft, ChevronRight, Clock3, MapPin, Music2, Phone, UserRound } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

type ClassLevel = "INICIANTE" | "INICIANTE_INTERMEDIARIO" | "INTERMEDIARIO" | "AVANCADO";
type AgeGroup = "BABY" | "KIDS" | "TEENS" | "ADULTO";
type Slot = { classGroupId: string; classScheduleId: string; scheduledOn: string; startsAt: string; endsAt: string; className: string; modality: string; level: ClassLevel; ageGroup: AgeGroup; ageGroups: AgeGroup[]; instructorName: string; roomName: string; remainingSeats: number | null };
type LeadSource = { id: string; name: string };

const classLevels: Array<{ value: ClassLevel; label: string }> = [{ value: "INICIANTE", label: "INICIANTE" }, { value: "INICIANTE_INTERMEDIARIO", label: "INICIANTE / INTERMEDIÁRIO" }, { value: "INTERMEDIARIO", label: "INTERMEDIÁRIO" }, { value: "AVANCADO", label: "AVANÇADO" }];
const ageGroups: Array<{ value: AgeGroup; label: string }> = [{ value: "BABY", label: "BABY (4 A 6)" }, { value: "KIDS", label: "KIDS (7 A 11)" }, { value: "TEENS", label: "TEENS (12 A 17)" }, { value: "ADULTO", label: "ADULT (18+)" }];

export default function TrialBookingPage() {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [sources, setSources] = useState<LeadSource[]>([]);
  const [schoolName, setSchoolName] = useState("XPACE");
  const [selectedAgeGroup, setSelectedAgeGroup] = useState<AgeGroup | "">("");
  const [selectedModality, setSelectedModality] = useState("");
  const [selectedLevel, setSelectedLevel] = useState<ClassLevel | "">("");
  const [selectedWeekIndex, setSelectedWeekIndex] = useState(0);
  const [selected, setSelected] = useState("");
  const [form, setForm] = useState({ fullName: "", mobile: "", email: "", sourceId: "", website: "" });
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => { void loadSlots(); }, []);
  const ageGroupSlots = useMemo(() => selectedAgeGroup ? slots.filter((slot) => slot.ageGroups.includes(selectedAgeGroup)) : [], [selectedAgeGroup, slots]);
  const modalities = useMemo(() => Array.from(new Set(ageGroupSlots.map((slot) => slot.modality))).sort((left, right) => left.localeCompare(right)), [ageGroupSlots]);
  const modalitySlots = useMemo(() => ageGroupSlots.filter((slot) => slot.modality === selectedModality), [ageGroupSlots, selectedModality]);
  const levels = useMemo(() => classLevels.filter((level) => modalitySlots.some((slot) => slot.level === level.value)), [modalitySlots]);
  const levelSlots = useMemo(() => modalitySlots.filter((slot) => supportsSelectedLevel(slot.level, selectedLevel)), [modalitySlots, selectedLevel]);
  const availableWeekStarts = useMemo(() => Array.from(new Set(levelSlots.map((slot) => weekStart(slot.scheduledOn)))).sort(), [levelSlots]);
  const selectedWeekStart = availableWeekStarts[Math.min(selectedWeekIndex, Math.max(availableWeekStarts.length - 1, 0))] ?? "";
  const calendarDays = useMemo(() => selectedWeekStart ? Array.from({ length: 7 }, (_, index) => {
    const date = addDays(selectedWeekStart, index);
    return { date, slots: levelSlots.filter((slot) => slot.scheduledOn === date) };
  }) : [], [levelSlots, selectedWeekStart]);
  const chosen = useMemo(() => slots.find((slot) => slotKey(slot) === selected), [selected, slots]);

  async function loadSlots() {
    setLoading(true);
    try {
      const response = await fetch("/api/public/xpace/aula-experimental", { cache: "no-store" });
      const payload = await response.json() as { success?: boolean; message?: string; schoolName?: string; slots?: Slot[]; sources?: LeadSource[] };
      if (!response.ok || !payload.success) throw new Error(payload.message || "NÃO FOI POSSÍVEL CARREGAR OS HORÁRIOS.");
      setSlots(payload.slots ?? []); setSources(payload.sources ?? []); setSchoolName(payload.schoolName || "XPACE");
    } catch (error) { setNotice(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL CARREGAR OS HORÁRIOS."); }
    finally { setLoading(false); }
  }

  function chooseAgeGroup(ageGroup: AgeGroup) { setSelectedAgeGroup(ageGroup); setSelectedModality(""); setSelectedLevel(""); setSelectedWeekIndex(0); setSelected(""); }
  function chooseModality(modality: string) { setSelectedModality(modality); setSelectedLevel(""); setSelectedWeekIndex(0); setSelected(""); }
  function chooseLevel(level: ClassLevel) { setSelectedLevel(level); setSelectedWeekIndex(0); setSelected(""); }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!chosen) { setNotice("ESCOLHA UMA AULA EXPERIMENTAL DISPONÍVEL."); return; }
    setSending(true); setNotice("");
    try {
      const response = await fetch("/api/public/xpace/aula-experimental", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, classGroupId: chosen.classGroupId, classScheduleId: chosen.classScheduleId, scheduledOn: chosen.scheduledOn }) });
      const payload = await response.json() as { success?: boolean; message?: string };
      if (!response.ok || !payload.success) throw new Error(payload.message || "NÃO FOI POSSÍVEL CONCLUIR O AGENDAMENTO.");
      setNotice(payload.message || "AULA EXPERIMENTAL AGENDADA!"); setSelected(""); setSelectedWeekIndex(0); setSelectedLevel(""); setSelectedModality(""); setSelectedAgeGroup(""); setForm({ fullName: "", mobile: "", email: "", sourceId: "", website: "" }); await loadSlots();
    } catch (error) { setNotice(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL CONCLUIR O AGENDAMENTO."); }
    finally { setSending(false); }
  }

  return <main className="xpace-public-booking"><section className="xpace-public-booking-card">
    <header><span><Music2 size={18} /> {schoolName}</span><h1>SUA AULA<br />COMEÇA AQUI.</h1><p>Escolha uma aula experimental e a nossa equipe confirma os detalhes com você.</p></header>
    <form onSubmit={submit}>
      <section className="xpace-public-booking-steps" aria-label="Escolha da aula">
        <div><strong>1. PARA QUEM É A AULA?</strong><p>Escolha a faixa etária de quem vai experimentar.</p><nav>{loading ? <span>CARREGANDO HORÁRIOS...</span> : ageGroups.filter((ageGroup) => slots.some((slot) => slot.ageGroups.includes(ageGroup.value))).map((ageGroup) => <button key={ageGroup.value} type="button" className={selectedAgeGroup === ageGroup.value ? "is-selected" : ""} onClick={() => chooseAgeGroup(ageGroup.value)}>{ageGroup.label}</button>)}</nav></div>
        {selectedAgeGroup ? <div><strong>2. MODALIDADE</strong><p>Escolha o estilo que quer experimentar.</p><nav>{modalities.length ? modalities.map((modality) => <button key={modality} type="button" className={selectedModality === modality ? "is-selected" : ""} onClick={() => chooseModality(modality)}>{modality}</button>) : <span>NENHUMA MODALIDADE DISPONÍVEL PARA ESTA FAIXA.</span>}</nav></div> : null}
        {selectedModality ? <div><strong>3. NÍVEL</strong><p>Escolha o nível da turma.</p><nav>{levels.map((level) => <button key={level.value} type="button" className={selectedLevel === level.value ? "is-selected" : ""} onClick={() => chooseLevel(level.value)}>{level.label}</button>)}</nav></div> : null}
        {selectedLevel ? <div className="xpace-public-booking-calendar-step"><strong>4. DATA E HORÁRIO</strong><p>Escolha o melhor período da semana. Os botões mostram somente aulas disponíveis.</p><div className="xpace-public-calendar-toolbar"><button type="button" className="xpace-public-calendar-nav" disabled={selectedWeekIndex === 0} onClick={() => { setSelectedWeekIndex((current) => Math.max(0, current - 1)); setSelected(""); }}><ChevronLeft size={15} /> ANTERIOR</button><b>{selectedWeekStart ? weekRangeLabel(selectedWeekStart) : "SEM HORÁRIOS DISPONÍVEIS"}</b><button type="button" className="xpace-public-calendar-nav" disabled={selectedWeekIndex >= availableWeekStarts.length - 1} onClick={() => { setSelectedWeekIndex((current) => Math.min(availableWeekStarts.length - 1, current + 1)); setSelected(""); }}>PRÓXIMA <ChevronRight size={15} /></button></div><div className="xpace-public-calendar-scroll"><section className="xpace-public-calendar" aria-label="Agenda semanal de horários"><span className="xpace-public-calendar-corner" aria-hidden="true" />{calendarDays.map((day) => <header key={day.date}><small>{calendarWeekday(day.date)}</small><strong>{day.date.slice(8, 10)}</strong><em>{monthShortLabel(day.date)}</em></header>)}{timePeriods.map((period) => <div className="xpace-public-calendar-period" key={period.label}><b>{period.label}</b>{calendarDays.map((day) => { const options = day.slots.filter((slot) => period.includes(slot.startsAt)); return <div className="xpace-public-calendar-cell" key={`${period.label}-${day.date}`} aria-label={`${period.label}, ${formatDate(day.date)}`}>{options.length ? options.map((slot) => <button key={slotKey(slot)} type="button" className={selected === slotKey(slot) ? "is-selected" : ""} aria-pressed={selected === slotKey(slot)} onClick={() => setSelected(slotKey(slot))}><strong>{slot.startsAt}</strong><small>{slot.endsAt}{slot.remainingSeats === null ? "" : ` · ${slot.remainingSeats} vagas`}</small></button>) : <span>—</span>}</div>; })}</div>)}</section></div></div> : null}
      </section>
      {chosen ? <aside><Clock3 size={18} /><div><strong>{chosen.className} · {chosen.modality} · {ageGroupsLabel(chosen.ageGroups)} · {classLevelLabel(chosen.level)}</strong><small>{formatDate(chosen.scheduledOn)} · {chosen.startsAt}–{chosen.endsAt} · Prof. {chosen.instructorName}{chosen.roomName ? ` · ${chosen.roomName}` : ""}</small></div></aside> : null}
      <label><UserRound size={16} /> NOME COMPLETO<input value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} autoComplete="name" required /></label>
      <label><Phone size={16} /> TELEFONE / WHATSAPP<input value={form.mobile} onChange={(event) => setForm({ ...form, mobile: formatPhone(event.target.value) })} inputMode="tel" autoComplete="tel-national" placeholder="(47) 99999-9999" required /></label>
      <label><span className="xpace-public-booking-mail">@</span> E-MAIL<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} autoComplete="email" required /></label>
      <label><MapPin size={16} /> COMO CONHECEU A XPACE?<select value={form.sourceId} onChange={(event) => setForm({ ...form, sourceId: event.target.value })} required><option value="">SELECIONE UMA OPÇÃO</option>{sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</select></label>
      <label className="xpace-public-booking-honeypot" aria-hidden="true">SITE<input value={form.website} onChange={(event) => setForm({ ...form, website: event.target.value })} tabIndex={-1} autoComplete="off" /></label>
      {notice ? <p className="xpace-public-booking-notice" role="status">{notice}</p> : null}
      <button type="submit" disabled={sending || loading || !chosen}>{sending ? "AGENDANDO..." : "AGENDAR AULA EXPERIMENTAL"}</button>
    </form>
    <footer>VOCÊ PODE REALIZAR ATÉ DUAS AULAS EXPERIMENTAIS. A TERCEIRA POSSUI TAXA.</footer>
  </section></main>;
}

function supportsSelectedLevel(slotLevel: ClassLevel, selectedLevel: ClassLevel | "") { return selectedLevel === "INICIANTE_INTERMEDIARIO" ? slotLevel === "INICIANTE" || slotLevel === "INICIANTE_INTERMEDIARIO" : Boolean(selectedLevel) && slotLevel === selectedLevel; }
function classLevelLabel(level: ClassLevel) { return classLevels.find((item) => item.value === level)?.label ?? "INICIANTE"; }
function ageGroupLabel(ageGroup: AgeGroup) { return ageGroups.find((item) => item.value === ageGroup)?.label ?? "ADULT (18+)"; }
function ageGroupsLabel(values: AgeGroup[]) { return values.map(ageGroupLabel).join(" · "); }
function formatPhone(value: string) { const digits = value.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "").slice(0, 11); if (digits.length < 3) return digits ? `(${digits}` : ""; if (digits.length < 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`; if (digits.length < 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`; return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`; }
function slotKey(slot: Slot) { return `${slot.classGroupId}:${slot.classScheduleId}:${slot.scheduledOn}`; }
const timePeriods = [{ label: "MANHÃ", includes: (time: string) => time < "12:00" }, { label: "TARDE", includes: (time: string) => time >= "12:00" && time < "18:00" }, { label: "NOITE", includes: (time: string) => time >= "18:00" }];
function addDays(iso: string, days: number) { const value = new Date(`${iso}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }
function weekStart(iso: string) { const value = new Date(`${iso}T12:00:00Z`); const offset = (value.getUTCDay() + 6) % 7; return addDays(iso, -offset); }
function calendarWeekday(iso: string) { return ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"][new Date(`${iso}T12:00:00Z`).getUTCDay()]; }
function monthShortLabel(iso: string) { return new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(new Date(`${iso}T12:00:00`)).replace(".", "").toUpperCase(); }
function weekRangeLabel(iso: string) { const endsOn = addDays(iso, 6); return `${weekDateLabel(iso)} — ${weekDateLabel(endsOn)}`.toUpperCase(); }
function weekDateLabel(iso: string) { return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(`${iso}T12:00:00`)).replace(".", ""); }
function formatDate(iso: string) { return new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" }).format(new Date(`${iso}T12:00:00`)); }

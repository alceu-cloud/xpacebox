"use client";

import { CalendarCheck2, Clock3, Music2, Phone, UserRound } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

type Slot = { classGroupId: string; classScheduleId: string; scheduledOn: string; startsAt: string; endsAt: string; className: string; modality: string; instructorName: string; roomName: string; remainingSeats: number | null };

export default function TrialBookingPage() {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [schoolName, setSchoolName] = useState("XPACE");
  const [selected, setSelected] = useState("");
  const [form, setForm] = useState({ fullName: "", mobile: "", email: "", website: "" });
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => { void loadSlots(); }, []);
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

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!chosen) { setNotice("ESCOLHA UMA AULA EXPERIMENTAL DISPONÍVEL."); return; }
    setSending(true); setNotice("");
    try {
      const response = await fetch("/api/public/xpace/aula-experimental", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, classGroupId: chosen.classGroupId, classScheduleId: chosen.classScheduleId, scheduledOn: chosen.scheduledOn }) });
      const payload = await response.json() as { success?: boolean; message?: string };
      if (!response.ok || !payload.success) throw new Error(payload.message || "NÃO FOI POSSÍVEL CONCLUIR O AGENDAMENTO.");
      setNotice(payload.message || "AULA EXPERIMENTAL AGENDADA!"); setSelected(""); setForm({ fullName: "", mobile: "", email: "", website: "" }); await loadSlots();
    } catch (error) { setNotice(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL CONCLUIR O AGENDAMENTO."); }
    finally { setSending(false); }
  }

  return <main className="xpace-public-booking">
    <section className="xpace-public-booking-card">
      <header><span><Music2 size={18} /> {schoolName}</span><h1>SUA AULA<br />COMEÇA AQUI.</h1><p>Escolha uma aula experimental e a nossa equipe confirma os detalhes com você.</p></header>
      <form onSubmit={submit}>
        <label><UserRound size={16} /> NOME COMPLETO<input value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} autoComplete="name" required /></label>
        <label><Phone size={16} /> TELEFONE / WHATSAPP<input value={form.mobile} onChange={(event) => setForm({ ...form, mobile: event.target.value })} inputMode="tel" autoComplete="tel" required /></label>
        <label><span className="xpace-public-booking-mail">@</span> E-MAIL<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} autoComplete="email" required /></label>
        <label className="xpace-public-booking-honeypot" aria-hidden="true">SITE<input value={form.website} onChange={(event) => setForm({ ...form, website: event.target.value })} tabIndex={-1} autoComplete="off" /></label>
        <label className="xpace-public-booking-slot"><CalendarCheck2 size={16} /> AULA, DIA E HORÁRIO<select value={selected} onChange={(event) => setSelected(event.target.value)} disabled={loading || !slots.length} required><option value="">{loading ? "CARREGANDO HORÁRIOS..." : slots.length ? "SELECIONE UMA OPÇÃO" : "NENHUM HORÁRIO DISPONÍVEL"}</option>{slots.map((slot) => <option key={slotKey(slot)} value={slotKey(slot)}>{formatSlot(slot)}</option>)}</select></label>
        {chosen ? <aside><Clock3 size={18} /><div><strong>{chosen.className} · {chosen.modality}</strong><small>{formatDate(chosen.scheduledOn)} · {chosen.startsAt}–{chosen.endsAt} · Prof. {chosen.instructorName}{chosen.roomName ? ` · ${chosen.roomName}` : ""}</small></div></aside> : null}
        {notice ? <p className="xpace-public-booking-notice" role="status">{notice}</p> : null}
        <button type="submit" disabled={sending || loading || !slots.length}>{sending ? "AGENDANDO..." : "AGENDAR AULA EXPERIMENTAL"}</button>
      </form>
      <footer>VOCÊ PODE REALIZAR ATÉ DUAS AULAS EXPERIMENTAIS. A TERCEIRA POSSUI TAXA.</footer>
    </section>
  </main>;
}

function slotKey(slot: Slot) { return `${slot.classGroupId}:${slot.classScheduleId}:${slot.scheduledOn}`; }
function formatDate(iso: string) { return new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" }).format(new Date(`${iso}T12:00:00`)); }
function formatSlot(slot: Slot) { return `${formatDate(slot.scheduledOn)} · ${slot.startsAt} · ${slot.className} (${slot.modality})`; }

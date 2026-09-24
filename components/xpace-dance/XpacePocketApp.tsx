"use client";

import type { Session } from "@supabase/supabase-js";
import { Bell, Check, ChevronLeft, ChevronRight, LogOut, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type TouchEvent } from "react";

import { supabase } from "@/lib/supabase";

type Attendance = "AGENDADO" | "COMPARECEU" | "FALTOU" | "CANCELADO" | "NAO_INFORMADO";
type Student = { id: string; studentName: string; startsOn: string; endsOn: string | null };
type Schedule = { id: string; weekday: number; startsAt: string; endsAt: string; roomName: string; instructorName: string; color: string; capacity: number | null };
type Group = { id: string; name: string; schedules: Schedule[]; students: Student[] };
type Trial = { id: string; leadName: string; classScheduleId: string; scheduledOn: string; attendanceStatus: Attendance };
type AgendaResponse = { success: true; groups: Group[]; trialAppointments: Trial[] };
type OverviewResponse = { success: true; profileName: string; metrics: { trialsThisWeek: number; activeClients: number; newClientsThisMonth: number; newLeadsThisMonth: number }; notifications: Array<{ id: string; title: string; detail: string; createdAt: string }> };
type ClassEvent = { group: Group; schedule: Schedule };
type Tab = "DASHBOARD" | "AGENDA";

const dayNames = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

function todayInSaoPaulo() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function dateFromIso(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function iso(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function shiftDate(value: string, amount: number) {
  const date = dateFromIso(value);
  date.setDate(date.getDate() + amount);
  return iso(date);
}

function weekDays(value: string) {
  const offset = (dateFromIso(value).getDay() + 6) % 7;
  const monday = shiftDate(value, -offset);
  return Array.from({ length: 7 }, (_, index) => shiftDate(monday, index));
}

function formatDate(value: string) {
  return dateFromIso(value).toLocaleDateString("pt-BR", { day: "numeric", month: "long" });
}

function relativeTime(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  if (minutes < 1440) return `há ${Math.floor(minutes / 60)} h`;
  return `há ${Math.floor(minutes / 1440)} d`;
}

function firstName(value: string) {
  return value.trim().split(/\s+/)[0] || "equipe";
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) throw new Error("Sua sessão expirou. Entre novamente.");
  const response = await fetch(path, {
    ...init,
    cache: "no-store",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}`, ...init?.headers },
  });
  const payload = await response.json().catch(() => ({})) as T & { success?: boolean; message?: string };
  if (!response.ok || !payload.success) throw new Error(payload.message || "Não foi possível carregar os dados.");
  return payload;
}

export default function XpacePocketApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [accessError, setAccessError] = useState("");

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (mounted) { setSession(data.session); setBooting(false); }
    }).catch(() => { if (mounted) setBooting(false); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) setAllowed(false);
    });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!session) return;
    let mounted = true;
    void api<{ success: true }>("/api/empresas/xpace")
      .then(() => { if (mounted) { setAllowed(true); setAccessError(""); } })
      .catch((error: unknown) => { if (mounted) { setAllowed(false); setAccessError(error instanceof Error ? error.message : "Sem acesso à XPACE."); } });
    return () => { mounted = false; };
  }, [session?.user.id]);

  if (booting) return <main className="xp-pocket xp-centered" aria-busy="true">Abrindo XPACE...</main>;
  if (!session) return <Login />;
  if (!allowed) return <main className="xp-pocket xp-centered"><div className="xp-status-card"><h1>Validando acesso</h1><p>{accessError || "Conferindo sua conta da XPACE..."}</p>{accessError ? <button type="button" onClick={() => void supabase.auth.signOut()}>Voltar ao login</button> : <span className="xp-spinner" aria-label="Carregando" />}</div></main>;
  return <Home key={session.user.id} userId={session.user.id} />;
}

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    const { error: cause } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (cause) setError("Não foi possível entrar. Confira e-mail e senha.");
    setBusy(false);
  }

  return <main className="xp-pocket xp-login"><div className="xp-login-inner"><div className="xp-login-mark" aria-hidden="true">X</div><p className="xp-login-brand">XPACE</p><p className="xp-login-tagline">Sua escola, no seu ritmo.</p><form className="xp-login-card" onSubmit={(event) => void submit(event)}><h1>Bem-vindo de volta</h1><p>Acesse com sua conta da XPACEBOX.</p><label htmlFor="xp-email">E-mail</label><input id="xp-email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /><label htmlFor="xp-password">Senha</label><input id="xp-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />{error ? <p className="xp-error" role="alert">{error}</p> : null}<button type="submit" disabled={busy}>{busy ? "Entrando..." : "Entrar"}</button></form></div></main>;
}

function Home({ userId }: { userId: string }) {
  const [tab, setTab] = useState<Tab>("DASHBOARD");
  const [selectedDay, setSelectedDay] = useState(todayInSaoPaulo);
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [agenda, setAgenda] = useState<AgendaResponse | null>(null);
  const [selectedClass, setSelectedClass] = useState<ClassEvent | null>(null);
  const [showWeekTrials, setShowWeekTrials] = useState(false);
  const [selectedWeekTrial, setSelectedWeekTrial] = useState<Trial | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [lastSeenAt, setLastSeenAt] = useState("");
  const [busyId, setBusyId] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [error, setError] = useState("");
  const touchStart = useRef<{ x: number; y: number; atTop: boolean } | null>(null);
  const pullDistanceRef = useRef(0);
  const week = useMemo(() => weekDays(selectedDay), [selectedDay]);
  const from = week[0];
  const to = week[6];
  const seenKey = `xpace_pocket_notifications_seen_${userId}`;

  const load = useCallback(async () => {
    setRefreshing(true); setError("");
    try {
      const [agendaData, overviewData] = await Promise.all([
        api<AgendaResponse>(`/api/xpace/agenda?from=${from}&to=${to}`),
        api<OverviewResponse>("/api/xpace/mobile/overview"),
      ]);
      setAgenda(agendaData); setOverview(overviewData);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar os dados.");
    } finally { setRefreshing(false); }
  }, [from, to]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setLastSeenAt(window.localStorage.getItem(seenKey) || ""); }, [seenKey]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const day = params.get("date");
    if (day && /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(Date.parse(`${day}T12:00:00`))) setSelectedDay(day);
    if (params.get("tab") === "agenda") setTab("AGENDA");
  }, []);

  const events = useMemo(() => {
    const weekday = dateFromIso(selectedDay).getDay();
    return (agenda?.groups ?? []).flatMap((group) => group.schedules.filter((schedule) => schedule.weekday === weekday).map((schedule) => ({ group, schedule }))).sort((a, b) => a.schedule.startsAt.localeCompare(b.schedule.startsAt));
  }, [agenda, selectedDay]);
  const unseen = overview?.notifications.filter((item) => !lastSeenAt || item.createdAt > lastSeenAt).length ?? 0;

  function openNotifications() {
    setShowNotifications(true);
    const latest = overview?.notifications[0]?.createdAt;
    if (latest) { setLastSeenAt(latest); window.localStorage.setItem(seenKey, latest); }
  }

  function switchTab(next: Tab) {
    setTab(next); setSelectedClass(null); setShowNotifications(false); setShowWeekTrials(false); setSelectedWeekTrial(null);
  }

  function onTouchStart(event: TouchEvent<HTMLElement>) {
    touchStart.current = { x: event.touches[0].clientX, y: event.touches[0].clientY, atTop: window.scrollY <= 0 };
  }

  function onTouchMove(event: TouchEvent<HTMLElement>) {
    const start = touchStart.current;
    if (!start || !start.atTop || refreshing) return;
    const dx = event.touches[0].clientX - start.x;
    const dy = event.touches[0].clientY - start.y;
    if (dy > 0 && dy > Math.abs(dx) * 1.4) {
      const nextDistance = Math.min(76, Math.round(dy * 0.42));
      pullDistanceRef.current = nextDistance;
      setPullDistance(nextDistance);
    }
  }

  function onTouchEnd(event: TouchEvent<HTMLElement>) {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const dx = event.changedTouches[0].clientX - start.x;
    const dy = event.changedTouches[0].clientY - start.y;
    const shouldRefresh = start.atTop && dy > 0 && dy > Math.abs(dx) * 1.4 && pullDistanceRef.current >= 62;
    pullDistanceRef.current = 0;
    setPullDistance(0);
    if (shouldRefresh) { void load(); return; }
    if (Math.abs(dx) > 90 && Math.abs(dx) > Math.abs(dy) * 1.5) switchTab(dx < 0 ? "AGENDA" : "DASHBOARD");
  }

  async function markTrial(trial: Trial, status: "COMPARECEU" | "FALTOU") {
    setBusyId(trial.id); setError("");
    try {
      await api<{ success: true }>("/api/xpace/agenda", { method: "POST", body: JSON.stringify({ action: "UPDATE_TRIAL_ATTENDANCE", trialAttendance: { appointmentId: trial.id, classScheduleId: trial.classScheduleId, scheduledOn: trial.scheduledOn, attendanceStatus: status } }) });
      setAgenda((previous) => previous ? { ...previous, trialAppointments: previous.trialAppointments.map((item) => item.id === trial.id ? { ...item, attendanceStatus: status } : item) } : previous);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível registrar a presença.");
    } finally { setBusyId(""); }
  }

  async function signOut() {
    // A shared device must stop receiving company alerts after logout.
    if ("serviceWorker" in navigator) {
      try {
        const registration = await navigator.serviceWorker.getRegistration("/xpace/app");
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) {
          await api<{ success: true }>("/api/xpace/mobile/push", { method: "DELETE", body: JSON.stringify({ endpoint: subscription.endpoint }) }).catch(() => undefined);
          await subscription.unsubscribe();
        }
      } catch (cause) { console.error("XPACE PUSH LOGOUT CLEANUP FAILED", cause); }
    }
    await supabase.auth.signOut();
  }

  const showingPullFeedback = refreshing || pullDistance > 0;
  const pullLabel = refreshing ? "Atualizando..." : pullDistance >= 62 ? "Solte para atualizar" : "Puxe para atualizar";
  return <main className="xp-pocket xp-home"><div className="xp-shell"><header className="xp-top"><div className="xp-top-row"><div className="xp-avatar" aria-hidden="true">{(overview?.profileName || "X").trim().slice(0, 1).toUpperCase()}</div><div className="xp-greeting"><span>BEM-VINDO À XPACE</span><strong>Olá, {firstName(overview?.profileName || "equipe")}!</strong></div><button type="button" className="xp-bell" aria-label={`Notificações${unseen ? `, ${unseen} novas` : ""}`} onClick={openNotifications}><Bell size={23} />{unseen > 0 ? <b>{unseen}</b> : null}</button></div><div className="xp-hero"><span>SEU UNIVERSO XPACE</span><strong>Tudo no seu ritmo.<br />Tudo em um só lugar.</strong><p>Acompanhe sua escola e cuide de cada aula.</p></div></header><div className="xp-content"><nav className="xp-tabs" aria-label="Seções do aplicativo"><button type="button" className={tab === "DASHBOARD" ? "is-active" : ""} aria-current={tab === "DASHBOARD" ? "page" : undefined} onClick={() => switchTab("DASHBOARD")}>Dashboard</button><button type="button" className={tab === "AGENDA" ? "is-active" : ""} aria-current={tab === "AGENDA" ? "page" : undefined} onClick={() => switchTab("AGENDA")}>Agenda</button></nav>{error ? <div className="xp-error-banner" role="alert"><span>{error}</span><button type="button" onClick={() => void load()}>Tentar novamente</button></div> : null}<div className={`xp-pull-feedback${showingPullFeedback ? " is-visible" : ""}`} style={{ height: showingPullFeedback ? `${refreshing ? 42 : Math.min(42, pullDistance)}px` : 0 }} aria-live="polite"><RefreshCw size={16} className={refreshing ? "is-spinning" : ""} /><span>{pullLabel}</span></div><div className="xp-main" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>{showNotifications ? <Notifications items={overview?.notifications ?? []} onClose={() => setShowNotifications(false)} /> : tab === "DASHBOARD" ? showWeekTrials ? selectedWeekTrial ? <WeekTrialDetail trial={selectedWeekTrial} agenda={agenda} busyId={busyId} onBack={() => setSelectedWeekTrial(null)} onMark={markTrial} /> : <WeekTrials agenda={agenda} onBack={() => { setShowWeekTrials(false); setSelectedWeekTrial(null); }} onSelect={setSelectedWeekTrial} /> : <Dashboard metrics={overview?.metrics} onShowTrials={() => { setSelectedWeekTrial(null); setShowWeekTrials(true); }} /> : selectedClass ? <ClassDetail event={selectedClass} day={selectedDay} agenda={agenda} busyId={busyId} onBack={() => setSelectedClass(null)} onMark={markTrial} /> : <Agenda selectedDay={selectedDay} week={week} events={events} agenda={agenda} onSelectDay={(day) => { setSelectedDay(day); setSelectedClass(null); }} onSelectClass={setSelectedClass} />}</div><footer className="xp-bottom"><button type="button" onClick={() => void signOut()}><LogOut size={16} /> Sair</button></footer></div></div></main>;
}

function Dashboard({ metrics, onShowTrials }: { metrics?: OverviewResponse["metrics"]; onShowTrials: () => void }) {
  return <section><p className="xp-eyebrow">VISÃO GERAL</p><h1>Sua escola hoje</h1><p className="xp-subtitle">Indicadores atualizados com os registros do XPACE.</p><div className="xp-metrics"><Metric label="AULAS DA SEMANA" value={metrics?.trialsThisWeek} color="purple" detail="Toque para ver os leads" wide onClick={onShowTrials} /><Metric label="CLIENTES ATIVOS" value={metrics?.activeClients} color="green" /><Metric label="NOVOS CLIENTES" value={metrics?.newClientsThisMonth} color="pink" detail="Matrículas do mês" /><Metric label="NOVOS LEADS" value={metrics?.newLeadsThisMonth} color="orange" detail="Agendaram no mês" /><Metric label="A RECEBER HOJE" value="—" color="green" detail="Não integrado" /><Metric label="A PAGAR HOJE" value="—" color="red" detail="Não integrado" /><Metric label="VENDAS" value="—" color="purple" detail="Não integrado" wide /><Metric label="RECEITA" value="—" color="teal" detail="Não integrado" wide /></div><p className="xp-note">Os cartões financeiros serão ativados quando houver uma fonte consolidada no XPACE.</p></section>;
}

function WeekTrials({ agenda, onBack, onSelect }: { agenda: AgendaResponse | null; onBack: () => void; onSelect: (trial: Trial) => void }) {
  const trials = useMemo(() => (agenda?.trialAppointments ?? []).filter((trial) => trial.attendanceStatus !== "CANCELADO").map((trial) => {
    const match = agenda?.groups.flatMap((group) => group.schedules.map((schedule) => ({ group, schedule }))).find((item) => item.schedule.id === trial.classScheduleId);
    return { trial, groupName: match?.group.name || "AULA NÃO ENCONTRADA", roomName: match?.schedule.roomName || "Sala a definir", instructorName: match?.schedule.instructorName || "Professor a definir", startsAt: match?.schedule.startsAt || "" };
  }).sort((left, right) => left.trial.scheduledOn.localeCompare(right.trial.scheduledOn) || left.startsAt.localeCompare(right.startsAt)), [agenda]);

  return <section><button type="button" className="xp-back" onClick={onBack}><ChevronLeft size={16} /> Voltar</button><p className="xp-eyebrow">AGENDA</p><h1>Aulas da semana</h1><p className="xp-subtitle">Leads com aula experimental agendada nesta semana.</p><section className="xp-week-trials-screen" aria-label="Leads com aula experimental nesta semana"><div><strong>LEADS AGENDADOS</strong><span>{trials.length} agendamento{trials.length === 1 ? "" : "s"}</span></div>{trials.length ? trials.map(({ trial, groupName, roomName, instructorName, startsAt }) => <button type="button" key={trial.id} className="xp-week-trial-button" onClick={() => onSelect(trial)}><span><strong>{trial.leadName}</strong><small>Aula: {groupName} · {formatDate(trial.scheduledOn)}{startsAt ? ` · ${startsAt}` : ""}</small><small>Professor: {instructorName}</small><small>Sala: {roomName}</small></span><ChevronRight size={20} aria-hidden="true" /></button>) : <p className="xp-empty">Nenhum lead agendado nesta semana.</p>}</section></section>;
}

function WeekTrialDetail({ trial, agenda, busyId, onBack, onMark }: { trial: Trial; agenda: AgendaResponse | null; busyId: string; onBack: () => void; onMark: (trial: Trial, status: "COMPARECEU" | "FALTOU") => Promise<void> }) {
  const current = agenda?.trialAppointments.find((item) => item.id === trial.id) ?? trial;
  const match = agenda?.groups.flatMap((group) => group.schedules.map((schedule) => ({ group, schedule }))).find((item) => item.schedule.id === current.classScheduleId);
  const status = current.attendanceStatus === "COMPARECEU" ? "COMPARECEU" : current.attendanceStatus === "FALTOU" ? "FALTOU" : "AGENDADO";
  return <section><button type="button" className="xp-back" onClick={onBack}><ChevronLeft size={16} /> Voltar para os leads</button><div className="xp-detail-hero" style={{ borderTopColor: match?.schedule.color || "#7435d9" }}><span>{formatDate(current.scheduledOn)}{match?.schedule.startsAt ? ` · ${match.schedule.startsAt}` : ""}</span><h1>{current.leadName}</h1><p>{match?.group.name || "Aula a definir"}</p><strong>{match?.schedule.roomName || "Sala a definir"} · {match?.schedule.instructorName || "Professor a definir"}</strong></div><h2 className="xp-roster-title">CHAMADA DO LEAD</h2><article className="xp-person"><span className="xp-person-avatar">{current.leadName.slice(0, 1)}</span><div><strong>{current.leadName}</strong><small className="xp-lead-tag">LEAD · {status}</small><div className="xp-attendance"><button type="button" className={current.attendanceStatus === "FALTOU" ? "is-absent" : ""} disabled={Boolean(busyId)} aria-label={`Marcar ${current.leadName} como faltou`} onClick={() => void onMark(current, "FALTOU")}><X size={15} /> Faltou</button><button type="button" className={current.attendanceStatus === "COMPARECEU" ? "is-present" : ""} disabled={Boolean(busyId)} aria-label={`Marcar ${current.leadName} como compareceu`} onClick={() => void onMark(current, "COMPARECEU")}><Check size={15} /> Compareceu</button></div></div></article><p className="xp-note">A chamada atualiza o CRM deste lead. Matrícula continua sendo uma decisão posterior no CRM.</p></section>;
}

function Metric({ label, value, color, detail, wide = false, onClick, expanded = false }: { label: string; value: number | string | undefined; color: string; detail?: string; wide?: boolean; onClick?: () => void; expanded?: boolean }) {
  const className = `xp-metric xp-${color}${wide ? " xp-wide" : ""}${onClick ? " xp-metric-button" : ""}`;
  const content = <><span>{label}</span><strong>{value ?? "—"}</strong>{detail ? <small>{detail}</small> : null}</>;
  return onClick ? <button type="button" className={className} onClick={onClick} aria-expanded={expanded} aria-label={`${label}: ${value ?? "sem dados"}. ${expanded ? "Ocultar" : "Ver"} leads`}>{content}</button> : <article className={className}>{content}</article>;
}

function Notifications({ items, onClose }: { items: OverviewResponse["notifications"]; onClose: () => void }) {
  return <section><div className="xp-heading-row"><div><p className="xp-eyebrow">ATUALIZAÇÕES</p><h1>Notificações</h1></div><button type="button" className="xp-text-button" onClick={onClose}>Fechar</button></div><p className="xp-subtitle">Agendamentos recentes registrados no XPACE.</p><PushSettings />{items.length ? items.map((item) => <article className="xp-notification" key={item.id}><span className="xp-notification-dot" /><div><strong>{item.title}</strong><p>{item.detail}</p><time dateTime={item.createdAt}>{relativeTime(item.createdAt)}</time></div></article>) : <p className="xp-empty">Nenhum agendamento recente.</p>}</section>;
}

function base64Key(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

function PushSettings() {
  const [publicKey, setPublicKey] = useState("");
  const [status, setStatus] = useState("Verificando notificações neste aparelho...");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function check() {
      const config = await api<{ success: true; enabled: boolean; publicKey?: string }>("/api/xpace/mobile/push");
      if (!mounted) return;
      if (!config.enabled || !config.publicKey) { setStatus("Notificações no aparelho ainda não estão disponíveis."); return; }
      setPublicKey(config.publicKey);
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) { setStatus("Este navegador não oferece notificações push."); return; }
      const installed = window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
      if (!installed) { setStatus("No iPhone, abra o app pela Tela de Início para ativar avisos."); return; }
      if (Notification.permission === "denied") { setStatus("Notificações bloqueadas. Libere o XPACE nos Ajustes do iPhone."); return; }
      const registration = await navigator.serviceWorker.getRegistration("/xpace/app");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await api<{ success: true }>("/api/xpace/mobile/push", { method: "POST", body: JSON.stringify(subscription.toJSON()) });
        if (mounted) { setSubscribed(true); setStatus("Avisos ativados neste iPhone."); }
      } else if (mounted) setStatus("Ative avisos para receber novos agendamentos mesmo com o app fechado.");
    }
    void check().catch(() => { if (mounted) setStatus("Não foi possível verificar os avisos agora."); });
    return () => { mounted = false; };
  }, []);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    try {
      if (subscribed) {
        const registration = await navigator.serviceWorker.getRegistration("/xpace/app");
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) {
          await api<{ success: true }>("/api/xpace/mobile/push", { method: "DELETE", body: JSON.stringify({ endpoint: subscription.endpoint }) });
          await subscription.unsubscribe();
        }
        setSubscribed(false); setStatus("Avisos desativados neste iPhone.");
      } else {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") { setStatus("Permissão não concedida. Você pode liberar nos Ajustes do iPhone."); return; }
        const registration = await navigator.serviceWorker.register("/xpace-push-sw.js", { scope: "/xpace/app" });
        const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64Key(publicKey) });
        try {
          await api<{ success: true }>("/api/xpace/mobile/push", { method: "POST", body: JSON.stringify(subscription.toJSON()) });
        } catch (cause) { await subscription.unsubscribe(); throw cause; }
        setSubscribed(true); setStatus("Avisos ativados neste iPhone.");
      }
    } catch (cause) { setStatus(cause instanceof Error ? cause.message : "Não foi possível alterar as notificações."); }
    finally { setBusy(false); }
  }

  return <div className="xp-push-settings"><strong>Avisos no iPhone</strong><p>{status}</p>{publicKey && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && (window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone)) && Notification.permission !== "denied" ? <button type="button" onClick={() => void toggle()} disabled={busy}>{busy ? "Aguarde..." : subscribed ? "Desativar avisos" : "Ativar avisos"}</button> : null}</div>;
}

function Agenda({ selectedDay, week, events, agenda, onSelectDay, onSelectClass }: { selectedDay: string; week: string[]; events: ClassEvent[]; agenda: AgendaResponse | null; onSelectDay: (day: string) => void; onSelectClass: (event: ClassEvent) => void }) {
  return <section><div className="xp-heading-row"><div><p className="xp-eyebrow">CHAMADA DIÁRIA</p><h1>Agenda de aulas</h1></div><span className="xp-month">{dateFromIso(selectedDay).toLocaleDateString("pt-BR", { month: "short", year: "numeric" })}</span></div><div className="xp-week"><button type="button" aria-label="Semana anterior" onClick={() => onSelectDay(shiftDate(selectedDay, -7))}><ChevronLeft size={21} /></button>{week.map((day) => { const active = day === selectedDay; return <button type="button" key={day} className={active ? "is-active" : ""} aria-current={active ? "date" : undefined} aria-label={dateFromIso(day).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })} onClick={() => onSelectDay(day)}><small>{dayNames[dateFromIso(day).getDay()]}</small><b>{dateFromIso(day).getDate()}</b></button>; })}<button type="button" aria-label="Próxima semana" onClick={() => onSelectDay(shiftDate(selectedDay, 7))}><ChevronRight size={21} /></button></div><div className="xp-day-heading"><strong>{formatDate(selectedDay)}</strong><span>{events.length} aula{events.length === 1 ? "" : "s"}</span></div>{events.length ? events.map((event) => { const students = studentsFor(event, selectedDay); const leads = trialsFor(agenda, event, selectedDay); return <button type="button" className="xp-class-card" style={{ borderLeftColor: event.schedule.color || "#7435d9" }} key={event.schedule.id} onClick={() => onSelectClass(event)}><span className="xp-class-title"><strong>{event.group.name}</strong><ChevronRight size={22} /></span><span>{event.schedule.startsAt}–{event.schedule.endsAt} · {event.schedule.roomName || "Sala a definir"}</span><span>{event.schedule.instructorName || "Professor a definir"}</span><span className="xp-class-footer"><b>{students.length} aluno{students.length === 1 ? "" : "s"} · {leads.length} lead{leads.length === 1 ? "" : "s"}</b><em>Abrir chamada</em></span></button>; }) : <p className="xp-empty">Nenhuma aula cadastrada para este dia.</p>}</section>;
}

function studentsFor(event: ClassEvent, day: string) {
  return event.group.students.filter((student) => student.startsOn <= day && (!student.endsOn || student.endsOn >= day));
}

function trialsFor(agenda: AgendaResponse | null, event: ClassEvent, day: string) {
  return agenda?.trialAppointments.filter((trial) => trial.classScheduleId === event.schedule.id && trial.scheduledOn === day && trial.attendanceStatus !== "CANCELADO") ?? [];
}

function ClassDetail({ event, day, agenda, busyId, onBack, onMark }: { event: ClassEvent; day: string; agenda: AgendaResponse | null; busyId: string; onBack: () => void; onMark: (trial: Trial, status: "COMPARECEU" | "FALTOU") => Promise<void> }) {
  const students = studentsFor(event, day);
  const trials = trialsFor(agenda, event, day);
  return <section><button type="button" className="xp-back" onClick={onBack}><ChevronLeft size={16} /> Voltar para as aulas</button><div className="xp-detail-hero" style={{ borderTopColor: event.schedule.color || "#7435d9" }}><span>{formatDate(day)} · {event.schedule.startsAt}–{event.schedule.endsAt}</span><h1>{event.group.name}</h1><p>{event.schedule.roomName || "Sala a definir"} · {event.schedule.instructorName || "Professor a definir"}</p><strong>{students.length + trials.length}{event.schedule.capacity ? ` / ${event.schedule.capacity}` : ""} participantes</strong></div><h2 className="xp-roster-title">CHAMADA DA AULA</h2>{students.map((student) => <article className="xp-person" key={student.id}><span className="xp-person-avatar xp-student-avatar">{student.studentName.slice(0, 1)}</span><div><strong>{student.studentName}</strong><small className="xp-student-tag">ALUNO</small></div></article>)}{trials.map((trial) => <article className="xp-person" key={trial.id}><span className="xp-person-avatar">{trial.leadName.slice(0, 1)}</span><div><strong>{trial.leadName}</strong><small className="xp-lead-tag">LEAD · {trial.attendanceStatus === "COMPARECEU" ? "COMPARECEU" : trial.attendanceStatus === "FALTOU" ? "FALTOU" : "AGENDADO"}</small><div className="xp-attendance"><button type="button" className={trial.attendanceStatus === "FALTOU" ? "is-absent" : ""} disabled={Boolean(busyId)} aria-label={`Marcar ${trial.leadName} como faltou`} onClick={() => void onMark(trial, "FALTOU")}><X size={15} /> Faltou</button><button type="button" className={trial.attendanceStatus === "COMPARECEU" ? "is-present" : ""} disabled={Boolean(busyId)} aria-label={`Marcar ${trial.leadName} como compareceu`} onClick={() => void onMark(trial, "COMPARECEU")}><Check size={15} /> Compareceu</button></div></div></article>)}{!students.length && !trials.length ? <p className="xp-empty">Nenhum aluno ou lead nesta aula.</p> : null}<p className="xp-note">A chamada dos leads atualiza o CRM. Matrícula é uma decisão posterior, feita no CRM.</p></section>;
}

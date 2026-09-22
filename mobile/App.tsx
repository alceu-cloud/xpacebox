import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";

import { api } from "./src/lib/api";
import { supabase } from "./src/lib/supabase";
import type { AgendaResponse, Group, OverviewResponse, Schedule, Trial } from "./src/types";

type Tab = "DASHBOARD" | "AGENDA";
type ClassEvent = { group: Group; schedule: Schedule };

const colors = {
  ink: "#281c36",
  muted: "#746d7d",
  violet: "#6929bb",
  violetDark: "#391164",
  lilac: "#f3eaff",
  pink: "#db55b7",
  canvas: "#fbf9fe",
  line: "#e9e1ef",
  green: "#23845b",
  red: "#d4475a",
};
const days = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
const seenKey = "xpace_mobile_notifications_seen_at";

function localIso(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateFromIso(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function shiftDate(value: string, amount: number) {
  const date = dateFromIso(value);
  date.setDate(date.getDate() + amount);
  return localIso(date);
}

function weekDays(value: string) {
  const selected = dateFromIso(value);
  const mondayOffset = (selected.getDay() + 6) % 7;
  const monday = shiftDate(value, -mondayOffset);
  return Array.from({ length: 7 }, (_, index) => shiftDate(monday, index));
}

function relativeTime(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  if (minutes < 1_440) return `há ${Math.floor(minutes / 60)} h`;
  return `há ${Math.floor(minutes / 1_440)} d`;
}

function firstName(value: string) {
  return value.trim().split(/\s+/)[0] || "equipe";
}

function formatDate(value: string) {
  return dateFromIso(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session);
        setBooting(false);
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) setAllowed(false);
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    let mounted = true;
    void api<{ success: true }>("/api/empresas/xpace")
      .then(() => { if (mounted) { setAllowed(true); setError(""); } })
      .catch((cause: unknown) => {
        if (mounted) {
          setAllowed(false);
          setError(cause instanceof Error ? cause.message : "Sem acesso à XPACE.");
        }
      });
    return () => { mounted = false; };
  }, [session?.user.id]);

  if (booting) return <Loading />;
  if (!session) return <Login />;
  if (!allowed) return <SafeAreaView style={styles.blocked}><Text style={styles.blockedTitle}>Validando acesso</Text>{error ? <><Text style={styles.blockedBody}>{error}</Text><Pressable onPress={() => void supabase.auth.signOut()} style={styles.blockedButton}><Text style={styles.blockedButtonText}>Voltar ao login</Text></Pressable></> : <ActivityIndicator color={colors.violet} />}</SafeAreaView>;
  return <Home key={session.user.id} />;
}

function Loading() {
  return <SafeAreaView style={styles.blocked}><ActivityIndicator size="large" color={colors.violet} /><Text style={styles.blockedBody}>Abrindo XPACE...</Text></SafeAreaView>;
}

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setBusy(true);
    setError("");
    const { error: cause } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (cause) setError("Não foi possível entrar. Confira e-mail e senha.");
    setBusy(false);
  }

  return <SafeAreaView style={styles.loginRoot}><StatusBar barStyle="light-content" backgroundColor={colors.violetDark} /><KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.loginInner}><View style={styles.loginMark}><Text style={styles.loginMarkText}>X</Text></View><Text style={styles.loginTitle}>XPACE</Text><Text style={styles.loginCaption}>Sua escola, no seu ritmo.</Text><View style={styles.loginCard}><Text style={styles.loginCardTitle}>Bem-vindo de volta</Text><Text style={styles.loginCardCaption}>Acesse com sua conta da XPACEBOX.</Text><TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="E-mail" placeholderTextColor="#9b90aa" autoCapitalize="none" keyboardType="email-address" autoComplete="email" /><TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="Senha" placeholderTextColor="#9b90aa" secureTextEntry autoComplete="current-password" />{error ? <Text style={styles.error}>{error}</Text> : null}<Pressable style={[styles.loginButton, busy && styles.disabled]} disabled={busy || !email || !password} onPress={() => void submit()}><Text style={styles.loginButtonText}>{busy ? "Entrando..." : "Entrar"}</Text></Pressable></View></KeyboardAvoidingView></SafeAreaView>;
}

function Home() {
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState<Tab>("DASHBOARD");
  const [selectedDay, setSelectedDay] = useState(localIso(new Date()));
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [agenda, setAgenda] = useState<AgendaResponse | null>(null);
  const [selectedClass, setSelectedClass] = useState<ClassEvent | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [lastSeenAt, setLastSeenAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const touchX = useRef<number | null>(null);
  const week = useMemo(() => weekDays(selectedDay), [selectedDay]);
  const from = week[0];
  const to = week[6];

  const load = useCallback(async (withOverview = true) => {
    setRefreshing(true);
    setError("");
    try {
      const agendaPromise = api<AgendaResponse>(`/api/xpace/agenda?from=${from}&to=${to}`);
      const overviewPromise = withOverview ? api<OverviewResponse>("/api/xpace/mobile/overview") : null;
      const [agendaData, overviewData] = await Promise.all([agendaPromise, overviewPromise]);
      setAgenda(agendaData);
      if (overviewData) setOverview(overviewData);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar os dados.");
    } finally {
      setRefreshing(false);
    }
  }, [from, to]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void AsyncStorage.getItem(seenKey).then((value) => setLastSeenAt(value || "")); }, []);

  const events = useMemo(() => {
    const weekday = dateFromIso(selectedDay).getDay();
    return (agenda?.groups ?? []).flatMap((group) => group.schedules.filter((schedule) => schedule.weekday === weekday).map((schedule) => ({ group, schedule }))).sort((a, b) => a.schedule.startsAt.localeCompare(b.schedule.startsAt));
  }, [agenda, selectedDay]);
  const unseen = overview?.notifications.filter((item) => !lastSeenAt || item.createdAt > lastSeenAt).length ?? 0;

  function openNotifications() {
    setShowNotifications(true);
    const latest = overview?.notifications[0]?.createdAt;
    if (latest) {
      setLastSeenAt(latest);
      void AsyncStorage.setItem(seenKey, latest);
    }
  }

  async function markTrial(trial: Trial, attendanceStatus: "COMPARECEU" | "FALTOU") {
    setBusy(true);
    try {
      await api<{ success: true }>("/api/xpace/agenda", { method: "POST", body: JSON.stringify({ action: "UPDATE_TRIAL_ATTENDANCE", trialAttendance: { appointmentId: trial.id, classScheduleId: trial.classScheduleId, scheduledOn: trial.scheduledOn, attendanceStatus } }) });
      setAgenda((previous) => previous ? { ...previous, trialAppointments: previous.trialAppointments.map((item) => item.id === trial.id ? { ...item, attendanceStatus } : item) } : previous);
    } catch (cause) {
      Alert.alert("Não foi possível registrar", cause instanceof Error ? cause.message : "Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  function switchTab(next: Tab) {
    setTab(next);
    setSelectedClass(null);
    setShowNotifications(false);
  }

  return <SafeAreaView style={styles.root}><StatusBar barStyle="light-content" backgroundColor="#21142b" /><View style={styles.darkTop}><View style={styles.headerRow}><View style={styles.avatar}><Text style={styles.avatarText}>{(overview?.profileName || "X").trim().slice(0, 1).toUpperCase()}</Text></View><View style={styles.greeting}><Text style={styles.greetingSmall}>BEM-VINDO À XPACE</Text><Text style={styles.greetingName}>Olá, {firstName(overview?.profileName || "equipe")}!</Text></View><Pressable accessibilityLabel="Notificações" onPress={openNotifications} style={styles.bell}><Text style={styles.bellIcon}>🔔</Text>{unseen > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{unseen}</Text></View> : null}</Pressable></View><View style={styles.hero}><View style={styles.heroCircleOne} /><View style={styles.heroCircleTwo} /><Text style={styles.heroEyebrow}>SEU UNIVERSO XPACE</Text><Text style={styles.heroTitle}>Tudo no seu ritmo.\nTudo em um só lugar.</Text><Text style={styles.heroCaption}>Acompanhe sua escola e cuide de cada aula.</Text></View></View><View style={styles.body}><View style={styles.segmented}><Pressable onPress={() => switchTab("DASHBOARD")} style={[styles.segment, tab === "DASHBOARD" && styles.segmentActive]}><Text style={[styles.segmentText, tab === "DASHBOARD" && styles.segmentTextActive]}>Dashboard</Text></Pressable><Pressable onPress={() => switchTab("AGENDA")} style={[styles.segment, tab === "AGENDA" && styles.segmentActive]}><Text style={[styles.segmentText, tab === "AGENDA" && styles.segmentTextActive]}>Agenda</Text></Pressable></View>{error ? <View style={styles.errorBox}><Text style={styles.error}>{error}</Text><Pressable onPress={() => void load()}><Text style={styles.retry}>Tentar novamente</Text></Pressable></View> : null}<ScrollView style={styles.scroll} contentContainerStyle={[styles.scrollContent, { minWidth: Math.min(width, 380) - 20 }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load()} tintColor={colors.violet} />} onTouchStart={(event) => { touchX.current = event.nativeEvent.pageX; }} onTouchEnd={(event) => { if (touchX.current === null) return; const delta = event.nativeEvent.pageX - touchX.current; touchX.current = null; if (Math.abs(delta) > 90) switchTab(delta < 0 ? "AGENDA" : "DASHBOARD"); }}>{showNotifications ? <Notifications items={overview?.notifications ?? []} onClose={() => setShowNotifications(false)} /> : tab === "DASHBOARD" ? <Dashboard metrics={overview?.metrics} /> : selectedClass ? <ClassDetail event={selectedClass} day={selectedDay} agenda={agenda} busy={busy} onBack={() => setSelectedClass(null)} onMark={markTrial} /> : <Agenda selectedDay={selectedDay} week={week} events={events} agenda={agenda} onSelectDay={(value) => { setSelectedDay(value); setSelectedClass(null); }} onSelectClass={setSelectedClass} />}</ScrollView></View><View style={styles.bottom}><Pressable onPress={() => void supabase.auth.signOut()}><Text style={styles.bottomText}>Sair da conta</Text></Pressable><Text style={styles.bottomBrand}>XPACE • ESCOLA DE DANÇA</Text></View></SafeAreaView>;
}

function Dashboard({ metrics }: { metrics?: OverviewResponse["metrics"] }) {
  return <View><Text style={styles.sectionEyebrow}>VISÃO GERAL</Text><Text style={styles.sectionTitle}>Sua escola hoje</Text><Text style={styles.sectionCaption}>Indicadores atualizados com os registros do XPACE.</Text><View style={styles.metricGrid}><Metric label="EXPERIMENTAIS DA SEMANA" value={metrics?.trialsThisWeek} icon="✦" accent="#783ad0" wide /><Metric label="CLIENTES ATIVOS" value={metrics?.activeClients} icon="●" accent="#258c70" /><Metric label="NOVOS CLIENTES" value={metrics?.newClientsThisMonth} icon="+" accent="#ca589c" detail="Matrículas do mês" /><Metric label="NOVOS LEADS" value={metrics?.newLeadsThisMonth} icon="↗" accent="#e18a35" detail="Agendaram no mês" /><Metric label="A RECEBER HOJE" value="—" icon="↓" accent="#328f65" detail="Não integrado" /><Metric label="A PAGAR HOJE" value="—" icon="↑" accent="#c56174" detail="Não integrado" /><Metric label="VENDAS" value="—" icon="$" accent="#853bc6" detail="Não integrado" wide /><Metric label="RECEITA" value="—" icon="◉" accent="#2b8e8a" detail="Não integrado" wide /></View><Text style={styles.footnote}>Os cartões financeiros serão ativados quando houver uma fonte consolidada no XPACE.</Text></View>;
}

function Metric({ label, value, icon, accent, detail, wide = false }: { label: string; value: number | string | undefined; icon: string; accent: string; detail?: string; wide?: boolean }) {
  return <View style={[styles.metric, wide ? styles.metricWide : styles.metricHalf]}><View style={styles.metricTop}><Text style={styles.metricLabel}>{label}</Text><Text style={[styles.metricIcon, { color: accent }]}>{icon}</Text></View><Text style={[styles.metricValue, { color: accent }]}>{value ?? "—"}</Text>{detail ? <Text style={styles.metricDetail}>{detail}</Text> : null}</View>;
}

function Notifications({ items, onClose }: { items: OverviewResponse["notifications"]; onClose: () => void }) {
  return <View><View style={styles.headingRow}><View><Text style={styles.sectionEyebrow}>ATUALIZAÇÕES</Text><Text style={styles.sectionTitle}>Notificações</Text></View><Pressable onPress={onClose}><Text style={styles.backLink}>Fechar</Text></Pressable></View><Text style={styles.sectionCaption}>Agendamentos recentes registrados no XPACE.</Text>{items.length ? items.map((item) => <View key={item.id} style={styles.notification}><View style={styles.notificationDot} /><View style={styles.notificationBody}><Text style={styles.notificationTitle}>{item.title}</Text><Text style={styles.notificationDetail}>{item.detail}</Text><Text style={styles.notificationTime}>{relativeTime(item.createdAt)}</Text></View></View>) : <Text style={styles.empty}>Nenhum agendamento recente.</Text>}<Text style={styles.footnote}>Estes avisos aparecem no app. Notificações push no celular ainda não estão ativas.</Text></View>;
}

function Agenda({ selectedDay, week, events, agenda, onSelectDay, onSelectClass }: { selectedDay: string; week: string[]; events: ClassEvent[]; agenda: AgendaResponse | null; onSelectDay: (value: string) => void; onSelectClass: (value: ClassEvent) => void }) {
  return <View><View style={styles.headingRow}><View><Text style={styles.sectionEyebrow}>CHAMADA DIÁRIA</Text><Text style={styles.sectionTitle}>Agenda de aulas</Text></View><Text style={styles.monthLabel}>{dateFromIso(selectedDay).toLocaleDateString("pt-BR", { month: "short", year: "numeric" }).toUpperCase()}</Text></View><View style={styles.weekNav}><Pressable onPress={() => onSelectDay(shiftDate(selectedDay, -7))} style={styles.weekArrow}><Text style={styles.weekArrowText}>‹</Text></Pressable>{week.map((day) => { const active = day === selectedDay; return <Pressable key={day} onPress={() => onSelectDay(day)} style={[styles.dayButton, active && styles.dayActive]}><Text style={[styles.dayName, active && styles.dayNameActive]}>{days[dateFromIso(day).getDay()]}</Text><Text style={[styles.dayNumber, active && styles.dayNumberActive]}>{dateFromIso(day).getDate()}</Text></Pressable>; })}<Pressable onPress={() => onSelectDay(shiftDate(selectedDay, 7))} style={styles.weekArrow}><Text style={styles.weekArrowText}>›</Text></Pressable></View><View style={styles.dayHeading}><Text style={styles.dayHeadingTitle}>{formatDate(selectedDay)}</Text><Text style={styles.dayHeadingCount}>{events.length} aula{events.length === 1 ? "" : "s"}</Text></View>{events.length ? events.map((event) => { const enrolled = event.group.students.filter((student) => student.startsOn <= selectedDay && (!student.endsOn || student.endsOn >= selectedDay)); const leads = agenda?.trialAppointments.filter((trial) => trial.classScheduleId === event.schedule.id && trial.scheduledOn === selectedDay && trial.attendanceStatus !== "CANCELADO") ?? []; return <Pressable key={event.schedule.id} onPress={() => onSelectClass(event)} style={[styles.classCard, { borderLeftColor: event.schedule.color || colors.violet }]}><View style={styles.classHead}><Text style={styles.className}>{event.group.name}</Text><Text style={styles.classChevron}>›</Text></View><Text style={styles.classMeta}>{event.schedule.startsAt}–{event.schedule.endsAt} · {event.schedule.roomName || "Sala a definir"}</Text><Text style={styles.classMeta}>{event.schedule.instructorName || "Professor a definir"}</Text><View style={styles.classFooter}><Text style={styles.classCount}>{enrolled.length} aluno{enrolled.length === 1 ? "" : "s"} · {leads.length} lead{leads.length === 1 ? "" : "s"}</Text><Text style={styles.classAction}>Abrir chamada</Text></View></Pressable>; }) : <Text style={styles.empty}>Nenhuma aula cadastrada para este dia.</Text>}</View>;
}

function ClassDetail({ event, day, agenda, busy, onBack, onMark }: { event: ClassEvent; day: string; agenda: AgendaResponse | null; busy: boolean; onBack: () => void; onMark: (trial: Trial, status: "COMPARECEU" | "FALTOU") => Promise<void> }) {
  const students = event.group.students.filter((student) => student.startsOn <= day && (!student.endsOn || student.endsOn >= day));
  const trials = agenda?.trialAppointments.filter((trial) => trial.classScheduleId === event.schedule.id && trial.scheduledOn === day && trial.attendanceStatus !== "CANCELADO") ?? [];
  return <View><Pressable onPress={onBack}><Text style={styles.backLink}>‹ Voltar para as aulas</Text></Pressable><View style={[styles.detailHero, { borderTopColor: event.schedule.color || colors.violet }]}><Text style={styles.detailEyebrow}>{formatDate(day)} · {event.schedule.startsAt}–{event.schedule.endsAt}</Text><Text style={styles.detailName}>{event.group.name}</Text><Text style={styles.detailMeta}>{event.schedule.roomName || "Sala a definir"} · {event.schedule.instructorName || "Professor a definir"}</Text><Text style={styles.detailCapacity}>{students.length + trials.length}{event.schedule.capacity ? ` / ${event.schedule.capacity}` : ""} participantes</Text></View><Text style={styles.rosterHeading}>CHAMADA DA AULA</Text>{students.map((student) => <View key={student.id} style={styles.person}><View style={[styles.personAvatar, styles.studentAvatar]}><Text style={styles.personAvatarText}>{student.studentName.slice(0, 1)}</Text></View><View style={styles.personMain}><Text style={styles.personName}>{student.studentName}</Text><Text style={styles.studentTag}>ALUNO</Text></View></View>)}{trials.map((trial) => <View key={trial.id} style={styles.person}><View style={styles.personAvatar}><Text style={styles.personAvatarText}>{trial.leadName.slice(0, 1)}</Text></View><View style={styles.personMain}><Text style={styles.personName}>{trial.leadName}</Text><Text style={styles.leadTag}>LEAD · {trial.attendanceStatus === "COMPARECEU" ? "COMPARECEU" : trial.attendanceStatus === "FALTOU" ? "FALTOU" : "AGENDADO"}</Text><View style={styles.attendanceActions}><Pressable accessibilityLabel={`Marcar ${trial.leadName} como faltou`} disabled={busy} onPress={() => void onMark(trial, "FALTOU")} style={[styles.attendanceButton, trial.attendanceStatus === "FALTOU" && styles.absentActive]}><Text style={[styles.attendanceText, trial.attendanceStatus === "FALTOU" && styles.activeText]}>✕ Faltou</Text></Pressable><Pressable accessibilityLabel={`Marcar ${trial.leadName} como compareceu`} disabled={busy} onPress={() => void onMark(trial, "COMPARECEU")} style={[styles.attendanceButton, trial.attendanceStatus === "COMPARECEU" && styles.presentActive]}><Text style={[styles.attendanceText, trial.attendanceStatus === "COMPARECEU" && styles.activeText]}>✓ Compareceu</Text></Pressable></View></View></View>)}{!students.length && !trials.length ? <Text style={styles.empty}>Nenhum aluno ou lead nesta aula.</Text> : null}<Text style={styles.footnote}>A chamada de leads atualiza o CRM automaticamente. Matrícula é feita depois, no CRM.</Text></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  darkTop: { backgroundColor: "#21142b", paddingHorizontal: 22, paddingTop: Platform.OS === "android" ? 16 : 10, paddingBottom: 25 },
  headerRow: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  avatar: { width: 43, height: 43, borderRadius: 22, backgroundColor: colors.violet, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontSize: 21, fontWeight: "800" },
  greeting: { flex: 1, marginLeft: 12 },
  greetingSmall: { color: "#be9bda", fontSize: 10, fontWeight: "800", letterSpacing: 1.1 },
  greetingName: { color: "#fff", fontSize: 20, fontWeight: "800" },
  bell: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  bellIcon: { color: "#fff", fontSize: 28, fontWeight: "800" },
  badge: { position: "absolute", top: 1, right: 0, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: "#ef536f", alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  hero: { overflow: "hidden", borderRadius: 20, backgroundColor: colors.violet, padding: 20, minHeight: 132 },
  heroCircleOne: { position: "absolute", right: -20, top: -55, width: 170, height: 170, borderRadius: 85, backgroundColor: "#a04ddd" },
  heroCircleTwo: { position: "absolute", right: 10, bottom: -90, width: 150, height: 150, borderRadius: 75, backgroundColor: "#db5ab1" },
  heroEyebrow: { color: "#efd8ff", fontSize: 10, fontWeight: "800", letterSpacing: 1.5 },
  heroTitle: { color: "#fff", fontSize: 24, lineHeight: 28, fontWeight: "900", marginTop: 9 },
  heroCaption: { color: "#f2dbff", fontSize: 12, marginTop: 8 },
  body: { flex: 1, marginTop: -10, backgroundColor: colors.canvas, borderTopLeftRadius: 21, borderTopRightRadius: 21, paddingTop: 14 },
  segmented: { flexDirection: "row", marginHorizontal: 20, borderBottomWidth: 1, borderBottomColor: colors.line },
  segment: { flex: 1, alignItems: "center", paddingVertical: 15, borderBottomWidth: 3, borderBottomColor: "transparent" },
  segmentActive: { borderBottomColor: colors.violet },
  segmentText: { fontSize: 15, color: colors.muted, fontWeight: "700" },
  segmentTextActive: { color: colors.ink, fontWeight: "900" },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 36 },
  sectionEyebrow: { color: colors.violet, fontSize: 10, letterSpacing: 1.6, fontWeight: "900" },
  sectionTitle: { color: colors.ink, fontSize: 25, fontWeight: "900", marginTop: 5 },
  sectionCaption: { color: colors.muted, fontSize: 13, marginTop: 5, marginBottom: 17 },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  metric: { backgroundColor: "#fff", borderColor: colors.line, borderWidth: 1, borderRadius: 16, padding: 15, marginBottom: 11, minHeight: 120 },
  metricWide: { width: "100%" },
  metricHalf: { width: "48.5%" },
  metricTop: { flexDirection: "row", justifyContent: "space-between" },
  metricLabel: { color: colors.muted, fontSize: 11, fontWeight: "800", flex: 1 },
  metricIcon: { fontSize: 23, fontWeight: "900", marginLeft: 5 },
  metricValue: { fontSize: 29, fontWeight: "900", marginTop: 11 },
  metricDetail: { color: colors.muted, fontSize: 11, marginTop: 3 },
  footnote: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 12 },
  bottom: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 22, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: "#fff" },
  bottomText: { color: colors.violet, fontSize: 11, fontWeight: "800" },
  bottomBrand: { color: "#aaa0b3", fontSize: 9, fontWeight: "700" },
  headingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  monthLabel: { color: colors.violet, fontSize: 11, fontWeight: "800" },
  weekNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 20, marginBottom: 20 },
  weekArrow: { width: 21, alignItems: "center" },
  weekArrowText: { color: colors.violet, fontSize: 29, lineHeight: 32 },
  dayButton: { alignItems: "center", paddingVertical: 7, minWidth: 35, borderRadius: 18 },
  dayActive: { backgroundColor: colors.violet },
  dayName: { color: colors.muted, fontSize: 9, fontWeight: "800" },
  dayNameActive: { color: "#ead1ff" },
  dayNumber: { color: colors.ink, fontSize: 17, fontWeight: "900", marginTop: 4 },
  dayNumberActive: { color: "#fff" },
  dayHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  dayHeadingTitle: { color: colors.ink, fontSize: 17, fontWeight: "900", textTransform: "capitalize" },
  dayHeadingCount: { color: colors.muted, fontSize: 12 },
  classCard: { backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: colors.line, borderLeftWidth: 5, padding: 15, marginBottom: 12 },
  classHead: { flexDirection: "row", alignItems: "flex-start" },
  className: { color: colors.ink, fontWeight: "900", fontSize: 16, flex: 1, lineHeight: 22 },
  classChevron: { color: colors.violet, fontSize: 30, lineHeight: 24 },
  classMeta: { color: colors.muted, fontSize: 12, marginTop: 5 },
  classFooter: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10, marginTop: 12 },
  classCount: { color: colors.ink, fontSize: 12, fontWeight: "700" },
  classAction: { color: colors.violet, fontSize: 12, fontWeight: "800" },
  backLink: { color: colors.violet, fontWeight: "800", fontSize: 13, marginBottom: 13 },
  detailHero: { backgroundColor: "#fff", borderRadius: 16, borderColor: colors.line, borderWidth: 1, borderTopWidth: 5, padding: 18 },
  detailEyebrow: { color: colors.violet, fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
  detailName: { color: colors.ink, fontSize: 21, fontWeight: "900", marginTop: 8 },
  detailMeta: { color: colors.muted, fontSize: 12, marginTop: 8 },
  detailCapacity: { color: colors.violet, fontSize: 13, fontWeight: "800", marginTop: 14 },
  rosterHeading: { color: colors.ink, fontSize: 13, fontWeight: "900", textAlign: "center", letterSpacing: 1, marginTop: 26, marginBottom: 9 },
  person: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 15, borderBottomColor: colors.line, borderBottomWidth: 1 },
  personAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.violet, alignItems: "center", justifyContent: "center", marginRight: 11 },
  studentAvatar: { backgroundColor: colors.green },
  personAvatarText: { color: "#fff", fontSize: 18, fontWeight: "900" },
  personMain: { flex: 1 },
  personName: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  studentTag: { color: colors.green, fontSize: 10, fontWeight: "900", marginTop: 3 },
  leadTag: { color: colors.violet, fontSize: 10, fontWeight: "900", marginTop: 3 },
  attendanceActions: { flexDirection: "row", gap: 8, marginTop: 10 },
  attendanceButton: { borderColor: colors.line, borderWidth: 1, borderRadius: 9, paddingVertical: 7, paddingHorizontal: 9 },
  absentActive: { backgroundColor: colors.red, borderColor: colors.red },
  presentActive: { backgroundColor: colors.green, borderColor: colors.green },
  attendanceText: { color: colors.ink, fontSize: 11, fontWeight: "800" },
  activeText: { color: "#fff" },
  notification: { flexDirection: "row", paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.line },
  notificationDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.pink, marginTop: 6, marginRight: 12 },
  notificationBody: { flex: 1 },
  notificationTitle: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  notificationDetail: { color: colors.muted, fontSize: 12, marginTop: 4 },
  notificationTime: { color: colors.violet, fontSize: 11, fontWeight: "800", marginTop: 6 },
  empty: { color: colors.muted, fontSize: 13, padding: 20, backgroundColor: "#fff", borderRadius: 12, textAlign: "center" },
  errorBox: { marginHorizontal: 20, marginTop: 10, backgroundColor: "#fff1f2", padding: 12, borderRadius: 10 },
  error: { color: colors.red, fontSize: 12 },
  retry: { color: colors.violet, fontWeight: "800", marginTop: 5 },
  blocked: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.canvas, padding: 28 },
  blockedTitle: { color: colors.ink, fontSize: 21, fontWeight: "900", marginBottom: 10 },
  blockedBody: { color: colors.muted, fontSize: 14, textAlign: "center", marginTop: 12, marginBottom: 12 },
  blockedButton: { backgroundColor: colors.violet, borderRadius: 10, padding: 12 },
  blockedButtonText: { color: "#fff", fontWeight: "800" },
  loginRoot: { flex: 1, backgroundColor: colors.violetDark },
  loginInner: { flex: 1, justifyContent: "center", paddingHorizontal: 24 },
  loginMark: { width: 66, height: 66, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.pink, alignSelf: "center" },
  loginMarkText: { color: "#fff", fontSize: 37, fontWeight: "900" },
  loginTitle: { color: "#fff", fontSize: 34, fontWeight: "900", textAlign: "center", marginTop: 13, letterSpacing: 2 },
  loginCaption: { color: "#e8d2fa", fontSize: 14, textAlign: "center", marginBottom: 32 },
  loginCard: { backgroundColor: "#fff", borderRadius: 22, padding: 22 },
  loginCardTitle: { color: colors.ink, fontSize: 22, fontWeight: "900" },
  loginCardCaption: { color: colors.muted, fontSize: 13, marginTop: 5, marginBottom: 20 },
  input: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.canvas, borderRadius: 11, color: colors.ink, paddingHorizontal: 14, height: 48, marginBottom: 11 },
  loginButton: { backgroundColor: colors.violet, borderRadius: 11, alignItems: "center", padding: 15, marginTop: 5 },
  disabled: { opacity: 0.6 },
  loginButtonText: { color: "#fff", fontWeight: "900", fontSize: 14 },
});

"use client";

import { AlertTriangle, BarChart3, ArrowUpRight, CalendarDays, ClipboardList, LayoutDashboard, MessagesSquare, Package, ReceiptText, ShoppingBag, SlidersHorizontal, Sparkles, UsersRound, WalletCards } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import BuildRevision from "@/components/BuildRevision";
import CommunityWorkspace from "@/components/xpace-dance/CommunityWorkspace";
import ContractsWorkspace from "@/components/xpace-dance/ContractsWorkspace";
import AgendaWorkspace from "@/components/xpace-dance/AgendaWorkspace";
import AdministrativeWorkspace from "@/components/xpace-dance/AdministrativeWorkspace";
import ModalitiesWorkspace from "@/components/xpace-dance/ModalitiesWorkspace";
import InstructorsWorkspace from "@/components/xpace-dance/InstructorsWorkspace";
import FinanceWorkspace from "@/components/xpace-dance/FinanceWorkspace";
import LeadsWorkspace from "@/components/xpace-dance/LeadsWorkspace";
import RoomsWorkspace from "@/components/xpace-dance/RoomsWorkspace";
import ServicesWorkspace from "@/components/xpace-dance/ServicesWorkspace";
import SettingsWorkspace from "@/components/xpace-dance/SettingsWorkspace";
import StudentProfileWorkspace from "@/components/xpace-dance/StudentProfileWorkspace";
import XpaceHomeOverview from "@/components/xpace-dance/XpaceHomeOverview";
import DashboardWorkspace from "@/components/xpace-dance/DashboardWorkspace";
import ReportsWorkspace from "@/components/xpace-dance/ReportsWorkspace";
import MessageConnectorWorkspace from "@/components/xpace-dance/MessageConnectorWorkspace";
import NewLeadSoundToggle from "@/components/xpace-dance/NewLeadSoundToggle";
import { XPayAccount, XPayBenefits, XPayStore } from "@/components/xpace-dance/XPayWorkspace";
import { supabase } from "@/lib/supabase";

const modules = [
  { icon: UsersRound, title: "CLIENTES", description: "Alunos e responsáveis", accent: "lilac" },
  { icon: LayoutDashboard, title: "DASHBOARD", description: "Visão geral", accent: "violet" },
  { icon: BarChart3, title: "RELATÓRIOS", description: "Acompanhamento e decisões", accent: "violet" },
  { icon: MessagesSquare, title: "CRM", description: "Relacionamento", accent: "pink" },
  { icon: CalendarDays, title: "AGENDA", description: "Turmas e horários", accent: "blue" },
  { icon: WalletCards, title: "FINANCEIRO", description: "Cobranças e pagamentos", accent: "violet" },
  { icon: Package, title: "ESTOQUE", description: "Materiais e uniformes", accent: "lilac" },
  { icon: ReceiptText, title: "COMANDA", description: "Consumos e pedidos", accent: "pink" },
  { icon: ClipboardList, title: "ADMINISTRATIVO", description: "Operação interna", accent: "violet" },
  { icon: SlidersHorizontal, title: "CONFIGURAÇÕES", description: "Preferências", accent: "lilac" },
  { icon: ShoppingBag, title: "LOJA", description: "Produtos e inscrições", accent: "blue" },
];

export default function DanceWorkspace({ canAccessCentral, onExit }: { canAccessCentral: boolean; onExit: () => Promise<void> }) {
  const router = useRouter();
  const [screen, setScreen] = useState<"HOME" | "REPORTS" | "DASHBOARD" | "COMMUNITY" | "PROFILE" | "CRM" | "AGENDA" | "FINANCE" | "ADMINISTRATIVE" | "CONTRACTS" | "SERVICES" | "MODALITIES" | "INSTRUCTORS" | "SETTINGS" | "ROOMS" | "STORE" | "XPAY_BENEFITS" | "XPAY_ACCOUNT" | "MESSAGE_CONNECTOR">("HOME");
  const [profileId, setProfileId] = useState("");
  const [leadId, setLeadId] = useState("");
  const [reportActions, setReportActions] = useState(false);
  const [notificationSettings, setNotificationSettings] = useState(false);
  function openReports() { setReportActions(false); setScreen("REPORTS"); }
  function openCrm() { setLeadId(""); setScreen("CRM"); }
  const [connectorHealth, setConnectorHealth] = useState<{ configured: boolean; status: string; lastSeenAt: string | null } | null>(null);
  useEffect(() => { window.scrollTo(0, 0); if (screen === "HOME") setNotificationSettings(false); }, [screen]);
  useEffect(() => {
    let active = true;
    async function checkConnector() {
      if (document.visibilityState === "hidden") return;
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session?.access_token) return;
        const response = await fetch("/api/xpace/message-connector/status", { headers: { Authorization: `Bearer ${data.session.access_token}` }, cache: "no-store" });
        const payload = await response.json() as { success?: boolean; configured?: boolean; status?: string; lastSeenAt?: string | null };
        if (!response.ok || !payload.success) throw new Error("STATUS INDISPONÍVEL");
        if (active) setConnectorHealth({ configured: Boolean(payload.configured), status: payload.status ?? "OFFLINE", lastSeenAt: payload.lastSeenAt ?? null });
      } catch {
        if (active) setConnectorHealth((previous) => previous?.configured ? { ...previous, status: "UNKNOWN" } : null);
      }
    }
    void checkConnector();
    const timer = window.setInterval(() => { void checkConnector(); }, 20_000);
    document.addEventListener("visibilitychange", checkConnector);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", checkConnector); };
  }, []);
  const activeModule = screen === "REPORTS" ? "RELATÓRIOS" : screen === "DASHBOARD" ? "DASHBOARD" : screen === "COMMUNITY" || screen === "PROFILE" ? "CLIENTES" : screen === "CRM" ? "CRM" : screen === "AGENDA" ? "AGENDA" : screen === "FINANCE" ? "FINANCEIRO" : screen === "ADMINISTRATIVE" || screen === "CONTRACTS" || screen === "SERVICES" || screen === "MODALITIES" || screen === "INSTRUCTORS" || screen === "ROOMS" ? "ADMINISTRATIVO" : screen === "SETTINGS" ? "CONFIGURAÇÕES" : screen === "STORE" || screen === "XPAY_BENEFITS" || screen === "XPAY_ACCOUNT" || screen === "MESSAGE_CONNECTOR" ? "LOJA" : null;
  const returnScreen = screen === "PROFILE" ? "COMMUNITY" : screen === "CONTRACTS" || screen === "SERVICES" || screen === "MODALITIES" || screen === "INSTRUCTORS" || screen === "ROOMS" ? "ADMINISTRATIVE" : screen === "XPAY_BENEFITS" || screen === "XPAY_ACCOUNT" || screen === "MESSAGE_CONNECTOR" ? "STORE" : "HOME";
  const returnTitle = screen === "PROFILE" ? "Voltar à Comunidade" : screen === "CONTRACTS" || screen === "SERVICES" || screen === "MODALITIES" || screen === "INSTRUCTORS" || screen === "ROOMS" ? "Voltar ao Administrativo" : screen === "XPAY_BENEFITS" || screen === "XPAY_ACCOUNT" || screen === "MESSAGE_CONNECTOR" ? "Voltar à Loja" : "Voltar ao Painel";

  const connectorAlert = connectorHealth?.status === "PREPARING" ? "TROCA PARA Z-API EM PREPARAÇÃO. FILA AGUARDANDO TESTE E ATIVAÇÃO."
    : connectorHealth?.status === "PAUSED" ? "FILA DE WHATSAPP PAUSADA NA Z-API."
    : connectorHealth?.status === "SCHEDULER_ERROR" ? "AGENDADOR DA Z-API SEM EXECUÇÃO RECENTE CONFIRMADA."
    : "WHATSAPP DESCONECTADO OU SEM CONFIRMAÇÃO DE CONEXÃO.";
  const topbar = <><header className={`xd-topbar${(screen === "DASHBOARD" || screen === "REPORTS") ? " xd-topbar--dashboard" : ""}`}>
    <div className="xd-brand" aria-label="XPACE Escola de Dança"><img className="xd-brand-logo" src="/brands/xpace-logo.png" alt="XPACE" /><span className="xd-school-name">ESCOLA DE DANÇA</span></div>
    <div className="xd-topbar-tools"><NewLeadSoundToggle />{activeModule ? <div className="xd-topbar-context"><button type="button" className="xd-active-module xd-active-module--return" onClick={() => setScreen(returnScreen)} title={returnTitle}><span>MÓDULO ATIVO</span><strong>{activeModule}</strong></button></div> : canAccessCentral ? <button type="button" className="xd-back" onClick={() => router.push("/")}>CENTRAL</button> : <button type="button" className="xd-back" onClick={() => void onExit()}>SAIR</button>}</div>
  </header>{connectorHealth?.configured && connectorHealth.status !== "CONNECTED" ? <div className="xd-connector-alert" role="alert"><AlertTriangle size={18} aria-hidden="true" /><span><strong>{connectorAlert}</strong> As mensagens automáticas podem ficar na fila. Avise um gerente para conferir o Integrador na Loja.</span></div> : null}</>;

  if (screen === "COMMUNITY") return <main className="xd-shell">{topbar}<CommunityWorkspace onOpenProfile={(id) => { setProfileId(id); setScreen("PROFILE"); }} /></main>;
  if (screen === "DASHBOARD") return <main className="xd-shell">{topbar}<DashboardWorkspace /></main>;
  if (screen === "REPORTS") return <main className="xd-shell">{topbar}<ReportsWorkspace startWithActions={reportActions} onOpenLead={(id) => { setLeadId(id); setScreen("CRM"); }} /></main>;
  if (screen === "PROFILE" && profileId) return <main className="xd-shell">{topbar}<StudentProfileWorkspace studentId={profileId} /></main>;
  if (screen === "CRM") return <main className="xd-shell">{topbar}<LeadsWorkspace initialLeadId={leadId} onOpenConversion={() => { setReportActions(true); setScreen("REPORTS"); }} /></main>;
  if (screen === "AGENDA") return <main className="xd-shell">{topbar}<AgendaWorkspace /></main>;
  if (screen === "FINANCE") return <main className="xd-shell">{topbar}<FinanceWorkspace /></main>;
  if (screen === "STORE") return <main className="xd-shell">{topbar}<XPayStore onOpenBenefits={() => setScreen("XPAY_BENEFITS")} onOpenAccount={() => setScreen("XPAY_ACCOUNT")} onOpenMessages={() => setScreen("MESSAGE_CONNECTOR")} /></main>;
  if (screen === "MESSAGE_CONNECTOR") return <main className="xd-shell">{topbar}<MessageConnectorWorkspace onBack={() => setScreen("STORE")} /></main>;
  if (screen === "XPAY_BENEFITS") return <main className="xd-shell">{topbar}<XPayBenefits onOpenAccount={() => setScreen("XPAY_ACCOUNT")} onBack={() => setScreen("STORE")} /></main>;
  if (screen === "XPAY_ACCOUNT") return <main className="xd-shell">{topbar}<XPayAccount onBack={() => setScreen("STORE")} /></main>;
  if (screen === "ADMINISTRATIVE") return <main className="xd-shell">{topbar}<AdministrativeWorkspace onOpenContracts={() => setScreen("CONTRACTS")} onOpenServices={() => setScreen("SERVICES")} onOpenModalities={() => setScreen("MODALITIES")} onOpenInstructors={() => setScreen("INSTRUCTORS")} onOpenRooms={() => setScreen("ROOMS")} /></main>;
  if (screen === "CONTRACTS") return <main className="xd-shell">{topbar}<ContractsWorkspace /></main>;
  if (screen === "SERVICES") return <main className="xd-shell">{topbar}<ServicesWorkspace /></main>;
  if (screen === "MODALITIES") return <main className="xd-shell">{topbar}<ModalitiesWorkspace /></main>;
  if (screen === "INSTRUCTORS") return <main className="xd-shell">{topbar}<InstructorsWorkspace /></main>;
  if (screen === "SETTINGS") return <main className="xd-shell">{topbar}<SettingsWorkspace startWithNotifications={notificationSettings} /></main>;
  if (screen === "ROOMS") return <main className="xd-shell">{topbar}<RoomsWorkspace /></main>;

  return <main className="xd-shell">
    {topbar}

    <section className="xd-hero" aria-label="XPACE Escola de Dança">
      <div className="xd-hero-copy">
        <span><Sparkles size={15} aria-hidden="true" /> MOVIMENTO QUE CONECTA</span>
        <h1>O palco da sua<br />operação.</h1>
        <p>Uma escola viva, em cada ritmo: do primeiro passo à próxima conquista.</p>
      </div>
      <div className="xd-hero-motion" aria-hidden="true">
        <div className="xd-orbit xd-orbit-one" />
        <div className="xd-orbit xd-orbit-two" />
        <div className="xd-motion-core"><span>X</span></div>
        <div className="xd-motion-tag xd-tag-hiphop">HIP HOP</div>
        <div className="xd-motion-tag xd-tag-ballet">BALLET</div>
        <div className="xd-motion-tag xd-tag-jazz">JAZZ</div>
        <div className="xd-motion-tag xd-tag-salao">DANÇA DE SALÃO</div>
        <div className="xd-motion-tag xd-tag-contemporaneo">CONTEMPORÂNEO</div>
        <div className="xd-motion-tag xd-tag-heels">HEELS</div>
        <div className="xd-motion-tag xd-tag-jazzfunk">JAZZ FUNK</div>
        <div className="xd-motion-tag xd-tag-acrobacias">ACROBACIAS</div>
        <div className="xd-motion-trail" />
      </div>
    </section>

    <XpaceHomeOverview onPreferences={() => { setNotificationSettings(true); setScreen("SETTINGS"); }} onOpen={notice => { if (notice.leadId) { setLeadId(notice.leadId); setScreen("CRM"); } else if (notice.studentId && notice.target === "COMMUNITY") { setProfileId(notice.studentId); setScreen("PROFILE"); } else if (notice.target === "MESSAGE_CONNECTOR") setScreen("MESSAGE_CONNECTOR"); else if (notice.target === "FINANCE") setScreen("FINANCE"); else setScreen("SETTINGS"); }} />

    <section className="xd-modules" aria-label="Módulos da XPACE Escola de Dança">
      {modules.map(({ icon: Icon, title, description, accent }) => <button className={`xd-module xd-module--${accent}`} type="button" key={title} title={`${title}: ${["CLIENTES", "DASHBOARD", "RELATÓRIOS", "CRM", "AGENDA", "FINANCEIRO", "ADMINISTRATIVO", "CONFIGURAÇÕES", "LOJA"].includes(title) ? "abrir módulo" : "em preparação"}`} onClick={() => title === "CLIENTES" ? setScreen("COMMUNITY") : title === "DASHBOARD" ? setScreen("DASHBOARD") : title === "RELATÓRIOS" ? openReports() : title === "CRM" ? openCrm() : title === "AGENDA" ? setScreen("AGENDA") : title === "FINANCEIRO" ? setScreen("FINANCE") : title === "ADMINISTRATIVO" ? setScreen("ADMINISTRATIVE") : title === "CONFIGURAÇÕES" ? setScreen("SETTINGS") : title === "LOJA" ? setScreen("STORE") : undefined}>
        <span className="xd-module-icon"><Icon size={20} aria-hidden="true" /></span>
        <span className="xd-module-copy"><strong>{title}</strong><small>{description}</small></span>
        <ArrowUpRight className="xd-module-arrow" size={17} aria-hidden="true" />
      </button>)}
    </section>
    <BuildRevision className="xd-home-revision" />
  </main>;
}

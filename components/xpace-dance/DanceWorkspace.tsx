"use client";

import { AlertTriangle, BarChart3, ArrowUpRight, CalendarDays, ClipboardList, LayoutDashboard, MessagesSquare, Package, ReceiptText, ShoppingBag, SlidersHorizontal, Sparkles, UsersRound, WalletCards } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import BackTitle from "@/components/navigation/BackTitle";
import { WorkspaceNavigationProvider, useWorkspaceNavigation, useScreenHistory, clearScreenHistory } from "@/components/navigation/WorkspaceNavigation";
import { allowWorkspaceNavigation } from "@/components/navigation/navigation-guard";

import BuildRevision from "@/components/BuildRevision";
import LinkTreeWorkspace from '@/components/xpace-dance/LinkTreeWorkspace';
import RefreshableScreen from "@/components/xpace-dance/RefreshableScreen";
import StockWorkspace from "@/components/xpace-dance/StockWorkspace";
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
  return <WorkspaceNavigationProvider><DanceWorkspaceContent canAccessCentral={canAccessCentral} onExit={onExit} /></WorkspaceNavigationProvider>;
}

function DanceWorkspaceContent({ canAccessCentral, onExit }: { canAccessCentral: boolean; onExit: () => Promise<void> }) {
  const router = useRouter();
  type Screen = "HOME" | "REPORTS" | "DASHBOARD" | "COMMUNITY" | "PROFILE" | "CRM" | "AGENDA" | "FINANCE" | "STOCK" | "ADMINISTRATIVE" | "CONTRACTS" | "SERVICES" | "MODALITIES" | "INSTRUCTORS" | "SETTINGS" | "ROOMS" | "STORE" | "XPAY_BENEFITS" | "XPAY_ACCOUNT" | "MESSAGE_CONNECTOR" | "LINK_TREE";
  const { current: screen, open, back, reset } = useScreenHistory<Screen>("HOME", "xpace/screens");
  function setScreen(next: Screen) { if (next === "SETTINGS") clearScreenHistory("xpace/settings"); open(next); }
  const navigation = useWorkspaceNavigation();
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
  const activeModule = screen === "LINK_TREE" ? "ÁRVORE DE LINKS" : screen === "REPORTS" ? "RELATÓRIOS" : screen === "DASHBOARD" ? "DASHBOARD" : screen === "COMMUNITY" || screen === "PROFILE" ? "CLIENTES" : screen === "CRM" ? "CRM" : screen === "AGENDA" ? "AGENDA" : screen === "FINANCE" ? "FINANCEIRO" : screen === "STOCK" ? "ESTOQUE" : screen === "ADMINISTRATIVE" || screen === "CONTRACTS" || screen === "SERVICES" || screen === "MODALITIES" || screen === "INSTRUCTORS" || screen === "ROOMS" ? "ADMINISTRATIVO" : screen === "SETTINGS" ? "CONFIGURAÇÕES" : screen === "STORE" || screen === "XPAY_BENEFITS" || screen === "XPAY_ACCOUNT" || screen === "MESSAGE_CONNECTOR" ? "LOJA" : null;

  const connectorAlert = connectorHealth?.status === "PREPARING" ? "TROCA PARA Z-API EM PREPARAÇÃO. FILA AGUARDANDO TESTE E ATIVAÇÃO."
    : connectorHealth?.status === "PAUSED" ? "FILA DE WHATSAPP PAUSADA NA Z-API."
    : connectorHealth?.status === "SCHEDULER_ERROR" ? "AGENDADOR DA Z-API SEM EXECUÇÃO RECENTE CONFIRMADA."
    : "WHATSAPP DESCONECTADO OU SEM CONFIRMAÇÃO DE CONEXÃO.";
  const topbar = <><header className={`xd-topbar${(screen === "DASHBOARD" || screen === "REPORTS") ? " xd-topbar--dashboard" : ""}`}>
    <button type="button" className="xd-brand xd-brand-home" aria-label="XPACE · ir para o início" onClick={() => { if (allowWorkspaceNavigation()) reset("HOME"); }}><img className="xd-brand-logo" src="/brands/xpace-logo.png" alt="XPACE" /><span className="xd-school-name">ESCOLA DE DANÇA</span></button>
    <div className="xd-topbar-tools"><NewLeadSoundToggle />{activeModule ? <div className="xd-topbar-context"><BackTitle title={navigation?.action?.title || activeModule} onBack={navigation?.action?.back || back} className="xd-active-module xd-active-module--return"><span>MÓDULO ATIVO</span><strong>{navigation?.action?.title || activeModule}</strong></BackTitle></div> : canAccessCentral ? <button type="button" className="xd-back" onClick={() => router.push("/")}>CENTRAL</button> : <button type="button" className="xd-back" onClick={() => void onExit()}>SAIR</button>}</div>
  </header>{connectorHealth?.configured && connectorHealth.status !== "CONNECTED" ? <div className="xd-connector-alert" role="alert"><AlertTriangle size={18} aria-hidden="true" /><span><strong>{connectorAlert}</strong> As mensagens automáticas podem ficar na fila. Avise um gerente para conferir o Integrador na Loja.</span></div> : null}</>;

  if (screen === "COMMUNITY") return <RefreshableScreen screenKey={screen}>{topbar}<CommunityWorkspace onOpenProfile={(id) => { setProfileId(id); setScreen("PROFILE"); }} /></RefreshableScreen>;
  if (screen === "DASHBOARD") return <RefreshableScreen screenKey={screen}>{topbar}<DashboardWorkspace /></RefreshableScreen>;
  if (screen === "REPORTS") return <RefreshableScreen screenKey={screen}>{topbar}<ReportsWorkspace startWithActions={reportActions} onOpenLead={(id) => { setLeadId(id); setScreen("CRM"); }} /></RefreshableScreen>;
  if (screen === "PROFILE" && profileId) return <RefreshableScreen screenKey={screen}>{topbar}<StudentProfileWorkspace studentId={profileId} /></RefreshableScreen>;
  if (screen === "CRM") return <RefreshableScreen screenKey={screen}>{topbar}<LeadsWorkspace initialLeadId={leadId} onOpenConversion={() => { setReportActions(true); setScreen("REPORTS"); }} /></RefreshableScreen>;
  if (screen === "AGENDA") return <RefreshableScreen screenKey={screen}>{topbar}<AgendaWorkspace /></RefreshableScreen>;
  if (screen === "FINANCE") return <RefreshableScreen screenKey={screen}>{topbar}<FinanceWorkspace /></RefreshableScreen>;
  if (screen === "STOCK") return <RefreshableScreen screenKey={screen}>{topbar}<StockWorkspace /></RefreshableScreen>;
  if (screen === "LINK_TREE") return <RefreshableScreen screenKey={screen}>{topbar}<LinkTreeWorkspace /></RefreshableScreen>;
  if (screen === "STORE") return <RefreshableScreen screenKey={screen}>{topbar}<XPayStore onOpenLinks={() => setScreen("LINK_TREE")} onOpenBenefits={() => setScreen("XPAY_BENEFITS")} onOpenAccount={() => setScreen("XPAY_ACCOUNT")} onOpenMessages={() => setScreen("MESSAGE_CONNECTOR")} /></RefreshableScreen>;
  if (screen === "MESSAGE_CONNECTOR") return <RefreshableScreen screenKey={screen}>{topbar}<MessageConnectorWorkspace /></RefreshableScreen>;
  if (screen === "XPAY_BENEFITS") return <RefreshableScreen screenKey={screen}>{topbar}<XPayBenefits onOpenAccount={() => setScreen("XPAY_ACCOUNT")} onBack={back} /></RefreshableScreen>;
  if (screen === "XPAY_ACCOUNT") return <RefreshableScreen screenKey={screen}>{topbar}<XPayAccount onBack={back} /></RefreshableScreen>;
  if (screen === "ADMINISTRATIVE") return <RefreshableScreen screenKey={screen}>{topbar}<AdministrativeWorkspace onOpenContracts={() => setScreen("CONTRACTS")} onOpenServices={() => setScreen("SERVICES")} onOpenModalities={() => setScreen("MODALITIES")} onOpenInstructors={() => setScreen("INSTRUCTORS")} onOpenRooms={() => setScreen("ROOMS")} /></RefreshableScreen>;
  if (screen === "CONTRACTS") return <RefreshableScreen screenKey={screen}>{topbar}<ContractsWorkspace /></RefreshableScreen>;
  if (screen === "SERVICES") return <RefreshableScreen screenKey={screen}>{topbar}<ServicesWorkspace /></RefreshableScreen>;
  if (screen === "MODALITIES") return <RefreshableScreen screenKey={screen}>{topbar}<ModalitiesWorkspace /></RefreshableScreen>;
  if (screen === "INSTRUCTORS") return <RefreshableScreen screenKey={screen}>{topbar}<InstructorsWorkspace /></RefreshableScreen>;
  if (screen === "SETTINGS") return <RefreshableScreen screenKey={screen}>{topbar}<SettingsWorkspace startWithNotifications={notificationSettings} onBack={back} /></RefreshableScreen>;
  if (screen === "ROOMS") return <RefreshableScreen screenKey={screen}>{topbar}<RoomsWorkspace /></RefreshableScreen>;

  return <RefreshableScreen screenKey={screen}>
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
      {modules.map(({ icon: Icon, title, description, accent }) => <button className={`xd-module xd-module--${accent}`} type="button" key={title} title={`${title}: ${["CLIENTES", "DASHBOARD", "RELATÓRIOS", "CRM", "AGENDA", "FINANCEIRO", "ESTOQUE", "ADMINISTRATIVO", "CONFIGURAÇÕES", "LOJA"].includes(title) ? "abrir módulo" : "em preparação"}`} onClick={() => title === "CLIENTES" ? setScreen("COMMUNITY") : title === "DASHBOARD" ? setScreen("DASHBOARD") : title === "RELATÓRIOS" ? openReports() : title === "CRM" ? openCrm() : title === "AGENDA" ? setScreen("AGENDA") : title === "FINANCEIRO" ? setScreen("FINANCE") : title === "ESTOQUE" ? setScreen("STOCK") : title === "ADMINISTRATIVO" ? setScreen("ADMINISTRATIVE") : title === "CONFIGURAÇÕES" ? setScreen("SETTINGS") : title === "LOJA" ? setScreen("STORE") : undefined}>
        <span className="xd-module-icon"><Icon size={20} aria-hidden="true" /></span>
        <span className="xd-module-copy"><strong>{title === "ADMINISTRATIVO" ? "ADM" : title === "CONFIGURAÇÕES" ? "Config" : title}</strong><small>{description}</small></span>
        <ArrowUpRight className="xd-module-arrow" size={17} aria-hidden="true" />
      </button>)}
    </section>
    <BuildRevision className="xd-home-revision" />
  </RefreshableScreen>;
}

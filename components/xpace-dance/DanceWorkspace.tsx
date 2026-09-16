"use client";

import { ArrowUpRight, CalendarDays, ClipboardList, LayoutDashboard, MessagesSquare, Package, ReceiptText, ShoppingBag, SlidersHorizontal, Sparkles, UsersRound, WalletCards } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import BuildRevision from "@/components/BuildRevision";
import CommunityWorkspace from "@/components/xpace-dance/CommunityWorkspace";
import ContractsWorkspace from "@/components/xpace-dance/ContractsWorkspace";
import AgendaWorkspace from "@/components/xpace-dance/AgendaWorkspace";
import AdministrativeWorkspace from "@/components/xpace-dance/AdministrativeWorkspace";
import ModalitiesWorkspace from "@/components/xpace-dance/ModalitiesWorkspace";
import InstructorsWorkspace from "@/components/xpace-dance/InstructorsWorkspace";
import RoomsWorkspace from "@/components/xpace-dance/RoomsWorkspace";
import ServicesWorkspace from "@/components/xpace-dance/ServicesWorkspace";
import SettingsWorkspace from "@/components/xpace-dance/SettingsWorkspace";
import StudentProfileWorkspace from "@/components/xpace-dance/StudentProfileWorkspace";
import { XPayAccount, XPayBenefits, XPayStore } from "@/components/xpace-dance/XPayWorkspace";

const modules = [
  { icon: UsersRound, title: "CLIENTES", description: "Alunos e responsáveis", accent: "lilac" },
  { icon: LayoutDashboard, title: "DASHBOARD", description: "Visão geral", accent: "violet" },
  { icon: MessagesSquare, title: "CRM", description: "Relacionamento", accent: "pink" },
  { icon: CalendarDays, title: "AGENDA", description: "Turmas e horários", accent: "blue" },
  { icon: WalletCards, title: "FINANCEIRO", description: "Cobranças e pagamentos", accent: "violet" },
  { icon: Package, title: "ESTOQUE", description: "Materiais e uniformes", accent: "lilac" },
  { icon: ReceiptText, title: "COMANDA", description: "Consumos e pedidos", accent: "pink" },
  { icon: ClipboardList, title: "ADMINISTRATIVO", description: "Operação interna", accent: "violet" },
  { icon: SlidersHorizontal, title: "CONFIGURAÇÕES", description: "Preferências", accent: "lilac" },
  { icon: ShoppingBag, title: "LOJA", description: "Produtos e inscrições", accent: "blue" },
];

export default function DanceWorkspace() {
  const router = useRouter();
  const [screen, setScreen] = useState<"HOME" | "COMMUNITY" | "PROFILE" | "AGENDA" | "FINANCE" | "ADMINISTRATIVE" | "CONTRACTS" | "SERVICES" | "MODALITIES" | "INSTRUCTORS" | "SETTINGS" | "ROOMS" | "STORE" | "XPAY_BENEFITS" | "XPAY_ACCOUNT">("HOME");
  const [profileId, setProfileId] = useState("");
  const activeModule = screen === "COMMUNITY" || screen === "PROFILE" ? "CLIENTES" : screen === "AGENDA" ? "AGENDA" : screen === "FINANCE" ? "FINANCEIRO" : screen === "ADMINISTRATIVE" || screen === "CONTRACTS" || screen === "SERVICES" || screen === "MODALITIES" || screen === "INSTRUCTORS" || screen === "ROOMS" ? "ADMINISTRATIVO" : screen === "SETTINGS" ? "CONFIGURAÇÕES" : screen === "STORE" || screen === "XPAY_BENEFITS" || screen === "XPAY_ACCOUNT" ? "LOJA" : null;
  const returnScreen = screen === "PROFILE" ? "COMMUNITY" : screen === "CONTRACTS" || screen === "SERVICES" || screen === "MODALITIES" || screen === "INSTRUCTORS" || screen === "ROOMS" ? "ADMINISTRATIVE" : screen === "XPAY_BENEFITS" || screen === "XPAY_ACCOUNT" ? "STORE" : "HOME";
  const returnTitle = screen === "PROFILE" ? "Voltar à Comunidade" : screen === "CONTRACTS" || screen === "SERVICES" || screen === "MODALITIES" || screen === "INSTRUCTORS" || screen === "ROOMS" ? "Voltar ao Administrativo" : screen === "XPAY_BENEFITS" || screen === "XPAY_ACCOUNT" ? "Voltar à Loja" : "Voltar ao Painel";

  const topbar = <header className="xd-topbar">
    <div className="xd-brand" aria-label="XPACE Escola de Dança"><img className="xd-brand-logo" src="/brands/xpace-logo.png" alt="XPACE" /><span className="xd-school-name">ESCOLA DE DANÇA</span></div>
    {activeModule ? <div className="xd-topbar-context"><button type="button" className="xd-active-module xd-active-module--return" onClick={() => setScreen(returnScreen)} title={returnTitle}><span>MÓDULO ATIVO</span><strong>{activeModule}</strong></button></div> : <button type="button" className="xd-back" onClick={() => router.push("/")}>CENTRAL</button>}
  </header>;

  if (screen === "COMMUNITY") return <main className="xd-shell">{topbar}<CommunityWorkspace onOpenProfile={(id) => { setProfileId(id); setScreen("PROFILE"); }} /></main>;
  if (screen === "PROFILE" && profileId) return <main className="xd-shell">{topbar}<StudentProfileWorkspace studentId={profileId} /></main>;
  if (screen === "AGENDA") return <main className="xd-shell">{topbar}<AgendaWorkspace /></main>;
  if (screen === "FINANCE") return <main className="xd-shell">{topbar}<section className="xd-finance"><header><span>FINANCEIRO</span><h1>CONTROLE FINANCEIRO.</h1><p>Escolha uma área para começar a estruturar a operação da escola.</p></header><div>{["CAIXA", "CONTAS A PAGAR", "CONTAS A RECEBER", "CONTAS FINANCEIRAS", "XPACEPAY"].map((item, index) => <button key={item} type="button"><i>{String(index + 1).padStart(2, "0")}</i><strong>{item}</strong><small>EM PREPARAÇÃO</small></button>)}</div></section></main>;
  if (screen === "STORE") return <main className="xd-shell">{topbar}<XPayStore onOpenBenefits={() => setScreen("XPAY_BENEFITS")} onOpenAccount={() => setScreen("XPAY_ACCOUNT")} /></main>;
  if (screen === "XPAY_BENEFITS") return <main className="xd-shell">{topbar}<XPayBenefits onOpenAccount={() => setScreen("XPAY_ACCOUNT")} onBack={() => setScreen("STORE")} /></main>;
  if (screen === "XPAY_ACCOUNT") return <main className="xd-shell">{topbar}<XPayAccount onBack={() => setScreen("STORE")} /></main>;
  if (screen === "ADMINISTRATIVE") return <main className="xd-shell">{topbar}<AdministrativeWorkspace onOpenContracts={() => setScreen("CONTRACTS")} onOpenServices={() => setScreen("SERVICES")} onOpenModalities={() => setScreen("MODALITIES")} onOpenInstructors={() => setScreen("INSTRUCTORS")} onOpenRooms={() => setScreen("ROOMS")} /></main>;
  if (screen === "CONTRACTS") return <main className="xd-shell">{topbar}<ContractsWorkspace /></main>;
  if (screen === "SERVICES") return <main className="xd-shell">{topbar}<ServicesWorkspace /></main>;
  if (screen === "MODALITIES") return <main className="xd-shell">{topbar}<ModalitiesWorkspace /></main>;
  if (screen === "INSTRUCTORS") return <main className="xd-shell">{topbar}<InstructorsWorkspace /></main>;
  if (screen === "SETTINGS") return <main className="xd-shell">{topbar}<SettingsWorkspace /></main>;
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

    <section className="xd-modules" aria-label="Módulos da XPACE Escola de Dança">
      {modules.map(({ icon: Icon, title, description, accent }) => <button className={`xd-module xd-module--${accent}`} type="button" key={title} title={`${title}: ${["CLIENTES", "AGENDA", "FINANCEIRO", "ADMINISTRATIVO", "CONFIGURAÇÕES", "LOJA"].includes(title) ? "abrir módulo" : "em preparação"}`} onClick={() => title === "CLIENTES" ? setScreen("COMMUNITY") : title === "AGENDA" ? setScreen("AGENDA") : title === "FINANCEIRO" ? setScreen("FINANCE") : title === "ADMINISTRATIVO" ? setScreen("ADMINISTRATIVE") : title === "CONFIGURAÇÕES" ? setScreen("SETTINGS") : title === "LOJA" ? setScreen("STORE") : undefined}>
        <span className="xd-module-icon"><Icon size={20} aria-hidden="true" /></span>
        <span className="xd-module-copy"><strong>{title}</strong><small>{description}</small></span>
        <ArrowUpRight className="xd-module-arrow" size={17} aria-hidden="true" />
      </button>)}
    </section>
    <BuildRevision />
  </main>;
}

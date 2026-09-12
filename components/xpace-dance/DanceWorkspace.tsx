"use client";

import { ArrowUpRight, BarChart3, CalendarDays, ClipboardList, DoorOpen, LayoutDashboard, MessagesSquare, Package, ReceiptText, ShoppingBag, SlidersHorizontal, Sparkles, UsersRound, WalletCards } from "lucide-react";
import { useRouter } from "next/navigation";

const modules = [
  { icon: UsersRound, title: "COMUNIDADE", description: "Alunos e responsáveis", legacy: "Clientes", accent: "lilac" },
  { icon: MessagesSquare, title: "CONEXÕES", description: "Relacionamento", legacy: "CRM", accent: "pink" },
  { icon: CalendarDays, title: "RITMO", description: "Turmas e horários", legacy: "Agenda", accent: "blue" },
  { icon: WalletCards, title: "FLUXO", description: "Cobranças e pagamentos", legacy: "Financeiro", accent: "violet" },
  { icon: Package, title: "ACERVO", description: "Materiais e uniformes", legacy: "Estoque", accent: "lilac" },
  { icon: ReceiptText, title: "BALCÃO", description: "Vendas e consumos", legacy: "Comanda", accent: "pink" },
  { icon: BarChart3, title: "PULSO", description: "Indicadores", legacy: "Relatórios", accent: "blue" },
  { icon: ClipboardList, title: "BASTIDORES", description: "Operação interna", legacy: "Administrativo", accent: "violet" },
  { icon: SlidersHorizontal, title: "AJUSTES", description: "Preferências", legacy: "Configurações", accent: "lilac" },
  { icon: DoorOpen, title: "ESTÚDIO", description: "Salas e recursos", legacy: "Recursos", accent: "pink" },
  { icon: ShoppingBag, title: "VITRINE", description: "Produtos e inscrições", legacy: "Loja", accent: "blue" },
  { icon: LayoutDashboard, title: "PANORAMA", description: "Visão geral", legacy: "Dashboard", accent: "violet" },
];

export default function DanceWorkspace() {
  const router = useRouter();

  return <main className="xd-shell">
    <header className="xd-topbar">
      <div className="xd-brand" aria-label="XPACE Escola de Dança">
        <img className="xd-brand-logo" src="/brands/xpace-logo.png" alt="XPACE" />
        <span className="xd-school-name">ESCOLA DE DANÇA</span>
      </div>
      <button type="button" className="xd-back" onClick={() => router.push("/")}>CENTRAL</button>
    </header>

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
      {modules.map(({ icon: Icon, title, description, legacy, accent }) => <button className={`xd-module xd-module--${accent}`} type="button" key={title} title={`${title}: em preparação`}>
        <span className="xd-module-icon"><Icon size={20} aria-hidden="true" /></span>
        <span className="xd-module-copy"><strong>{title}</strong><small>{description} <em>({legacy})</em></small></span>
        <ArrowUpRight className="xd-module-arrow" size={17} aria-hidden="true" />
      </button>)}
    </section>
  </main>;
}

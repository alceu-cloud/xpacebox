"use client";

import { ArrowUpRight, BarChart3, CalendarDays, ClipboardList, DoorOpen, LayoutDashboard, MessagesSquare, Package, ReceiptText, ShoppingBag, SlidersHorizontal, Sparkles, UsersRound, WalletCards } from "lucide-react";
import { useRouter } from "next/navigation";

const modules = [
  { icon: UsersRound, title: "Comunidade", description: "Alunos e responsáveis", accent: "lilac" },
  { icon: MessagesSquare, title: "Conexões", description: "Relacionamento", accent: "pink" },
  { icon: CalendarDays, title: "Ritmo", description: "Turmas e horários", accent: "blue" },
  { icon: WalletCards, title: "Fluxo", description: "Cobranças e pagamentos", accent: "violet" },
  { icon: Package, title: "Acervo", description: "Materiais e uniformes", accent: "lilac" },
  { icon: ReceiptText, title: "Balcão", description: "Vendas e consumos", accent: "pink" },
  { icon: BarChart3, title: "Pulso", description: "Indicadores", accent: "blue" },
  { icon: ClipboardList, title: "Bastidores", description: "Operação interna", accent: "violet" },
  { icon: SlidersHorizontal, title: "Ajustes", description: "Preferências", accent: "lilac" },
  { icon: DoorOpen, title: "Estúdio", description: "Salas e recursos", accent: "pink" },
  { icon: ShoppingBag, title: "Vitrine", description: "Produtos e inscrições", accent: "blue" },
  { icon: LayoutDashboard, title: "Panorama", description: "Visão geral", accent: "violet" },
];

export default function DanceWorkspace() {
  const router = useRouter();

  return <main className="xd-shell">
    <header className="xd-topbar">
      <button type="button" className="xd-brand" onClick={() => router.push("/")} aria-label="Voltar para empresas">
        <span className="xd-logo-crop"><img src="/brands/xpace-dance-logo-1.png" alt="XPACE" /></span>
        <span className="xd-school-name">ESCOLA DE DANÇA</span>
      </button>
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
        <div className="xd-motion-tag xd-tag-salao">SALÃO</div>
        <div className="xd-motion-trail" />
      </div>
    </section>

    <section className="xd-modules" aria-label="Módulos da XPACE Escola de Dança">
      {modules.map(({ icon: Icon, title, description, accent }) => <button className={`xd-module xd-module--${accent}`} type="button" key={title} title={`${title}: em preparação`}>
        <span className="xd-module-icon"><Icon size={20} aria-hidden="true" /></span>
        <span className="xd-module-copy"><strong>{title}</strong><small>{description}</small></span>
        <ArrowUpRight className="xd-module-arrow" size={17} aria-hidden="true" />
      </button>)}
    </section>
  </main>;
}

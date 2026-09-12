"use client";

import { CalendarDays, CreditCard, Music2, UsersRound } from "lucide-react";
import { useRouter } from "next/navigation";

const foundations = [
  { icon: UsersRound, title: "Alunos e responsáveis", description: "Cadastros, contatos e situação do aluno." },
  { icon: CreditCard, title: "Planos e mensalidades", description: "Planos, vencimentos, cobranças e pagamentos." },
  { icon: CalendarDays, title: "Turmas e agenda", description: "Modalidades, professores, horários e presença." },
];

export default function DanceWorkspace() {
  const router = useRouter();

  return <main className="xd-shell">
    <header className="xd-topbar">
      <button type="button" className="xd-brand" onClick={() => router.push("/")} aria-label="Voltar para empresas">
        <Music2 size={24} aria-hidden="true" />
        <span>XPACE</span>
        <small>DANÇA</small>
      </button>
      <button type="button" className="xd-back" onClick={() => router.push("/")}>CENTRAL</button>
    </header>

    <section className="xd-intro">
      <span>AMBIENTE ISOLADO</span>
      <h1>GESTÃO DA XPACE DANÇA.</h1>
      <p>Este ambiente nasce separado da Dawos. Vamos construir a operação da escola por etapas, antes de importar os dados do NextFit.</p>
    </section>

    <section className="xd-foundations" aria-label="Etapas da implantação">
      {foundations.map(({ icon: Icon, title, description }, index) => <article className="xd-foundation" key={title}>
        <div className="xd-foundation-icon"><Icon size={23} aria-hidden="true" /></div>
        <small>ETAPA {String(index + 1).padStart(2, "0")}</small>
        <h2>{title}</h2>
        <p>{description}</p>
        <span>PLANEJAMENTO</span>
      </article>)}
    </section>

    <section className="xd-next-step">
      <div><span>PRÓXIMO PASSO</span><h2>DEFINIR O CADASTRO BASE.</h2></div>
      <p>Primeiro desenhamos as informações de aluno, responsável e plano. A importação só acontece depois de validar esse modelo.</p>
    </section>
  </main>;
}

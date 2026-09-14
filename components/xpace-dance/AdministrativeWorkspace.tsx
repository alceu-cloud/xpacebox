"use client";

import { FileText, Landmark, Settings2, ShieldCheck } from "lucide-react";

const areas = [
  { icon: FileText, title: "CONTRATOS", copy: "Catálogo comercial e regras de matrícula", available: true },
  { icon: Landmark, title: "CADASTROS FINANCEIROS", copy: "Categorias e configurações de receita", available: false },
  { icon: ShieldCheck, title: "PERMISSÕES", copy: "Acessos e regras operacionais", available: false },
  { icon: Settings2, title: "PREFERÊNCIAS", copy: "Parâmetros administrativos da escola", available: false },
];

export default function AdministrativeWorkspace({ onOpenContracts }: { onOpenContracts: () => void }) {
  return <section className="xd-administration">
    <header className="xd-administration-title"><span>OPERAÇÃO INTERNA</span><h1>ADMINISTRATIVO.</h1><p>Cadastros e parâmetros que organizam o funcionamento da escola.</p></header>
    <div className="xd-administration-grid">
      {areas.map(({ icon: Icon, title, copy, available }) => <button key={title} type="button" className="xd-administration-card" disabled={!available} onClick={available ? onOpenContracts : undefined} title={available ? "Abrir contratos" : "Em preparação"}>
        <span><Icon size={22} /></span><strong>{title}</strong><small>{copy}</small>
      </button>)}
    </div>
  </section>;
}

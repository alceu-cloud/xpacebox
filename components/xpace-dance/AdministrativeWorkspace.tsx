"use client";

import { FileText } from "lucide-react";

const areas = [
  { icon: FileText, title: "CONTRATOS", copy: "Catálogo comercial e regras de matrícula", available: true },
];

export default function AdministrativeWorkspace({ onOpenContracts }: { onOpenContracts: () => void }) {
  return <section className="xd-administration">
    <header className="xd-administration-title"><span>OPERAÇÃO INTERNA</span><h1>ADMINISTRATIVO.</h1><p>Cadastros e parâmetros que organizam o funcionamento da escola.</p></header>
    <div className="xd-administration-grid xd-administration-grid--single">
      {areas.map(({ icon: Icon, title, copy, available }) => <button key={title} type="button" className="xd-administration-card" disabled={!available} onClick={available ? onOpenContracts : undefined} title={available ? "Abrir contratos" : "Em preparação"}>
        <span><Icon size={22} /></span><strong>{title}</strong><small>{copy}</small>
      </button>)}
    </div>
  </section>;
}

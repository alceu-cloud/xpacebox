"use client";

import { FileText, ListChecks, GraduationCap } from "lucide-react";

const areas = [
  { icon: FileText, title: "CONTRATOS", copy: "Catálogo comercial e regras de matrícula" },
  { icon: ListChecks, title: "MODALIDADES", copy: "Agenda e vínculos de integrações" },
  { icon: GraduationCap, title: "PROFESSORES", copy: "Responsáveis pelas modalidades" },
];

export default function AdministrativeWorkspace({ onOpenContracts, onOpenModalities, onOpenInstructors }: { onOpenContracts: () => void; onOpenModalities: () => void; onOpenInstructors: () => void }) {
  return <section className="xd-administration">
    <header className="xd-administration-title"><span>OPERAÇÃO INTERNA</span><h1>ADMINISTRATIVO.</h1><p>Cadastros e parâmetros que organizam o funcionamento da escola.</p></header>
    <div className="xd-administration-grid">
      {areas.map(({ icon: Icon, title, copy }) => <button key={title} type="button" className="xd-administration-card" onClick={title === "CONTRATOS" ? onOpenContracts : title === "MODALIDADES" ? onOpenModalities : onOpenInstructors} title={title === "CONTRATOS" ? "Abrir contratos" : title === "MODALIDADES" ? "Abrir modalidades" : "Abrir professores"}>
        <span><Icon size={22} /></span><strong>{title}</strong><small>{copy}</small>
      </button>)}
    </div>
  </section>;
}

"use client";

import { DoorOpen, FileText, GraduationCap, ListChecks, PackagePlus } from "lucide-react";

const areas = [
  { icon: FileText, title: "CONTRATOS", copy: "Catálogo comercial e regras de matrícula" },
  { icon: PackagePlus, title: "SERVIÇOS", copy: "Taxas, matrículas e itens para venda" },
  { icon: ListChecks, title: "MODALIDADES", copy: "Agenda e vínculos de integrações" },
  { icon: GraduationCap, title: "PROFESSORES", copy: "Responsáveis pelas modalidades" },
  { icon: DoorOpen, title: "SALAS", copy: "Espaços e estrutura para as aulas" },
];

export default function AdministrativeWorkspace({ onOpenContracts, onOpenServices, onOpenModalities, onOpenInstructors, onOpenRooms }: { onOpenContracts: () => void; onOpenServices: () => void; onOpenModalities: () => void; onOpenInstructors: () => void; onOpenRooms: () => void }) {
  return <section className="xd-administration">
    <header className="xd-administration-title"><span>OPERAÇÃO INTERNA</span><h1>ADMINISTRATIVO.</h1><p>Cadastros e parâmetros que organizam o funcionamento da escola.</p></header>
    <div className="xd-administration-grid">
      {areas.map(({ icon: Icon, title, copy }) => <button key={title} type="button" className="xd-administration-card" onClick={title === "CONTRATOS" ? onOpenContracts : title === "SERVIÇOS" ? onOpenServices : title === "MODALIDADES" ? onOpenModalities : title === "PROFESSORES" ? onOpenInstructors : onOpenRooms} title={title === "CONTRATOS" ? "Abrir contratos" : title === "SERVIÇOS" ? "Abrir serviços" : title === "MODALIDADES" ? "Abrir modalidades" : title === "PROFESSORES" ? "Abrir professores" : "Abrir salas"}>
        <span><Icon size={22} /></span><strong>{title}</strong><small>{copy}</small>
      </button>)}
    </div>
  </section>;
}

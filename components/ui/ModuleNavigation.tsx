"use client";

import { Boxes, ChartNoAxesCombined, ContactRound, Settings2, Wallet, Calculator } from "lucide-react";
import type { CSSProperties } from "react";

const icons = { gerenciador: Settings2, clientes: ContactRound, produtos: Boxes, "formacao-preco": Calculator, financeiro: Wallet, relatorios: ChartNoAxesCombined };
type ModuleKey = keyof typeof icons;
type Module = { key: ModuleKey; nome: string; descricao: string; cor: string };

export default function ModuleNavigation({ company, modules, active, onSelect }: {
  company: string;
  modules: Module[];
  active: ModuleKey | null;
  onSelect: (key: ModuleKey) => void;
}) {
  return (
    <nav className="xb-module-strip" aria-label="Módulos da empresa">
      <div className="xb-module-strip-heading"><span>Ambiente {company.toUpperCase()}</span></div>
      <div className="xb-module-list">
        {modules.map((module) => {
          const Icon = icons[module.key];
          return (
            <button key={module.key} type="button" onClick={() => onSelect(module.key)}
              className={`xb-module-chip${active === module.key ? " is-active" : ""}`}
              style={{ "--xb-module-color": module.cor } as CSSProperties}
              aria-current={active === module.key ? "page" : undefined} title={module.descricao}>
              <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
              <strong>{module.nome}</strong>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

import { Link2, Network } from "lucide-react";
import { linkHubAddon, linkHubSections, publicLinkHubPath } from "@/lib/saas/link-hub";
import "./link-hub-preparation.css";

type Props = { companySlug: string; companyName: string; exempt: boolean; onOpen?: () => void };

export default function LinkHubPreparation({ companySlug, companyName, exempt, onOpen }: Props) {
  const monthlyPrice = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(linkHubAddon.monthlyCents / 100);
  let plannedPath: string | null = null;
  try { plannedPath = publicLinkHubPath(companySlug); } catch { /* A prévia não deve impedir o acesso à loja por um slug legado inválido. */ }

  return <article className="saas-link-hub">
    <div className="xd-xpay-card-visual saas-link-hub-visual" aria-hidden="true">
      <div className="xd-xpay-mark"><Network size={42} /><i><Link2 size={12} /></i></div>
      <span>LINKS</span>
    </div>
    <div className="saas-link-hub-copy">
    <header className="saas-link-hub-heading">
      <div><h2>{linkHubAddon.name}</h2><span className="saas-link-hub-status">{onOpen ? "DISPONÍVEL NA XPACE" : "PREPARAÇÃO"}</span></div>
      <strong className="saas-link-hub-price">{exempt ? "Isento de mensalidade" : `${monthlyPrice} / mês`}</strong>
    </header>
    <p>Uma página com a identidade da empresa para reunir contratos, produtos, eventos e agendamento de aulas experimentais.</p>
    {onOpen ? <button type="button" className="xd-secondary" onClick={onOpen}>ABRIR ÁRVORE DE LINKS</button> : <p className="saas-link-hub-note">Adicional em preparação. Contratação e publicação ainda indisponíveis.</p>}
    {onOpen ? <p className="saas-link-hub-note">Edite seus links, personalize a aparência e veja como a página ficará para o visitante.</p> : <details className="saas-link-hub-preview">
      <summary>Ver prévia da árvore de links</summary>
      <div className="saas-link-hub-preview-content">
        <strong className="saas-link-hub-company">{companyName}</strong>
        <p>Prévia da estrutura. As seções abaixo ainda não abrem páginas.</p>
        <ul className="saas-link-hub-sections">
          {linkHubSections.map(section => <li key={section.code}><h3>{section.title}</h3><p>{section.description}</p></li>)}
        </ul>
        <p className="saas-link-hub-address">Endereço: <code>{plannedPath || "A definir"}</code><small>{onOpen ? "Configure os links e ative a página no editor." : "Não publicado. Nenhum endereço público ativo nesta preparação."}</small></p>
      </div>
    </details>}
    </div>
  </article>;
}

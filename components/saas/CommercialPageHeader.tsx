"use client";
import Link from "next/link";
import { allowWorkspaceNavigation } from "@/components/navigation/navigation-guard";
import { companyLogo } from "@/lib/company-branding";

export default function CommercialPageHeader({ companySlug }: { companySlug: string }) {
  const home = companySlug === "xpace" ? "/xpace" : `/empresa/${encodeURIComponent(companySlug)}`;
  const logo = companySlug === "xpace" ? "/brands/xpace-logo.png" : companyLogo(companySlug);
  return <header className="saas-page-topbar"><Link href={home} aria-label="Ir para o início da empresa" onClick={event => { if (!allowWorkspaceNavigation()) event.preventDefault(); }}>{logo ? <img src={logo} alt={companySlug.toUpperCase()} /> : <strong>{companySlug.toUpperCase()}</strong>}</Link><span>ÁREA DA EMPRESA</span></header>;
}

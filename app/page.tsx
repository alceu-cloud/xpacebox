"use client";

import BrandLogo from "@/components/ui/BrandLogo";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase";

type Company = { id: string; name: string; slug: string };
const xpaceCompanySlug = "xpace";

export default function HomePage() {
  const router = useRouter();
  const [role, setRole] = useState("");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [provisioningXpace, setProvisioningXpace] = useState(false);
  const [xpaceMessage, setXpaceMessage] = useState("");

  useEffect(() => { void loadData(); }, []);

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace("/login"); return; }
    const { data: profile } = await supabase.from("profiles").select("platform_role").eq("id", user.id).single();
    const userRole = profile?.platform_role ?? "company_user";
    setRole(userRole);
    if (userRole === "platform_owner") {
      const { data } = await supabase.from("companies").select("id, name, slug").eq("active", true).order("name");
      setCompanies(data ?? []);
      setLoading(false);
      return;
    }
    const { data: memberships } = await supabase.from("company_members").select("company_id").eq("profile_id", user.id).eq("active", true);
    const companyIds = memberships?.map((item) => item.company_id) ?? [];
    if (!companyIds.length) { setLoading(false); return; }
    const { data } = await supabase.from("companies").select("id, name, slug").in("id", companyIds).eq("active", true);
    const empresas = data ?? [];
    if (empresas.length === 1) { router.replace(`/empresa/${empresas[0].slug}`); return; }
    setCompanies(empresas);
    setLoading(false);
  }

  async function logout() { await supabase.auth.signOut(); router.replace("/login"); }

  function openCompany(company: Company) {
    router.push(company.slug === xpaceCompanySlug ? "/xpace" : `/empresa/${company.slug}`);
  }

  async function provisionXpace() {
    setProvisioningXpace(true);
    setXpaceMessage("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("SESSAO NAO ENCONTRADA.");
      const response = await fetch("/api/empresas/xpace", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` } });
      const payload = await response.json();
      if (!response.ok || !payload.success || !payload.company) throw new Error(payload.message || "NAO FOI POSSIVEL CRIAR A XPACE.");
      const company = payload.company as Company;
      setCompanies((current) => [...current.filter((item) => item.id !== company.id), company].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
      setXpaceMessage("XPACE DANCA CRIADA. ABRA O NOVO AMBIENTE.");
    } catch (error) {
      setXpaceMessage(error instanceof Error ? error.message : "NAO FOI POSSIVEL CRIAR A XPACE.");
    } finally {
      setProvisioningXpace(false);
    }
  }

  if (loading) return <main className="xb-central"><section className="xb-central-loading"><BrandLogo priority /><p>Carregando sua central</p></section></main>;

  return (
    <main className="xb-central">
      <header className="xb-central-topbar"><BrandLogo priority /><button type="button" className="xb-topbar-action" onClick={logout}>Sair</button></header>
      <section className="xb-central-intro"><span>{role === "platform_owner" ? "Administração" : "Empresas"}</span><h1>Escolha onde trabalhar.</h1><p>Seus painéis, empresas e acessos em um único lugar.</p></section>
      <section className="xb-company-grid" aria-label="Painéis disponíveis">
        {role === "platform_owner" ? <button type="button" className="xb-company-card xb-company-card--admin" onClick={() => router.push("/usuarios")}><small>Administração</small><strong>Usuários</strong><span>Gerenciar acessos</span><i aria-hidden="true">01</i></button> : null}
        {companies.map((company, index) => <button key={company.id} type="button" className={`xb-company-card${company.slug === xpaceCompanySlug ? " xb-company-card--xpace" : company.slug === "dawos" ? " xb-company-card--dawos" : " xb-company-card--tenant"}`} onClick={() => openCompany(company)}><small>Empresa</small><strong>{company.name}</strong><span>Abrir painel</span><i aria-hidden="true">{String(index + (role === "platform_owner" ? 2 : 1)).padStart(2, "0")}</i></button>)}
        {role === "platform_owner" && !companies.some((company) => company.slug === xpaceCompanySlug) ? <button type="button" className="xb-company-card xb-company-card--xpace" onClick={() => void provisionXpace()} disabled={provisioningXpace}><small>Nova empresa</small><strong>XPACE Dança</strong><span>{provisioningXpace ? "Criando ambiente..." : "Ativar ambiente"}</span><i aria-hidden="true">03</i></button> : null}
        {role === "platform_owner" ? <div className="xb-company-card xb-company-card--waiting" aria-label="Próxima empresa"><small>Nova empresa</small><strong>Próxima vaga</strong><span>Aguardando cadastro</span><i aria-hidden="true">+</i></div> : null}
      </section>
      {xpaceMessage ? <p className="xb-central-message" role="status">{xpaceMessage}</p> : null}
      {!companies.length ? <p className="xb-central-empty">Nenhuma empresa disponível.</p> : null}
    </main>
  );
}

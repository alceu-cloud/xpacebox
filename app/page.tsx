"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase";

type Company = { id: string; name: string; slug: string };

export default function HomePage() {
  const router = useRouter();
  const [role, setRole] = useState("");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

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

  if (loading) return <main className="xb-central"><section className="xb-central-loading"><Image src="/xpacebox-logo-light.svg" alt="XPACEBOX" width={900} height={220} priority /><p>Carregando sua central</p></section></main>;

  return (
    <main className="xb-central">
      <header className="xb-central-topbar"><Image src="/xpacebox-logo-light.svg" alt="XPACEBOX" width={900} height={220} priority /><button type="button" className="xb-topbar-action" onClick={logout}>Sair</button></header>
      <section className="xb-central-intro"><span>{role === "platform_owner" ? "Administração" : "Empresas"}</span><h1>Escolha onde trabalhar.</h1><p>Seus painéis, empresas e acessos em um único lugar.</p></section>
      <section className="xb-company-grid" aria-label="Painéis disponíveis">
        {role === "platform_owner" ? <button type="button" className="xb-company-card xb-company-card--admin" onClick={() => router.push("/usuarios")}><small>Administração</small><strong>Usuários</strong><span>Gerenciar acessos</span><i aria-hidden="true">01</i></button> : null}
        {companies.map((company, index) => <button key={company.id} type="button" className="xb-company-card" onClick={() => router.push(`/empresa/${company.slug}`)}><small>Empresa</small><strong>{company.name}</strong><span>Abrir painel</span><i aria-hidden="true">{String(index + 1).padStart(2, "0")}</i></button>)}
        {role === "platform_owner" ? <div className="xb-company-card xb-company-card--waiting" aria-label="Próxima empresa"><small>Nova empresa</small><strong>Próxima vaga</strong><span>Aguardando cadastro</span><i aria-hidden="true">+</i></div> : null}
      </section>
      {!companies.length ? <p className="xb-central-empty">Nenhuma empresa disponível.</p> : null}
    </main>
  );
}

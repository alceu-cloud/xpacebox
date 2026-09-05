"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase";

type Company = {
  id: string;
  name: string;
  slug: string;
};

export default function HomePage() {
  const router = useRouter();

  const [role, setRole] = useState("");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.replace("/login");
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("platform_role")
      .eq("id", user.id)
      .single();

    const userRole = profile?.platform_role ?? "company_user";
    setRole(userRole);

    if (userRole === "platform_owner") {
      const { data } = await supabase
        .from("companies")
        .select("id, name, slug")
        .eq("active", true)
        .order("name");

      setCompanies(data ?? []);
      setLoading(false);
      return;
    }

    const { data: memberships } = await supabase
      .from("company_members")
      .select("company_id")
      .eq("profile_id", user.id)
      .eq("active", true);

    const companyIds = memberships?.map((item) => item.company_id) ?? [];

    if (companyIds.length === 0) {
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from("companies")
      .select("id, name, slug")
      .in("id", companyIds)
      .eq("active", true);

    const empresas = data ?? [];

    if (empresas.length === 1) {
      router.replace(`/empresa/${empresas[0].slug}`);
      return;
    }

    setCompanies(empresas);
    setLoading(false);
  }

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (loading) {
    return (
      <main className="xb-central">
        <section className="xb-central-loading">
          <Image
            src="/xpacebox-logo-light.svg"
            alt="XPACEBOX"
            width={900}
            height={220}
            priority
            className="xb-central-loading-logo"
          />
          <p>Carregando sua central...</p>
        </section>
      </main>
    );
  }

  return (
    <main className="xb-central">
      <section className="xb-central-panel">
        <header className="xb-central-header">
          <Image
            src="/xpacebox-logo-light.svg"
            alt="XPACEBOX"
            width={900}
            height={220}
            priority
            className="xb-central-logo"
          />

          <button type="button" onClick={logout} className="xb-central-logout">
            Sair
          </button>
        </header>

        <div className="xb-central-rule" />

        <section className="xb-central-intro">
          <span className="xb-central-kicker">
            {role === "platform_owner" ? "Administracao" : "Empresas"}
          </span>

          <h1>CENTRAL XPACEBOX</h1>

          <p>
            ESCOLHA O PAINEL DE TRABALHO DESEJADO.
          </p>
        </section>

        <section className="xb-central-actions">
          <div className="xb-central-shortcuts">
            {role === "platform_owner" ? <button type="button" onClick={() => router.push("/usuarios")} className="xb-central-shortcut xb-central-shortcut-admin">
              <span>ADMINISTRACAO</span>
              <strong>USUARIOS</strong>
              <small>GERENCIAR ACESSOS</small>
            </button> : null}

            {companies.map((company, index) => (
              <button key={company.id} type="button" onClick={() => router.push(`/empresa/${company.slug}`)} className="xb-central-shortcut xb-central-shortcut-company">
                <span>EMPRESA {String(index + 1).padStart(2, "0")}</span>
                <strong>{company.name.toUpperCase()}</strong>
                <small>ABRIR PAINEL</small>
              </button>
            ))}

            {role === "platform_owner" ? <div aria-label="Proxima empresa" className="xb-central-shortcut xb-central-shortcut-inactive">
              <span>NOVA EMPRESA</span>
              <strong>PROXIMA VAGA</strong>
              <small>AGUARDANDO CADASTRO</small>
            </div> : null}
          </div>

          {companies.length === 0 ? <div className="xb-central-empty">NENHUMA EMPRESA DISPONIVEL.</div> : null}
        </section>
      </section>
    </main>
  );
}

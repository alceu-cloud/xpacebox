"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

type Company = {
  id: string;
  name: string;
  slug: string;
};

export default function HomePage() {
  const router = useRouter();

  const [name, setName] = useState("");
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
      .select("full_name, platform_role")
      .eq("id", user.id)
      .single();

    setName(profile?.full_name ?? user.email ?? "Usuário");
    setRole(profile?.platform_role ?? "company_user");

    if (profile?.platform_role === "platform_owner") {
      const { data } = await supabase
        .from("companies")
        .select("id, name, slug")
        .eq("active", true)
        .order("name");

      setCompanies(data ?? []);
    } else {
      const { data: memberships } = await supabase
        .from("company_members")
        .select("company_id")
        .eq("profile_id", user.id)
        .eq("active", true);

      const companyIds = memberships?.map((item) => item.company_id) ?? [];

      if (companyIds.length > 0) {
        const { data } = await supabase
          .from("companies")
          .select("id, name, slug")
          .in("id", companyIds)
          .eq("active", true);

        setCompanies(data ?? []);
      }
    }

    setLoading(false);
  }

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (loading) {
    return <main style={{ padding: 40 }}>Carregando...</main>;
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 40,
        background: "#0f172a",
        color: "#ffffff",
        fontFamily: "Arial",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <h1>XPACEBOX</h1>
          <p>Olá, {name}</p>
        </div>

        <button onClick={logout}>Sair</button>
      </div>

      {role === "platform_owner" && (
        <section style={{ marginTop: 40 }}>
          <h2>Administração da plataforma</h2>

          <div style={{ display: "flex", gap: 16 }}>
            <button style={{ padding: 20 }}>Usuários</button>
            <button style={{ padding: 20 }}>Empresas</button>
          </div>
        </section>
      )}

      <section style={{ marginTop: 40 }}>
        <h2>Empresas disponíveis</h2>

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {companies.map((company) => (
            <button
              key={company.id}
              onClick={() => router.push(`/empresa/${company.slug}`)}
              style={{
                width: 240,
                padding: 30,
                borderRadius: 12,
                cursor: "pointer",
              }}
            >
              <strong>{company.name}</strong>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
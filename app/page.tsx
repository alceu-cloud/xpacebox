"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import LoginBackground from "@/components/login/LoginBackground";
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

    const userRole = profile?.platform_role ?? "company_user";

    setName(profile?.full_name ?? user.email ?? "USUÁRIO");
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

    const companyIds =
      memberships?.map((item) => item.company_id) ?? [];

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
      <LoginBackground>
        <div style={loadingStyle}>
          <Image
            src="/logo-xpacebox.png"
            alt="XPACEBOX"
            width={360}
            height={180}
            priority
            style={{
              width: "360px",
              maxWidth: "90%",
              height: "auto",
            }}
          />

          <p style={loadingTextStyle}>
            CARREGANDO SUA CENTRAL...
          </p>
        </div>
      </LoginBackground>
    );
  }

  return (
    <LoginBackground>
      <section style={panelStyle}>
        <header style={headerStyle}>
          <div>
            <Image
              src="/logo-xpacebox.png"
              alt="XPACEBOX"
              width={360}
              height={180}
              priority
              style={{
                width: "330px",
                maxWidth: "100%",
                height: "auto",
              }}
            />

            <p style={welcomeStyle}>
              OLÁ, {name.toUpperCase()}
            </p>
          </div>

          <button onClick={logout} style={logoutButtonStyle}>
            SAIR
          </button>
        </header>

        <div style={dividerStyle} />

        {role === "platform_owner" && (
          <section style={sectionStyle}>
            <div style={sectionHeaderStyle}>
              <div>
                <span style={eyebrowStyle}>
                  ADMINISTRAÇÃO
                </span>

                <h1 style={titleStyle}>
                  CENTRAL XPACEBOX
                </h1>

                <p style={descriptionStyle}>
                  ESCOLHA ONDE DESEJA ENTRAR.
                </p>
              </div>
            </div>

            <div style={gridStyle}>
  <button
    onClick={() => router.push("/usuarios")}
    style={actionCardStyle}
  >
    <span style={iconBoxStyle}>👥</span>

    <span style={cardTitleStyle}>
      USUÁRIOS
    </span>

    <span style={cardDescriptionStyle}>
      CADASTRAR E GERENCIAR ACESSOS
    </span>
  </button>
</div>
          </section>
        )}

        <section style={sectionStyle}>
          <span style={eyebrowStyle}>
            EMPRESAS
          </span>

          <h2 style={subtitleStyle}>
            EMPRESAS DISPONÍVEIS
          </h2>

          <div style={companiesGridStyle}>
            {companies.map((company) => (
              <button
                key={company.id}
                onClick={() =>
                  router.push(`/empresa/${company.slug}`)
                }
                style={companyCardStyle}
              >
                <span style={companyIconStyle}>🏢</span>

                <strong style={companyNameStyle}>
                  {company.name.toUpperCase()}
                </strong>

                <span style={enterTextStyle}>
                  ENTRAR NA EMPRESA →
                </span>
              </button>
            ))}
          </div>

          {companies.length === 0 && (
            <div style={emptyStyle}>
              NENHUMA EMPRESA DISPONÍVEL.
            </div>
          )}
        </section>
      </section>
    </LoginBackground>
  );
}

const loadingStyle = {
  display: "grid",
  justifyItems: "center",
  gap: 20,
};

const loadingTextStyle = {
  margin: 0,
  color: "#d1d5db",
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: "2px",
};

const panelStyle = {
  width: "100%",
  maxWidth: 1180,
  margin: "0 auto",
  padding: "42px 48px",
  borderRadius: 30,
  background: "rgba(7, 7, 17, 0.9)",
  border: "1px solid rgba(255,255,255,.08)",
  boxShadow: "0 30px 90px rgba(0,0,0,.48)",
  backdropFilter: "blur(24px)",
};

const headerStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 24,
};

const welcomeStyle = {
  margin: "-12px 0 0",
  color: "#d1d5db",
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: "2px",
};

const logoutButtonStyle = {
  padding: "12px 22px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,.16)",
  background: "rgba(255,255,255,.05)",
  color: "#ffffff",
  fontWeight: 800,
  letterSpacing: "1px",
  cursor: "pointer",
};

const dividerStyle = {
  height: 1,
  margin: "30px 0 36px",
  background:
    "linear-gradient(90deg,transparent,#7c3aed,#db2777,#f97316,transparent)",
  opacity: 0.7,
};

const sectionStyle = {
  marginTop: 34,
};

const sectionHeaderStyle = {
  display: "flex",
  alignItems: "end",
  justifyContent: "space-between",
};

const eyebrowStyle = {
  display: "block",
  marginBottom: 8,
  color: "#c084fc",
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: "3px",
};

const titleStyle = {
  margin: 0,
  color: "#ffffff",
  fontSize: 36,
  letterSpacing: "-1px",
};

const subtitleStyle = {
  margin: "0 0 22px",
  color: "#ffffff",
  fontSize: 25,
};

const descriptionStyle = {
  margin: "10px 0 0",
  color: "#9ca3af",
  fontSize: 13,
  letterSpacing: "1px",
};

const gridStyle = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 18,
  marginTop: 24,
};

const actionCardStyle = {
  minHeight: 170,
  padding: 26,
  borderRadius: 20,
  border: "1px solid rgba(255,255,255,.1)",
  background:
    "linear-gradient(145deg,rgba(124,58,237,.14),rgba(219,39,119,.08),rgba(249,115,22,.06))",
  color: "#ffffff",
  textAlign: "left" as const,
  cursor: "pointer",
  display: "grid",
  alignContent: "center",
  gap: 10,
  boxShadow: "0 14px 35px rgba(0,0,0,.22)",
};

const iconBoxStyle = {
  fontSize: 28,
};

const cardTitleStyle = {
  fontSize: 19,
  fontWeight: 900,
  letterSpacing: "1px",
};

const cardDescriptionStyle = {
  color: "#9ca3af",
  fontSize: 12,
  letterSpacing: "1px",
};

const companiesGridStyle = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(250px, 1fr))",
  gap: 18,
};

const companyCardStyle = {
  minHeight: 180,
  padding: 26,
  borderRadius: 20,
  border: "1px solid rgba(249,115,22,.24)",
  background:
    "linear-gradient(145deg,rgba(249,115,22,.13),rgba(219,39,119,.08),rgba(124,58,237,.1))",
  color: "#ffffff",
  cursor: "pointer",
  display: "grid",
  justifyItems: "start",
  alignContent: "center",
  gap: 12,
  textAlign: "left" as const,
  boxShadow: "0 14px 35px rgba(0,0,0,.22)",
};

const companyIconStyle = {
  fontSize: 30,
};

const companyNameStyle = {
  fontSize: 23,
  letterSpacing: "1px",
};

const enterTextStyle = {
  color: "#f0abfc",
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: "1px",
};

const emptyStyle = {
  padding: 30,
  borderRadius: 16,
  border: "1px dashed rgba(255,255,255,.16)",
  color: "#9ca3af",
  textAlign: "center" as const,
  letterSpacing: "1px",
};
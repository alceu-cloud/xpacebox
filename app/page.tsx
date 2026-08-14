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
      <main style={pageStyle}>
        <section style={loadingStyle}>
          <Image
            src="/xpacebox-logo-light.svg"
            alt="XPACEBOX"
            width={900}
            height={220}
            priority
            style={{
              width: "520px",
              maxWidth: "90%",
              height: "auto",
            }}
          />
          <p style={loadingTextStyle}>Carregando sua central...</p>
        </section>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <section style={panelStyle}>
        <header style={headerStyle}>
          <Image
            src="/xpacebox-logo-light.svg"
            alt="XPACEBOX"
            width={900}
            height={220}
            priority
            style={{
              width: "672px",
              maxWidth: "100%",
              height: "auto",
            }}
          />

          <button onClick={logout} style={logoutButtonStyle}>
            Sair
          </button>
        </header>

        <div style={dividerStyle} />

        <section style={heroStyle}>
          <span style={eyebrowStyle}>
            {role === "platform_owner" ? "Administracao" : "Empresas"}
          </span>

          <h1 style={titleStyle}>CENTRAL XPACEBOX</h1>

          <p style={descriptionStyle}>
            ESCOLHA O PAINEL DE TRABALHO DESEJADO.
          </p>
        </section>

        {role === "platform_owner" && (
          <section style={sectionStyle}>
            <div style={gridStyle}>
              <button
                onClick={() => router.push("/usuarios")}
                style={actionCardStyle}
              >
                <span style={innerButtonStyle}>
                  <span style={labelPillStyle}>USUARIOS</span>
                  <span style={cardDescriptionStyle}>
                    CADASTRE USUARIOS E GERENCIE ACESSOS DA PLATAFORMA.
                  </span>
                </span>
              </button>
            </div>
          </section>
        )}

        <section style={sectionStyle}>
          <div style={companiesGridStyle}>
            {companies.map((company) => (
              <button
                key={company.id}
                onClick={() => router.push(`/empresa/${company.slug}`)}
                style={companyCardStyle}
              >
                <span style={innerButtonStyle}>
                  <strong style={companyLabelPillStyle}>
                    {company.name.toUpperCase()}
                  </strong>
                  <span style={enterTextStyle}>ENTRAR NA EMPRESA</span>
                </span>
              </button>
            ))}
          </div>

          {companies.length === 0 && (
            <div style={emptyStyle}>NENHUMA EMPRESA DISPONIVEL.</div>
          )}
        </section>
      </section>
    </main>
  );
}

const pageStyle = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 40,
  background:
    "radial-gradient(circle at 8% 10%, rgba(111,50,210,.13), transparent 30%), radial-gradient(circle at 92% 18%, rgba(230,61,174,.10), transparent 28%), radial-gradient(circle at 86% 88%, rgba(255,59,37,.11), transparent 34%), linear-gradient(180deg,#ffffff 0%,#f7f8fc 100%)",
};

const loadingStyle = {
  display: "grid",
  justifyItems: "center",
  gap: 20,
  padding: 48,
  borderRadius: 28,
  background: "rgba(255,255,255,.86)",
  border: "1px solid rgba(20,24,39,.1)",
  boxShadow: "0 30px 90px rgba(39,36,67,.14)",
};

const loadingTextStyle = {
  margin: 0,
  color: "#667085",
  fontSize: 15,
  fontWeight: 800,
  letterSpacing: "1px",
};

const panelStyle = {
  width: "100%",
  maxWidth: 1280,
  margin: "0 auto",
  padding: "54px 64px",
  borderRadius: 32,
  background: "rgba(255,255,255,.9)",
  border: "1px solid rgba(20,24,39,.12)",
  boxShadow: "0 30px 90px rgba(39,36,67,.16)",
  backdropFilter: "blur(24px)",
};

const headerStyle = {
  display: "grid",
  gridTemplateColumns: "1fr auto 1fr",
  alignItems: "center",
  gap: 24,
};

const logoutButtonStyle = {
  gridColumn: 3,
  justifySelf: "end",
  padding: "18px 34px",
  borderRadius: 16,
  border: "1px solid rgba(111,50,210,.18)",
  background: "#ffffff",
  color: "#6f32d2",
  fontWeight: 900,
  fontSize: 22,
  cursor: "pointer",
  boxShadow: "0 12px 28px rgba(39,36,67,.1)",
};

const dividerStyle = {
  height: 1,
  margin: "38px 0 42px",
  background:
    "linear-gradient(90deg,transparent,#6f32d2,#e63dae,#ff3b25,transparent)",
  opacity: 0.6,
};

const heroStyle = {
  textAlign: "center" as const,
};

const sectionStyle = {
  marginTop: 38,
};

const eyebrowStyle = {
  display: "block",
  marginBottom: 10,
  color: "#6f32d2",
  fontSize: 13,
  fontWeight: 900,
  letterSpacing: "3px",
  textTransform: "uppercase" as const,
};

const titleStyle = {
  margin: 0,
  color: "#141827",
  fontSize: 50,
  fontWeight: 900,
};

const descriptionStyle = {
  margin: "12px 0 0",
  color: "#667085",
  fontSize: 20,
  fontWeight: 700,
};

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 20,
  marginTop: 24,
};

const actionCardStyle = {
  minHeight: 215,
  padding: 18,
  borderRadius: 22,
  border: "1px solid rgba(111,50,210,.18)",
  background:
    "linear-gradient(145deg, rgba(111,50,210,.08), rgba(230,61,174,.06), rgba(255,59,37,.05)), #ffffff",
  color: "#141827",
  textAlign: "left" as const,
  cursor: "pointer",
  display: "block",
  boxShadow: "0 18px 42px rgba(39,36,67,.1)",
};

const innerButtonStyle = {
  minHeight: 184,
  width: "100%",
  padding: "30px 32px",
  borderRadius: 18,
  background: "rgba(255,255,255,.82)",
  border: "1px solid rgba(20,24,39,.08)",
  display: "grid",
  alignContent: "center",
  justifyItems: "start",
  gap: 14,
  boxShadow: "inset 0 1px 0 rgba(255,255,255,.8)",
};

const labelPillStyle = {
  minHeight: 68,
  minWidth: 210,
  padding: "0 26px",
  display: "inline-grid",
  placeItems: "center",
  borderRadius: 18,
  color: "#ffffff",
  fontSize: 30,
  fontWeight: 900,
  background: "linear-gradient(135deg,#6f32d2,#e63dae,#ff3b25)",
};

const companyLabelPillStyle = {
  minHeight: 68,
  minWidth: 210,
  padding: "0 26px",
  display: "inline-grid",
  placeItems: "center",
  borderRadius: 18,
  color: "#ffffff",
  fontSize: 30,
  fontWeight: 900,
  background: "linear-gradient(135deg,#ff3b25,#e63dae,#6f32d2)",
};

const cardDescriptionStyle = {
  color: "#667085",
  fontSize: 20,
  fontWeight: 700,
};

const companiesGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 20,
};

const companyCardStyle = {
  minHeight: 215,
  padding: 18,
  borderRadius: 22,
  border: "1px solid rgba(255,59,37,.18)",
  background:
    "linear-gradient(145deg, rgba(255,59,37,.07), rgba(230,61,174,.05), rgba(111,50,210,.06)), #ffffff",
  color: "#141827",
  cursor: "pointer",
  display: "block",
  textAlign: "left" as const,
  boxShadow: "0 18px 42px rgba(39,36,67,.1)",
};

const enterTextStyle = {
  color: "#6f32d2",
  fontSize: 20,
  fontWeight: 900,
};

const emptyStyle = {
  padding: 34,
  borderRadius: 18,
  border: "1px dashed rgba(20,24,39,.18)",
  color: "#667085",
  textAlign: "center" as const,
  fontWeight: 800,
};

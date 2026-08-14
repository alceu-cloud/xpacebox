"use client";

import Image from "next/image";
import { useParams, usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";

type EmpresaLayoutProps = {
  children: ReactNode;
};

export default function EmpresaLayout({ children }: EmpresaLayoutProps) {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();

  const slug = String(params.slug ?? "");
  const nomeEmpresa = slug.toUpperCase();
  const logoEmpresa = slug === "dawos" ? "/companies/dawos-logo.jpg" : "";
  const noGerenciador = pathname.includes("/gerenciador");

  const [ehAdmin, setEhAdmin] = useState(false);
  const [emailLogado, setEmailLogado] = useState("");
  const [acoesAbertas, setAcoesAbertas] = useState(false);

  useEffect(() => {
    async function verificarUsuario() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) return;

      setEmailLogado(session.user.email ?? "");

      const { data: perfil } = await supabase
        .from("profiles")
        .select("platform_role")
        .eq("id", session.user.id)
        .single();

      if (perfil?.platform_role === "platform_owner") {
        setEhAdmin(true);
      }
    }

    verificarUsuario();
  }, []);

  async function sair() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div style={paginaStyle}>
      <header style={headerStyle}>
        <div style={logoAreaStyle}>
          {logoEmpresa ? (
            <Image
              src={logoEmpresa}
              alt={nomeEmpresa}
              width={300}
              height={130}
              priority
              style={logoEmpresaPrincipalStyle}
            />
          ) : (
            <strong style={empresaNomePrincipalStyle}>{nomeEmpresa}</strong>
          )}

          <div style={empresaAreaStyle}>
            <span style={empresaLabelStyle}>
              {noGerenciador ? "GERENCIADOR DA EMPRESA" : "AMBIENTE DA EMPRESA"}
            </span>
            <span style={empresaDescricaoStyle}>
              {noGerenciador
                ? "CONFIGURACOES DA DAWOS"
                : "ESCOLHA O MODULO QUE DESEJA ACESSAR."}
            </span>
            {noGerenciador && (
              <span style={loggedHeaderStyle}>LOGADO: {emailLogado || "USUARIO"}</span>
            )}
          </div>
        </div>

        <Image
          src="/xpacebox-logo-light.svg"
          alt="XPACEBOX"
          width={900}
          height={220}
          priority
          style={logoPlataformaStyle}
        />
      </header>

      <main style={conteudoStyle}>{children}</main>

      <div
        style={{
          ...floatingActionsStyle,
          transform: acoesAbertas ? "translateX(0)" : "translateX(calc(100% - 42px))",
        }}
        onMouseEnter={() => setAcoesAbertas(true)}
        onMouseLeave={() => setAcoesAbertas(false)}
      >
        <div style={drawerHandleStyle}>MENU</div>
        <div style={drawerButtonsStyle}>
          {noGerenciador && (
            <button
              type="button"
              onClick={() => router.push(`/empresa/${slug}`)}
              style={floatingButtonStyle}
            >
              INICIO
            </button>
          )}

          <button
            type="button"
            onClick={ehAdmin ? () => router.push("/") : sair}
            style={floatingButtonStyle}
          >
            {ehAdmin ? "VOLTAR A CENTRAL" : "SAIR"}
          </button>
        </div>
      </div>
    </div>
  );
}

const paginaStyle = {
  minHeight: "100vh",
  position: "relative" as const,
  background:
    "radial-gradient(circle at 8% 10%, rgba(111,50,210,.13), transparent 30%), radial-gradient(circle at 92% 18%, rgba(230,61,174,.10), transparent 28%), radial-gradient(circle at 86% 88%, rgba(255,59,37,.11), transparent 34%), linear-gradient(180deg,#ffffff 0%,#f7f8fc 100%)",
  color: "#141827",
};

const headerStyle = {
  minHeight: 138,
  padding: "24px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 28,
  borderBottom: "1px solid rgba(20,24,39,.1)",
  background: "rgba(255,255,255,.88)",
  backdropFilter: "blur(20px)",
  boxShadow: "0 18px 48px rgba(39,36,67,.1)",
};

const logoAreaStyle = {
  display: "flex",
  alignItems: "center",
  gap: 30,
};

const logoEmpresaPrincipalStyle = {
  width: "260px",
  maxWidth: "100%",
  height: "auto",
  display: "block",
  borderRadius: 10,
};

const empresaNomePrincipalStyle = {
  minWidth: 260,
  color: "#141827",
  fontSize: 44,
  fontWeight: 900,
  letterSpacing: "1px",
};

const empresaAreaStyle = {
  paddingLeft: 28,
  borderLeft: "1px solid rgba(20,24,39,.14)",
  display: "grid",
  gap: 7,
  minHeight: 104,
  alignContent: "center",
};

const empresaLabelStyle = {
  color: "#6f32d2",
  fontSize: 22,
  fontWeight: 900,
  letterSpacing: "3px",
};

const empresaNomeStyle = {
  color: "#141827",
  fontSize: 44,
  fontWeight: 900,
  letterSpacing: "1px",
};

const logoPlataformaStyle = {
  width: "260px",
  maxWidth: "100%",
  height: "auto",
  display: "block",
  marginRight: 188,
  transform: "scale(1.55)",
  transformOrigin: "right center",
};

const loggedHeaderStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 38,
  padding: "0 18px",
  borderRadius: 999,
  border: "1px solid rgba(230,128,25,.32)",
  background: "rgba(230,128,25,.08)",
  color: "#e68019",
  fontSize: 13,
  fontWeight: 900,
  justifySelf: "start",
  marginTop: 4,
};

const empresaDescricaoStyle = {
  color: "#667085",
  fontSize: 18,
  fontWeight: 800,
  letterSpacing: "1px",
};

const floatingActionsStyle = {
  position: "absolute" as const,
  right: 0,
  top: 4,
  zIndex: 20,
  display: "flex",
  alignItems: "stretch",
  transition: "transform .22s ease",
  filter: "drop-shadow(0 16px 30px rgba(39,36,67,.12))",
};

const drawerHandleStyle = {
  width: 42,
  minHeight: 192,
  borderRadius: "16px 0 0 16px",
  border: "1px solid rgba(111,50,210,.18)",
  borderRight: "none",
  background: "linear-gradient(180deg,#8b36e8,#ff315f)",
  color: "#fff",
  fontSize: 13,
  fontWeight: 900,
  letterSpacing: "1px",
  writingMode: "vertical-rl" as const,
  transform: "rotate(180deg)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const drawerButtonsStyle = {
  display: "grid",
  gap: 12,
  alignContent: "center",
  padding: 14,
  borderRadius: "0 0 0 18px",
  border: "1px solid rgba(111,50,210,.14)",
  background: "rgba(255,255,255,.94)",
  backdropFilter: "blur(16px)",
};

const floatingButtonStyle = {
  padding: "18px 30px",
  borderRadius: 16,
  border: "1px solid rgba(111,50,210,.18)",
  background: "#ffffff",
  color: "#6f32d2",
  fontSize: 18,
  fontWeight: 900,
  letterSpacing: "1px",
  cursor: "pointer",
  boxShadow: "0 12px 28px rgba(39,36,67,.1)",
  minWidth: 210,
};

const conteudoStyle = {
  width: "100%",
  maxWidth: 2200,
  margin: "0 auto",
  padding: "44px 28px 64px",
  boxSizing: "border-box" as const,
};

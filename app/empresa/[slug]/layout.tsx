"use client";

import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import type { ReactNode } from "react";

type EmpresaLayoutProps = {
  children: ReactNode;
};

export default function EmpresaLayout({
  children,
}: EmpresaLayoutProps) {
  const params = useParams();
  const router = useRouter();

  const slug = String(params.slug ?? "");
  const nomeEmpresa = slug.toUpperCase();

  return (
    <div style={paginaStyle}>
      <header style={headerStyle}>
        <div style={logoAreaStyle}>
          <Image
            src="/logo-xpacebox.png"
            alt="XPACEBOX"
            width={260}
            height={110}
            priority
            style={logoImagemStyle}
          />

          <div style={empresaAreaStyle}>
            <span style={empresaLabelStyle}>
              AMBIENTE DA EMPRESA
            </span>

            <strong style={empresaNomeStyle}>
              {nomeEmpresa}
            </strong>

            <span style={empresaDescricaoStyle}>
              ESCOLHA O MÓDULO QUE DESEJA ACESSAR.
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => router.push("/")}
          style={voltarStyle}
        >
          VOLTAR À CENTRAL
        </button>
      </header>

      <main style={conteudoStyle}>
        {children}
      </main>
    </div>
  );
}

const paginaStyle = {
  minHeight: "100vh",
  background:
    "linear-gradient(135deg,#05060d 0%,#09091a 40%,#140a2d 72%,#17090d 100%)",
  color: "#ffffff",
  fontFamily: "Arial, sans-serif",
};

const headerStyle = {
  minHeight: 112,
  padding: "12px 30px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 24,
  borderBottom: "1px solid rgba(255,255,255,.08)",
  background: "rgba(7,7,17,.88)",
  backdropFilter: "blur(20px)",
  boxShadow: "0 12px 36px rgba(0,0,0,.25)",
};

const logoAreaStyle = {
  display: "flex",
  alignItems: "center",
  gap: 24,
};

const logoImagemStyle = {
  width: "260px",
  maxWidth: "100%",
  height: "auto",
  display: "block",
};

const empresaAreaStyle = {
  paddingLeft: 24,
  borderLeft: "1px solid rgba(255,255,255,.14)",
  display: "grid",
  gap: 4,
};

const empresaLabelStyle = {
  color: "#c084fc",
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "2px",
};

const empresaNomeStyle = {
  color: "#ffffff",
  fontSize: 24,
  fontWeight: 900,
  letterSpacing: "1px",
};

const empresaDescricaoStyle = {
  color: "#9ca3af",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "1px",
};

const voltarStyle = {
  padding: "12px 18px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,.14)",
  background: "rgba(255,255,255,.05)",
  color: "#ffffff",
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: "1px",
  cursor: "pointer",
};

const conteudoStyle = {
  width: "100%",
  maxWidth: 1400,
  margin: "0 auto",
  padding: "18px 40px 40px",
  overflowX: "auto" as const,
};
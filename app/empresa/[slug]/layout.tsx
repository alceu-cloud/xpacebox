"use client";

import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";

type EmpresaLayoutProps = {
  children: ReactNode;
};

const itensMenu = [
  { nome: "Início", rota: "" },
  { nome: "Gerenciador", rota: "gerenciador" },
  { nome: "Clientes", rota: "clientes" },
  { nome: "Produtos", rota: "produtos" },
  { nome: "Formação de Preço", rota: "formacao-preco" },
  { nome: "Financeiro", rota: "financeiro" },
  { nome: "Relatórios", rota: "relatorios" },
];

export default function EmpresaLayout({
  children,
}: EmpresaLayoutProps) {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();

  const slug = String(params.slug ?? "");
  const nomeEmpresa = slug.toUpperCase();

  function rotaAtiva(rota: string) {
    const destino = rota
      ? `/empresa/${slug}/${rota}`
      : `/empresa/${slug}`;

    return pathname === destino;
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f6f3ff",
        fontFamily: "Arial, sans-serif",
        color: "#1f2937",
      }}
    >
      <header
        style={{
          height: 76,
          padding: "0 28px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background:
            "linear-gradient(90deg, #7c3aed 0%, #db2777 55%, #f97316 100%)",
          color: "#ffffff",
          boxShadow: "0 4px 18px rgba(0,0,0,0.12)",
        }}
      >
        <div>
          <strong style={{ fontSize: 22 }}>XPACEBOX</strong>
          <div style={{ fontSize: 13, opacity: 0.9 }}>
            {nomeEmpresa}
          </div>
        </div>

        <button
          onClick={() => router.push("/dashboard")}
          style={{
            border: "1px solid rgba(255,255,255,0.5)",
            background: "rgba(255,255,255,0.15)",
            color: "#ffffff",
            padding: "10px 16px",
            borderRadius: 10,
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          Voltar à Central
        </button>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "250px 1fr",
          minHeight: "calc(100vh - 76px)",
        }}
      >
        <aside
          style={{
            background: "#ffffff",
            padding: 20,
            borderRight: "1px solid #e5e7eb",
          }}
        >
          <div
            style={{
              marginBottom: 20,
              padding: 16,
              borderRadius: 14,
              background:
                "linear-gradient(135deg, #f3e8ff, #fce7f3, #ffedd5)",
            }}
          >
            <strong style={{ fontSize: 18 }}>{nomeEmpresa}</strong>
            <div
              style={{
                marginTop: 4,
                fontSize: 13,
                color: "#6b7280",
              }}
            >
              Ambiente da empresa
            </div>
          </div>

          <nav
            style={{
              display: "grid",
              gap: 8,
            }}
          >
            {itensMenu.map((item) => {
              const ativo = rotaAtiva(item.rota);
              const href = item.rota
                ? `/empresa/${slug}/${item.rota}`
                : `/empresa/${slug}`;

              return (
                <Link
                  key={item.nome}
                  href={href}
                  style={{
                    textDecoration: "none",
                    padding: "13px 14px",
                    borderRadius: 10,
                    fontWeight: ativo ? 700 : 500,
                    color: ativo ? "#ffffff" : "#374151",
                    background: ativo
                      ? "linear-gradient(90deg, #7c3aed, #db2777)"
                      : "transparent",
                  }}
                >
                  {item.nome}
                </Link>
              );
            })}
          </nav>
        </aside>

        <section
          style={{
            padding: 32,
            overflowX: "auto",
          }}
        >
          {children}
        </section>
      </div>
    </div>
  );
}
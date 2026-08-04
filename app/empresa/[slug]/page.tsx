"use client";

import { useParams, useRouter } from "next/navigation";

const modulos = [
  { nome: "Gerenciador", rota: "gerenciador" },
  { nome: "Clientes", rota: "clientes" },
  { nome: "Produtos", rota: "produtos" },
  { nome: "Formação de Preço", rota: "formacao-preco" },
  { nome: "Financeiro", rota: "financeiro" },
  { nome: "Relatórios", rota: "relatorios" },
];

export default function EmpresaPage() {
  const router = useRouter();
  const params = useParams();

  const slug = String(params.slug);

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 40,
        background: "#0f172a",
        color: "#fff",
        fontFamily: "Arial",
      }}
    >
      <button
        onClick={() => router.push("/dashboard")}
        style={{ marginBottom: 30, padding: 10, cursor: "pointer" }}
      >
        ← Voltar
      </button>

      <h1>{slug.toUpperCase()}</h1>
      <p>Escolha um módulo</p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 20,
          marginTop: 40,
        }}
      >
        {modulos.map((modulo) => (
          <button
            key={modulo.rota}
            onClick={() =>
              router.push(`/empresa/${slug}/${modulo.rota}`)
            }
            style={{
              padding: 35,
              borderRadius: 16,
              cursor: "pointer",
              fontSize: 20,
            }}
          >
            {modulo.nome}
          </button>
        ))}
      </div>
    </main>
  );
}
"use client";

import { useParams, useRouter } from "next/navigation";

const modulos = [
  {
    nome: "GERENCIADOR",
    descricao: "PAINEL ADMINISTRATIVO DA EMPRESA",
    rota: "gerenciador",
    icone: "⚙️",
    cor: "#7c3aed",
  },
  {
    nome: "CLIENTES",
    descricao: "CADASTRO E GESTÃO DE CLIENTES",
    rota: "clientes",
    icone: "👥",
    cor: "#a855f7",
  },
  {
    nome: "PRODUTOS",
    descricao: "PRODUTOS, MATERIAIS E SERVIÇOS",
    rota: "produtos",
    icone: "📦",
    cor: "#db2777",
  },
  {
    nome: "FORMAÇÃO DE PREÇO",
    descricao: "CÁLCULOS, CUSTOS E MARGENS",
    rota: "formacao-preco",
    icone: "🧮",
    cor: "#f97316",
  },
  {
    nome: "FINANCEIRO",
    descricao: "CONTROLE E INDICADORES FINANCEIROS",
    rota: "financeiro",
    icone: "💰",
    cor: "#eab308",
  },
  {
    nome: "RELATÓRIOS",
    descricao: "ANÁLISES E INFORMAÇÕES GERENCIAIS",
    rota: "relatorios",
    icone: "📊",
    cor: "#ec4899",
  },
];

export default function EmpresaPage() {
  const router = useRouter();
  const params = useParams();

  const slug = String(params.slug ?? "");

  return (
    <main style={paginaStyle}>
      <div style={linhaStyle} />

      <div style={gradeStyle}>
        {modulos.map((modulo) => (
          <button
            key={modulo.rota}
            type="button"
            onClick={() =>
              router.push(
                `/empresa/${slug}/${modulo.rota}`
              )
            }
            style={{
              ...cardStyle,
              borderColor: `${modulo.cor}55`,
              background: `linear-gradient(
                145deg,
                ${modulo.cor}25,
                rgba(219,39,119,.07),
                rgba(10,10,20,.95)
              )`,
            }}
          >
            <span
              style={{
                ...iconeStyle,
                boxShadow: `0 12px 30px ${modulo.cor}30`,
              }}
            >
              {modulo.icone}
            </span>

            <strong style={nomeStyle}>
              {modulo.nome}
            </strong>

            <span style={textoStyle}>
              {modulo.descricao}
            </span>

            <span
              style={{
                ...acessarStyle,
                color: modulo.cor,
              }}
            >
              ACESSAR MÓDULO →
            </span>
          </button>
        ))}
      </div>
    </main>
  );
}

const paginaStyle = {
  width: "100%",
};

const linhaStyle = {
  height: 1,
  margin: "0 0 24px",
  background:
    "linear-gradient(90deg,transparent,#7c3aed,#db2777,#f97316,transparent)",
  opacity: 0.75,
};

const gradeStyle = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 20,
};

const cardStyle = {
  minHeight: 230,
  padding: 28,
  borderRadius: 22,
  border: "1px solid",
  color: "#ffffff",
  cursor: "pointer",
  textAlign: "left" as const,
  display: "grid",
  alignContent: "center",
  justifyItems: "start",
  gap: 12,
  boxShadow: "0 16px 40px rgba(0,0,0,.28)",
};

const iconeStyle = {
  width: 54,
  height: 54,
  display: "grid",
  placeItems: "center",
  borderRadius: 16,
  background: "rgba(255,255,255,.08)",
  fontSize: 27,
};

const nomeStyle = {
  marginTop: 5,
  fontSize: 20,
  fontWeight: 900,
  letterSpacing: "1px",
};

const textoStyle = {
  color: "#9ca3af",
  fontSize: 12,
  lineHeight: 1.5,
  letterSpacing: "1px",
};

const acessarStyle = {
  marginTop: 8,
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: "1px",
};
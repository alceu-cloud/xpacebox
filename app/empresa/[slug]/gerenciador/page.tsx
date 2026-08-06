import Card from "@/components/ui/Card";

export default function GerenciadorPage() {
  return (
    <>
      <h1
        style={{
          fontSize: 32,
          fontWeight: 700,
          marginBottom: 8,
        }}
      >
        Gerenciador
      </h1>

      <p
        style={{
          color: "#6b7280",
          marginBottom: 30,
        }}
      >
        Bem-vindo ao painel administrativo da empresa.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit,minmax(260px,1fr))",
          gap: 20,
        }}
      >
        <Card
          titulo="👥 Clientes"
          descricao="Gerenciar clientes cadastrados."
        />

        <Card
          titulo="📦 Produtos"
          descricao="Cadastro de produtos."
        />

        <Card
          titulo="💰 Financeiro"
          descricao="Indicadores financeiros."
        />

        <Card
          titulo="📊 Relatórios"
          descricao="Visualizar relatórios."
        />
      </div>
    </>
  );
}
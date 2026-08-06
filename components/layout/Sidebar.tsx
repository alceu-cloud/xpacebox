type MenuItem = {
  nome: string;
  href: string;
  ativo: boolean;
};

type SidebarProps = {
  empresa: string;
  itens: MenuItem[];
};

export default function Sidebar({
  empresa,
  itens,
}: SidebarProps) {
  return (
    <aside
      style={{
        background: "#ffffff",
        padding: 20,
        borderRight: "1px solid #e5e7eb",
        width: 250,
      }}
    >
      <div
        style={{
          marginBottom: 20,
          padding: 16,
          borderRadius: 14,
          background:
            "linear-gradient(135deg,#f3e8ff,#fce7f3,#ffedd5)",
        }}
      >
        <strong style={{ fontSize: 20 }}>{empresa}</strong>

        <div
          style={{
            marginTop: 4,
            color: "#6b7280",
            fontSize: 13,
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
        {itens.map((item) => (
          <a
            key={item.nome}
            href={item.href}
            style={{
              textDecoration: "none",
              padding: "13px 14px",
              borderRadius: 10,
              fontWeight: item.ativo ? 700 : 500,
              color: item.ativo ? "#ffffff" : "#374151",
              background: item.ativo
                ? "linear-gradient(90deg,#7c3aed,#db2777)"
                : "transparent",
            }}
          >
            {item.nome}
          </a>
        ))}
      </nav>
    </aside>
  );
}
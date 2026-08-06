type UserCardProps = {
  nome: string;
  perfil: string;
  empresa?: string;
  ativo: boolean;
  onEditar: () => void;
  onExcluir: () => void;
};

export default function UserCard({
  nome,
  perfil,
  empresa,
  ativo,
  onEditar,
  onExcluir,
}: UserCardProps) {
  return (
    <div
      style={{
        background: "rgba(15,12,28,.82)",
        border: "1px solid rgba(255,255,255,.08)",
        borderRadius: 20,
        padding: 24,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 20,
        boxShadow: "0 18px 40px rgba(0,0,0,.25)",
      }}
    >
      <div>
        <h3
          style={{
            margin: 0,
            color: "#fff",
            fontSize: 22,
          }}
        >
          {nome}
        </h3>

        <p style={{ color: "#9ca3af", margin: "8px 0" }}>
          {perfil}
        </p>

        {empresa && (
          <p style={{ color: "#c084fc", margin: 0 }}>
            🏢 {empresa}
          </p>
        )}

        <p
          style={{
            color: ativo ? "#22c55e" : "#ef4444",
            marginTop: 10,
          }}
        >
          {ativo ? "● Ativo" : "● Inativo"}
        </p>
      </div>

      <div
        style={{
          display: "flex",
          gap: 10,
        }}
      >
        <button
          onClick={onEditar}
          style={{
            padding: "12px 18px",
            border: "none",
            borderRadius: 12,
            cursor: "pointer",
            color: "#fff",
            fontWeight: 700,
            background:
              "linear-gradient(90deg,#7c3aed,#db2777)",
          }}
        >
          ✏️ Editar
        </button>

        <button
          onClick={onExcluir}
          style={{
            padding: "12px 18px",
            border: "1px solid rgba(239,68,68,.4)",
            borderRadius: 12,
            cursor: "pointer",
            color: "#fff",
            fontWeight: 700,
            background: "rgba(239,68,68,.15)",
          }}
        >
          🗑️ Excluir
        </button>
      </div>
    </div>
  );
}
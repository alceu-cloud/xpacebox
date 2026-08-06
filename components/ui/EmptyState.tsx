type EmptyStateProps = {
  titulo: string;
  descricao: string;
};

export default function EmptyState({
  titulo,
  descricao,
}: EmptyStateProps) {
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px dashed #d1d5db",
        borderRadius: 18,
        padding: 50,
        textAlign: "center",
      }}
    >
      <h2
        style={{
          margin: 0,
          marginBottom: 12,
          color: "#374151",
        }}
      >
        {titulo}
      </h2>

      <p
        style={{
          margin: 0,
          color: "#6b7280",
          fontSize: 15,
        }}
      >
        {descricao}
      </p>
    </div>
  );
}
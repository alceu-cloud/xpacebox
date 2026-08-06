type StatCardProps = {
  titulo: string;
  valor: string;
  cor?: string;
};

export default function StatCard({
  titulo,
  valor,
  cor = "#7c3aed",
}: StatCardProps) {
  return (
    <div
      style={{
        background: "#ffffff",
        borderRadius: 18,
        padding: 24,
        borderLeft: `6px solid ${cor}`,
        boxShadow: "0 8px 24px rgba(0,0,0,.06)",
      }}
    >
      <div
        style={{
          color: "#6b7280",
          fontSize: 14,
          marginBottom: 8,
        }}
      >
        {titulo}
      </div>

      <div
        style={{
          fontSize: 34,
          fontWeight: 700,
          color: "#111827",
        }}
      >
        {valor}
      </div>
    </div>
  );
}
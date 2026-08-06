type BadgeProps = {
  texto: string;
  cor?: "verde" | "amarelo" | "vermelho" | "azul";
};

export default function Badge({
  texto,
  cor = "azul",
}: BadgeProps) {
  const cores = {
    verde: {
      fundo: "#dcfce7",
      texto: "#166534",
    },
    amarelo: {
      fundo: "#fef9c3",
      texto: "#854d0e",
    },
    vermelho: {
      fundo: "#fee2e2",
      texto: "#991b1b",
    },
    azul: {
      fundo: "#dbeafe",
      texto: "#1d4ed8",
    },
  };

  return (
    <span
      style={{
        display: "inline-block",
        padding: "6px 12px",
        borderRadius: 999,
        fontWeight: 700,
        fontSize: 13,
        background: cores[cor].fundo,
        color: cores[cor].texto,
      }}
    >
      {texto}
    </span>
  );
}
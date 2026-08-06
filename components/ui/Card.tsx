import { ReactNode } from "react";

type CardProps = {
  titulo: string;
  descricao?: string;
  children?: ReactNode;
};

export default function Card({
  titulo,
  descricao,
  children,
}: CardProps) {
  return (
    <div
      style={{
        background: "#ffffff",
        borderRadius: 18,
        padding: 24,
        border: "1px solid #ececec",
        boxShadow: "0 8px 24px rgba(0,0,0,.06)",
      }}
    >
      <h2
        style={{
          margin: 0,
          marginBottom: 8,
          fontSize: 22,
        }}
      >
        {titulo}
      </h2>

      {descricao && (
        <p
          style={{
            marginTop: 0,
            color: "#6b7280",
          }}
        >
          {descricao}
        </p>
      )}

      {children}
    </div>
  );
}
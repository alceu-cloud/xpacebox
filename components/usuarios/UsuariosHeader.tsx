"use client";

import { useRouter } from "next/navigation";

type UsuariosHeaderProps = {
  onNovo: () => void;
};

export default function UsuariosHeader({
  onNovo,
}: UsuariosHeaderProps) {
  const router = useRouter();

  return (
    <>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 30,
        }}
      >
        <div>
          <span
            style={{
              color: "#c084fc",
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: "2px",
            }}
          >
            ADMINISTRAÇÃO
          </span>

          <h1
            style={{
              color: "#ffffff",
              fontSize: 42,
              margin: "8px 0",
              fontWeight: 800,
            }}
          >
            USUÁRIOS
          </h1>

          <p
            style={{
              color: "#9ca3af",
              margin: 0,
              fontSize: 16,
            }}
          >
            Gerencie os acessos da plataforma.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            gap: 12,
          }}
        >
          <button
            onClick={() => router.push("/")}
            style={{
              padding: "14px 22px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,.12)",
              background: "transparent",
              color: "#ffffff",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            ← CENTRAL
          </button>

          <button
            onClick={onNovo}
            style={{
              padding: "14px 22px",
              border: "none",
              borderRadius: 12,
              cursor: "pointer",
              color: "#ffffff",
              fontWeight: 700,
              background:
                "linear-gradient(90deg,#7c3aed,#db2777,#f97316)",
            }}
          >
            + NOVO USUÁRIO
          </button>
        </div>
      </div>

      <div
        style={{
          height: 1,
          marginBottom: 30,
          background:
            "linear-gradient(90deg,transparent,#7c3aed,#db2777,#f97316,transparent)",
        }}
      />
    </>
  );
}
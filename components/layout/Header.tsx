"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { ReactNode } from "react";

type HeaderProps = {
  ambiente: string;
  titulo: string;
  descricao: string;
  children?: ReactNode;
};

export default function Header({
  ambiente,
  titulo,
  descricao,
  children,
}: HeaderProps) {
  const router = useRouter();

  return (
    <header
      style={{
        width: "100%",
        padding: "24px 40px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        background: "#080710",
        borderBottom: "1px solid rgba(255,255,255,.08)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 28,
        }}
      >
        <Image
          src="/logo-xpacebox.png"
          alt="XPACEBOX"
          width={190}
          height={90}
          priority
        />

        <div
          style={{
            width: 1,
            height: 90,
            background: "rgba(255,255,255,.12)",
          }}
        />

        <div>
          <span
            style={{
              display: "block",
              color: "#c084fc",
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: "3px",
              marginBottom: 10,
            }}
          >
            {ambiente}
          </span>

          <h1
            style={{
              margin: 0,
              color: "#ffffff",
              fontSize: 42,
              fontWeight: 900,
            }}
          >
            {titulo}
          </h1>

          <p
            style={{
              margin: "8px 0 0",
              color: "#9ca3af",
              fontSize: 13,
              letterSpacing: "2px",
            }}
          >
            {descricao}
          </p>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
        }}
      >
        {children}

        <button
          onClick={() => router.back()}
          style={{
            padding: "14px 22px",
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,.12)",
            background: "transparent",
            color: "#ffffff",
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          ← VOLTAR
        </button>
      </div>
    </header>
  );
}
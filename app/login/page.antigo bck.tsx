"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [verificando, setVerificando] = useState(true);

  useEffect(() => {
    verificarSessao();
  }, []);

  async function verificarSessao() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session) {
      router.replace("/");
      return;
    }

    setVerificando(false);
  }

  async function entrar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setMensagem("");
    setCarregando(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password: senha,
    });

    if (error) {
      setMensagem("E-mail ou senha inválidos.");
      setCarregando(false);
      return;
    }

    router.replace("/");
  }

  if (verificando) {
    return (
      <main style={paginaStyle}>
        <div style={{ textAlign: "center" }}>
          <h1>XPACEBOX</h1>
          <p>Verificando seu acesso...</p>
        </div>
      </main>
    );
  }

  return (
    <main style={paginaStyle}>
      <section style={cardStyle}>
        <h1
          style={{
            margin: "0 0 28px",
            fontSize: 38,
            color: "#111827",
          }}
        >
          XPACEBOX
        </h1>

        <form onSubmit={entrar}>
          <label style={labelStyle}>
            E-mail
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Digite seu e-mail"
              required
              disabled={carregando}
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            Senha
            <input
              type="password"
              value={senha}
              onChange={(event) => setSenha(event.target.value)}
              placeholder="Digite sua senha"
              required
              disabled={carregando}
              style={inputStyle}
            />
          </label>

          <button
            type="submit"
            disabled={carregando}
            style={{
              width: "100%",
              marginTop: 18,
              padding: 15,
              border: "none",
              borderRadius: 10,
              background: carregando ? "#a78bfa" : "#7c3aed",
              color: "#ffffff",
              fontSize: 17,
              fontWeight: 700,
              cursor: carregando ? "not-allowed" : "pointer",
            }}
          >
            {carregando ? "Entrando..." : "Entrar"}
          </button>

          {mensagem && (
            <p
              style={{
                marginTop: 18,
                padding: 12,
                borderRadius: 8,
                background: "#fee2e2",
                color: "#991b1b",
              }}
            >
              {mensagem}
            </p>
          )}
        </form>
      </section>
    </main>
  );
}

const paginaStyle = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  background: "#0f172a",
  fontFamily: "Arial, sans-serif",
};

const cardStyle = {
  width: "100%",
  maxWidth: 430,
  padding: 42,
  borderRadius: 18,
  background: "#ffffff",
  boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
};

const labelStyle = {
  display: "block",
  marginBottom: 18,
  color: "#111827",
  fontSize: 15,
  fontWeight: 600,
};

const inputStyle = {
  display: "block",
  width: "100%",
  marginTop: 8,
  padding: 14,
  border: "1px solid #cbd5e1",
  borderRadius: 9,
  fontSize: 16,
  boxSizing: "border-box" as const,
};
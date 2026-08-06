"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

import LoginBackground from "@/components/login/LoginBackground";
import LoginCard from "@/components/login/LoginCard";
import LoginLogo from "@/components/login/LoginLogo";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [verificando, setVerificando] = useState(true);
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [lembrar, setLembrar] = useState(false);

  useEffect(() => {
    verificarSessao();

    const emailSalvo = localStorage.getItem("xpacebox_email");

    if (emailSalvo) {
      setEmail(emailSalvo);
      setLembrar(true);
    }
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

    if (lembrar) {
      localStorage.setItem(
        "xpacebox_email",
        email.trim().toLowerCase()
      );
    } else {
      localStorage.removeItem("xpacebox_email");
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password: senha,
    });

    if (error) {
      setMensagem("E-MAIL OU SENHA INVÁLIDOS.");
      setCarregando(false);
      return;
    }

    router.replace("/");
  }

  if (verificando) {
    return (
      <LoginBackground>
        <LoginCard>
          <LoginLogo />

          <p style={verificandoStyle}>
            VERIFICANDO SEU ACESSO...
          </p>
        </LoginCard>
      </LoginBackground>
    );
  }

  return (
    <LoginBackground>
      <LoginCard>
        <LoginLogo />

        <form onSubmit={entrar}>
          <label style={labelStyle}>
            E-MAIL

            <div style={inputWrapperStyle}>
              <span style={iconStyle}>✉</span>

              <input
                className="login-input"
                type="email"
                autoComplete="off"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="DIGITE SEU E-MAIL"
                required
                disabled={carregando}
                style={inputStyle}
              />
            </div>
          </label>

          <label style={labelStyle}>
            SENHA

            <div style={inputWrapperStyle}>
              <span style={iconStyle}>🔒</span>

              <input
                className="login-input"
                type={mostrarSenha ? "text" : "password"}
                autoComplete="new-password"
                value={senha}
                onChange={(event) => setSenha(event.target.value)}
                placeholder="DIGITE SUA SENHA"
                required
                disabled={carregando}
                style={inputStyle}
              />

              <button
                type="button"
                onClick={() =>
                  setMostrarSenha((valor) => !valor)
                }
                style={eyeButtonStyle}
                aria-label={
                  mostrarSenha
                    ? "Ocultar senha"
                    : "Mostrar senha"
                }
              >
                {mostrarSenha ? "🙈" : "👁"}
              </button>
            </div>
          </label>

          <div style={optionsStyle}>
            <label style={rememberStyle}>
              <input
                type="checkbox"
                checked={lembrar}
                onChange={(event) =>
                  setLembrar(event.target.checked)
                }
                style={checkboxStyle}
              />

              <span>LEMBRAR DE MIM</span>
            </label>

            <button
              type="button"
              style={forgotButtonStyle}
            >
              ESQUECI MINHA SENHA
            </button>
          </div>

          <button
            type="submit"
            disabled={carregando}
            style={{
              ...botaoStyle,
              opacity: carregando ? 0.7 : 1,
              cursor: carregando
                ? "not-allowed"
                : "pointer",
            }}
          >
            {carregando ? "ENTRANDO..." : "ENTRAR"}
          </button>

          {mensagem && (
            <div style={mensagemStyle}>
              {mensagem}
            </div>
          )}

          <div style={dividerStyle}>
            <span style={lineStyle} />
            <span>OU</span>
            <span style={lineStyle} />
          </div>

          <footer style={footerStyle}>
            XPACEBOX © 2026 — TODOS OS DIREITOS RESERVADOS
          </footer>
        </form>
      </LoginCard>
    </LoginBackground>
  );
}

const verificandoStyle = {
  textAlign: "center" as const,
  color: "#9ca3af",
  textTransform: "uppercase" as const,
  letterSpacing: "1px",
};

const labelStyle = {
  display: "block",
  marginBottom: 22,
  color: "#d1d5db",
  fontSize: 14,
  fontWeight: 700,
  letterSpacing: "1px",
};

const inputWrapperStyle = {
  display: "flex",
  alignItems: "center",
  marginTop: 10,
  borderRadius: 12,
  overflow: "hidden",
  border: "1px solid rgba(255,255,255,.15)",
  background: "#16141f",
  boxShadow: "0 0 0 1px rgba(255,255,255,.04)",
};

const inputStyle = {
  flex: 1,
  minWidth: 0,
  height: 56,
  padding: "0 14px",
  border: "none",
  outline: "none",
  background: "#16141f",
  color: "#ffffff",
  WebkitTextFillColor: "#ffffff",
  WebkitBoxShadow: "0 0 0 1000px #16141f inset",
  boxShadow: "0 0 0 1000px #16141f inset",
  colorScheme: "dark" as const,
  fontSize: 16,
  appearance: "none" as const,
  WebkitAppearance: "none" as const,
};

const iconStyle = {
  marginLeft: 16,
  fontSize: 19,
};

const eyeButtonStyle = {
  border: "none",
  background: "transparent",
  color: "#ffffff",
  fontSize: 20,
  cursor: "pointer",
  padding: "8px 16px",
};

const optionsStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 16,
  marginTop: 4,
  marginBottom: 26,
};

const rememberStyle = {
  display: "flex",
  alignItems: "center",
  gap: 9,
  color: "#d1d5db",
  fontSize: 13,
  cursor: "pointer",
};

const checkboxStyle = {
  width: 18,
  height: 18,
  accentColor: "#9333ea",
};

const forgotButtonStyle = {
  border: "none",
  background: "transparent",
  color: "#c084fc",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

const botaoStyle = {
  width: "100%",
  padding: 17,
  borderRadius: 12,
  border: "none",
  color: "#ffffff",
  fontSize: 16,
  fontWeight: 800,
  letterSpacing: "1px",
  background:
    "linear-gradient(90deg,#7c3aed,#db2777,#f97316)",
  boxShadow: "0 14px 32px rgba(219,39,119,.28)",
};

const mensagemStyle = {
  marginTop: 18,
  padding: 14,
  borderRadius: 10,
  background: "rgba(127,29,29,.35)",
  border: "1px solid rgba(248,113,113,.35)",
  color: "#fecaca",
  textAlign: "center" as const,
  fontSize: 13,
  fontWeight: 700,
};

const dividerStyle = {
  display: "flex",
  alignItems: "center",
  gap: 18,
  marginTop: 30,
  color: "#9ca3af",
  fontSize: 13,
};

const lineStyle = {
  flex: 1,
  height: 1,
  background: "rgba(255,255,255,.15)",
};

const footerStyle = {
  marginTop: 28,
  textAlign: "center" as const,
  color: "#6b7280",
  fontSize: 11,
  letterSpacing: "1px",
};
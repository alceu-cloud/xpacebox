"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import LoginBackground from "@/components/login/LoginBackground";
import LoginCard from "@/components/login/LoginCard";
import LoginLogo from "@/components/login/LoginLogo";
import { supabase } from "@/lib/supabase";

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
      await redirecionarUsuario(session.user.id);
      return;
    }

    setVerificando(false);
  }

  async function redirecionarUsuario(userId: string) {
    const { data: perfil, error } = await supabase
      .from("profiles")
      .select("platform_role")
      .eq("id", userId)
      .single();

    if (error || !perfil) {
      console.error("ERRO PERFIL:", error);
      alert("Erro buscando perfil.");
      return;
    }

    if (perfil.platform_role === "platform_owner") {
      router.replace("/");
      return;
    }

    const { data: vinculo, error: erroVinculo } = await supabase
      .from("company_members")
      .select("company_id")
      .eq("profile_id", userId)
      .single();

    if (erroVinculo || !vinculo) {
      alert("Usuario sem empresa vinculada.");
      return;
    }

    const { data: empresa, error: erroEmpresa } = await supabase
      .from("companies")
      .select("slug")
      .eq("id", vinculo.company_id)
      .single();

    if (erroEmpresa || !empresa) {
      alert("Empresa nao encontrada.");
      return;
    }

    router.replace(`/empresa/${empresa.slug}`);
  }

  async function entrar(event: FormEvent) {
    event.preventDefault();
    setMensagem("");
    setCarregando(true);

    if (lembrar) {
      localStorage.setItem("xpacebox_email", email.trim().toLowerCase());
    } else {
      localStorage.removeItem("xpacebox_email");
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password: senha,
    });

    if (error) {
      console.log("ERRO LOGIN:", error);
      setMensagem(error.message);
      setCarregando(false);
      return;
    }

    if (data.user) {
      await redirecionarUsuario(data.user.id);
    }

    setCarregando(false);
  }

  if (verificando) {
    return (
      <LoginBackground>
        <LoginCard>
          <LoginLogo />
          <p style={verificandoStyle}>Verificando seu acesso...</p>
        </LoginCard>
      </LoginBackground>
    );
  }

  return (
    <LoginBackground>
      <LoginCard>
        <LoginLogo />

        <form onSubmit={entrar} style={{ marginTop: 48 }}>
          <label style={labelStyle}>
            E-mail
            <div style={inputWrapperStyle}>
              <span style={iconStyle}>@</span>
              <input
                className="login-input"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Digite seu e-mail"
                required
                disabled={carregando}
                style={inputStyle}
              />
            </div>
          </label>

          <label style={labelStyle}>
            Senha
            <div style={inputWrapperStyle}>
              <span style={iconStyle}>#</span>
              <input
                className="login-input"
                type={mostrarSenha ? "text" : "password"}
                autoComplete="current-password"
                value={senha}
                onChange={(event) => setSenha(event.target.value)}
                placeholder="Digite sua senha"
                required
                disabled={carregando}
                style={inputStyle}
              />

              <button
                type="button"
                onClick={() => setMostrarSenha((valor) => !valor)}
                style={eyeButtonStyle}
              >
                {mostrarSenha ? "Ocultar" : "Ver"}
              </button>
            </div>
          </label>

          <div style={optionsStyle}>
            <label style={rememberStyle}>
              <input
                type="checkbox"
                checked={lembrar}
                onChange={(event) => setLembrar(event.target.checked)}
                style={checkboxStyle}
              />
              <span>Lembrar de mim</span>
            </label>

            <button type="button" style={forgotButtonStyle}>
              Esqueci minha senha
            </button>
          </div>

          <button
            type="submit"
            disabled={carregando}
            style={{
              ...botaoStyle,
              opacity: carregando ? 0.72 : 1,
            }}
          >
            {carregando ? "Entrando..." : "Entrar"}
          </button>

          {mensagem && <div style={mensagemStyle}>{mensagem}</div>}
        </form>
      </LoginCard>
    </LoginBackground>
  );
}

const verificandoStyle = {
  textAlign: "center" as const,
  color: "#667085",
  textTransform: "uppercase" as const,
  letterSpacing: "1px",
  fontSize: 12,
  fontWeight: 700,
};

const labelStyle = {
  display: "block",
  marginBottom: 32,
  color: "#344054",
  fontSize: 28,
  fontWeight: 800,
};

const inputWrapperStyle = {
  display: "flex",
  alignItems: "center",
  marginTop: 9,
  borderRadius: 14,
  overflow: "hidden",
  border: "1px solid rgba(20,24,39,.14)",
  background: "#ffffff",
  boxShadow: "0 10px 28px rgba(20,24,39,.06)",
};

const inputStyle = {
  flex: 1,
  height: 96,
  padding: "0 24px",
  border: "none",
  outline: "none",
  background: "#ffffff",
  color: "#141827",
  fontSize: 34,
  fontWeight: 600,
};

const iconStyle = {
  width: 76,
  textAlign: "center" as const,
  fontSize: 34,
  fontWeight: 900,
  color: "#6f32d2",
};

const eyeButtonStyle = {
  alignSelf: "stretch",
  minWidth: 124,
  background: "transparent",
  border: "none",
  borderLeft: "1px solid rgba(20,24,39,.1)",
  color: "#6f32d2",
  cursor: "pointer",
  padding: "0 14px",
  fontSize: 24,
  fontWeight: 900,
};

const optionsStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  marginBottom: 42,
  alignItems: "center",
};

const rememberStyle = {
  display: "flex",
  gap: 8,
  color: "#344054",
  fontSize: 24,
  fontWeight: 700,
};

const checkboxStyle = {
  width: 30,
  height: 30,
  accentColor: "#6f32d2",
};

const forgotButtonStyle = {
  background: "transparent",
  border: "none",
  color: "#6f32d2",
  cursor: "pointer",
  fontSize: 24,
  fontWeight: 900,
};

const botaoStyle = {
  width: "100%",
  padding: 30,
  borderRadius: 14,
  border: "none",
  color: "#ffffff",
  fontWeight: 900,
  cursor: "pointer",
  background: "linear-gradient(90deg,#6f32d2,#e63dae,#ff3b25)",
  boxShadow: "0 16px 34px rgba(230,61,174,.26)",
};

const mensagemStyle = {
  marginTop: 18,
  padding: 14,
  borderRadius: 12,
  background: "rgba(255,59,37,.08)",
  color: "#b42318",
  textAlign: "center" as const,
  border: "1px solid rgba(255,59,37,.18)",
  fontSize: 22,
  fontWeight: 700,
};

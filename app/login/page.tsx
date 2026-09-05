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
          <p className="xb-login-checking">Verificando seu acesso</p>
        </LoginCard>
      </LoginBackground>
    );
  }

  return (
    <LoginBackground>
      <LoginCard>
        <LoginLogo />

        <form onSubmit={entrar} className="xb-login-form">
          <label className="xb-login-field">
            E-mail
            <div className="xb-login-input-wrap">
              <span aria-hidden="true">@</span>
              <input
                className="xb-login-input"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Digite seu e-mail"
                required
                disabled={carregando}
              />
            </div>
          </label>

          <label className="xb-login-field">
            Senha
            <div className="xb-login-input-wrap">
              <span aria-hidden="true">*</span>
              <input
                className="xb-login-input"
                type={mostrarSenha ? "text" : "password"}
                autoComplete="current-password"
                value={senha}
                onChange={(event) => setSenha(event.target.value)}
                placeholder="Digite sua senha"
                required
                disabled={carregando}
              />

              <button
                type="button"
                onClick={() => setMostrarSenha((valor) => !valor)}
                className="xb-login-password-toggle"
              >
                {mostrarSenha ? "Ocultar" : "Ver"}
              </button>
            </div>
          </label>

          <div className="xb-login-options">
            <label className="xb-login-remember">
              <input
                type="checkbox"
                checked={lembrar}
                onChange={(event) => setLembrar(event.target.checked)}
              />
              <span>Lembrar de mim</span>
            </label>

            <button type="button" className="xb-login-forgot">
              Esqueci minha senha
            </button>
          </div>

          <button
            type="submit"
            disabled={carregando}
            className="xb-login-submit"
          >
            {carregando ? "Entrando..." : "Entrar"}
          </button>

          {mensagem && <div className="xb-login-message">{mensagem}</div>}
        </form>
      </LoginCard>
    </LoginBackground>
  );
}

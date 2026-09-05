"use client";

import Image from "next/image";
import { useParams, usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";
import { CrmOperationalLockProvider } from "@/components/clientes/CrmOperationalLock";

type EmpresaLayoutProps = {
  children: ReactNode;
};

export default function EmpresaLayout({ children }: EmpresaLayoutProps) {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();

  const slug = String(params.slug ?? "");
  const nomeEmpresa = slug.toUpperCase();
  const logoEmpresa = slug === "dawos" ? "/companies/dawos-logo.jpg" : "";
  const noGerenciador = pathname.includes("/gerenciador");

  const [ehAdmin, setEhAdmin] = useState(false);
  const [emailLogado, setEmailLogado] = useState("");
  const [acoesAbertas, setAcoesAbertas] = useState(false);

  useEffect(() => {
    async function verificarUsuario() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) return;

      setEmailLogado(session.user.email ?? "");

      const { data: perfil } = await supabase
        .from("profiles")
        .select("platform_role")
        .eq("id", session.user.id)
        .single();

      if (perfil?.platform_role === "platform_owner") {
        setEhAdmin(true);
      }
    }

    verificarUsuario();
  }, []);

  async function sair() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <CrmOperationalLockProvider>
    <div className="xb-company-app">
      <header className="xb-company-header">
        <div className="xb-company-identity">
          {logoEmpresa ? (
            <Image
              src={logoEmpresa}
              alt={nomeEmpresa}
              width={300}
              height={130}
              priority
              className="xb-company-logo"
            />
          ) : (
            <strong className="xb-company-name">{nomeEmpresa}</strong>
          )}

          <div className="xb-company-context">
            <span className="xb-company-kicker">
              {noGerenciador ? "GERENCIADOR DA EMPRESA" : "AMBIENTE DA EMPRESA"}
            </span>
            <span className="xb-company-description">
              {noGerenciador
                ? "CONFIGURACOES DA DAWOS"
                : "ESCOLHA O MODULO QUE DESEJA ACESSAR."}
            </span>
            {noGerenciador && (
              <span className="xb-company-session">LOGADO: {emailLogado || "USUARIO"}</span>
            )}
          </div>
        </div>

        <Image
          src="/xpacebox-logo-light.svg"
          alt="XPACEBOX"
          width={900}
          height={220}
          priority
          className="xb-company-platform-logo"
        />
      </header>

      <main className="xb-company-content">{children}</main>

      <div
        className={`xb-company-actions ${acoesAbertas ? "is-open" : ""}`}
        onMouseEnter={() => setAcoesAbertas(true)}
        onMouseLeave={() => setAcoesAbertas(false)}
      >
        <button type="button" className="xb-company-actions-handle" onClick={() => setAcoesAbertas((current) => !current)} aria-label="ABRIR MENU DE ACOES" aria-expanded={acoesAbertas}>MENU</button>
        <div className="xb-company-actions-panel">
          {noGerenciador && (
            <button
              type="button"
              onClick={() => router.push(`/empresa/${slug}`)}
              className="xb-company-action-button"
            >
              INICIO
            </button>
          )}

          <button
            type="button"
            onClick={ehAdmin ? () => router.push("/") : sair}
            className="xb-company-action-button"
          >
            {ehAdmin ? "VOLTAR A CENTRAL" : "SAIR"}
          </button>
        </div>
      </div>
    </div>
    </CrmOperationalLockProvider>
  );
}

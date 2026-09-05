"use client";

import Image from "next/image";
import { useParams, usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { CrmOperationalLockProvider } from "@/components/clientes/CrmOperationalLock";
import { supabase } from "@/lib/supabase";

type EmpresaLayoutProps = { children: ReactNode };

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

  useEffect(() => {
    async function verificarUsuario() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setEmailLogado(session.user.email ?? "");
      const { data: perfil } = await supabase.from("profiles").select("platform_role").eq("id", session.user.id).single();
      setEhAdmin(perfil?.platform_role === "platform_owner");
    }
    void verificarUsuario();
  }, []);

  async function sair() { await supabase.auth.signOut(); router.push("/login"); }

  return (
    <CrmOperationalLockProvider>
      <div className="xb-company-shell">
        <header className="xb-company-topbar">
          <button type="button" className="xb-company-brand" onClick={() => router.push(`/empresa/${slug}`)} aria-label={`Abrir ${nomeEmpresa}`}>
            {logoEmpresa ? <Image src={logoEmpresa} alt={nomeEmpresa} width={300} height={130} priority className="xb-company-logo" /> : <strong>{nomeEmpresa}</strong>}
          </button>
          <div className="xb-company-context">
            <span>{noGerenciador ? "Gerenciador" : "Área de trabalho"}</span>
            <strong>{noGerenciador ? `Configurações de ${nomeEmpresa}` : "Operação comercial e industrial"}</strong>
            {noGerenciador && emailLogado ? <small>{emailLogado}</small> : null}
          </div>
          <div className="xb-company-actions">
            {noGerenciador ? <button type="button" className="xb-topbar-link" onClick={() => router.push(`/empresa/${slug}`)}>Início</button> : null}
            <Image src="/xpacebox-logo-light.svg" alt="XPACEBOX" width={900} height={220} priority className="xb-platform-logo" />
            <button type="button" className="xb-topbar-action" onClick={ehAdmin ? () => router.push("/") : sair}>{ehAdmin ? "Central" : "Sair"}</button>
          </div>
        </header>
        <main className="xb-company-content">{children}</main>
      </div>
    </CrmOperationalLockProvider>
  );
}

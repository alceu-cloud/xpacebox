"use client";

import Image from "next/image";
import BrandLogo from "@/components/ui/BrandLogo";
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
  const logoEmpresa = slug === "dawos" ? "/companies/dawos-logo-nova.png" : "";
  const noGerenciador = pathname.includes("/gerenciador");
  const [ehAdmin, setEhAdmin] = useState(false);
  const [emailLogado, setEmailLogado] = useState("");
  const [access, setAccess] = useState<{ slug: string; status: "checking" | "allowed" | "denied" | "error" }>({ slug: "", status: "checking" });
  const accessStatus = access.slug === slug ? access.status : "checking";

  useEffect(() => {
    let active = true;
    setAccess({ slug, status: "checking" });

    async function verificarUsuario() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!active) return;
      if (!session) {
        router.replace("/login");
        return;
      }

      if (slug === "xpace") {
        router.replace("/xpace");
        return;
      }

      try {
        const response = await fetch(`/api/empresas/${encodeURIComponent(slug)}/acesso`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        });
        if (!active) return;
        if (response.status === 401) {
          router.replace("/login");
          return;
        }
        if (!response.ok) {
          setAccess({ slug, status: response.status === 403 || response.status === 404 ? "denied" : "error" });
          return;
        }
        setAccess({ slug, status: "allowed" });
      } catch {
        if (active) setAccess({ slug, status: "error" });
      }
    }

    void verificarUsuario();
    return () => { active = false; };
  }, [router, slug]);

  useEffect(() => {
    if (accessStatus !== "allowed") return;
    async function verificarUsuario() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setEmailLogado(session.user.email ?? "");
      const { data: perfil } = await supabase.from("profiles").select("platform_role").eq("id", session.user.id).single();
      setEhAdmin(perfil?.platform_role === "platform_owner");
    }
    void verificarUsuario();
  }, [accessStatus]);

  async function sair() { await supabase.auth.signOut(); router.push("/login"); }

  if (accessStatus !== "allowed") {
    return (
      <main className="xb-central" aria-busy={accessStatus === "checking"}>
        <section className="xb-central-loading">
          <BrandLogo priority />
          <p>{accessStatus === "denied" ? "Você não tem acesso a esta empresa." : accessStatus === "error" ? "Não foi possível verificar seu acesso. Atualize a página." : "Verificando seu acesso..."}</p>
          {accessStatus === "denied" ? <button type="button" className="xb-topbar-action" onClick={() => router.replace("/")}>Ir para minhas empresas</button> : null}
        </section>
      </main>
    );
  }

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
            <BrandLogo priority className="xb-platform-logo" />
            <button type="button" className="xb-topbar-action" onClick={ehAdmin ? () => router.push("/") : sair}>{ehAdmin ? "Central" : "Sair"}</button>
          </div>
        </header>
        <main className="xb-company-content">{children}</main>
      </div>
    </CrmOperationalLockProvider>
  );
}

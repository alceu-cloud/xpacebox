"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import GerenciadorEmpresa from "@/components/gerenciador/GerenciadorEmpresa";
import { supabase } from "@/lib/supabase";

export default function GerenciadorPage() {
  const router = useRouter();
  const params = useParams();
  const slug = String(params.slug ?? "");
  const [autorizado, setAutorizado] = useState(false);
  const [verificando, setVerificando] = useState(true);

  useEffect(() => {
    async function verificarAcesso() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.replace("/login");
        return;
      }

      const { data: perfil } = await supabase
        .from("profiles")
        .select("platform_role")
        .eq("id", session.user.id)
        .single();

      if (perfil?.platform_role === "platform_owner" || perfil?.platform_role === "company_manager") {
        setAutorizado(true);
        setVerificando(false);
        return;
      }

      router.replace(`/empresa/${slug}`);
    }

    verificarAcesso();
  }, [router, slug]);

  if (verificando) {
    return <div style={loadingStyle}>VERIFICANDO ACESSO...</div>;
  }

  if (!autorizado) return null;

  return <GerenciadorEmpresa />;
}

const loadingStyle = {
  minHeight: 240,
  display: "grid",
  placeItems: "center",
  color: "#667085",
  fontSize: 18,
  fontWeight: 900,
};

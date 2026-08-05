"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

type Profile = {
  platform_role: string;
  active: boolean;
};

type Membership = {
  company_id: string;
  companies: {
    slug: string;
    active: boolean;
  } | null;
};

export default function HomePage() {
  const router = useRouter();
  const [message, setMessage] = useState("Verificando seu acesso...");

  useEffect(() => {
    direcionarUsuario();
  }, []);

  async function direcionarUsuario() {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      router.replace("/login");
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("platform_role, active")
      .eq("id", user.id)
      .single<Profile>();

    if (profileError || !profile) {
      setMessage("Perfil do usuário não encontrado.");
      return;
    }

    if (!profile.active) {
      await supabase.auth.signOut();
      setMessage("Seu acesso está desativado.");
      return;
    }

    if (profile.platform_role === "platform_owner") {
      router.replace("/dashboard");
      return;
    }

    const { data: memberships, error: membershipsError } =
      await supabase
        .from("company_members")
        .select(
          `
          company_id,
          companies (
            slug,
            active
          )
        `
        )
        .eq("profile_id", user.id)
        .eq("active", true)
        .returns<Membership[]>();

    if (membershipsError) {
      console.error(membershipsError);
      setMessage("Erro ao localizar a empresa do usuário.");
      return;
    }

    const empresasAtivas =
      memberships?.filter(
        (membership) =>
          membership.companies &&
          membership.companies.active === true
      ) ?? [];

    if (empresasAtivas.length === 0) {
      setMessage("Nenhuma empresa está vinculada ao seu usuário.");
      return;
    }

    if (empresasAtivas.length === 1) {
      const slug = empresasAtivas[0].companies?.slug;

      if (!slug) {
        setMessage("A empresa vinculada não possui endereço válido.");
        return;
      }

      router.replace(`/empresa/${slug}`);
      return;
    }

    router.replace("/dashboard");
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0f172a",
        color: "#ffffff",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <h1>XPACEBOX</h1>
        <p>{message}</p>
      </div>
    </main>
  );
}
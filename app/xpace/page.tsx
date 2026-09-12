"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import DanceWorkspace from "@/components/xpace-dance/DanceWorkspace";
import { supabase } from "@/lib/supabase";

export default function XpacePage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    async function checkAccess() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace("/login");
        return;
      }
      const response = await fetch("/api/empresas/xpace", { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (!response.ok) {
        router.replace("/");
        return;
      }
      setAuthorized(true);
    }
    void checkAccess();
  }, [router]);

  if (!authorized) return <main className="xd-loading" aria-busy="true">CARREGANDO AMBIENTE</main>;
  return <DanceWorkspace />;
}

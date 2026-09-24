"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import DanceWorkspace from "@/components/xpace-dance/DanceWorkspace";
import { supabase } from "@/lib/supabase";

type XpaceAccess = { success: true; canAccessCentral: boolean };

export default function XpacePage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [canAccessCentral, setCanAccessCentral] = useState(false);

  useEffect(() => {
    async function checkAccess() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace("/login");
        return;
      }
      const response = await fetch("/api/empresas/xpace", { headers: { Authorization: `Bearer ${session.access_token}` } });
      const payload = await response.json().catch(() => null) as XpaceAccess | null;
      if (!response.ok || !payload?.success) {
        router.replace("/");
        return;
      }
      setCanAccessCentral(payload.canAccessCentral === true);
      setAuthorized(true);
    }
    void checkAccess();
  }, [router]);

  if (!authorized) return <main className="xd-loading" aria-busy="true">CARREGANDO AMBIENTE</main>;
  async function exitXpace() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return <DanceWorkspace canAccessCentral={canAccessCentral} onExit={exitXpace} />;
}

"use client";
import { UserRoundCheck, UserRoundPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import CompanyNoticePanel from "@/components/notifications/CompanyNoticePanel";
import type { CompanyNotice } from "@/lib/notifications";
export default function XpaceHomeOverview({ onOpen, onPreferences }: { onOpen?: (notice: CompanyNotice) => void; onPreferences?: () => void }) {
  const [metrics, setMetrics] = useState<{ activeClients: number; newClientsThisMonth: number }>();
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("Sua sessão expirou.");
        const response = await fetch("/api/xpace/home", { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
        const payload = await response.json();
        if (!response.ok || !payload.success) throw new Error("Não foi possível carregar os indicadores.");
        if (active) setMetrics(payload.metrics);
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : "Falha ao carregar indicadores."); }
    })();
    return () => { active = false; };
  }, []);
  return <section className="xd-home-overview" aria-label="Resumo da XPACE"><div className="xd-home-stats"><article className="xd-home-stat xd-home-stat--active"><span className="xd-home-stat-icon"><UserRoundCheck size={21} aria-hidden="true" /></span><div><span className="xd-home-stat-label">CLIENTES ATIVOS</span><strong>{metrics?.activeClients ?? "—"}</strong><small>Pessoas com contrato ativo hoje</small></div></article><article className="xd-home-stat xd-home-stat--new"><span className="xd-home-stat-icon"><UserRoundPlus size={21} aria-hidden="true" /></span><div><span className="xd-home-stat-label">CLIENTES NOVOS</span><strong>{metrics?.newClientsThisMonth ?? "—"}</strong><small>Primeira venda efetivada neste mês</small></div></article>{error ? <p role="alert">{error}</p> : null}</div><CompanyNoticePanel slug="xpace" onOpen={onOpen} onPreferences={onPreferences} /></section>;
}

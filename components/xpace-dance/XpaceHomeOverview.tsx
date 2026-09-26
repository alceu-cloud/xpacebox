"use client";

import { Bell, ChevronLeft, ChevronRight, RefreshCw, UserRoundCheck, UserRoundPlus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";

type HomeOverview = {
  success: true;
  metrics: { activeClients: number; newClientsThisMonth: number };
  notifications: {
    items: Array<{ id: string; title: string; scheduledOn: string; createdAt: string }>;
    total: number;
    unread: number;
    latestCreatedAt: string | null;
    page: number;
    pageSize: number;
  };
};

function dateLabel(value: string) {
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Sao_Paulo" }).format(parsed);
}

export default function XpaceHomeOverview() {
  const [overview, setOverview] = useState<HomeOverview | null>(null);
  const [userId, setUserId] = useState("");
  const [seenAt, setSeenAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (page: number, lastSeen: string) => {
    setLoading(true);
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sua sessão expirou. Entre novamente para ver o resumo.");
      setUserId(session.user.id);
      const query = new URLSearchParams({ page: String(page) });
      if (lastSeen) query.set("seenAt", lastSeen);
      const response = await fetch(`/api/xpace/home?${query}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null) as (HomeOverview & { message?: string }) | null;
      if (!response.ok || !payload?.success) throw new Error(payload?.message || "Não foi possível carregar o resumo.");
      setOverview(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar o resumo.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active || !session) return;
      const lastSeen = window.localStorage.getItem(`xpace_home_notifications_seen_${session.user.id}`) || "";
      setSeenAt(lastSeen);
      void load(0, lastSeen);
    });
    return () => { active = false; };
  }, [load]);

  function markAllRead() {
    const latest = overview?.notifications.latestCreatedAt;
    if (!latest || !userId) return;
    window.localStorage.setItem(`xpace_home_notifications_seen_${userId}`, latest);
    setSeenAt(latest);
    setOverview((current) => current ? { ...current, notifications: { ...current.notifications, unread: 0 } } : current);
  }

  const notifications = overview?.notifications;
  const page = notifications?.page ?? 0;
  const pageSize = notifications?.pageSize ?? 2;
  const total = notifications?.total ?? 0;
  const first = total ? page * pageSize + 1 : 0;
  const last = Math.min(total, first + (notifications?.items.length ?? 0) - 1);

  return <section className="xd-home-overview" aria-label="Resumo da XPACE">
    <div className="xd-home-stats">
      <article className="xd-home-stat xd-home-stat--active">
        <span className="xd-home-stat-icon"><UserRoundCheck size={21} aria-hidden="true" /></span>
        <div><span className="xd-home-stat-label">CLIENTES ATIVOS</span><strong>{loading && !overview ? "—" : overview?.metrics.activeClients ?? "—"}</strong><small>Pessoas com contrato ativo hoje</small></div>
      </article>
      <article className="xd-home-stat xd-home-stat--new">
        <span className="xd-home-stat-icon"><UserRoundPlus size={21} aria-hidden="true" /></span>
        <div><span className="xd-home-stat-label">CLIENTES NOVOS</span><strong>{loading && !overview ? "—" : overview?.metrics.newClientsThisMonth ?? "—"}</strong><small>Primeira venda efetivada neste mês</small></div>
      </article>
    </div>

    <article className="xd-home-notifications">
      <header>
        <div className="xd-home-notification-heading"><span className="xd-home-bell"><Bell size={20} aria-hidden="true" />{notifications?.unread ? <b aria-label={`${notifications.unread} notificações não lidas`}>{notifications.unread > 99 ? "99+" : notifications.unread}</b> : null}</span><div><strong>NOTIFICAÇÕES</strong><small>Novos agendamentos experimentais</small></div></div>
        <button type="button" className="xd-home-mark-read" disabled={!notifications?.unread} onClick={markAllRead}>Marcar todas como lidas</button>
      </header>
      {error ? <div className="xd-home-error" role="alert"><span>{error}</span><button type="button" onClick={() => void load(page, seenAt)}>Tentar novamente</button></div> : null}
      {loading && !overview ? <p className="xd-home-empty">Carregando avisos...</p> : null}
      {!loading && !error && !total ? <p className="xd-home-empty">Nenhum agendamento para mostrar ainda.</p> : null}
      {notifications?.items.length ? <div className="xd-home-notification-list">{notifications.items.map((item) => <div className="xd-home-notification" key={item.id}><span className={`xd-home-notification-dot${seenAt && item.createdAt <= seenAt ? " is-read" : ""}`} aria-hidden="true" /><div><strong>{item.title}</strong><span>Aula experimental · {dateLabel(item.scheduledOn)}</span></div></div>)}</div> : null}
      <footer><span>{total ? `${first}–${last} de ${total}` : "0 avisos"}</span><div><button type="button" aria-label="Avisos anteriores" disabled={loading || page === 0} onClick={() => void load(page - 1, seenAt)}><ChevronLeft size={17} /></button><button type="button" aria-label="Próximos avisos" disabled={loading || (page + 1) * pageSize >= total} onClick={() => void load(page + 1, seenAt)}><ChevronRight size={17} /></button><button type="button" aria-label="Atualizar avisos" disabled={loading} onClick={() => void load(page, seenAt)}><RefreshCw size={15} /></button></div></footer>
    </article>
  </section>;
}

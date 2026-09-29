"use client";

import { Bell, ChevronLeft, ChevronRight, RefreshCw, UserRoundCheck, UserRoundPlus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

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
type NotificationBucket = "UNREAD" | "READ";

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
  const [bucket, setBucket] = useState<NotificationBucket>("UNREAD");
  const requestId = useRef(0);

  const load = useCallback(async (page: number, lastSeen: string, selectedBucket: NotificationBucket, notificationsOnly = false, quiet = false) => {
    const currentRequest = ++requestId.current;
    if (!quiet) { setLoading(true); setError(""); }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sua sessão expirou. Entre novamente para ver o resumo.");
      setUserId(session.user.id);
      const query = new URLSearchParams({ page: String(page), bucket: selectedBucket });
      if (lastSeen) query.set("seenAt", lastSeen);
      if (notificationsOnly) query.set("notificationsOnly", "1");
      const response = await fetch(`/api/xpace/home?${query}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null) as (Partial<HomeOverview> & { message?: string }) | null;
      if (!response.ok || !payload?.success || !payload.notifications) throw new Error(payload?.message || "Não foi possível carregar o resumo.");
      if (currentRequest !== requestId.current) return;
      setOverview((current) => ({
        success: true,
        metrics: payload.metrics ?? current?.metrics ?? { activeClients: 0, newClientsThisMonth: 0 },
        notifications: payload.notifications!,
      }));
      return payload.notifications;
    } catch (cause) {
      if (!quiet && currentRequest === requestId.current) setError(cause instanceof Error ? cause.message : "Não foi possível carregar o resumo.");
    } finally {
      if (!quiet && currentRequest === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active || !session) return;
      const lastSeen = window.localStorage.getItem(`xpace_home_notifications_seen_${session.user.id}`) || "";
      setSeenAt(lastSeen);
      void load(0, lastSeen, "UNREAD");
    });
    return () => { active = false; };
  }, [load]);

  useEffect(() => {
    if (!userId) return;
    const timer = window.setInterval(() => {
      if (!loading && document.visibilityState === "visible") void load(overview?.notifications.page ?? 0, seenAt, bucket, true, true).then((updated) => {
        if (bucket !== "READ" || !updated?.unread) return;
        setBucket("UNREAD");
        setOverview((current) => current ? { ...current, notifications: { ...current.notifications, items: [], page: 0, total: updated.unread } } : current);
        void load(0, seenAt, "UNREAD", true, true);
      });
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [bucket, load, loading, overview?.notifications.page, seenAt, userId]);

  function markAllRead() {
    const latest = overview?.notifications.latestCreatedAt;
    if (!latest || !userId) return;
    window.localStorage.setItem(`xpace_home_notifications_seen_${userId}`, latest);
    requestId.current += 1;
    setSeenAt(latest);
    setBucket("READ");
    setOverview((current) => current ? { ...current, notifications: { ...current.notifications, items: [], unread: 0, page: 0 } } : current);
    void load(0, latest, "READ", true);
  }

  function changeBucket(nextBucket: NotificationBucket) {
    if (nextBucket === bucket) return;
    requestId.current += 1;
    setBucket(nextBucket);
    setOverview((current) => current ? { ...current, notifications: { ...current.notifications, items: [], page: 0 } } : current);
    void load(0, seenAt, nextBucket, true);
  }

  const notifications = overview?.notifications;
  const page = notifications?.page ?? 0;
  const pageSize = notifications?.pageSize ?? 2;
  const total = notifications?.total ?? 0;
  const first = total ? page * pageSize + 1 : 0;
  const last = notifications?.items.length ? Math.min(total, first + notifications.items.length - 1) : 0;

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
      <div className="xd-home-notification-tabs" role="tablist" aria-label="Situação das notificações"><button type="button" role="tab" aria-selected={bucket === "UNREAD"} className={bucket === "UNREAD" ? "is-active" : ""} onClick={() => changeBucket("UNREAD")}>NÃO LIDAS{notifications?.unread ? ` · ${notifications.unread}` : ""}</button><button type="button" role="tab" aria-selected={bucket === "READ"} className={bucket === "READ" ? "is-active" : ""} onClick={() => changeBucket("READ")}>LIDAS</button></div>
      {error ? <div className="xd-home-error" role="alert"><span>{error}</span><button type="button" onClick={() => void load(page, seenAt, bucket, true)}>Tentar novamente</button></div> : null}
      {loading && !overview ? <p className="xd-home-empty">Carregando avisos...</p> : null}
      {!loading && !error && !total ? <p className="xd-home-empty">{bucket === "UNREAD" ? "Tudo em dia! Nenhuma notificação não lida." : "Nenhuma notificação lida ainda."}</p> : null}
      {notifications?.items.length ? <div className="xd-home-notification-list">{notifications.items.map((item) => <div className="xd-home-notification" key={item.id}><span className={`xd-home-notification-dot${seenAt && item.createdAt <= seenAt ? " is-read" : ""}`} aria-hidden="true" /><div><strong>{item.title}</strong><span>Aula experimental · {dateLabel(item.scheduledOn)}</span></div></div>)}</div> : null}
      <footer><span>{total ? `${first}–${last} de ${total}` : "0 avisos"}</span><div><button type="button" aria-label="Avisos anteriores" disabled={loading || page === 0} onClick={() => void load(page - 1, seenAt, bucket, true)}><ChevronLeft size={17} /></button><button type="button" aria-label="Próximos avisos" disabled={loading || (page + 1) * pageSize >= total} onClick={() => void load(page + 1, seenAt, bucket, true)}><ChevronRight size={17} /></button><button type="button" aria-label="Atualizar avisos" disabled={loading} onClick={() => void load(page, seenAt, bucket, true)}><RefreshCw size={15} /></button></div></footer>
    </article>
  </section>;
}

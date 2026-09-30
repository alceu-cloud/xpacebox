"use client";
import { Bell, ChevronLeft, ChevronRight, RefreshCw, Settings2, AlertTriangle } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { supabase } from "@/lib/supabase";
import { notificationCategories, type CompanyNotice } from "@/lib/notifications";
type Feed = { items: CompanyNotice[]; total: number; unread: number; issueCount: number; todayErrors: number; page: number; pageSize: number; snapshotAt: string };
type Bucket = "UNREAD" | "READ" | "ISSUES";
export async function noticesRequest(slug: string, query = "", init?: RequestInit) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Sua sessão expirou. Entre novamente.");
  const response = await fetch(`/api/notifications?slug=${encodeURIComponent(slug)}${query}`, { ...init, headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, cache: "no-store" });
  const payload = await response.json();
  if (!response.ok || !payload.success) throw new Error(payload.message || "Não foi possível carregar os avisos.");
  return payload;
}
export default function CompanyNoticePanel({ slug, onOpen, onPreferences }: { slug: "dawos" | "xpace"; onOpen?: (notice: CompanyNotice) => void; onPreferences?: () => void }) {
  const [bucket, setBucket] = useState<Bucket>(slug === "dawos" ? "ISSUES" : "UNREAD");
  const [feed, setFeed] = useState<Feed>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false), [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const load = useCallback(async (selected: Bucket, page = 0, quiet = false) => {
    const id = ++seq.current;
    if (!quiet) setLoading(true);
    try { const data = await noticesRequest(slug, `&bucket=${selected}&page=${page}`); if (seq.current === id) { setFeed(data); setError(""); } }
    catch (cause) { if (seq.current === id) setError(cause instanceof Error ? cause.message : "Falha ao carregar os avisos."); }
    finally { if (seq.current === id) setLoading(false); }
  }, [slug]);
  useEffect(() => {
    let active = true;
    async function start() {
      if (slug === "xpace") {
        const { data: { session } } = await supabase.auth.getSession();
        const seen = session && localStorage.getItem(`xpace_home_notifications_seen_${session.user.id}`);
        if (seen) try { await noticesRequest(slug, "", { method: "PATCH", body: JSON.stringify({ action: "MIGRATE_READ", seenAt: seen }) }); } catch { /* Normal load surfaces server failures. */ }
      }
      if (active) void load(bucket);
    }
    void start(); return () => { active = false; seq.current++; };
  }, [slug, load, bucket]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible" && !busy) void load(bucket, feed?.page ?? 0, true); };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("company-notification-preferences", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("company-notification-preferences", refresh); };
  }, [load, bucket, feed?.page, busy]);
  async function markRead() {
    setBusy(true); setError("");
    try { await noticesRequest(slug, "", { method: "PATCH", body: JSON.stringify({ action: "MARK_READ", snapshotAt: feed?.snapshotAt }) }); setBucket("READ"); await load("READ"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível marcar como lidas."); }
    finally { setBusy(false); }
  }
  const total = feed?.total ?? 0, page = feed?.page ?? 0;
  return <article className={`xd-home-notifications cn-panel cn-panel--${slug}`} aria-label={slug === "dawos" ? "Falhas e providências DAWOS" : "Notificações e providências XPACE"} aria-busy={loading || busy}>
    <header><div className="xd-home-notification-heading"><span className="xd-home-bell">{slug === "dawos" ? <AlertTriangle size={20} aria-hidden="true" /> : <Bell size={20} aria-hidden="true" />}{feed?.unread ? <b>{feed.unread}</b> : null}</span><div><strong>{slug === "dawos" ? "FALHAS E PROVIDÊNCIAS" : "NOTIFICAÇÕES"}</strong><small>{slug === "dawos" ? `${feed?.todayErrors ?? 0} falhas ativas registradas hoje` : "Avisos por assunto · pendências até resolver"}</small></div></div>{onPreferences ? <button type="button" className="cn-settings-button" aria-label="Usuário e notificações" title="Usuário e notificações" onClick={onPreferences}><Settings2 size={17} /></button> : null}</header>
    <div className="xd-home-notification-tabs" aria-label="Filtrar avisos">{(["UNREAD", "READ", "ISSUES"] as Bucket[]).map(value => <button type="button" key={value} aria-pressed={bucket === value} className={bucket === value ? "is-active" : ""} onClick={() => setBucket(value)}>{value === "UNREAD" ? `NÃO LIDAS${feed?.unread ? ` · ${feed.unread}` : ""}` : value === "READ" ? "LIDAS" : `PROVIDÊNCIAS${feed?.issueCount ? ` · ${feed.issueCount}` : ""}`}</button>)}</div>
    {bucket !== "ISSUES" ? <button type="button" className="xd-home-mark-read cn-mark-read" disabled={busy || loading || !feed?.unread} onClick={() => void markRead()}>Marcar todas como lidas</button> : <p className="cn-helper">Não desaparecem ao ler. Corrija o registro ou a automação.</p>}
    {error ? <p className="xd-home-error" role="alert">{error}</p> : null}
    {!feed && loading ? <p className="xd-home-empty">Carregando...</p> : null}
    {feed && !total && !error ? <p className="xd-home-empty">{bucket === "ISSUES" ? "Tudo em dia! Nenhuma providência nas categorias escolhidas." : bucket === "READ" ? "Nenhuma notificação lida." : "Nenhuma notificação não lida."}</p> : null}
    <ul className="cn-notices">{feed?.items.map(item => <li key={item.id} style={{ "--cn-color": notificationCategories[item.category].color } as CSSProperties}>
      {item.diagnosis ? <div className="cn-notice cn-notice-diagnostic">
        <span className="cn-category">{notificationCategories[item.category].label} · AÇÃO NECESSÁRIA</span><strong>{item.title}</strong><span className="cn-detail">{item.detail}</span>
        <time dateTime={item.createdAt}>Tentativa: {new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(item.createdAt))}</time>
        <p className="cn-cause"><b>Motivo registrado:</b> {item.diagnosis.cause}</p>
        <details className="cn-solution"><summary>Como resolver</summary><ol>{item.diagnosis.steps.map((step, index) => <li key={index}>{step}</li>)}</ol></details>
        {onOpen ? <div className="cn-actions"><button type="button" onClick={() => onOpen(item)}>{item.diagnosis.actionLabel}</button>{item.diagnosis.secondaryTarget ? <button type="button" onClick={() => onOpen({ ...item, target: item.diagnosis!.secondaryTarget! })}>{item.diagnosis.secondaryLabel}</button> : null}</div> : null}
      </div> : <button type="button" className="cn-notice" onClick={() => onOpen?.(item)} disabled={!onOpen}><span className="cn-category">{notificationCategories[item.category].label}{bucket === "ISSUES" ? " · AÇÃO NECESSÁRIA" : ""}</span><strong>{item.title}</strong><span className="cn-detail">{item.detail}</span><time dateTime={item.createdAt}>{new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(item.createdAt))}</time></button>}
    </li>)}</ul>
    <footer><span>{total ? `${page * 2 + 1}–${Math.min(total, page * 2 + 2)} de ${total}` : "0 avisos"}</span><div><button type="button" aria-label="Avisos anteriores" disabled={loading || page === 0} onClick={() => void load(bucket, page - 1)}><ChevronLeft size={17} /></button><button type="button" aria-label="Próximos avisos" disabled={loading || (page + 1) * 2 >= total} onClick={() => void load(bucket, page + 1)}><ChevronRight size={17} /></button><button type="button" aria-label="Atualizar avisos" disabled={loading} onClick={() => void load(bucket, page)}><RefreshCw size={15} /></button></div></footer>
  </article>;
}

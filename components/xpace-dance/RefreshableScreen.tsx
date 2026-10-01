"use client";
import { RefreshCw } from "lucide-react";
import { Fragment, useEffect, useRef, useState, type ReactNode, type TouchEvent } from "react";

// Never prevent native scrolling or remount a form without the user's agreement.
export default function RefreshableScreen({ children, screenKey }: { children: ReactNode; screenKey: string }) {
  const [version, setVersion] = useState(0);
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const pulled = useRef(0);
  const busy = useRef(false);
  const dirty = useRef(false);
  useEffect(() => { document.documentElement.classList.add("xpace-pull-enabled"); return () => document.documentElement.classList.remove("xpace-pull-enabled"); }, []);
  useEffect(() => { dirty.current = false; start.current = null; pulled.current = 0; setDistance(0); }, [screenKey]);
  function begin(event: TouchEvent<HTMLElement>) {
    start.current = null;
    if (busy.current || event.touches.length !== 1 || window.scrollY > 0 || document.querySelector('dialog[open], [role="dialog"]')) return;
    const target = event.target as HTMLElement;
    if (target.closest('input, textarea, select, button, a, [contenteditable="true"], [data-no-pull-refresh]')) return;
    // A scrollable child at its own top must not refresh the page behind it.
    for (let element: HTMLElement | null = target; element && element !== event.currentTarget; element = element.parentElement) {
      if (element.scrollHeight > element.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(element).overflowY)) return;
    }
    start.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  }
  function move(event: TouchEvent<HTMLElement>) {
    if (!start.current || event.touches.length !== 1) { start.current = null; pulled.current = 0; setDistance(0); return; }
    const dx = Math.abs(event.touches[0].clientX - start.current.x);
    const dy = event.touches[0].clientY - start.current.y;
    pulled.current = dy > dx * 1.4 ? Math.min(76, Math.max(0, dy * .42)) : 0;
    setDistance(pulled.current);
  }
  async function end() {
    const refresh = Boolean(start.current && pulled.current >= 62);
    start.current = null; pulled.current = 0; setDistance(0);
    if (!refresh || busy.current) return;
    if (dirty.current && !window.confirm("Há campos alterados nesta tela. Atualizar pode descartar o que não foi salvo. Deseja continuar?")) return;
    busy.current = true; setRefreshing(true);
    try {
      const tasks: Promise<unknown>[] = [];
      window.dispatchEvent(new CustomEvent("xpace:refresh", { detail: { tasks } }));
      if (tasks.length) await Promise.allSettled(tasks);
      else { setVersion(value => value + 1); await new Promise(resolve => window.setTimeout(resolve, 400)); }
      dirty.current = false;
    } finally { busy.current = false; setRefreshing(false); }
  }
  return <main className="xd-shell xd-refreshable" onTouchStart={begin} onTouchMove={move} onTouchEnd={() => void end()} onTouchCancel={() => { start.current = null; pulled.current = 0; setDistance(0); }} onChangeCapture={event => { const target = event.target as HTMLElement; if (!target.matches('input[type="search"]') && target.closest('form, [data-unsaved-form]')) dirty.current = true; }}>
    <div className={`xd-pull-feedback${refreshing || distance ? " is-visible" : ""}`} role="status" style={{ height: refreshing ? 42 : Math.min(42, distance) }}><RefreshCw size={17} className={refreshing ? "xd-spin" : ""} /><span>{refreshing ? "Atualizando..." : distance >= 62 ? "Solte para atualizar" : "Puxe para atualizar"}</span></div>
    <Fragment key={`${screenKey}:${version}`}>{children}</Fragment>
  </main>;
}

"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { IssueAlarmTracker, playIssueAlarm, type IssueSignal } from "@/lib/issue-sound";

export function useIssueAlarm(slug: string, signals?: IssueSignal[], snapshotAt?: string) {
  const [mode, setMode] = useState<"OFF" | "WAITING" | "ACTIVE">("WAITING");
  const [key, setKey] = useState("");
  const context = useRef<AudioContext | null>(null);
  const tracker = useRef(new IssueAlarmTracker());
  useEffect(() => {
    let mounted = true;
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted || !session) return;
      const storageKey = `company_issue_sound_${slug}_${session.user.id}`;
      try {
        const saved = JSON.parse(localStorage.getItem(`${storageKey}_heard`) || "[]");
        tracker.current = new IssueAlarmTracker(Array.isArray(saved) ? saved.filter((id): id is string => typeof id === "string").slice(0, 1000) : []);
        setMode(localStorage.getItem(storageKey) === "0" ? "OFF" : "WAITING");
      } catch { tracker.current = new IssueAlarmTracker(); }
      setKey(storageKey);
    }).catch(() => { /* Keep controls disabled when session cannot be loaded. */ });
    return () => { mounted = false; void context.current?.close().catch(() => {}); context.current = null; };
  }, [slug]);

  async function unlock() {
    if (!context.current || context.current.state === "closed") context.current = new AudioContext();
    await context.current.resume();
    setMode(context.current.state === "running" ? "ACTIVE" : "WAITING");
  }
  useEffect(() => {
    if (!key || mode !== "WAITING") return;
    // Audio cannot bypass the browser's fresh-gesture requirement after reload.
    const resume = (event: Event) => {
      if (!event.isTrusted || (event.target instanceof Element && event.target.closest(".cn-sound-button"))) return;
      void unlock().catch(() => setMode("WAITING"));
    };
    document.addEventListener("pointerdown", resume);
    document.addEventListener("keydown", resume);
    return () => { document.removeEventListener("pointerdown", resume); document.removeEventListener("keydown", resume); };
  }, [key, mode]);

  useEffect(() => {
    if (!key || !signals) return;
    const check = () => {
      // Ignore stale data after a failed refresh or a backgrounded tab.
      if (!snapshotAt || Date.now() - Date.parse(snapshotAt) > 90_000 || document.visibilityState !== "visible") return;
      const alerts = tracker.current.pendingAlerts(signals, Date.now());
      if (mode === "ACTIVE" && context.current?.state === "running" && alerts.length) {
        try { playIssueAlarm(context.current); tracker.current.acknowledge(alerts); }
        catch { setMode("WAITING"); }
      }
      try { localStorage.setItem(`${key}_heard`, JSON.stringify([...tracker.current.heard].slice(-1000))); } catch { /* Audio still works without storage. */ }
    };
    check();
    const timer = window.setInterval(check, 5000);
    return () => window.clearInterval(timer);
  }, [key, mode, signals, snapshotAt]);

  async function toggle() {
    if (!key) return;
    if (mode === "ACTIVE") {
      setMode("OFF");
      try { localStorage.setItem(key, "0"); } catch { /* Keep in-memory choice. */ }
      void context.current?.suspend();
    } else {
      try { localStorage.setItem(key, "1"); } catch { /* Keep in-memory choice. */ }
      try { await unlock(); } catch { setMode("WAITING"); }
    }
  }
  const label = mode === "ACTIVE" ? "Silenciar som de providências" : mode === "WAITING" ? "Liberar som de providências" : "Ativar som de providências";
  return { mode, label, ready: Boolean(key), toggle };
}

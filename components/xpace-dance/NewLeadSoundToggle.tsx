"use client";

import { Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { supabase } from "@/lib/supabase";

type LeadSignal = { success?: boolean; latest?: { id: string; createdAt: string } | null };

function playCoinChime(context: AudioContext) {
  const start = context.currentTime;
  for (const [offset, frequency] of [[0, 880], [0.12, 1320]] as const) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, start + offset);
    gain.gain.setValueAtTime(0.0001, start + offset);
    gain.gain.exponentialRampToValueAtTime(0.13, start + offset + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.38);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start + offset);
    oscillator.stop(start + offset + 0.4);
  }
}

export default function NewLeadSoundToggle() {
  const [enabled, setEnabled] = useState(false);
  const [notice, setNotice] = useState("");
  const audioRef = useRef<AudioContext | null>(null);
  const latestRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let inFlight = false;
    async function check() {
      if (!active || inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const response = await fetch("/api/xpace/leads/signal", {
          headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store",
        });
        const payload = await response.json() as LeadSignal;
        if (!response.ok || !payload.success) throw new Error("Consulta indisponível");
        const key = payload.latest ? `${payload.latest.createdAt}:${payload.latest.id}` : "";
        if (!active) return;
        if (latestRef.current !== null && key && key !== latestRef.current && audioRef.current?.state === "running") {
          playCoinChime(audioRef.current);
        }
        latestRef.current = key;
        setNotice("");
      } catch {
        if (active) setNotice("Não foi possível acompanhar novos leads agora.");
      } finally { inFlight = false; }
    }
    void check();
    const timer = window.setInterval(() => { void check(); }, 15_000);
    document.addEventListener("visibilitychange", check);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", check); };
  }, [enabled]);

  useEffect(() => () => { void audioRef.current?.close(); }, []);

  async function toggle() {
    if (enabled) { setEnabled(false); latestRef.current = null; return; }
    try {
      audioRef.current ??= new AudioContext();
      await audioRef.current.resume();
      if (audioRef.current.state !== "running") throw new Error("SOM BLOQUEADO");
      latestRef.current = null;
      setEnabled(true);
      setNotice("");
    } catch { setNotice("O navegador bloqueou o som. Toque novamente para ativar."); }
  }

  return <button type="button" className={`xd-lead-sound-toggle${enabled ? " is-active" : ""}`} onClick={() => void toggle()} title={notice || (enabled ? "Silenciar novos leads" : "Ativar som para novos leads")} aria-label={enabled ? "Silenciar som de novos leads" : "Ativar som de novos leads"} aria-pressed={enabled}>
    {enabled ? <Volume2 size={16} aria-hidden="true" /> : <VolumeX size={16} aria-hidden="true" />}
    <span>{enabled ? "SOM DE LEADS ATIVO" : "ATIVAR SOM DE LEADS"}</span>
  </button>;
}

"use client";

import { Volume2, VolumeX } from "lucide-react";
import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";

type LeadSignal = { success?: boolean; latest?: { id: string; createdAt: string } | null };
type SoundMode = "OFF" | "ACTIVE" | "NEEDS_GESTURE";

let sharedAudioContext: AudioContext | null = null;
let latestLeadKey: string | null = null;
let signalOwner: string | null = null;

function audioContext() {
  if (!sharedAudioContext || sharedAudioContext.state === "closed") sharedAudioContext = new AudioContext();
  return sharedAudioContext;
}

function preferenceKey(userId: string) { return `xpace_lead_sound_enabled_${userId}`; }

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
  const [mode, setMode] = useState<SoundMode>("OFF");
  const [userId, setUserId] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted || !session) return;
      const id = session.user.id;
      if (signalOwner !== id) { signalOwner = id; latestLeadKey = null; }
      setUserId(id);
      if (window.localStorage.getItem(preferenceKey(id)) === "1") {
        const context = audioContext();
        setMode(context.state === "running" ? "ACTIVE" : "NEEDS_GESTURE");
        // Some browsers allow an already-authorized origin to resume on reload.
        // If they don't, preserve the preference and wait for a real gesture.
        void context.resume().then(() => { if (mounted && context.state === "running") setMode("ACTIVE"); }).catch(() => {});
      }
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (mode !== "NEEDS_GESTURE") return;
    let mounted = true;
    function reactivate(event: Event) {
      // The button has its own handler. Resuming on pointerdown here would make
      // its subsequent click see ACTIVE and immediately switch the sound off.
      if (event.target instanceof Element && event.target.closest(".xd-lead-sound-toggle")) return;
      void audioContext().resume().then(() => {
        if (mounted && sharedAudioContext?.state === "running") { setMode("ACTIVE"); setNotice(""); }
      }).catch(() => { if (mounted) setNotice("O navegador bloqueou o som. Toque para reativar."); });
    }
    document.addEventListener("pointerdown", reactivate);
    document.addEventListener("keydown", reactivate);
    return () => { mounted = false; document.removeEventListener("pointerdown", reactivate); document.removeEventListener("keydown", reactivate); };
  }, [mode]);

  useEffect(() => {
    if (mode !== "ACTIVE" || !userId) return;
    let active = true;
    let inFlight = false;
    async function check() {
      if (!active || inFlight || document.visibilityState !== "visible") return;
      if (sharedAudioContext?.state !== "running") { setMode("NEEDS_GESTURE"); return; }
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
        if (latestLeadKey !== null && key && key !== latestLeadKey && sharedAudioContext?.state === "running") {
          playCoinChime(sharedAudioContext);
        }
        latestLeadKey = key;
        setNotice("");
      } catch {
        if (active) setNotice("Não foi possível acompanhar novos leads agora.");
      } finally { inFlight = false; }
    }
    void check();
    const timer = window.setInterval(() => { void check(); }, 15_000);
    document.addEventListener("visibilitychange", check);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", check); };
  }, [mode, userId]);

  async function toggle() {
    if (!userId) return;
    if (mode === "ACTIVE") {
      window.localStorage.removeItem(preferenceKey(userId));
      latestLeadKey = null;
      setMode("OFF");
      void sharedAudioContext?.suspend();
      return;
    }
    try {
      window.localStorage.setItem(preferenceKey(userId), "1");
      const context = audioContext();
      await context.resume();
      if (context.state !== "running") throw new Error("SOM BLOQUEADO");
      if (mode === "OFF") latestLeadKey = null;
      setMode("ACTIVE");
      setNotice("");
    } catch { setMode("NEEDS_GESTURE"); setNotice("O navegador bloqueou o som. Toque para reativar."); }
  }

  const active = mode === "ACTIVE";
  const enabled = mode !== "OFF";
  const label = active ? "SOM DE LEADS ATIVO" : mode === "NEEDS_GESTURE" ? "SOM LIGADO · CLIQUE NA TELA" : "ATIVAR SOM DE LEADS";
  return <button type="button" className={`xd-lead-sound-toggle${active ? " is-active" : mode === "NEEDS_GESTURE" ? " is-waiting" : ""}`} onClick={() => void toggle()} disabled={!userId} title={notice || (mode === "NEEDS_GESTURE" ? "Sua preferência está salva. Clique aqui ou em outro ponto da tela para o navegador liberar o áudio." : label)} aria-label={active ? "Silenciar som de novos leads" : label} aria-pressed={enabled}>
    {enabled ? <Volume2 size={16} aria-hidden="true" /> : <VolumeX size={16} aria-hidden="true" />}
    <span>{label}</span>
  </button>;
}

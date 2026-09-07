"use client";

import Image from "next/image";
import { Pause, Play } from "lucide-react";
import { useEffect, useState } from "react";

export default function WorkspaceWelcome() {
  const [paused, setPaused] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(preference.matches);
    const updateVisibility = () => setHidden(document.hidden);
    updatePreference();
    updateVisibility();
    preference.addEventListener("change", updatePreference);
    document.addEventListener("visibilitychange", updateVisibility);
    return () => {
      preference.removeEventListener("change", updatePreference);
      document.removeEventListener("visibilitychange", updateVisibility);
    };
  }, []);

  return (
    <section className="xb-welcome" data-paused={paused || hidden || reducedMotion}>
      <div className="xb-welcome-art" aria-hidden="true">
        <Image src="/images/workspace-technology.webp" alt="" fill priority sizes="(max-width: 1800px) 100vw, 1800px" />
      </div>
      <div className="xb-welcome-copy">
        <span>XPACEBOX</span>
        <h1>ESCOLHA UM MÓDULO<br />PARA TRABALHAR.</h1>
      </div>
      {!reducedMotion && (
        <button type="button" className="xb-welcome-motion" onClick={() => setPaused(!paused)}
          aria-label={paused ? "Retomar animação" : "Pausar animação"}
          title={paused ? "Retomar animação" : "Pausar animação"} aria-pressed={paused}>
          {paused ? <Play size={18} aria-hidden="true" /> : <Pause size={18} aria-hidden="true" />}
        </button>
      )}
    </section>
  );
}

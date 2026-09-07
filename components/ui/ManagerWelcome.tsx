"use client";

import Image from "next/image";
import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

const signals = ["#36dcff", "#ff42b4", "#ffac58", "#a38bff", "#36dcff", "#ff42b4"];

export default function ManagerWelcome() {
  const container = useRef<HTMLElement>(null);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(preference.matches);
    const updateVisibility = () => setHidden(document.hidden);
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    if (container.current) observer.observe(container.current);
    updatePreference();
    updateVisibility();
    preference.addEventListener("change", updatePreference);
    document.addEventListener("visibilitychange", updateVisibility);
    return () => {
      observer.disconnect();
      preference.removeEventListener("change", updatePreference);
      document.removeEventListener("visibilitychange", updateVisibility);
    };
  }, []);

  return (
    <section ref={container} className="xb-manager-empty" data-paused={paused || hidden || !visible || reducedMotion} aria-labelledby="manager-welcome-title">
      <div className="xb-manager-scene" aria-hidden="true">
        <Image src="/images/workspace-technology.webp" alt="" fill sizes="(max-width: 680px) 100vw, 1600px" />
      </div>
      <div className="xb-manager-signals" aria-hidden="true">
        {signals.map((color, index) => (
          <div className="xb-manager-signal-track" key={index} style={{ "--signal-color": color, "--signal-index": index } as CSSProperties}>
            <span />
          </div>
        ))}
      </div>
      <div className="xb-manager-empty-copy">
        <span>GERENCIADOR DA EMPRESA</span>
        <h2 id="manager-welcome-title">Escolha uma area<br />para configurar.</h2>
      </div>
      {!reducedMotion && (
        <button type="button" className="xb-manager-motion" onClick={() => setPaused(!paused)}
          aria-label={paused ? "Retomar animação" : "Pausar animação"}
          title={paused ? "Retomar animação" : "Pausar animação"} aria-pressed={paused}>
          {paused ? <Play size={18} aria-hidden="true" /> : <Pause size={18} aria-hidden="true" />}
        </button>
      )}
    </section>
  );
}

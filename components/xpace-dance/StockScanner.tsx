"use client";

import { Camera, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";

export default function StockScanner({ onRead }: { onRead: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  const [manual, setManual] = useState("");
  const [error, setError] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  const onReadRef = useRef(onRead);
  useEffect(() => { onReadRef.current = onRead; }, [onRead]);
  useEffect(() => {
    if (!open) return;
    let cancelled = false, controls: IScannerControls | undefined, stream: MediaStream | undefined, decoded = false;
    function stop() { controls?.stop(); stream?.getTracks().forEach(track => track.stop()); }
    function hide() { if (document.visibilityState === "hidden") { stop(); setOpen(false); } }
    document.addEventListener("visibilitychange", hide);
    void (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) throw new Error("Abra pelo endereço HTTPS e permita a câmera. Você também pode digitar o código.");
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        if (cancelled) return;
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } });
        if (cancelled) { stop(); return; }
        if (!video.current) { stop(); return; }
        controls = await new BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 150, delayBetweenScanSuccess: 500 }).decodeFromStream(stream, video.current, (result, _error, scanner) => {
          if (!result || cancelled || decoded) return;
          decoded = true; scanner.stop(); stop(); setOpen(false); onReadRef.current(result.getText());
        });
        if (cancelled || decoded) stop();
      } catch (cause) {
        stop();
        if (!cancelled) { const name = (cause as Error).name; setError(name === "NotAllowedError" ? "Câmera não autorizada. Permita o acesso nas configurações do navegador ou digite o código." : name === "NotFoundError" ? "Nenhuma câmera encontrada. Digite o código do produto." : cause instanceof Error ? cause.message : "Não foi possível abrir a câmera."); setOpen(false); }
      }
    })();
    return () => { cancelled = true; stop(); document.removeEventListener("visibilitychange", hide); };
  }, [open]);

  return <div className="xs-scanner" data-no-pull-refresh>
    <button type="button" className="xs-primary" onClick={() => { setError(""); setOpen(true); }}><Camera size={20} /> ESCANEAR CÓDIGO DE BARRAS OU QR</button>
    <p>Aponte para a embalagem ou para o QR da folha de produtos.</p>
    {open ? <div className="xs-camera"><video ref={video} muted playsInline autoPlay aria-label="Câmera para ler o código" /><div className="xs-camera-frame" aria-hidden="true" /><button type="button" aria-label="Fechar câmera" onClick={() => setOpen(false)}><X size={20} /></button><small>Centralize o código e mantenha o celular parado.</small></div> : null}
    <form className="xs-code-input" onSubmit={event => { event.preventDefault(); if (manual.trim()) { setOpen(false); onRead(manual.trim()); } }}><label>OU DIGITE O CÓDIGO<input aria-label="Código do produto" autoCapitalize="off" autoCorrect="off" value={manual} onChange={event => setManual(event.target.value)} placeholder="Código de barras ou XP-..." maxLength={100} /></label><button type="submit" className="xs-secondary" disabled={!manual.trim()}><Search size={17} /> BUSCAR</button></form>
    {error ? <p className="xs-error" role="alert">{error}</p> : null}
  </div>;
}

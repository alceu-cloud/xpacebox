"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";
import type { CrmTelephonyCall } from "@/types/crm";

export default function TelephonyCallHistory({ slug, calls }: { slug: string; calls: CrmTelephonyCall[] }) {
  return (
    <section className="crm-call-history">
      <header>
        <div>
          <span>METRICX</span>
          <h4>CHAMADAS DO CLIENTE</h4>
        </div>
        <small>{calls.length} REGISTRO(S)</small>
      </header>
      {calls.map((call) => <CallRow key={call.id} slug={slug} call={call} />)}
      {!calls.length ? <div className="clients-empty">NENHUMA CHAMADA REGISTRADA PARA ESTE CLIENTE.</div> : null}
    </section>
  );
}

function CallRow({ slug, call }: { slug: string; call: CrmTelephonyCall }) {
  const [audioUrl, setAudioUrl] = useState("");
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioError, setAudioError] = useState("");

  useEffect(() => () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  async function loadAudio() {
    if (audioUrl || !call.hasAudio) return;
    setAudioLoading(true);
    setAudioError("");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("SESSAO NAO ENCONTRADA.");
      const response = await fetch(`/api/integracoes/baldussi/chamadas/${call.id}/audio?slug=${encodeURIComponent(slug)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.message || "NAO FOI POSSIVEL CARREGAR O AUDIO.");
      }
      const blob = await response.blob();
      if (!blob.size) throw new Error("O AUDIO RETORNOU VAZIO.");
      setAudioUrl(URL.createObjectURL(blob));
    } catch (error) {
      setAudioError(error instanceof Error ? error.message : "NAO FOI POSSIVEL CARREGAR O AUDIO.");
    } finally {
      setAudioLoading(false);
    }
  }

  return (
    <article className="crm-call-row">
      <div className="crm-call-meta">
        <span className={`crm-call-direction crm-call-direction-${call.direction.toLowerCase()}`}>{directionLabel(call.direction)}</span>
        <strong>{call.status}</strong>
        <small>{dateTime(call.startedAt)} · {duration(call.durationSeconds)}</small>
      </div>
      <div className="crm-call-content">
        <strong>{call.representativeName || "RAMAL NAO IDENTIFICADO"}</strong>
        <span>RAMAL {call.extension || "-"} · {phone(call.remotePhone)}</span>
        {call.summary ? <p>{call.summary}</p> : <p className="crm-call-pending">ANALISE DO METRICX AINDA NAO DISPONIVEL.</p>}
        {call.justification ? <p className="crm-call-justification">{call.justification}</p> : null}
        {call.transcript ? <details><summary>VER TRANSCRICAO</summary><p>{call.transcript}</p></details> : null}
      </div>
      <div className="crm-call-actions">
        {call.qualityScore !== null && call.qualityScore > 0 ? <span className="crm-call-score">NOTA {call.qualityScore.toFixed(1)}</span> : null}
        {call.hasAudio ? <button type="button" onClick={() => void loadAudio()} disabled={audioLoading || Boolean(audioUrl)}>{audioLoading ? "CARREGANDO..." : audioUrl ? "AUDIO CARREGADO" : "OUVIR AUDIO"}</button> : <small>SEM AUDIO</small>}
        {audioError ? <small className="crm-call-error">{audioError}</small> : null}
      </div>
      {audioUrl ? <audio className="crm-call-player" controls preload="metadata" src={audioUrl} /> : null}
    </article>
  );
}

function directionLabel(direction: CrmTelephonyCall["direction"]) {
  if (direction === "OUTBOUND") return "SAIDA";
  if (direction === "INBOUND") return "ENTRADA";
  return "NAO CLASSIFICADA";
}

function duration(seconds: number) {
  const total = Math.max(0, Math.round(seconds || 0));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function dateTime(value: string) {
  if (!value) return "DATA NAO INFORMADA";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value));
}

function phone(value: string) {
  const digits = value.replace(/\D/g, "").replace(/^55/, "");
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return value || "NUMERO NAO INFORMADO";
}

"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";

import { loadCrmOperationalLock, postponeCrmAgenda } from "@/lib/crm";
import { supabase } from "@/lib/supabase";
import type { CrmOperationalLock } from "@/types/crm";

type CrmOperationalLockContextValue = {
  lock: CrmOperationalLock | null;
  isBlocked: boolean;
  loading: boolean;
  refreshOperationalLock: () => Promise<void>;
};

const CrmOperationalLockContext = createContext<CrmOperationalLockContextValue | null>(null);

export function CrmOperationalLockProvider({ children }: { children: ReactNode }) {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const slug = String(params.slug ?? "");
  const rootPath = `/empresa/${slug}`;
  const [lock, setLock] = useState<CrmOperationalLock | null>(null);
  const [loading, setLoading] = useState(true);
  const [crmAccessGranted, setCrmAccessGranted] = useState(false);
  const [postponing, setPostponing] = useState(false);
  const [error, setError] = useState("");

  const refreshOperationalLock = useCallback(async () => {
    if (!slug) return;
    try {
      const nextLock = await loadCrmOperationalLock(slug);
      setLock(nextLock);
      setError("");
    } catch (lockError) {
      setError(messageFrom(lockError));
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    setLoading(true);
    setCrmAccessGranted(false);
    void refreshOperationalLock();
  }, [refreshOperationalLock]);

  useEffect(() => {
    setCrmAccessGranted(false);
  }, [lock?.activityId]);

  const isBlocked = Boolean(lock);
  const shouldShowGate = isBlocked && (!crmAccessGranted || pathname !== rootPath);
  const contextValue = useMemo(
    () => ({ lock, isBlocked, loading, refreshOperationalLock }),
    [isBlocked, loading, lock, refreshOperationalLock]
  );

  async function handlePostpone() {
    if (!lock) return;
    setPostponing(true);
    setError("");
    try {
      await postponeCrmAgenda(slug, lock.clientId, lock.activityId);
      setCrmAccessGranted(false);
      await refreshOperationalLock();
    } catch (postponeError) {
      setError(messageFrom(postponeError));
    } finally {
      setPostponing(false);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <CrmOperationalLockContext.Provider value={contextValue}>
      {children}
      {shouldShowGate && lock ? (
        <aside style={overlayStyle} role="alertdialog" aria-modal="true" aria-label="PENDENCIA ATRASADA">
          <section style={panelStyle}>
            <span style={eyebrowStyle}>PENDENCIA COMERCIAL ATRASADA</span>
            <h2 style={titleStyle}>ANTES DE ABRIR OUTRO MODULO, RESOLVA ESTE ATENDIMENTO.</h2>
            <p style={descriptionStyle}>A rotina fica liberada assim que voce registrar o contato ou adiar esta agenda para o proximo dia util.</p>
            <div style={detailsStyle}>
              <Detail label="CLIENTE" value={lock.clientName} />
              <Detail label="ACAO" value={actionLabel(lock.nextActionType)} />
              <Detail label="VENCIMENTO" value={displayDateTime(lock.nextActionAt)} />
              {lock.opportunityTitle ? <Detail label="OPORTUNIDADE" value={lock.opportunityTitle} /> : null}
            </div>
            {error ? <p style={errorStyle}>{error}</p> : null}
            <div style={actionsStyle}>
              <button
                type="button"
                onClick={() => {
                  setCrmAccessGranted(true);
                  router.push(`${rootPath}?crm=pendencia`);
                }}
                style={primaryButtonStyle}
              >
                ATENDER AGORA
              </button>
              {lock.canPostpone ? (
                <button type="button" onClick={handlePostpone} disabled={postponing} style={secondaryButtonStyle}>
                  {postponing ? "ADIANDO..." : `ADIAR PARA O PROXIMO DIA UTIL (${lock.postponementCount}/3)`}
                </button>
              ) : (
                <strong style={limitStyle}>ESTA AGENDA JA FOI ADIADA 3 VEZES. REGISTRE O ATENDIMENTO PARA SEGUIR.</strong>
              )}
            </div>
            <button type="button" onClick={handleSignOut} style={signOutStyle}>SAIR DO SISTEMA</button>
          </section>
        </aside>
      ) : null}
    </CrmOperationalLockContext.Provider>
  );
}

export function useCrmOperationalLock() {
  const context = useContext(CrmOperationalLockContext);
  if (!context) throw new Error("CRM OPERATIONAL LOCK PROVIDER AUSENTE.");
  return context;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div style={detailStyle}><span>{label}</span><strong>{value}</strong></div>;
}

function actionLabel(value: string) {
  const labels: Record<string, string> = { WHATSAPP: "WHATSAPP", CALL: "LIGAR", EMAIL: "E-MAIL", VISIT: "VISITAR", QUOTE: "ORCAMENTO", FOLLOW_UP: "ACOMPANHAR" };
  return labels[value] || "ACOMPANHAR";
}

function displayDateTime(value: string) {
  if (!value) return "NAO INFORMADO";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "NAO FOI POSSIVEL ATUALIZAR A AGENDA.";
}

const overlayStyle = {
  position: "fixed" as const,
  inset: 0,
  zIndex: 500,
  display: "grid",
  placeItems: "center",
  padding: 24,
  background: "rgba(20,24,39,.68)",
  backdropFilter: "blur(7px)",
};
const panelStyle = { width: "min(100%, 700px)", padding: 34, borderRadius: 8, border: "1px solid rgba(255,59,37,.42)", background: "#ffffff", boxShadow: "0 28px 72px rgba(0,0,0,.28)" };
const eyebrowStyle = { display: "block", color: "#e6007e", fontSize: 12, fontWeight: 900, letterSpacing: "1.6px" };
const titleStyle = { margin: "12px 0 10px", color: "#141827", fontSize: 28, lineHeight: 1.12, fontWeight: 900, letterSpacing: 0 };
const descriptionStyle = { margin: 0, color: "#667085", fontSize: 15, lineHeight: 1.5, fontWeight: 700 };
const detailsStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10, marginTop: 24 };
const detailStyle = { display: "grid", gap: 5, minHeight: 60, padding: "12px 14px", border: "1px solid rgba(52,64,84,.14)", borderRadius: 6, background: "#f8f9fc" };
const actionsStyle = { display: "flex", flexWrap: "wrap" as const, alignItems: "center", gap: 10, marginTop: 22 };
const primaryButtonStyle = { minHeight: 46, padding: "0 20px", border: "1px solid #6f32d2", borderRadius: 6, background: "#6f32d2", color: "#ffffff", fontWeight: 900, cursor: "pointer" };
const secondaryButtonStyle = { minHeight: 46, padding: "0 18px", border: "1px solid rgba(230,128,25,.55)", borderRadius: 6, background: "#ffffff", color: "#c76a00", fontWeight: 900, cursor: "pointer" };
const limitStyle = { color: "#c82525", fontSize: 13, lineHeight: 1.35 };
const signOutStyle = { marginTop: 20, padding: 0, border: 0, background: "transparent", color: "#667085", fontSize: 12, fontWeight: 900, textDecoration: "underline", cursor: "pointer" };
const errorStyle = { margin: "18px 0 0", padding: "10px 12px", borderRadius: 6, background: "#fff0f0", color: "#c82525", fontSize: 13, fontWeight: 800 };

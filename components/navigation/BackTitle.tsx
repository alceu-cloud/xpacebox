"use client";

import { useRouter, usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from "react";
import { allowWorkspaceNavigation } from "./navigation-guard";

const RouteContext = createContext<((fallback: string) => void) | null>(null);

export function RouteBackProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const trail = useRef<string[]>([]);
  const popped = useRef(false);
  const referrerAvailable = useRef(true);
  useEffect(() => {
    const onPop = () => { popped.current = true; referrerAvailable.current = false; };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => {
    if (trail.current.at(-1) === pathname) { popped.current = false; return; }
    const previous = trail.current.lastIndexOf(pathname);
    if (popped.current && previous >= 0) trail.current = trail.current.slice(0, previous + 1);
    else trail.current.push(pathname);
    popped.current = false;
  }, [pathname]);
  const back = useCallback((fallback: string) => {
    // A direct link must not send someone back to an unrelated external site.
    const internalReferrer = referrerAvailable.current && document.referrer && new URL(document.referrer).origin === location.origin;
    if (window.history.length > 1 && (trail.current.length > 1 || internalReferrer)) router.back();
    else { trail.current = []; referrerAvailable.current = false; router.replace(fallback); }
  }, [router]);
  return <RouteContext.Provider value={back}>{children}</RouteContext.Provider>;
}

export default function BackTitle({ title, children, onBack, fallbackHref = "/", className = "", disabled = false }: { title: string; children?: ReactNode; onBack?: () => void; fallbackHref?: string; className?: string; disabled?: boolean }) {
  const routeBack = useContext(RouteContext);
  const router = useRouter();
  return <button type="button" className={`xb-back-title ${className}`.trim()} aria-label={title} title="Voltar à tela anterior" disabled={disabled} onClick={() => { if (allowWorkspaceNavigation()) { if (onBack) onBack(); else if (routeBack) routeBack(fallbackHref); else router.replace(fallbackHref); } }}>{children || title}</button>;
}

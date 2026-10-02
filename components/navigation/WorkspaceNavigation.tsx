"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { popScreen, pushScreen } from "@/lib/navigation";

type BackAction = { title: string; back: () => void };
type Navigation = { action: BackAction | null; register: (action: BackAction) => () => void };
const Context = createContext<Navigation | null>(null);

export function WorkspaceNavigationProvider({ children }: { children: ReactNode }) {
  const [entry, setEntry] = useState<(BackAction & { token: symbol }) | null>(null);
  const register = useCallback((action: BackAction) => {
    const token = Symbol();
    setEntry({ ...action, token });
    return () => setEntry(current => current?.token === token ? null : current);
  }, []);
  const value = useMemo(() => ({ action: entry, register }), [entry, register]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useWorkspaceNavigation() { return useContext(Context); }

// Nested views replace the shared title/back action, without another loose button.
export function useWorkspaceBack(title: string, back: (() => void) | null) {
  const navigation = useContext(Context);
  const register = navigation?.register;
  const callback = useRef(back);
  callback.current = back;
  const enabled = Boolean(back);
  useEffect(() => {
    if (!register || !enabled) return;
    return register({ title, back: () => callback.current?.() });
  }, [register, title, enabled]);
  return Boolean(navigation);
}

const entryHistoryKey = "xpaceboxScreenHistory";

export function clearScreenHistory(key: string) {
  const saved = { ...(window.history.state?.[entryHistoryKey] || {}) };
  delete saved[key];
  window.history.replaceState({ ...window.history.state, [entryHistoryKey]: saved }, "");
}

export function useScreenHistory<T>(initial: T, entryKey?: string) {
  const [trail, setTrail] = useState<T[]>([initial]);
  const initialized = useRef<string | null>(null);
  const restoring = useRef<T[] | null>(null);
  useEffect(() => {
    if (!entryKey) return;
    if (initialized.current !== entryKey) {
      initialized.current = entryKey;
      const saved = window.history.state?.[entryHistoryKey]?.[entryKey];
      if (Array.isArray(saved) && saved.length && saved.every(item => typeof item === "string" || item === null)) {
        restoring.current = saved as T[];
        setTrail(saved as T[]);
        return;
      }
      restoring.current = [initial];
      setTrail(restoring.current);
      return;
    }
    if (restoring.current && trail !== restoring.current) return;
    restoring.current = null;
    const saved = window.history.state?.[entryHistoryKey] || {};
    if (JSON.stringify(saved[entryKey]) !== JSON.stringify(trail)) window.history.replaceState({ ...window.history.state, [entryHistoryKey]: { ...saved, [entryKey]: trail } }, "");
  }, [entryKey, trail]);
  const open = useCallback((next: T) => setTrail(previous => pushScreen(previous, next)), []);
  const back = useCallback(() => setTrail(popScreen), []);
  const reset = useCallback((next: T) => setTrail([next]), []);
  return { current: trail[trail.length - 1], open, back, reset, canBack: trail.length > 1 };
}

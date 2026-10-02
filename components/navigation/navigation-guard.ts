"use client";
import { useEffect, useRef } from "react";

export function allowWorkspaceNavigation() {
  return window.dispatchEvent(new Event("xpacebox:before-navigation", { cancelable: true }));
}

export function useNavigationGuard(busy: boolean, dirty: boolean) {
  const current = useRef({ busy, dirty });
  current.current = { busy, dirty };
  useEffect(() => {
    const check = (event: Event) => {
      if (current.current.busy || (current.current.dirty && !window.confirm("Há preferências alteradas que não foram salvas. Deseja sair sem salvar?"))) event.preventDefault();
    };
    window.addEventListener("xpacebox:before-navigation", check);
    return () => window.removeEventListener("xpacebox:before-navigation", check);
  }, []);
}

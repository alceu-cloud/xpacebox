"use client";
import Image from "next/image";
import Link from "next/link";
import { allowWorkspaceNavigation } from "@/components/navigation/navigation-guard";

export default function BrandLogo({ className = "", priority = false }: { className?: string; priority?: boolean }) {
  return <Link href="/" className="xb-brand-link" aria-label="XPACEBOX · ir para a tela inicial" onClick={event => { if (!allowWorkspaceNavigation()) event.preventDefault(); }}><Image src="/images/xpacebox-brand.png" alt="XPACEBOX" width={2048} height={768} priority={priority} className={`xb-brand-logo ${className}`} sizes="(max-width: 680px) 180px, 260px" /></Link>;
}

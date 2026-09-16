"use client";

export default function BuildRevision({ className = "" }: { className?: string }) {
  const revision = process.env.NEXT_PUBLIC_BUILD_REVISION || "LOCAL";

  return <small className={`xb-build-revision ${className}`.trim()}>VERSÃO {revision}</small>;
}

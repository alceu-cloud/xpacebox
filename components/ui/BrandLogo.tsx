import Image from "next/image";

export default function BrandLogo({ className = "", priority = false }: { className?: string; priority?: boolean }) {
  return <Image src="/images/xpacebox-brand.png" alt="XPACEBOX" width={2048} height={768} priority={priority} className={`xb-brand-logo ${className}`} sizes="(max-width: 680px) 180px, 260px" />;
}

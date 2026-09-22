import type { Metadata } from "next";

import "./pocket.css";

export const metadata: Metadata = {
  title: "XPACE · Agenda",
  description: "Painel e chamada diária da escola XPACE.",
  manifest: "/xpace/app/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "XPACE",
    statusBarStyle: "black-translucent",
  },
};

export default function PocketLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}

import type { Metadata } from "next";

import "./pocket.css";

export const metadata: Metadata = {
  title: "XPACE · Escola",
  description: "Painel, chamada diária e estoque da escola XPACE.",
  manifest: "/xpace/app/manifest.webmanifest",
  icons: {
    icon: [{ url: "/xpace-school-app-icon.png", sizes: "1254x1254", type: "image/png" }],
    apple: [{ url: "/xpace-school-app-icon.png", sizes: "1254x1254", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "XPACE",
    statusBarStyle: "black-translucent",
  },
};

export default function PocketLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}

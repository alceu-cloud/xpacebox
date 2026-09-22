import type { Metadata } from "next";
import "./globals.css";
import "./workspace.css";

export const metadata: Metadata = {
  title: "XPACEBOX",
  description: "Plataforma inteligente para gestao multiempresa.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/xpacebox-system-icon.png", sizes: "1254x1254", type: "image/png" }],
    apple: [{ url: "/xpacebox-system-icon.png", sizes: "1254x1254", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "XPACEBOX",
    statusBarStyle: "black-translucent",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}

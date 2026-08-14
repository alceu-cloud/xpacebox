import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "XPACEBOX",
  description: "Plataforma inteligente para gestao multiempresa.",
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

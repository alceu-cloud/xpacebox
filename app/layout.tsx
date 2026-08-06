import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "XPACEBOX",
  description: "Plataforma Inteligente para Gestão",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          padding: 0,
          background: "#05060d",
          overflowX: "hidden",
        }}
      >
        {children}
      </body>
    </html>
  );
}
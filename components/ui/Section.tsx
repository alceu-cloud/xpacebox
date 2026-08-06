import { ReactNode } from "react";

type SectionProps = {
  titulo: string;
  children: ReactNode;
};

export default function Section({
  titulo,
  children,
}: SectionProps) {
  return (
    <section
      style={{
        marginBottom: 32,
      }}
    >
      <h2
        style={{
          marginBottom: 16,
          fontSize: 22,
          fontWeight: 700,
          color: "#111827",
        }}
      >
        {titulo}
      </h2>

      {children}
    </section>
  );
}
import { ReactNode } from "react";

type Props = {
  children: ReactNode;
};

export default function LoginCard({ children }: Props) {
  return (
    <div
      style={{
        width: "100%",
        maxWidth: 940,
        margin: "0 auto",
        padding: "74px 86px",
        borderRadius: 34,
        background: "rgba(255,255,255,.94)",
        backdropFilter: "blur(22px)",
        WebkitBackdropFilter: "blur(22px)",
        border: "1px solid rgba(20,24,39,.1)",
        boxShadow: "0 28px 90px rgba(39,36,67,.16)",
      }}
    >
      {children}
    </div>
  );
}

import { ReactNode } from "react";

type Props = {
  children: ReactNode;
};

export default function LoginCard({ children }: Props) {
  return (
    <div
      style={{
        width: "100%",
        maxWidth: 520,
        margin: "0 auto",
        padding: "55px",
        borderRadius: 30,
        background: "rgba(10,10,18,.88)",
        backdropFilter: "blur(25px)",
        WebkitBackdropFilter: "blur(25px)",
        boxShadow:
          "0 25px 80px rgba(0,0,0,.55), inset 0 0 0 1px rgba(255,255,255,.06)",
      }}
    >
      {children}
    </div>
  );
}
import type { ReactNode } from "react";

export default function LoginCard({ children }: { children: ReactNode }) {
  return <section className="xb-login-card">{children}</section>;
}

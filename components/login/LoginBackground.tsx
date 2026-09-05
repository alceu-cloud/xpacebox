import type { ReactNode } from "react";

export default function LoginBackground({ children }: { children: ReactNode }) {
  return <main className="xb-login-page"><div className="xb-login-frame">{children}</div></main>;
}

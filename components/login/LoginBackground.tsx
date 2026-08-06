import { ReactNode } from "react";

type Props = {
  children: ReactNode;
};

export default function LoginBackground({ children }: Props) {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        position: "relative",
        overflow: "hidden",
        fontFamily: "Arial, sans-serif",
        background:
          "linear-gradient(135deg,#05060d 0%,#09091a 35%,#130b2d 70%,#18080d 100%)",
      }}
    >
      {/* Luz Roxa */}
      <div
        style={{
          position: "absolute",
          width: 900,
          height: 900,
          borderRadius: "50%",
          left: -300,
          top: -250,
          background: "rgba(124,58,237,.22)",
          filter: "blur(180px)",
        }}
      />

      {/* Luz Laranja */}
      <div
        style={{
          position: "absolute",
          width: 900,
          height: 900,
          borderRadius: "50%",
          right: -320,
          bottom: -320,
          background: "rgba(249,115,22,.18)",
          filter: "blur(180px)",
        }}
      />

      {/* Linhas Roxas */}
      <div
        style={{
          position: "absolute",
          left: -180,
          top: -120,
          width: 700,
          height: 700,
          transform: "rotate(-35deg)",
          background:
            "repeating-linear-gradient(90deg, transparent 0 34px, rgba(168,85,247,.10) 35px 37px)",
          opacity: .8,
        }}
      />

      {/* Linhas Laranja */}
      <div
        style={{
          position: "absolute",
          right: -180,
          bottom: -120,
          width: 700,
          height: 700,
          transform: "rotate(-35deg)",
          background:
            "repeating-linear-gradient(90deg, transparent 0 34px, rgba(249,115,22,.10) 35px 37px)",
          opacity: .8,
        }}
      />

      {/* X Esquerdo */}
      <div
        style={{
          position: "absolute",
          left: -120,
          top: 120,
          width: 320,
          height: 320,
          transform: "rotate(45deg)",
          border: "2px solid rgba(168,85,247,.18)",
        }}
      />

      {/* X Direito */}
      <div
        style={{
          position: "absolute",
          right: -120,
          bottom: 80,
          width: 320,
          height: 320,
          transform: "rotate(45deg)",
          border: "2px solid rgba(249,115,22,.18)",
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 10,
          width: "100%",
          maxWidth: 1400,
          padding: 40,
        }}
      >
        {children}
      </div>
    </main>
  );
}
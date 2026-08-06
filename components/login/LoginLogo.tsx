import Image from "next/image";

export default function LoginLogo() {
  return (
    <div
      style={{
        textAlign: "center",
        marginBottom: 0,
      }}
    >
      <Image
        src="/logo-xpacebox.png"
        alt="XPACEBOX"
        width={900}
        height={450}
        priority
        style={{
        width: "700px",
        maxWidth: "100%",
        height: "auto",
        margin: "0 auto",
        display: "block",
        }}
      />

      <h2
        style={{
          marginTop: 0,
          marginBottom: 8,
          color: "#FFFFFF",
          fontSize: 28,
          fontWeight: 800,
          textTransform: "uppercase",
          letterSpacing: "1px",
        }}
      >
        BEM-VINDO DE VOLTA!
      </h2>

      <div
        style={{
          color: "#9CA3AF",
          textTransform: "uppercase",
          letterSpacing: "1px",
          fontSize: 15,
        }}
      >
        FAÇA LOGIN PARA ACESSAR SUA CONTA
      </div>
    </div>
  );
}
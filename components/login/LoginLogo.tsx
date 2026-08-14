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
        src="/xpacebox-logo-light.svg"
        alt="XPACEBOX"
        width={900}
        height={220}
        priority
        className="xb-logo"
        style={{
          width: "700px",
          maxWidth: "100%",
          height: "auto",
          margin: "0 auto",
        }}
      />

      <h2
        style={{
          marginTop: 8,
          marginBottom: 8,
          color: "#141827",
          fontSize: 42,
          fontWeight: 800,
          textTransform: "uppercase",
        }}
      >
        Bem-vindo de volta
      </h2>

      <div
        style={{
          color: "#667085",
          textTransform: "uppercase",
          letterSpacing: "1px",
          fontSize: 18,
          fontWeight: 700,
        }}
      >
        Acesse sua central XPACEBOX
      </div>
    </div>
  );
}

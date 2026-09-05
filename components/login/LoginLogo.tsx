import Image from "next/image";

export default function LoginLogo() {
  return (
    <header className="xb-login-brand">
      <Image src="/xpacebox-logo-light.svg" alt="XPACEBOX" width={900} height={220} priority />
      <span>Área segura</span>
      <h1>Entre na sua conta.</h1>
      <p>Use seus dados de acesso para continuar.</p>
    </header>
  );
}

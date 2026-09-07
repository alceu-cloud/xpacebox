import BrandLogo from "@/components/ui/BrandLogo";

export default function LoginLogo() {
  return (
    <header className="xb-login-brand">
      <BrandLogo priority />
      <span>Área segura</span>
      <h1>Entre na sua conta.</h1>
      <p>Use seus dados de acesso para continuar.</p>
    </header>
  );
}

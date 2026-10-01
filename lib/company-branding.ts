const companyLogos = {
  dawos: "/companies/dawos-logo-nova.png",
  gta: "/companies/gta-logo.png",
  carcat: "/companies/carcat-logo.png",
} as const;

export function companyLogo(slug: string) {
  return Object.hasOwn(companyLogos, slug) ? companyLogos[slug as keyof typeof companyLogos] : "";
}

// Existing custom logos take precedence; saved empty values use the brand default.
export function resolveCompanyLogo(slug: string, configured?: string | null) {
  return configured?.trim() || companyLogo(slug);
}

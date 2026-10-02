// Preparation catalog only. This does not grant access or alter the live pricebook.
export const linkHubAddon = Object.freeze({
  code: "LINK_HUB",
  name: "Árvore de links",
  monthlyCents: 1990,
  status: "PREPARATION",
} as const);

export const linkHubSections = Object.freeze([
  { code: "CONTRACTS", title: "Contratos e planos", description: "Escolha e contratação dos planos da empresa." },
  { code: "PRODUCTS", title: "Produtos", description: "Catálogo e compra de produtos." },
  { code: "EVENTS", title: "Eventos", description: "Site, programação e inscrições dos eventos." },
  { code: "TRIAL_BOOKING", title: "Agendar aula", description: "Agendamento público de aula experimental." },
] as const);
export type LinkHubSectionCode = typeof linkHubSections[number]["code"];
export type LinkHubLink = { code: LinkHubSectionCode; title: string; url: string };

// A planned path, not proof that a public page exists or has been published.
export function publicLinkHubPath(companySlug: string): string {
  if (typeof companySlug !== "string" || companySlug.length > 80 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(companySlug)) {
    throw new Error("ENDEREÇO DA EMPRESA INVÁLIDO.");
  }
  return `/links/${companySlug}`;
}

// Pure groundwork for tomorrow's authenticated editor. Never fetches destinations.
// This validator is not authorization, an entitlement check, or an SSRF resolver.
export function validateLinkHubLinks(input: unknown): LinkHubLink[] {
  if (!Array.isArray(input) || input.length > linkHubSections.length) throw new Error("INFORME ATÉ QUATRO LINKS.");
  const seen = new Set<LinkHubSectionCode>();
  return input.map((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("LINK INVÁLIDO.");
    const value = raw as Record<string, unknown>;
    if (Object.keys(value).some(key => !["code", "title", "url"].includes(key))) throw new Error("CAMPO DE LINK NÃO PERMITIDO.");
    if (!linkHubSections.some(section => section.code === value.code) || seen.has(value.code as LinkHubSectionCode)) throw new Error("SEÇÃO INVÁLIDA OU REPETIDA.");
    if (typeof value.title !== "string" || !value.title.trim() || value.title.trim().length > 80 || /[\u0000-\u001f\u007f]/.test(value.title)) throw new Error("TÍTULO DO LINK INVÁLIDO.");
    if (typeof value.url !== "string" || value.url.length > 2048 || value.url.trim() !== value.url || /[\s\\\u0000-\u001f\u007f]/.test(value.url)) throw new Error("ENDEREÇO DO LINK INVÁLIDO.");
    let url: URL;
    try { url = new URL(value.url); } catch { throw new Error("USE UM ENDEREÇO HTTPS COMPLETO."); }
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) throw new Error("USE HTTPS, SEM CREDENCIAIS OU PORTA PRIVADA.");
    // Display-only links must not invite customers into local/internal networks.
    // Reject numeric IPv4/IPv6, single-label/private hosts and credential query names.
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (!host.includes(".") || /^[\d.]+$/.test(host) || host.includes(":") || /(?:^|\.)(?:localhost|local|internal|test|invalid|example)$/.test(host)
      || /(?:^|\/)(?:api|admin|config|configuracoes|settings)(?:\/|$)/i.test(url.pathname)
      || [...url.searchParams.keys()].some(key => /^(?:token|access_token|api_key|apikey|client_token|secret|password|authorization)$/i.test(key))) {
      throw new Error("USE SOMENTE DESTINOS PÚBLICOS, SEM SEGREDOS.");
    }
    seen.add(value.code as LinkHubSectionCode);
    return { code: value.code as LinkHubSectionCode, title: value.title.trim(), url: url.href };
  });
}

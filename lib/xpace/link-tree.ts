export type LinkPage = { title: string; description: string; logo_url: string; active: boolean; button_style: 'classic' | 'minimal'; appearance: 'company' | 'custom'; primary_color: string; theme: 'light' | 'dark' };
export type TreeLink = { id: string; title: string; url: string; icon: 'link' | 'instagram' | 'whatsapp' | 'calendar' | 'ticket' | 'store'; active: boolean; position: number };
export type LinkStatistics = { accesses: number; visitors: number; newVisitors: number; returningVisitors: number; days: { day: string; accesses: number }[]; links: { id: string; title: string; clicks: number }[] };
export const defaultLinkPage: LinkPage = { title: 'XPACE', description: 'ESCOLA DE DANÇA', logo_url: '/brands/xpace-logo.png', active: true, button_style: 'classic', appearance: 'company', primary_color: '#7435d9', theme: 'light' };
export function webUrl(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length > 2048) throw new Error('INFORME UM LINK VÁLIDO.');
  let url:URL;
  try{url=new URL(value.trim());}catch{throw new Error('INFORME UM LINK COMPLETO, COMEÇANDO POR HTTPS://.');}
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !url.hostname) throw new Error('USE UM LINK HTTP OU HTTPS.');
  return url.href;
}
export function normalizeLink(value: unknown): Omit<TreeLink,'id'|'position'> {
  const v = value as Partial<TreeLink> | null;
  if (!v || typeof v.title !== 'string' || !v.title.trim() || v.title.trim().length > 100) throw new Error('INFORME UM TÍTULO DE ATÉ 100 CARACTERES.');
  if (!['link','instagram','whatsapp','calendar','ticket','store'].includes(String(v.icon))) throw new Error('ÍCONE INVÁLIDO.');
  if (typeof v.active !== 'boolean') throw new Error('STATUS INVÁLIDO.');
  return { title: v.title.trim(), url: webUrl(v.url), icon: v.icon!, active: v.active };
}
export function normalizePage(value: unknown): LinkPage {
  const v = value as Partial<LinkPage> | null;
  if (!v || typeof v.title !== 'string' || !v.title.trim() || v.title.trim().length > 80 || typeof v.description !== 'string' || v.description.length > 240) throw new Error('CONFIRA O TÍTULO E A DESCRIÇÃO.');
  if (!['classic','minimal'].includes(String(v.button_style)) || !['company','custom'].includes(String(v.appearance)) || !['light','dark'].includes(String(v.theme)) || !/^#[a-f0-9]{6}$/i.test(String(v.primary_color)) || typeof v.active !== 'boolean') throw new Error('APARÊNCIA INVÁLIDA.');
  const logo = v.logo_url === '/brands/xpace-logo.png' ? v.logo_url : webUrl(v.logo_url);
  if (logo !== '/brands/xpace-logo.png' && !logo.startsWith('https://')) throw new Error('USE HTTPS PARA A IMAGEM DO LOGO.');
  return { title: v.title.trim(), description: v.description.trim(), logo_url: logo, active: v.active, button_style: v.button_style!, appearance: v.appearance!, primary_color: v.primary_color!, theme: v.theme! };
}
export function validUuid(value: unknown): value is string { return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }

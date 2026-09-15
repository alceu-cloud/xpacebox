"use client";

import { FormEvent, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";

type Profile = { legalName: string; tradeName: string; cnpj: string; postalCode: string; street: string; streetNumber: string; complement: string; district: string; city: string; state: string };
const empty: Profile = { legalName: "", tradeName: "", cnpj: "", postalCode: "", street: "", streetNumber: "", complement: "", district: "", city: "", state: "" };

export default function SettingsWorkspace() {
  const [profile, setProfile] = useState<Profile>(empty);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => { void request<{ profile: Profile }>("/api/xpace/perfil-escola").then((payload) => setProfile(payload.profile)).catch((error: unknown) => setNotice(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL CARREGAR O PERFIL.")); }, []);
  async function submit(event: FormEvent) { event.preventDefault(); setSaving(true); setNotice(""); try { await request("/api/xpace/perfil-escola", { method: "PUT", body: JSON.stringify({ profile }) }); setNotice("PERFIL DA ESCOLA ATUALIZADO."); } catch (error) { setNotice(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL SALVAR O PERFIL."); } finally { setSaving(false); } }
  return <section className="xd-administration"><header className="xd-administration-title"><span>PREFERÊNCIAS DA ESCOLA</span><h1>CONFIGURAÇÕES.</h1><p>Dados usados nos contratos, cobranças e comunicações oficiais.</p></header><form className="xd-contract-builder" onSubmit={submit}><fieldset className="xd-contract-builder-section"><legend>MEU PERFIL</legend><div className="xd-contract-form-grid xd-contract-form-grid--plan"><Field label="RAZÃO SOCIAL" value={profile.legalName} onChange={(legalName) => setProfile({ ...profile, legalName })} /><Field label="NOME FANTASIA" value={profile.tradeName} onChange={(tradeName) => setProfile({ ...profile, tradeName })} /><Field label="CNPJ" value={formatCnpj(profile.cnpj)} onChange={(cnpj) => setProfile({ ...profile, cnpj: digits(cnpj) })} /><Field label="CEP" value={formatCep(profile.postalCode)} onChange={(postalCode) => setProfile({ ...profile, postalCode: digits(postalCode) })} /><Field label="ENDEREÇO" value={profile.street} onChange={(street) => setProfile({ ...profile, street })} /><Field label="NÚMERO" value={profile.streetNumber} onChange={(streetNumber) => setProfile({ ...profile, streetNumber })} /><Field label="COMPLEMENTO" value={profile.complement} onChange={(complement) => setProfile({ ...profile, complement })} /><Field label="BAIRRO" value={profile.district} onChange={(district) => setProfile({ ...profile, district })} /><Field label="CIDADE" value={profile.city} onChange={(city) => setProfile({ ...profile, city })} /><Field label="UF" value={profile.state} onChange={(state) => setProfile({ ...profile, state: state.toUpperCase().slice(0, 2) })} /></div></fieldset>{notice ? <p className="xd-feedback">{notice}</p> : null}<footer className="xd-contract-form-actions"><button className="xd-primary" type="submit" disabled={saving}>{saving ? "SALVANDO..." : "SALVAR PERFIL"}</button></footer></form></section>;
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label>{label}<input value={value} onChange={(event) => onChange(event.target.value.toLocaleUpperCase("pt-BR"))} required={label !== "COMPLEMENTO"} /></label>; }
async function request<T>(path: string, init?: RequestInit): Promise<T> { const { data } = await supabase.auth.getSession(); const token = data.session?.access_token; if (!token) throw new Error("SESSÃO NÃO ENCONTRADA."); const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init?.headers } }); const payload = await response.json().catch(() => ({})) as { success?: boolean; message?: string } & T; if (!response.ok || !payload.success) throw new Error(payload.message || "NÃO FOI POSSÍVEL CONCLUIR A OPERAÇÃO."); return payload; }
function digits(value: string) { return value.replace(/\D/g, "").slice(0, 14); }
function formatCnpj(value: string) { const digitsValue = digits(value); return digitsValue.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2"); }
function formatCep(value: string) { const digitsValue = value.replace(/\D/g, "").slice(0, 8); return digitsValue.replace(/^(\d{5})(\d)/, "$1-$2"); }

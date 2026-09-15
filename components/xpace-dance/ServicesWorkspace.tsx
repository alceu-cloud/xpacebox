"use client";

import { ImagePlus, PackagePlus, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { supabase } from "@/lib/supabase";

type Service = { id: string; description: string; salePriceCents: number; imageUrl: string; active: boolean };
type Draft = { description: string; price: string; imageUrl: string };
const emptyDraft = (): Draft => ({ description: "", price: "", imageUrl: "" });

export default function ServicesWorkspace() {
  const [services, setServices] = useState<Service[]>([]);
  const [view, setView] = useState<"LIST" | "FORM">("LIST");
  const [editingId, setEditingId] = useState("");
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => { void loadServices(); }, []);

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) throw new Error("SESSÃO NÃO ENCONTRADA.");
    const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}`, ...init?.headers } });
    const payload = await response.json().catch(() => ({})) as { success?: boolean; message?: string } & T;
    if (!response.ok || !payload.success) throw new Error(payload.message || "NÃO FOI POSSÍVEL CONCLUIR A OPERAÇÃO.");
    return payload;
  }
  async function loadServices() { setLoading(true); try { const payload = await request<{ services: Service[] }>("/api/xpace/servicos"); setServices(payload.services); } catch (error) { setNotice(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL CARREGAR OS SERVIÇOS."); } finally { setLoading(false); } }
  function startNew() { setEditingId(""); setDraft(emptyDraft()); setImageFile(null); setNotice(""); setView("FORM"); }
  function startEdit(service: Service) { setEditingId(service.id); setDraft({ description: service.description, price: centsToInput(service.salePriceCents), imageUrl: service.imageUrl }); setImageFile(null); setNotice(""); setView("FORM"); }
  async function uploadImage(serviceId: string) {
    if (!imageFile) return;
    const { data } = await supabase.auth.getSession();
    const form = new FormData(); form.set("image", imageFile);
    const response = await fetch(`/api/xpace/servicos/${serviceId}/imagem`, { method: "POST", headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` }, body: form });
    const payload = await response.json().catch(() => ({})) as { success?: boolean; message?: string };
    if (!response.ok || !payload.success) throw new Error(payload.message || "O SERVIÇO FOI SALVO, MAS A IMAGEM NÃO PÔDE SER ENVIADA.");
  }
  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true); setNotice("");
    try {
      const body = { description: draft.description, salePriceCents: inputToCents(draft.price) };
      const payload = editingId
        ? await request<{ service: { id: string } }>("/api/xpace/servicos", { method: "PATCH", body: JSON.stringify({ action: "UPDATE_SERVICE", service: { id: editingId, ...body } }) })
        : await request<{ service: { id: string } }>("/api/xpace/servicos", { method: "POST", body: JSON.stringify({ action: "CREATE_SERVICE", service: body }) });
      await uploadImage(editingId || payload.service.id);
      await loadServices(); setView("LIST"); setNotice(editingId ? "SERVIÇO ATUALIZADO." : "SERVIÇO CADASTRADO.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL SALVAR O SERVIÇO."); } finally { setSaving(false); }
  }
  async function setActive(service: Service) { setSaving(true); setNotice(""); try { await request("/api/xpace/servicos", { method: "PATCH", body: JSON.stringify({ action: "SET_SERVICE_ACTIVE", service: { id: service.id, active: !service.active } }) }); await loadServices(); setNotice(service.active ? "SERVIÇO ARQUIVADO." : "SERVIÇO REATIVADO."); } catch (error) { setNotice(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL ATUALIZAR O SERVIÇO."); } finally { setSaving(false); } }
  async function remove(service: Service) { if (!window.confirm(`Excluir o serviço ${service.description}? Só será permitido se ele não estiver em contratos ou matrículas.`)) return; setSaving(true); setNotice(""); try { await request("/api/xpace/servicos", { method: "DELETE", body: JSON.stringify({ action: "DELETE_SERVICE", service: { id: service.id } }) }); await loadServices(); setNotice("SERVIÇO EXCLUÍDO."); } catch (error) { setNotice(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL EXCLUIR O SERVIÇO."); } finally { setSaving(false); } }
  const visible = useMemo(() => { const term = normalize(search); return services.filter((service) => !term || normalize(service.description).includes(term)); }, [services, search]);

  if (view === "FORM") return <section className="xd-services"><header className="xd-contract-title"><div><span>ADMINISTRATIVO · CATÁLOGO</span><h1>{editingId ? "ATUALIZAR SERVIÇO." : "NOVO SERVIÇO."}</h1><p>Cadastre taxas, matrículas e outros serviços que poderão ser cobrados nos contratos.</p></div></header><form className="xd-service-form" onSubmit={save}><section><header><span><PackagePlus size={18} /> DADOS DO SERVIÇO</span><small>CATÁLOGO COMERCIAL</small></header><div className="xd-service-fields"><label className="xd-service-description">DESCRIÇÃO *<input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="EX.: TAXA DE MATRÍCULA" required /></label><label>PREÇO DE VENDA *<input inputMode="numeric" value={draft.price} onChange={(event) => setDraft({ ...draft, price: currencyInput(event.target.value) })} placeholder="R$ 0,00" required /></label></div></section><section className="xd-service-image"><header><span><ImagePlus size={18} /> IMAGEM DO SERVIÇO</span><small>PARA A LOJA FUTURA</small></header><div>{draft.imageUrl ? <img src={draft.imageUrl} alt="Imagem atual do serviço" /> : <span><ImagePlus size={24} /> SEM IMAGEM</span>}<p>{imageFile ? imageFile.name : "JPG, PNG OU WEBP · ATÉ 3 MB"}</p><input ref={imageInput} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(event: ChangeEvent<HTMLInputElement>) => setImageFile(event.target.files?.[0] ?? null)} /><button type="button" className="xd-secondary" onClick={() => imageInput.current?.click()}><ImagePlus size={16} /> {draft.imageUrl || imageFile ? "TROCAR IMAGEM" : "ENVIAR IMAGEM"}</button></div></section><footer className="xd-contract-form-actions"><button type="button" className="xd-secondary" onClick={() => setView("LIST")} disabled={saving}>CANCELAR</button><button type="submit" className="xd-primary" disabled={saving}>{saving ? "SALVANDO..." : editingId ? "SALVAR ALTERAÇÕES" : "CADASTRAR SERVIÇO"}</button></footer></form>{notice ? <p className="xd-feedback">{notice}</p> : null}</section>;

  return <section className="xd-services"><header className="xd-contract-title"><div><span>ADMINISTRATIVO · CATÁLOGO</span><h1>SERVIÇOS.</h1><p>Taxas, matrículas e itens intangíveis disponíveis para cobrança e para a loja.</p></div><button type="button" className="xd-primary" onClick={startNew}><Plus size={17} /> NOVO SERVIÇO</button></header><div className="xd-contract-tools"><label><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="PESQUISAR SERVIÇO" /></label></div>{notice ? <p className="xd-feedback">{notice}</p> : null}{loading ? <p className="xd-contract-loading">CARREGANDO SERVIÇOS...</p> : <div className="xd-service-list">{visible.length ? visible.map((service) => <article className={!service.active ? "is-archived" : ""} key={service.id}>{service.imageUrl ? <img src={service.imageUrl} alt="" /> : <span><PackagePlus size={21} /></span>}<div><strong>{service.description}</strong><small>SERVIÇO CADASTRADO PARA COBRANÇA E LOJA</small></div><b>{formatCurrency(service.salePriceCents)}</b><div className="xd-room-actions"><button type="button" className="xd-secondary" disabled={saving} onClick={() => startEdit(service)}><Pencil size={14} /> EDITAR</button><button type="button" className="xd-secondary" disabled={saving} onClick={() => void setActive(service)}>{service.active ? "ARQUIVAR" : "REATIVAR"}</button><button type="button" className="xd-quiet-action xd-danger-link" disabled={saving} onClick={() => void remove(service)}><Trash2 size={14} /> EXCLUIR</button></div></article>) : <p className="xd-empty-community">NENHUM SERVIÇO CADASTRADO.</p>}</div>}</section>;
}

function normalize(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR"); }
function inputToCents(value: string) { const digits = value.replace(/\D/g, ""); return digits ? Number(digits) : 0; }
function centsToInput(value: number) { return currencyInput(String(value)); }
function currencyInput(value: string) { const digits = value.replace(/\D/g, "").replace(/^0+(?=\d)/, ""); if (!digits) return ""; return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(digits) / 100); }
function formatCurrency(cents: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100); }

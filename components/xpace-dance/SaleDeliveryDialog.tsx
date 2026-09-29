"use client";

import { Check, Copy, ExternalLink, Link2, LoaderCircle, Mail, MessageCircle, X } from "lucide-react";
import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";

type Kind = "ASSINATURA" | "COBRANCA";
type Data = { success: boolean; customer: { name: string; email: string; mobile: string; whatsappOptIn: boolean }; links: Record<Kind, string>; paymentError: string; connector: { configured: boolean; online: boolean } };

async function request<T>(saleId: string, body?: object): Promise<T> {
  const { data } = await supabase.auth.getSession();
  if (!data.session?.access_token) throw new Error("SESSÃO NÃO ENCONTRADA.");
  const response = await fetch(body ? "/api/xpace/message-connector/delivery" : `/api/xpace/message-connector/delivery?saleId=${encodeURIComponent(saleId)}`, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${data.session.access_token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const payload = await response.json().catch(() => ({})) as T & { success?: boolean; message?: string };
  if (!response.ok || !payload.success) throw new Error(payload.message || "NÃO FOI POSSÍVEL PREPARAR O LINK.");
  return payload;
}

export default function SaleDeliveryDialog({ saleId, onClose, afterSale = false }: { saleId: string; onClose: () => void; afterSale?: boolean }) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => { let active = true; void request<Data>(saleId).then((result) => { if (active) setData(result); }).catch((error) => { if (active) setNotice(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL PREPARAR OS LINKS."); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [saleId]);

  async function send(kind: Kind, channel: "EMAIL" | "WHATSAPP") {
    if (!data) return;
    setWorking(`${kind}-${channel}`); setNotice("");
    try {
      const result = await request<{ status: string }>(saleId, { saleId, kind, channel });
      setNotice(channel === "EMAIL" ? "E-MAIL ACEITO PELO SERVIÇO DE ENVIO. A ENTREGA NA CAIXA DO CLIENTE AINDA DEPENDE DO PROVEDOR." : result.status === "QUEUED" ? "MENSAGEM ADICIONADA À FILA. ACOMPANHE O ENVIO NA LOJA; NÃO FOI ENTREGUE AINDA." : "ENVIO SOLICITADO.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL ENVIAR."); }
    finally { setWorking(""); }
  }
  async function copy(url: string) { try { await navigator.clipboard.writeText(url); setNotice("LINK COPIADO. ENVIE PELO CANAL DE SUA PREFERÊNCIA."); } catch { setNotice("NÃO FOI POSSÍVEL COPIAR O LINK."); } }
  const phone = data?.customer.mobile.replace(/\D/g, "") ?? "";
  const whatsappPhone = phone.startsWith("55") ? phone : `55${phone}`;
  return <div className="xd-profile-overlay" role="presentation" onMouseDown={onClose}><section className="xd-profile-dialog xd-delivery-dialog" role="dialog" aria-modal="true" aria-label="Enviar links da venda" onMouseDown={(event) => event.stopPropagation()}><header><span><SendIcon /> {afterSale ? "VENDA REGISTRADA · COMO ENVIAR OS LINKS?" : "ENVIAR LINKS DA VENDA"}</span><button type="button" onClick={onClose} aria-label="Fechar"><X size={20} /></button></header><div className="xd-delivery-body"><p>Escolha o envio de cada link para <strong>{data?.customer.name ?? "o cliente"}</strong>. Você pode copiar agora e decidir depois. Nada é disparado pelo conector sem sua confirmação; Asaas e Autentique podem enviar notificações próprias.</p>{loading ? <div className="xd-delivery-loading"><LoaderCircle size={18} className="xd-spin" /> CONSULTANDO ASSINATURA E COBRANÇA...</div> : data ? <>{(["ASSINATURA", "COBRANCA"] as Kind[]).map((kind) => { const url = data.links[kind]; return <article className="xd-delivery-link" key={kind}><div className="xd-delivery-link-head"><div><span>{kind === "ASSINATURA" ? <Link2 size={17} /> : <Mail size={17} />}{kind === "ASSINATURA" ? "ASSINATURA DO CONTRATO" : "LINK DE PAGAMENTO"}</span><p>{url ? kind === "ASSINATURA" ? "Link da Autentique pronto para assinatura." : "Link da cobrança emitida no Asaas." : kind === "ASSINATURA" ? "Ainda não há assinatura pendente com link disponível." : "Não há cobrança aberta emitida no Asaas para esta venda."}</p></div>{url ? <Check size={19} className="is-ready" /> : null}</div>{url ? <><div className="xd-delivery-url"><span>{url}</span><a href={url} target="_blank" rel="noreferrer" aria-label="Abrir link"><ExternalLink size={17} /></a></div><div className="xd-delivery-actions"><button type="button" onClick={() => void copy(url)}><Copy size={15} /> COPIAR</button><button type="button" disabled={!data.customer.email || Boolean(working)} onClick={() => void send(kind, "EMAIL")}><Mail size={15} /> E-MAIL</button><button type="button" disabled={!data.customer.whatsappOptIn || !data.connector.configured || !phone || Boolean(working)} onClick={() => void send(kind, "WHATSAPP")}><MessageCircle size={15} /> WHATSAPP DA ESCOLA</button>{data.customer.whatsappOptIn && phone && whatsappPhone.length >= 12 ? <a href={`https://wa.me/${whatsappPhone}?text=${encodeURIComponent(kind === "ASSINATURA" ? `Olá! Segue o link para assinar seu contrato da XPACE: ${url}` : `Olá! Segue o link da sua cobrança XPACE: ${url}`)}`} target="_blank" rel="noreferrer"><ExternalLink size={15} /> ABRIR NO MEU WHATSAPP</a> : null}</div></> : null}</article>; })}{data.paymentError ? <p className="xd-delivery-notice">LINK ASAAS INDISPONÍVEL: {data.paymentError}</p> : null}<p className="xd-delivery-hint">{!data.connector.configured ? "WhatsApp automático indisponível: configure o Integrador de mensagens na Loja." : !data.connector.online ? "Computador da escola offline: o envio pelo conector entrará na fila até ele voltar." : "Conector online: mensagens solicitadas serão enviadas pela fila."} {!data.customer.whatsappOptIn ? "WHATSAPP NÃO AUTORIZADO: NÃO ENVIAR LINKS OU MENSAGENS, NEM MANUALMENTE." : ""}</p></> : null}{notice ? <p className="xd-delivery-notice" role="status">{notice}</p> : null}</div><footer><button type="button" className="xd-primary" onClick={onClose}>{afterSale ? "CONCLUIR" : "FECHAR"}</button></footer></section></div>;
}

function SendIcon() { return <MessageCircle size={18} />; }

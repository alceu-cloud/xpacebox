"use client";
import { useEffect, useState } from "react";
import { notificationCategories, type NotificationCategory } from "@/lib/notifications";
import { noticesRequest } from "./CompanyNoticePanel";
import BackButton from "@/components/navigation/BackButton";
import { useWorkspaceNavigation } from "@/components/navigation/WorkspaceNavigation";
export default function NotificationPreferencesPanel({ slug, onBack }: { slug: string; onBack?: () => void }) {
  const embedded = Boolean(useWorkspaceNavigation());
  const [categories, setCategories] = useState<NotificationCategory[]>([]);
  const [name, setName] = useState("");
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => { let active = true; void noticesRequest(slug, "&preferencesOnly=1").then(data => { if (active) { setCategories(data.preferences.categories); setName(data.userName); setReady(true); } }).catch(cause => { if (active) setMessage(cause.message); }); return () => { active = false; }; }, [slug]);
  async function save() {
    setBusy(true); setMessage("");
    try { await noticesRequest(slug, "", { method: "PATCH", body: JSON.stringify({ action: "PREFERENCES", categories }) }); setMessage("Preferências salvas para seu usuário nesta empresa."); window.dispatchEvent(new Event("company-notification-preferences")); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "Não foi possível salvar."); }
    finally { setBusy(false); }
  }
  const available = Object.entries(notificationCategories).filter(([key]) => slug === "xpace" || key === "EMAIL");
  return <section className="cn-preferences" aria-label="Usuário e notificações"><header className="cn-preferences-heading">{!embedded && onBack ? <BackButton onBack={onBack} /> : null}<div><h2>USUÁRIO E NOTIFICAÇÕES</h2><p>{name || "Seu usuário"} · {slug.toUpperCase()}</p></div></header><p>Escolha os assuntos que quer ver no painel. Isso não muda permissões nem desativa envios automáticos aos clientes. As preferências valem em todos os seus aparelhos.</p><fieldset disabled={!ready || busy}><legend>Assuntos no painel</legend>{available.map(([key, value]) => <label key={key}><input type="checkbox" checked={categories.includes(key as NotificationCategory)} onChange={event => setCategories(current => event.target.checked ? [...current, key as NotificationCategory] : current.filter(c => c !== key))} /><span style={{ borderColor: value.color }}><strong>{value.label}</strong><small>{key === "CRM" ? "Leads ganhos com informações faltantes, exceto os importados da planilha." : key === "EMAIL" ? "Falhas da agenda comercial e dos avisos de amostras." : key === "WHATSAPP" ? "Conexão e mensagens sem confirmação de envio." : key === "CONTRATO" ? "Assinaturas e falhas do contrato." : key === "FINANCEIRO" ? "Recebimentos e falhas das cobranças." : "Novos agendamentos experimentais."}</small></span></label>)}</fieldset><p className="cn-helper">Desmarcar um assunto esconde seus avisos e providências para você, mas não resolve os problemas. Falhas financeiras e de contratos são exibidas somente aos gestores autorizados.</p><button type="button" className="xd-primary" disabled={!ready || busy} onClick={() => void save()}>{busy ? "SALVANDO..." : "SALVAR PREFERÊNCIAS"}</button>{message ? <p role="status">{message}</p> : null}</section>;
}

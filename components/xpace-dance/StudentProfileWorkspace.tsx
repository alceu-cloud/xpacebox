"use client";

import { AlertTriangle, CalendarClock, Camera, CheckCircle2, CircleDollarSign, Crown, FileSignature, FileText, Filter, Gift, History, Mail, MessageCircle, MoreHorizontal, Pencil, Plus, Printer, RotateCw, Search, Send, Settings2, StickyNote, WalletCards, XCircle } from "lucide-react";
import { ChangeEvent, FormEvent, ReactNode, useEffect, useRef, useState } from "react";

import { supabase } from "@/lib/supabase";

type Tab = "RESUMO" | "COMUNICACAO" | "VENDAS" | "CONTRATOS" | "FINANCEIRO";
type Profile = {
  student: { id: string; personNumber: number; name: string; cpfMasked: string; mobile: string; birthDate: string; email: string; gender: string; whatsappOptIn: boolean; postalCode: string; street: string; streetNumber: string; complement: string; district: string; city: string; state: string; photoUrl: string; active: boolean; age: number | null };
  benefitProfiles: Array<{ id: string; name: string; kind: string; discountType: "PERCENTUAL" | "FIXO"; discountValue: number; active: boolean }>;
  benefits: Array<{ id: string; profileId: string; profile: { id: string; name: string; kind: string; discountType: "PERCENTUAL" | "FIXO"; discountValue: number } | null; startsOn: string; endsOn: string | null; status: "ATIVO" | "ENCERRADO"; note: string; createdAt: string }>;
  summary: { activeContract: boolean; overdueCents: number; debtCents: number; creditCents: number; rewardsBalance: number; nextDueOn: string | null };
  contracts: Array<{ id: string; planId: string; contractNumber: number; planName: string; billingInterval: string; durationMonths: number; baseAmountCents: number; amountCents: number; benefitName: string; renewsAutomatically: boolean; startsOn: string; endsOn: string; status: string; statusNote: string; cancelEffectiveOn: string | null; createdAt: string; sale: { id: string; signatureRequired: boolean; signatureStatus: string; signatureUrl: string; signedDocumentUrl: string; signatureError: string; sentAt: string | null; signedAt: string | null } | null; groups: Array<{ modalityName: string; schedules: Array<{ weekday: number; startsAt: string; endsAt: string; roomName: string }> }>; events: Array<{ id: string; type: string; previousStatus: string; nextStatus: string; note: string; createdAt: string }> }>;
  sales: Array<{ id: string; saleNumber: number; contractId: string; contractNumber: number; planName: string; soldAt: string; status: string; signatureRequired: boolean; signatureStatus: string; signatureProvider: string; signatureUrl: string; signedDocumentUrl: string; signatureError: string; signedAt: string | null; cancelledAt: string | null; cancellationReason: string; baseAmountCents: number; amountCents: number; discountCents: number }>;
  charges: Array<{ id: string; contractId: string; paymentMethod: string; competenceOn: string; dueOn: string; baseAmountCents: number; amountCents: number; status: string; paidAmountCents: number; paidAt: string | null; benefitName: string; providerPaymentId: string; providerStatus: string; pixCopyPaste: string; pixQrCodeUrl: string; providerError: string }>;
  activities: Array<{ id: string; type: string; subject: string; content: string; occurredAt: string }>;
  rewards: Array<{ points_delta: number; reason: string; occurred_at: string }>;
};
type SalePlan = { id: string; name: string; description: string; billingInterval: string; durationMonths: number; amountCents: number; renewsAutomatically: boolean; active: boolean; modalityRules: Array<{ modalityId?: string; sessionsPerWeek?: number }>; catalogSettings: { sendForSignature?: boolean; enrollmentFeeEnabled?: boolean; enrollmentServiceId?: string } };
type SaleClassGroup = { id: string; name: string; modalityId: string; schedules: Array<{ weekday: number; startsAt: string; endsAt: string }> };
type SaleModality = { id: string; name: string };
type SaleService = { id: string; description: string; salePriceCents: number };

export default function StudentProfileWorkspace({ studentId }: { studentId: string }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tab, setTab] = useState<Tab>("RESUMO");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(false);
  const [benefitOpen, setBenefitOpen] = useState(false);
  const [benefitProfileId, setBenefitProfileId] = useState("");
  const [benefitNote, setBenefitNote] = useState("");
  const [saleOpen, setSaleOpen] = useState(false);
  const [detailContract, setDetailContract] = useState<Profile["contracts"][number] | null>(null);
  const [salePlans, setSalePlans] = useState<SalePlan[]>([]);
  const [saleClassGroups, setSaleClassGroups] = useState<SaleClassGroup[]>([]);
  const [saleModalities, setSaleModalities] = useState<SaleModality[]>([]);
  const [saleServices, setSaleServices] = useState<SaleService[]>([]);
  const [salePreset, setSalePreset] = useState<{ planId?: string; startsOn?: string }>({});
  const [activity, setActivity] = useState({ type: "ATIVIDADE", subject: "", content: "" });
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { void loadProfile(); }, [studentId]);

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("SESSÃO NÃO ENCONTRADA.");
    const response = await fetch(path, { ...init, headers: { Authorization: `Bearer ${token}`, ...init?.headers } });
    const payload = await response.json().catch(() => ({})) as { success?: boolean; message?: string } & T;
    if (!response.ok || !payload.success) throw new Error(payload.message || "NÃO FOI POSSÍVEL CONCLUIR A OPERAÇÃO.");
    return payload;
  }

  async function loadProfile() {
    setLoading(true);
    try { const payload = await request<Profile>(`/api/xpace/alunos/${studentId}`); setProfile(payload); }
    catch (error) { setNotice(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL CARREGAR O PERFIL."); }
    finally { setLoading(false); }
  }

  async function uploadPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setSaving(true); setNotice("");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("SESSÃO NÃO ENCONTRADA.");
      const form = new FormData(); form.append("photo", file);
      const response = await fetch(`/api/xpace/alunos/${studentId}/foto`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
      const payload = await response.json().catch(() => ({})) as { success?: boolean; message?: string; photoUrl?: string };
      if (!response.ok || !payload.success) throw new Error(payload.message || "NÃO FOI POSSÍVEL ENVIAR A FOTO.");
      setProfile((current) => current ? { ...current, student: { ...current.student, photoUrl: payload.photoUrl ?? "" } } : current);
      setNotice("FOTO ATUALIZADA.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL ENVIAR A FOTO."); }
    finally { setSaving(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  async function saveActivity(event: FormEvent) {
    event.preventDefault(); setSaving(true); setNotice("");
    try {
      await request(`/api/xpace/alunos/${studentId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "ADD_ACTIVITY", activity }) });
      setActivity({ type: "ATIVIDADE", subject: "", content: "" }); await loadProfile(); setNotice("REGISTRO ADICIONADO À LINHA DO TEMPO.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL REGISTRAR A ATIVIDADE."); }
    finally { setSaving(false); }
  }

  async function saveBenefit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setNotice("");
    try {
      await request(`/api/xpace/alunos/${studentId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "SET_BENEFIT", benefit: { benefitProfileId, note: benefitNote } }) });
      setBenefitOpen(false); setBenefitNote(""); await loadProfile(); setNotice("BENEFÍCIO APLICADO. NOVOS CONTRATOS COPIARÃO ESTA CONDIÇÃO.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL APLICAR O BENEFÍCIO."); }
    finally { setSaving(false); }
  }

  async function endBenefit() {
    setSaving(true); setNotice("");
    try { await request(`/api/xpace/alunos/${studentId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "END_BENEFIT" }) }); await loadProfile(); setNotice("BENEFÍCIO ENCERRADO. CONTRATOS EXISTENTES NÃO FORAM ALTERADOS."); }
    catch (error) { setNotice(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL ENCERRAR O BENEFÍCIO."); }
    finally { setSaving(false); }
  }

  async function createBenefitProfile(input: { name: string; kind: string; discountType: string; discountValue: number }) {
    setSaving(true); setNotice("");
    try {
      const payload = await request<{ profile: { id: string } }>("/api/xpace/beneficios", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      await loadProfile(); setBenefitProfileId(payload.profile.id); setNotice("PERFIL DE BENEFÍCIO CADASTRADO.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL CADASTRAR O PERFIL."); }
    finally { setSaving(false); }
  }

  function openBenefitDialog() {
    const current = profile?.benefits.find((benefit) => benefit.status === "ATIVO");
    setBenefitProfileId(current?.profileId ?? profile?.benefitProfiles.find((benefit) => benefit.active)?.id ?? "");
    setBenefitOpen(true);
  }

  async function openSale(preset: { planId?: string; startsOn?: string } = {}) {
    setSaving(true); setNotice("");
    try {
      const payload = await request<{ plans: SalePlan[]; classGroups: SaleClassGroup[]; modalities: SaleModality[]; services: SaleService[] }>("/api/xpace/contratos");
      setSalePlans(payload.plans.filter((plan) => plan.active !== false));
      setSaleClassGroups(payload.classGroups);
      setSaleModalities(payload.modalities);
      setSaleServices(payload.services);
      setSalePreset(preset); setSaleOpen(true);
    } catch (error) { setNotice(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL CARREGAR OS CONTRATOS PARA VENDA."); }
    finally { setSaving(false); }
  }

  async function createSale(input: { planId: string; classGroupIds: string[]; saleOn: string; firstDueOn: string; discountType: "PERCENTUAL" | "FIXO"; discountValue: number; enrollmentFeeEnabled: boolean; paymentMethod: "PIX" | "CARTAO" }) {
    setSaving(true); setNotice("");
    try {
      const payload = await request<{ pendingSignature?: boolean }>("/api/xpace/contratos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "CREATE_CONTRACT", contract: { studentId, ...input } }) });
      setSaleOpen(false); await loadProfile(); setTab("VENDAS"); setNotice(payload.pendingSignature ? "VENDA REGISTRADA. ENVIE O CONTRATO PARA ASSINATURA QUANDO CONFERIR O MODELO E OS DADOS DO ALUNO." : "VENDA REGISTRADA. O CONTRATO E AS COBRANÇAS MENSAIS FORAM CRIADOS.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL REGISTRAR A VENDA."); }
    finally { setSaving(false); }
  }

  async function sendForSignature(saleId: string, resend = false) {
    if (!window.confirm(resend ? "REENVIAR ESTE CONTRATO PARA ASSINATURA POR E-MAIL?" : "ENVIAR ESTE CONTRATO PARA ASSINATURA POR E-MAIL? CONFIRA ANTES O MODELO PDF E OS DADOS DO ALUNO.")) return;
    setSaving(true); setNotice("");
    try {
      const payload = await request<{ signatureUrl?: string; sandbox?: boolean }>("/api/xpace/assinaturas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ saleId, resend }) });
      await loadProfile();
      setNotice(payload.sandbox ? "ASSINATURA ENVIADA POR E-MAIL EM MODO DE TESTE. O CONTRATO JÁ SEGUE ATIVO; A ASSINATURA FICA REGISTRADA NO HISTÓRICO." : "ASSINATURA ENVIADA POR E-MAIL. O CONTRATO JÁ SEGUE ATIVO; A ASSINATURA FICA REGISTRADA NO HISTÓRICO.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL ENVIAR O CONTRATO PARA ASSINATURA."); }
    finally { setSaving(false); }
  }

  async function updateContractStatus(contractId: string, status: "PAUSADO" | "ENCERRADO" | "CANCELADO", effectiveOn = "") {
    if (status === "ENCERRADO" && !effectiveOn) {
      const chosen = window.prompt("ENCERRAR AGORA OU AGENDAR? Deixe em branco para encerrar agora; para agendar, informe a data em AAAA-MM-DD.", "");
      if (chosen === null) return;
      if (chosen.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(chosen.trim())) { setNotice("INFORME A DATA DE ENCERRAMENTO NO FORMATO AAAA-MM-DD."); return; }
      effectiveOn = chosen.trim();
    }
    const isScheduled = Boolean(effectiveOn && effectiveOn > localToday());
    const confirmation = isScheduled ? `Agendar o encerramento para ${date(effectiveOn)}? As cobranças com vencimento nessa data ou depois serão canceladas.` : status === "CANCELADO" ? "Cancelar este contrato e manter o histórico financeiro?" : status === "ENCERRADO" ? "Encerrar este contrato e cancelar somente as cobranças futuras em aberto?" : "Suspender este contrato e cancelar as cobranças futuras em aberto a partir de hoje? O histórico não será apagado.";
    if (!window.confirm(confirmation)) return;
    const statusNote = status === "CANCELADO" ? window.prompt("MOTIVO DO CANCELAMENTO:") ?? "" : "";
    if (status === "CANCELADO" && !statusNote) return;
    setSaving(true); setNotice("");
    try {
      await request("/api/xpace/contratos", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "SET_CONTRACT_STATUS", contract: { id: contractId, status, statusNote, effectiveOn } }) });
      await loadProfile(); setNotice(isScheduled ? "ENCERRAMENTO AGENDADO. O CONTRATO SEGUE VÁLIDO ATÉ A DATA ESCOLHIDA E AS COBRANÇAS FUTURAS FORAM CANCELADAS." : status === "PAUSADO" ? "CONTRATO SUSPENSO. AS COBRANÇAS FUTURAS EM ABERTO FORAM CANCELADAS E O HISTÓRICO FOI PRESERVADO." : "CONTRATO ATUALIZADO E HISTÓRICO PRESERVADO.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL ATUALIZAR O CONTRATO."); }
    finally { setSaving(false); }
  }

  async function generatePix(contractId: string) {
    setSaving(true); setNotice("");
    try {
      const payload = await request<{ charge: Pick<Profile["charges"][number], "id" | "pixCopyPaste" | "pixQrCodeUrl" | "providerStatus"> }>("/api/xpace/contratos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "GENERATE_PIX", contract: { id: contractId } }) });
      await loadProfile(); setNotice("PIX GERADO. CONFIRA O QR CODE E CONFIRME O PAGAMENTO NO SANDBOX DO ASAAS.");
      return payload.charge;
    } catch (error) { setNotice(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL GERAR O PIX."); return null; }
    finally { setSaving(false); }
  }

  if (loading || !profile) return <section className="xd-student-profile"><p className="xd-profile-loading">CARREGANDO PERFIL DO ALUNO...</p>{notice ? <p className="xd-feedback">{notice}</p> : null}</section>;

  const activeBenefit = profile.benefits.find((benefit) => benefit.status === "ATIVO");
  const whatsapp = profile.student.mobile.replace(/\D/g, "");

  return <section className="xd-student-profile">
    <header className="xd-profile-identity">
      <div className="xd-profile-avatar"><div>{profile.student.photoUrl ? <img src={profile.student.photoUrl} alt={`Foto de ${profile.student.name}`} /> : <span>{initials(profile.student.name)}</span>}</div><button type="button" title="Enviar foto" disabled={saving} onClick={() => fileRef.current?.click()}><Camera size={16} /></button><input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadPhoto} /></div>
      <div className="xd-profile-name"><div><h1>{profile.student.name}</h1><span className={profile.summary.activeContract ? "xd-status-pill is-active" : "xd-status-pill"}><CheckCircle2 size={14} /> {profile.summary.activeContract ? "ATIVO" : "SEM CONTRATO ATIVO"}</span>{activeBenefit ? <button type="button" className="xd-benefit-pill" onClick={openBenefitDialog}><Crown size={14} /> {activeBenefit.profile?.name ?? "BENEFÍCIO"}</button> : <button type="button" className="xd-benefit-pill is-empty" onClick={openBenefitDialog}><Gift size={14} /> BENEFÍCIO</button>}</div><p>{profile.student.age ?? "—"} ANOS · {labelGender(profile.student.gender)}</p><div className="xd-profile-actions"><button type="button" className="xd-primary" onClick={() => setEditing(true)}><Pencil size={16} /> CADASTRO</button><a className={whatsapp ? "xd-secondary" : "xd-secondary is-disabled"} href={whatsapp ? `https://wa.me/55${whatsapp}` : undefined} target="_blank" rel="noreferrer" aria-disabled={!whatsapp}><MessageCircle size={16} /> WHATSAPP</a><button type="button" className="xd-icon-copy" title="Mais ações" onClick={openBenefitDialog}><MoreHorizontal size={19} /></button></div></div>
    </header>
    <nav className="xd-profile-tabs" aria-label="Seções do aluno">{(["RESUMO", "COMUNICACAO", "VENDAS", "CONTRATOS", "FINANCEIRO"] as Tab[]).map((item) => <button type="button" key={item} className={tab === item ? "is-active" : ""} onClick={() => setTab(item)}>{item === "COMUNICACAO" ? "COMUNICAÇÃO" : item}</button>)}</nav>
    {notice ? <p className="xd-feedback">{notice}</p> : null}
    {tab === "RESUMO" ? <Summary profile={profile} activeBenefit={activeBenefit} onBenefit={openBenefitDialog} /> : null}
    {tab === "COMUNICACAO" ? <Communication activity={activity} setActivity={setActivity} saving={saving} onSubmit={saveActivity} activities={profile.activities} /> : null}
    {tab === "VENDAS" ? <Sales sales={profile.sales} saving={saving} onSell={() => void openSale()} onSend={(saleId) => void sendForSignature(saleId)} /> : null}
    {tab === "CONTRATOS" ? <Contracts contracts={profile.contracts} saving={saving} onRenew={(contract) => void openSale({ planId: contract.planId, startsOn: addDays(contract.endsOn, 1) })} onStatus={updateContractStatus} onDetails={setDetailContract} /> : null}
    {tab === "FINANCEIRO" ? <Finance charges={profile.charges} contracts={profile.contracts} saving={saving} onGeneratePix={generatePix} /> : null}
    {editing ? <StudentEdit profile={profile} saving={saving} onClose={() => setEditing(false)} onSaved={async () => { setEditing(false); await loadProfile(); setNotice("CADASTRO ATUALIZADO."); }} request={request} /> : null}
    {benefitOpen ? <BenefitDialog profiles={profile.benefitProfiles} current={activeBenefit} selected={benefitProfileId} note={benefitNote} saving={saving} onSelect={setBenefitProfileId} onNote={setBenefitNote} onClose={() => setBenefitOpen(false)} onSubmit={saveBenefit} onEnd={endBenefit} onCreate={createBenefitProfile} /> : null}
    {saleOpen ? <SaleDialog plans={salePlans} classGroups={saleClassGroups} modalities={saleModalities} services={saleServices} preset={salePreset} saving={saving} onClose={() => setSaleOpen(false)} onSubmit={createSale} /> : null}
    {detailContract ? <ContractDetailsDialog contract={detailContract} saving={saving} onClose={() => setDetailContract(null)} onSend={(resend) => detailContract.sale && void sendForSignature(detailContract.sale.id, resend)} onStatus={updateContractStatus} /> : null}
  </section>;
}

function Summary({ profile, activeBenefit, onBenefit }: { profile: Profile; activeBenefit: Profile["benefits"][number] | undefined; onBenefit: () => void }) {
  const activeContracts = profile.contracts.filter((contract) => ["ATIVO", "AGENDADO", "PAUSADO"].includes(contract.status));
  return <div className="xd-profile-content"><div className="xd-summary-metrics"><Metric icon={<AlertTriangle size={18} />} label="EM ATRASO" value={currency(profile.summary.overdueCents)} tone="danger" /><Metric icon={<CircleDollarSign size={18} />} label="SALDO DEVEDOR" value={currency(profile.summary.debtCents)} tone="danger" /><Metric icon={<WalletCards size={18} />} label="CRÉDITOS" value={currency(profile.summary.creditCents)} tone="blue" /><Metric icon={<Gift size={18} />} label="SALDO XPACE" value={`${profile.summary.rewardsBalance} PTS`} tone="purple" /><Metric icon={<CalendarClock size={18} />} label="PRÓX. VENCIMENTO" value={profile.summary.nextDueOn ? date(profile.summary.nextDueOn) : "—"} tone="green" /></div><div className="xd-summary-grid"><section className="xd-profile-panel xd-profile-panel--contracts"><header><span><FileText size={18} /> CONTRATOS</span><small>{activeContracts.length} EM VIGOR</small></header>{activeContracts.length ? activeContracts.map((contract) => <article key={contract.id}><div><strong>{contract.planName}</strong><small>{contract.renewsAutomatically ? `RENOVA A CADA ${contract.billingInterval}` : `VIGENTE ATÉ ${date(contract.endsOn)}`}</small></div><b>{currency(contract.amountCents)}</b></article>) : <Empty title="SEM CONTRATO ATIVO" copy="O status do aluno será atualizado quando um contrato for registrado." />}</section><section className="xd-profile-panel"><header><span><Crown size={18} /> BENEFÍCIO</span><button type="button" title="Gerenciar benefício" onClick={onBenefit}><Pencil size={15} /></button></header>{activeBenefit?.profile ? <div className="xd-benefit-summary"><strong>{activeBenefit.profile.name}</strong><span>{benefitLabel(activeBenefit.profile.discountType, activeBenefit.profile.discountValue)}</span><small>DESDE {date(activeBenefit.startsOn)}</small></div> : <Empty title="SEM BENEFÍCIO" copy="VIP e bolsas são aplicados aqui antes da nova matrícula." />}</section><section className="xd-profile-panel"><header><span><Gift size={18} /> CLUBE DE RECOMPENSAS</span></header>{profile.rewards.length ? <div className="xd-reward-list">{profile.rewards.slice(0, 4).map((reward, index) => <article key={`${reward.occurred_at}-${index}`}><span>{reward.reason}</span><b className={reward.points_delta >= 0 ? "is-positive" : ""}>{reward.points_delta >= 0 ? "+" : ""}{reward.points_delta} PTS</b></article>)}</div> : <Empty title="SEM MOVIMENTAÇÕES" copy="A pontuação será registrada pela operação quando o clube estiver configurado." />}</section></div></div>;
}

function Communication({ activity, setActivity, saving, onSubmit, activities }: { activity: { type: string; subject: string; content: string }; setActivity: (value: { type: string; subject: string; content: string }) => void; saving: boolean; onSubmit: (event: FormEvent) => void; activities: Profile["activities"] }) { return <div className="xd-profile-content xd-communication"><form className="xd-activity-form" onSubmit={onSubmit}><header><span><StickyNote size={18} /> REGISTRAR ATIVIDADE</span><small>TUDO O QUE FOR REGISTRADO FICA NA LINHA DO TEMPO.</small></header><div><label>TIPO<select value={activity.type} onChange={(event) => setActivity({ ...activity, type: event.target.value })}><option value="ATIVIDADE">ATIVIDADE</option><option value="NOTA">NOTA</option><option value="WHATSAPP">WHATSAPP</option><option value="EMAIL">E-MAIL</option></select></label><label>ASSUNTO<input value={activity.subject} onChange={(event) => setActivity({ ...activity, subject: event.target.value })} required placeholder="EX.: RETORNO SOBRE A MATRÍCULA" /></label><label className="xd-activity-text">DESCRIÇÃO<textarea value={activity.content} onChange={(event) => setActivity({ ...activity, content: event.target.value })} placeholder="REGISTRE O QUE FOI TRATADO..." /></label><button type="submit" className="xd-primary" disabled={saving}><Plus size={16} /> ADICIONAR</button></div></form><section className="xd-timeline"><header><span><History size={19} /> LINHA DO TEMPO</span><small>{activities.length} REGISTRO(S)</small></header>{activities.length ? activities.map((item) => <article key={item.id}><div className={`xd-timeline-icon xd-timeline-icon--${item.type.toLowerCase()}`}>{item.type === "WHATSAPP" ? <MessageCircle size={16} /> : item.type === "EMAIL" ? <Mail size={16} /> : <StickyNote size={16} />}</div><div><strong>{item.subject}</strong>{item.content ? <p>{item.content}</p> : null}<small>{labelActivity(item.type)} · {dateTime(item.occurredAt)}</small></div></article>) : <Empty title="A LINHA DO TEMPO COMEÇA AQUI" copy="Registre contatos, e-mails, WhatsApp e observações para manter o contexto do aluno." />}</section></div>; }
function Sales({ sales, saving, onSell, onSend }: { sales: Profile["sales"]; saving: boolean; onSell: () => void; onSend: (saleId: string) => void }) {
  const [period, setPeriod] = useState("TODOS"); const [status, setStatus] = useState("TODOS");
  const visible = sales.filter((sale) => (status === "TODOS" || sale.status === status) && inPeriod(sale.soldAt, period));
  return <div className="xd-profile-content"><section className="xd-profile-panel xd-sales-history"><header><div><span><CircleDollarSign size={18} /> HISTÓRICO DE VENDAS</span><small>VENDA, ASSINATURA E CANCELAMENTO FICAM RASTREÁVEIS.</small></div><button type="button" className="xd-sell-contract" onClick={onSell}><FileSignature size={18} /><span>NOVA VENDA</span><small>VENDER CONTRATO</small></button></header><div className="xd-history-filters"><label><Filter size={14} /><select value={period} onChange={(event) => setPeriod(event.target.value)}><option value="TODOS">TODO O PERÍODO</option><option value="MES">MÊS ATUAL</option><option value="TRIMESTRE">TRIMESTRE ATUAL</option><option value="ANO">ANO ATUAL</option></select></label><label><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="TODOS">TODAS AS SITUAÇÕES</option><option value="CONCLUIDA">CONCLUÍDA</option><option value="PENDENTE_ASSINATURA">ASSINATURA PENDENTE</option><option value="ENVIADA_PARA_ASSINATURA">ENVIADA PARA ASSINATURA</option><option value="PROCESSANDO">PROCESSANDO</option><option value="ERRO">ERRO</option><option value="CANCELADA">CANCELADA</option></select></label></div>{visible.length ? <div className="xd-sales-table"><div className="xd-sales-head"><span>CONTRATO</span><span>DATA DA VENDA</span><span>DESCONTO</span><span>VALOR</span><span>SITUAÇÃO</span></div>{visible.map((sale) => <article key={sale.id}><div><strong>#{String(sale.contractNumber).padStart(5, "0")} · {sale.planName}</strong><small>{sale.signatureRequired ? `ASSINATURA · ${labelSignature(sale.signatureStatus)}` : "SEM ASSINATURA EXTERNA"}</small>{sale.signatureRequired && sale.signatureStatus === "PENDENTE" ? <button type="button" className="xd-secondary" disabled={saving} onClick={() => onSend(sale.id)}><Send size={14} /> ENVIAR PARA ASSINATURA</button> : null}{sale.signatureUrl ? <a className="xd-secondary" href={sale.signatureUrl} target="_blank" rel="noreferrer">ABRIR ASSINATURA</a> : null}</div><span>{date(sale.soldAt)}</span><span>{sale.discountCents ? currency(sale.discountCents) : "—"}</span><b>{currency(sale.amountCents)}</b><span className={`xd-sale-state xd-sale-state--${sale.status.toLowerCase()}`}>{labelSaleStatus(sale.status)}</span></article>)}</div> : <Empty title="SEM VENDAS NESTE FILTRO" copy="A emissão de um contrato aparecerá aqui como venda, sem misturar com recebimentos." />}</section></div>;
}
function Contracts({ contracts, saving, onRenew, onStatus, onDetails }: { contracts: Profile["contracts"]; saving: boolean; onRenew: (contract: Profile["contracts"][number]) => void; onStatus: (contractId: string, status: "PAUSADO" | "ENCERRADO" | "CANCELADO") => void; onDetails: (contract: Profile["contracts"][number]) => void }) {
  const [filter, setFilter] = useState("TODOS"); const visible = contracts.filter((contract) => filter === "TODOS" || contract.status === filter).sort((left, right) => contractRank(left.status) - contractRank(right.status) || right.startsOn.localeCompare(left.startsOn));
  return <div className="xd-profile-content"><section className="xd-profile-panel xd-contract-history"><header><div><span><FileText size={18} /> HISTÓRICO DE CONTRATOS</span><small>ATIVOS APARECEM PRIMEIRO. NENHUM ENCERRAMENTO APAGA O PASSADO.</small></div><label className="xd-history-select"><Filter size={14} /><select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="TODOS">TODOS</option><option value="ATIVO">ATIVOS</option><option value="AGENDADO">AGENDADOS</option><option value="PAUSADO">SUSPENSOS</option><option value="ENCERRADO">ENCERRADOS</option><option value="CANCELADO">CANCELADOS</option></select></label></header>{visible.length ? visible.map((contract) => <article key={contract.id}><div><strong>#{String(contract.contractNumber).padStart(5, "0")} · {contract.planName}</strong><small>{cycleLabel(contract.durationMonths)} · VÁLIDO DE {date(contract.startsOn)} ATÉ {date(contract.endsOn)}{contract.renewsAutomatically ? " · RENOVAÇÃO AUTOMÁTICA" : ""}</small></div><b>{currency(contract.amountCents)}<small>POR MÊS</small></b><span className={`xd-contract-state xd-contract-state--${contract.status.toLowerCase()}`}>{labelContractStatus(contract.status)}</span><div className="xd-contract-actions">{!contract.renewsAutomatically && ["ATIVO", "AGENDADO", "ENCERRADO"].includes(contract.status) ? <button type="button" className="xd-secondary" disabled={saving} onClick={() => onRenew(contract)}><RotateCw size={14} /> RENOVAR</button> : null}<button type="button" className="xd-secondary" onClick={() => onDetails(contract)}>DETALHES</button><button type="button" className="xd-icon-copy" title="Detalhes do contrato" onClick={() => onDetails(contract)}><MoreHorizontal size={16} /></button></div></article>) : <Empty title="SEM CONTRATOS NESTE FILTRO" copy="Os contratos emitidos para o aluno ficam aqui, inclusive encerrados e cancelados." />}</section></div>;
}
function ContractDetailsDialog({ contract, saving, onClose, onSend, onStatus }: { contract: Profile["contracts"][number]; saving: boolean; onClose: () => void; onSend: (resend: boolean) => void; onStatus: (contractId: string, status: "PAUSADO" | "ENCERRADO" | "CANCELADO", effectiveOn?: string) => void }) {
  const [tab, setTab] = useState<"DADOS" | "GRADES" | "PRESENCAS" | "HISTORICO">("DADOS");
  const [copied, setCopied] = useState(false);
  const [ending, setEnding] = useState(false);
  const [endDate, setEndDate] = useState(localToday());
  const signature = contract.sale;
  const signatureLink = signature?.signatureUrl || signature?.signedDocumentUrl || "";
  async function copyLink() { if (!signatureLink) return; await navigator.clipboard.writeText(signatureLink); setCopied(true); }
  return <div className="xd-profile-overlay" role="presentation" onMouseDown={onClose}><section className="xd-profile-dialog xd-contract-details-dialog" role="dialog" aria-modal="true" aria-label="Detalhes do contrato" onMouseDown={(event) => event.stopPropagation()}><header><span><FileText size={17} /> DETALHES DO CONTRATO</span><button type="button" onClick={onClose} aria-label="Fechar">×</button></header><h2>{contract.planName}</h2><nav className="xd-contract-detail-tabs"><button type="button" className={tab === "DADOS" ? "is-active" : ""} onClick={() => setTab("DADOS")}>DADOS PRINCIPAIS</button><button type="button" className={tab === "GRADES" ? "is-active" : ""} onClick={() => setTab("GRADES")}>MODALIDADES</button><button type="button" className={tab === "PRESENCAS" ? "is-active" : ""} onClick={() => setTab("PRESENCAS")}>PRESENÇAS</button><button type="button" className={tab === "HISTORICO" ? "is-active" : ""} onClick={() => setTab("HISTORICO")}>HISTÓRICO GERAL</button></nav>{tab === "DADOS" ? <div className="xd-contract-details-content"><div className="xd-contract-details-summary"><span className={`xd-contract-state xd-contract-state--${contract.status.toLowerCase()}`}>{labelContractStatus(contract.status)}</span>{contract.renewsAutomatically ? <small>RENOVA AUTOMATICAMENTE</small> : <small>RENOVAÇÃO MANUAL</small>}</div><div className="xd-contract-detail-metrics"><div><small>INÍCIO</small><strong>{date(contract.startsOn)}</strong></div><div><small>VALIDADE</small><strong>{date(contract.endsOn)}</strong></div><div><small>DURAÇÃO</small><strong>{cycleLabel(contract.durationMonths)}</strong></div><div><small>VALOR</small><strong>{currency(contract.amountCents)}</strong></div></div>{contract.cancelEffectiveOn ? <p className="xd-contract-schedule-note">ENCERRAMENTO PROGRAMADO PARA {date(contract.cancelEffectiveOn)}. Cobranças a partir dessa data não serão emitidas.</p> : null}<section className="xd-contract-signature"><header><div><span>ASSINATURA ELETRÔNICA</span><small>{signature?.signatureStatus ? labelSignature(signature.signatureStatus) : "NÃO SOLICITADA"}</small></div></header>{signature?.signedAt ? <p>ASSINADO EM {dateTime(signature.signedAt)}.</p> : <p>A assinatura é opcional e não bloqueia a venda nem o acesso do aluno.</p>}<div>{signatureLink ? <button type="button" className="xd-secondary" onClick={() => void copyLink()}>{copied ? "LINK COPIADO" : "COPIAR LINK"}</button> : null}<button type="button" className="xd-primary" disabled={saving} onClick={() => onSend(Boolean(signature?.signatureUrl))}>{signature?.signatureUrl ? "REENVIAR POR E-MAIL" : "GERENCIAR ASSINATURA"}</button>{signature?.signedDocumentUrl ? <a className="xd-secondary" href={signature.signedDocumentUrl} target="_blank" rel="noreferrer">VISUALIZAR PDF</a> : null}</div>{signature?.signatureError ? <small className="xd-feedback">{signature.signatureError}</small> : null}</section></div> : null}{tab === "GRADES" ? <div className="xd-contract-details-content">{contract.groups.length ? contract.groups.map((group, index) => <section className="xd-contract-group" key={`${group.modalityName}-${index}`}><header><strong>{group.modalityName}</strong><small>SESSÕES SELECIONADAS NO CONTRATO</small></header>{group.schedules.length ? <ul>{group.schedules.map((schedule, scheduleIndex) => <li key={`${schedule.weekday}-${schedule.startsAt}-${scheduleIndex}`}>{weekdayLabel(schedule.weekday)} · {schedule.startsAt}–{schedule.endsAt}{schedule.roomName ? ` · ${schedule.roomName}` : ""}</li>)}</ul> : <p>SEM HORÁRIOS ATIVOS NESTA GRADE.</p>}<button type="button" className="xd-secondary" disabled>GERENCIAR MATRÍCULAS · EM BREVE</button></section>) : <Empty title="SEM GRADES VINCULADAS" copy="As grades escolhidas na venda aparecerão aqui." />}</div> : null}{tab === "PRESENCAS" ? <div className="xd-contract-details-content"><Empty title="PRESENÇAS EM PREPARAÇÃO" copy="Quando o check-in estiver integrado, as aulas realizadas e faltas deste contrato aparecerão aqui." /></div> : null}{tab === "HISTORICO" ? <div className="xd-contract-details-content"><section className="xd-contract-event-list">{[{ id: "created", type: "CRIADO", note: "CONTRATO REGISTRADO.", createdAt: contract.createdAt }, ...contract.events].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((event) => <article key={event.id}><span>{event.type.replaceAll("_", " ")}</span><p>{event.note || (event.nextStatus ? `STATUS ALTERADO PARA ${labelContractStatus(event.nextStatus)}.` : "AÇÃO REGISTRADA NO CONTRATO.")}</p><small>{dateTime(event.createdAt)}</small></article>)}</section></div> : null}<footer><div>{["ATIVO", "PAUSADO", "AGENDADO"].includes(contract.status) ? <button type="button" className="xd-danger-link" disabled={saving} onClick={() => onStatus(contract.id, "ENCERRADO")}>ENCERRAR CONTRATO</button> : null}</div><button type="button" className="xd-secondary" onClick={onClose}>FECHAR</button></footer></section></div>;
}

function Finance({ charges, contracts, saving, onGeneratePix }: { charges: Profile["charges"]; contracts: Profile["contracts"]; saving: boolean; onGeneratePix: (contractId: string) => Promise<Pick<Profile["charges"][number], "id" | "pixCopyPaste" | "pixQrCodeUrl" | "providerStatus"> | null> }) {
  const [pixCharge, setPixCharge] = useState<Profile["charges"][number] | null>(null);
  const [copied, setCopied] = useState(false);
  const plans = new Map(contracts.map((contract) => [contract.id, contract.planName]));
  const qrImage = pixCharge?.pixQrCodeUrl ? (pixCharge.pixQrCodeUrl.startsWith("http") || pixCharge.pixQrCodeUrl.startsWith("data:") ? pixCharge.pixQrCodeUrl : `data:image/png;base64,${pixCharge.pixQrCodeUrl}`) : "";
  async function copyPix() {
    if (!pixCharge?.pixCopyPaste) return;
    await navigator.clipboard.writeText(pixCharge.pixCopyPaste);
    setCopied(true);
  }
  async function generate(charge: Profile["charges"][number]) {
    const pix = await onGeneratePix(charge.contractId);
    if (pix) { setCopied(false); setPixCharge({ ...charge, ...pix }); }
  }
  return <div className="xd-profile-content">
    <section className="xd-profile-panel xd-finance-history">
      <header><div><span><WalletCards size={18} /> HISTÓRICO FINANCEIRO</span><small>PARCELAS PROGRAMADAS E RECEBIMENTOS NUNCA SÃO APAGADOS.</small></div><small>{charges.length} LANÇAMENTO(S)</small></header>
      {charges.length ? <div className="xd-finance-table xd-finance-table--full">
        <div className="xd-finance-head"><span>CONTRATO</span><span>VENCIMENTO</span><span>ORIGINAL</span><span>RECEBIDO</span><span>SITUAÇÃO</span><span>AÇÕES</span></div>
        {charges.map((charge) => <article key={charge.id}>
          <strong>{plans.get(charge.contractId) ?? "CONTRATO"}<small>COMPETÊNCIA {date(charge.competenceOn)}</small></strong>
          <span>{date(charge.dueOn)}</span><b>{currency(charge.amountCents)}</b><span>{charge.paidAt ? currency(charge.paidAmountCents) : "—"}</span>
          <span className={`xd-charge-state xd-charge-state--${charge.status.toLowerCase()}`}>{charge.status}</span>
          <div className="xd-finance-actions">
            {charge.pixCopyPaste ? <button type="button" className="xd-secondary" onClick={() => { setCopied(false); setPixCharge(charge); }}>VER PIX</button> : null}
            {!charge.pixCopyPaste && charge.paymentMethod === "PIX" && charge.status === "ABERTO" ? <button type="button" className="xd-secondary" disabled={saving} onClick={() => void generate(charge)}>{saving ? "GERANDO..." : "GERAR PIX"}</button> : null}
            {charge.providerError ? <small className="xd-finance-error">{charge.providerError}</small> : null}
            <button type="button" className="xd-secondary" disabled={!charge.paidAt}>VER RECEBIDO</button><button type="button" className="xd-secondary" disabled>RECEBER</button>
            <button type="button" className="xd-icon-copy" title={charge.providerError || "Detalhes e recibo"}><Settings2 size={15} /></button>
          </div>
        </article>)}
      </div> : <Empty title="SEM MOVIMENTAÇÃO FINANCEIRA" copy="Ao concluir uma venda, as mensalidades do contrato serão listadas aqui." />}
    </section>
    {pixCharge ? <div className="xd-profile-overlay" role="presentation" onMouseDown={() => setPixCharge(null)}><section className="xd-profile-dialog xd-pix-dialog" role="dialog" aria-modal="true" aria-label="Cobrança PIX" onMouseDown={(event) => event.stopPropagation()}><header><span>COBRANÇA PIX · SANDBOX</span><button type="button" onClick={() => setPixCharge(null)} aria-label="Fechar">×</button></header><h2>{currency(pixCharge.amountCents)}</h2><p>Vencimento em {date(pixCharge.dueOn)}. No Sandbox do Asaas, confirme o pagamento pelo painel deles para testar o retorno.</p>{qrImage ? <img className="xd-pix-qr" src={qrImage} alt="QR Code PIX" /> : null}<label>PIX COPIA E COLA<textarea readOnly value={pixCharge.pixCopyPaste} /></label><footer><small>{pixCharge.providerStatus || "AGUARDANDO PAGAMENTO"}</small><button type="button" className="xd-primary" onClick={() => void copyPix()}>{copied ? "CÓDIGO COPIADO" : "COPIAR PIX"}</button></footer></section></div> : null}
  </div>;
}
function SaleDialog({ plans, classGroups, modalities, services, preset, saving, onClose, onSubmit }: { plans: SalePlan[]; classGroups: SaleClassGroup[]; modalities: SaleModality[]; services: SaleService[]; preset: { planId?: string; startsOn?: string }; saving: boolean; onClose: () => void; onSubmit: (input: { planId: string; classGroupIds: string[]; saleOn: string; firstDueOn: string; discountType: "PERCENTUAL" | "FIXO"; discountValue: number; enrollmentFeeEnabled: boolean; paymentMethod: "PIX" | "CARTAO" }) => Promise<void> }) {
  const [planId, setPlanId] = useState(preset.planId || ""); const [classGroupIds, setClassGroupIds] = useState<string[]>([]);
  const [saleOn, setSaleOn] = useState(preset.startsOn || localToday()); const [firstDueOn, setFirstDueOn] = useState(preset.startsOn || localToday());
  const [discountType, setDiscountType] = useState<"PERCENTUAL" | "FIXO">("FIXO"); const [discount, setDiscount] = useState("");
  const [enrollmentEnabled, setEnrollmentEnabled] = useState(true); const [paymentMethod, setPaymentMethod] = useState<"PIX" | "CARTAO">("PIX"); const [pickerOpen, setPickerOpen] = useState(false);
  const plan = plans.find((item) => item.id === planId); const planModalityIds = new Set(plan?.modalityRules.map((rule) => rule.modalityId).filter((id): id is string => Boolean(id)) ?? []);
  const availableGroups = classGroups.filter((group) => planModalityIds.has(group.modalityId)); const enrollment = plan?.catalogSettings.enrollmentFeeEnabled ? services.find((service) => service.id === plan.catalogSettings.enrollmentServiceId) : undefined;
  const rawDiscount = discountType === "PERCENTUAL" ? Math.round(Math.max(0, Number(discount.replace(",", ".") || 0)) * 100) : cents(discount); const discountCents = plan ? discountType === "PERCENTUAL" ? Math.round(plan.amountCents * rawDiscount / 10000) : rawDiscount : 0;
  const finalValue = Math.max(0, (plan?.amountCents ?? 0) - discountCents); const hasAllModalities = plan ? plan.modalityRules.every((rule) => classGroupIds.some((id) => availableGroups.find((group) => group.id === id)?.modalityId === rule.modalityId)) : false;
  function choosePlan(id: string) { setPlanId(id); setClassGroupIds([]); setDiscount(""); setEnrollmentEnabled(true); setPickerOpen(false); }
  function toggleGroup(group: SaleClassGroup) { const selected = classGroupIds.includes(group.id); if (selected) return setClassGroupIds((ids) => ids.filter((id) => id !== group.id)); const limit = plan?.modalityRules.find((rule) => rule.modalityId === group.modalityId)?.sessionsPerWeek ?? 1; const used = classGroupIds.filter((id) => availableGroups.find((item) => item.id === id)?.modalityId === group.modalityId).length; if (used >= limit) return; setClassGroupIds((ids) => [...ids, group.id]); }
  async function submit(event: FormEvent) { event.preventDefault(); if (!plan || !hasAllModalities) return; await onSubmit({ planId: plan.id, classGroupIds, saleOn, firstDueOn, discountType, discountValue: rawDiscount, enrollmentFeeEnabled: Boolean(enrollment && enrollmentEnabled), paymentMethod }); }
  return <div className="xd-profile-overlay" role="presentation"><form className="xd-profile-dialog xd-sale-dialog xd-sale-primary-dialog" onSubmit={submit}><header><span><FileSignature size={17} /> NOVA VENDA</span><button type="button" title="Fechar" onClick={onClose}>×</button></header><h2>REGISTRAR VENDA.</h2><p>Escolha o contrato, as grades permitidas, a data de início e o primeiro vencimento.</p><div className="xd-sale-start"><label>INÍCIO DO CONTRATO<input type="date" value={saleOn} onChange={(event) => setSaleOn(event.target.value)} required /></label><label>PRIMEIRO VENCIMENTO<input type="date" value={firstDueOn} onChange={(event) => setFirstDueOn(event.target.value)} required /></label><button type="button" className="xd-primary" onClick={() => setPickerOpen(true)}><Plus size={16} /> {plan ? "ALTERAR CONTRATO" : "ADICIONAR CONTRATO"}</button></div>{plan ? <><div className="xd-sale-plan-preview"><div><strong>{plan.name}</strong><span>{cycleLabel(plan.durationMonths)} · {plan.renewsAutomatically ? "RENOVAÇÃO AUTOMÁTICA" : "RENOVAÇÃO MANUAL"}</span></div><b>{currency(plan.amountCents)}</b><small>{enrollment ? `ADESÃO: ${currency(enrollment.salePriceCents)}` : "SEM TAXA DE ADESÃO"}</small></div>{enrollment ? <label className="xd-sale-toggle"><input type="checkbox" checked={enrollmentEnabled} onChange={(event) => setEnrollmentEnabled(event.target.checked)} /> COBRAR TAXA DE ADESÃO NESTA VENDA</label> : null}<section className="xd-sale-groups"><strong>GRADES DE HORÁRIO</strong><small>Selecione até o limite semanal definido em cada modalidade.</small>{plan.modalityRules.map((rule) => { const modality = modalities.find((item) => item.id === rule.modalityId); const groups = availableGroups.filter((group) => group.modalityId === rule.modalityId); const selected = classGroupIds.filter((id) => groups.some((group) => group.id === id)).length; return <article key={rule.modalityId}><header><b>{modality?.name ?? "MODALIDADE"}</b><span>{selected}/{rule.sessionsPerWeek ?? 1} HORÁRIO(S)</span></header>{groups.length ? groups.map((group) => <button type="button" key={group.id} className={classGroupIds.includes(group.id) ? "is-selected" : ""} onClick={() => toggleGroup(group)}>{group.name}<small>{scheduleLabel(group.schedules)}</small></button>) : <small>SEM GRADE ATIVA NESTA MODALIDADE.</small>}</article>; })}</section><section className="xd-sale-discount"><label>DESCONTO<select value={discountType} onChange={(event) => { setDiscountType(event.target.value as "PERCENTUAL" | "FIXO"); setDiscount(""); }}><option value="FIXO">VALOR EM R$</option><option value="PERCENTUAL">PERCENTUAL</option></select></label><label>{discountType === "PERCENTUAL" ? "% DE DESCONTO" : "VALOR DO DESCONTO"}<input inputMode="numeric" value={discount} onChange={(event) => setDiscount(discountType === "FIXO" ? currencyInput(event.target.value) : event.target.value)} placeholder={discountType === "PERCENTUAL" ? "0" : "R$ 0,00"} /></label></section><section className="xd-sale-payment"><strong>FORMA DE COBRANÇA</strong><div><button type="button" className={paymentMethod === "PIX" ? "is-selected" : ""} onClick={() => setPaymentMethod("PIX")}>PIX</button><button type="button" className={paymentMethod === "CARTAO" ? "is-selected" : ""} onClick={() => setPaymentMethod("CARTAO")}>CARTÃO</button></div>{paymentMethod === "CARTAO" ? <small>O cartão será escolhido entre os cartões tokenizados do aluno; nunca guardaremos dados do cartão no sistema.</small> : null}</section><div className="xd-sale-total"><span>RESUMO DA VENDA</span><strong>{currency(finalValue + (enrollmentEnabled ? enrollment?.salePriceCents ?? 0 : 0))}</strong><small>{currency(finalValue)} do contrato{enrollmentEnabled && enrollment ? ` + ${currency(enrollment.salePriceCents)} de adesão` : ""} · vence em {date(firstDueOn)}</small></div></> : <button type="button" className="xd-sale-empty-plan" onClick={() => setPickerOpen(true)}><Plus size={18} /><span>ADICIONE O CONTRATO DESTA VENDA</span><small>BUSQUE POR NOME, MODALIDADE OU PERÍODO.</small></button>}<footer><button type="button" className="xd-secondary" onClick={onClose}>CANCELAR</button><button type="submit" className="xd-primary" disabled={saving || !plan || !hasAllModalities}>{saving ? "REGISTRANDO..." : "CONCLUIR VENDA"}</button></footer>{pickerOpen ? <PlanPicker plans={plans} modalities={modalities} services={services} selectedPlanId={planId} onClose={() => setPickerOpen(false)} onChoose={choosePlan} /> : null}</form></div>;
}
function PlanPicker({ plans, modalities, services, selectedPlanId, onClose, onChoose }: { plans: SalePlan[]; modalities: SaleModality[]; services: SaleService[]; selectedPlanId: string; onClose: () => void; onChoose: (id: string) => void }) {
  const [search, setSearch] = useState("");
  const [modalityId, setModalityId] = useState("TODAS");
  const [interval, setInterval] = useState("TODOS");
  const visible = plans.filter((plan) => (interval === "TODOS" || plan.billingInterval === interval) && (modalityId === "TODAS" || plan.modalityRules.some((rule) => rule.modalityId === modalityId)) && searchablePlan(plan, modalities).includes(normalizeSearch(search)));
  return <div className="xd-profile-overlay xd-plan-picker-overlay" role="presentation"><section className="xd-profile-dialog xd-plan-picker" role="dialog" aria-modal="true" aria-labelledby="xd-plan-picker-title"><header><span><FileText size={18} /> ADICIONAR CONTRATO</span><button type="button" title="Fechar" onClick={onClose}>×</button></header><div className="xd-plan-picker-controls"><label><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="PESQUISAR CONTRATO" /></label><label><select value={modalityId} onChange={(event) => setModalityId(event.target.value)}><option value="TODAS">TODAS AS MODALIDADES</option>{modalities.map((modality) => <option key={modality.id} value={modality.id}>{modality.name}</option>)}</select></label><div>{(["MENSAL", "SEMESTRAL", "ANUAL"] as const).map((item) => <button key={item} type="button" className={interval === item ? "is-active" : ""} onClick={() => setInterval(interval === item ? "TODOS" : item)}>{item === "SEMESTRAL" ? "SEMESTRAL" : item}</button>)}</div></div><div className="xd-plan-picker-list">{visible.length ? visible.map((plan) => { const enrollment = plan.catalogSettings.enrollmentFeeEnabled ? services.find((service) => service.id === plan.catalogSettings.enrollmentServiceId) : undefined; const planModalities = modalities.filter((modality) => plan.modalityRules.some((rule) => rule.modalityId === modality.id)); return <article key={plan.id} className={selectedPlanId === plan.id ? "is-selected" : ""}><header><strong>{plan.name}</strong>{planModalities.length ? <small>{planModalities.map((modality) => modality.name).join(" · ")}</small> : null}</header><div><span>DURAÇÃO<b>{cycleLabel(plan.durationMonths)}</b></span><span>TAXA DE ADESÃO<b>{enrollment ? currency(enrollment.salePriceCents) : "GRÁTIS"}</b></span><span>VALOR DO CONTRATO<b>{currency(plan.amountCents)}</b></span></div><footer><small>{plan.catalogSettings.sendForSignature ? "ASSINATURA ONLINE" : "ASSINATURA NÃO EXIGIDA"}</small><button type="button" className="xd-secondary" onClick={() => onChoose(plan.id)}>ADICIONAR</button></footer></article>; }) : <p className="xd-agenda-empty">NENHUM CONTRATO ENCONTRADO COM ESTES FILTROS.</p>}</div><footer><button type="button" className="xd-secondary" onClick={onClose}>FECHAR</button></footer></section></div>;
}
function BenefitDialog({ profiles, current, selected, note, saving, onSelect, onNote, onClose, onSubmit, onEnd, onCreate }: { profiles: Profile["benefitProfiles"]; current: Profile["benefits"][number] | undefined; selected: string; note: string; saving: boolean; onSelect: (value: string) => void; onNote: (value: string) => void; onClose: () => void; onSubmit: (event: FormEvent) => void; onEnd: () => void; onCreate: (value: { name: string; kind: string; discountType: string; discountValue: number }) => Promise<void> }) {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ name: "", kind: "VIP", discountType: "PERCENTUAL", discount: "" });
  const activeProfiles = profiles.filter((profile) => profile.active);
  const selectedId = selected || current?.profileId || activeProfiles[0]?.id || "";
  return <div className="xd-profile-overlay" role="presentation"><form className="xd-profile-dialog" onSubmit={onSubmit}><header><span>BENEFÍCIO DO ALUNO</span><button type="button" title="Fechar" onClick={onClose}>×</button></header><h2>VIP E BOLSAS.</h2><p>Um benefício ativo por aluno. A condição será copiada para novos contratos, sem alterar os que já existem.</p><label>PERFIL<select value={selectedId} onChange={(event) => onSelect(event.target.value)} required><option value="">SELECIONE</option>{activeProfiles.map((profile) => <option value={profile.id} key={profile.id}>{profile.name} · {benefitLabel(profile.discountType, profile.discountValue)}</option>)}</select></label><button type="button" className="xd-benefit-create" onClick={() => setCreating((value) => !value)}>{creating ? "CANCELAR NOVO PERFIL" : "+ CADASTRAR PERFIL VIP OU BOLSA"}</button>{creating ? <div className="xd-benefit-creator"><label>NOME<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="EX.: VIP 10%" /></label><label>TIPO<select value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value })}><option value="VIP">VIP</option><option value="BOLSA">BOLSA</option><option value="OUTRO">OUTRO</option></select></label><label>DESCONTO<select value={draft.discountType} onChange={(event) => setDraft({ ...draft, discountType: event.target.value })}><option value="PERCENTUAL">PERCENTUAL</option><option value="FIXO">VALOR FIXO</option></select></label><label>{draft.discountType === "PERCENTUAL" ? "PERCENTUAL" : "VALOR (R$)"}<input type="number" min="0" max={draft.discountType === "PERCENTUAL" ? "100" : undefined} step="0.01" value={draft.discount} onChange={(event) => setDraft({ ...draft, discount: event.target.value })} /></label><button type="button" className="xd-secondary" disabled={saving || !draft.name || !draft.discount} onClick={() => void onCreate({ name: draft.name, kind: draft.kind, discountType: draft.discountType, discountValue: Math.round(Number(draft.discount.replace(",", ".")) * 100) })}>SALVAR PERFIL</button></div> : null}<label>OBSERVAÇÃO<input value={note} onChange={(event) => onNote(event.target.value)} placeholder="EX.: BOLSA SOCIAL APROVADA" /></label><footer>{current ? <button className="xd-danger-link" type="button" disabled={saving} onClick={onEnd}>ENCERRAR ATUAL</button> : <span />}{activeProfiles.length ? <button type="submit" className="xd-primary" disabled={saving || !selectedId}>APLICAR BENEFÍCIO</button> : <small>CADASTRE O PRIMEIRO PERFIL PARA APLICÁ-LO AO ALUNO.</small>}</footer></form></div>;
}
function StudentEdit({ profile, saving, onClose, onSaved, request }: { profile: Profile; saving: boolean; onClose: () => void; onSaved: () => Promise<void>; request: <T>(path: string, init?: RequestInit) => Promise<T> }) { const [draft, setDraft] = useState({ fullName: profile.student.name, mobile: profile.student.mobile, birthDate: profile.student.birthDate, email: profile.student.email, gender: profile.student.gender, whatsappOptIn: profile.student.whatsappOptIn, postalCode: profile.student.postalCode, street: profile.student.street, streetNumber: profile.student.streetNumber, complement: profile.student.complement, district: profile.student.district, city: profile.student.city, state: profile.student.state }); const [error, setError] = useState(""); async function submit(event: FormEvent) { event.preventDefault(); setError(""); try { await request(`/api/xpace/alunos/${profile.student.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "UPDATE_PERSON", person: draft }) }); await onSaved(); } catch (reason) { setError(reason instanceof Error ? reason.message : "NÃO FOI POSSÍVEL ATUALIZAR O CADASTRO."); } } return <div className="xd-profile-overlay" role="presentation"><form className="xd-profile-dialog xd-profile-dialog--edit" onSubmit={submit}><header><span>CADASTRO GERAL</span><button type="button" title="Fechar" onClick={onClose}>×</button></header><h2>DADOS DO ALUNO.</h2><div className="xd-edit-grid"><label>CPF<input value={profile.student.cpfMasked} disabled /></label><label>NOME COMPLETO<input value={draft.fullName} onChange={(event) => setDraft({ ...draft, fullName: event.target.value })} required /></label><label>CELULAR<input value={draft.mobile} onChange={(event) => setDraft({ ...draft, mobile: event.target.value })} /></label><label>NASCIMENTO<input type="date" value={draft.birthDate} onChange={(event) => setDraft({ ...draft, birthDate: event.target.value })} required /></label><label>E-MAIL<input type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} /></label><label>SEXO<select value={draft.gender} onChange={(event) => setDraft({ ...draft, gender: event.target.value })}><option value="NAO_INFORMADO">NÃO INFORMAR</option><option value="FEMININO">FEMININO</option><option value="MASCULINO">MASCULINO</option><option value="NAO_BINARIO">NÃO BINÁRIO</option></select></label><label>CEP<input value={draft.postalCode} onChange={(event) => setDraft({ ...draft, postalCode: event.target.value })} /></label><label>RUA<input value={draft.street} onChange={(event) => setDraft({ ...draft, street: event.target.value })} /></label><label>NÚMERO<input value={draft.streetNumber} onChange={(event) => setDraft({ ...draft, streetNumber: event.target.value })} /></label><label>COMPLEMENTO<input value={draft.complement} onChange={(event) => setDraft({ ...draft, complement: event.target.value })} /></label><label>BAIRRO<input value={draft.district} onChange={(event) => setDraft({ ...draft, district: event.target.value })} /></label><label>CIDADE<input value={draft.city} onChange={(event) => setDraft({ ...draft, city: event.target.value })} /></label><label>UF<input maxLength={2} value={draft.state} onChange={(event) => setDraft({ ...draft, state: event.target.value.toUpperCase() })} /></label></div>{error ? <p className="xd-feedback">{error}</p> : null}<footer><button type="button" className="xd-secondary" onClick={onClose}>CANCELAR</button><button type="submit" className="xd-primary" disabled={saving}>SALVAR CADASTRO</button></footer></form></div>; }
function Metric({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone: string }) { return <article className={`xd-metric xd-metric--${tone}`}><span>{icon}</span><div><small>{label}</small><strong>{value}</strong></div></article>; }
function Empty({ title, copy }: { title: string; copy: string }) { return <div className="xd-profile-empty"><span>×</span><strong>{title}</strong><p>{copy}</p></div>; }
function currency(value: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value / 100); }
function date(value: string) { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(`${value}T12:00:00`)); }
function dateTime(value: string) { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); }
function weekdayLabel(value: number) { return ["DOMINGO", "SEGUNDA", "TERÇA", "QUARTA", "QUINTA", "SEXTA", "SÁBADO"][value] ?? "DIA"; }
function initials(value: string) { return value.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); }
function labelGender(value: string) { return ({ FEMININO: "FEMININO", MASCULINO: "MASCULINO", NAO_BINARIO: "NÃO BINÁRIO" } as Record<string, string>)[value] ?? "NÃO INFORMADO"; }
function labelActivity(value: string) { return ({ ATIVIDADE: "ATIVIDADE", NOTA: "NOTA", WHATSAPP: "WHATSAPP", EMAIL: "E-MAIL", SISTEMA: "SISTEMA" } as Record<string, string>)[value] ?? value; }
function benefitLabel(type: "PERCENTUAL" | "FIXO", value: number) { return type === "PERCENTUAL" ? `${(value / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% DE DESCONTO` : `${currency(value)} DE DESCONTO`; }
function localToday() { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()); }
function addDays(value: string, days: number) { const current = new Date(`${value}T12:00:00`); current.setDate(current.getDate() + days); return current.toISOString().slice(0, 10); }
function cents(value: string) { const digits = value.replace(/\D/g, ""); return digits ? Number(digits) : 0; }
function currencyInput(value: string) { const amount = cents(value); return amount ? currency(amount) : ""; }
function normalizeSearch(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim(); }
function searchablePlan(plan: SalePlan, modalities: SaleModality[]) { const modalityNames = modalities.filter((modality) => plan.modalityRules.some((rule) => rule.modalityId === modality.id)).map((modality) => modality.name).join(" "); return normalizeSearch(`${plan.name} ${plan.description} ${modalityNames}`); }
function scheduleLabel(schedules: SaleClassGroup["schedules"]) { const days = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"]; return schedules.map((schedule) => `${days[schedule.weekday]} ${schedule.startsAt}–${schedule.endsAt}`).join(" · "); }
function cycleLabel(months: number) { return months === 1 ? "MENSAL" : months === 6 ? "SEMESTRAL" : months === 12 ? "ANUAL" : `${months} MESES`; }
function labelContractStatus(value: string) { return ({ AGUARDANDO_ASSINATURA: "ASSINATURA PENDENTE", AGENDADO: "AGENDADO", ATIVO: "ATIVO", PAUSADO: "SUSPENSO", CANCELADO: "CANCELADO", ENCERRADO: "ENCERRADO" } as Record<string, string>)[value] ?? value; }
function labelSaleStatus(value: string) { return ({ EM_PREPARACAO: "EM PREPARAÇÃO", PENDENTE_ASSINATURA: "ASSINATURA PENDENTE", ENVIADA_PARA_ASSINATURA: "ASSINATURA ENVIADA", CONCLUIDA: "CONCLUÍDA", CANCELADA: "CANCELADA", PROCESSANDO: "PROCESSANDO", ERRO: "ERRO" } as Record<string, string>)[value] ?? value; }
function labelSignature(value: string) { return ({ NAO_SOLICITADA: "NÃO SOLICITADA", PENDENTE: "PENDENTE", ENVIADA: "ENVIADA", ASSINADA: "ASSINADA", RECUSADA: "RECUSADA", ERRO: "ERRO" } as Record<string, string>)[value] ?? value; }
function contractRank(status: string) { return ({ ATIVO: 0, AGENDADO: 1, AGUARDANDO_ASSINATURA: 2, PAUSADO: 3, ENCERRADO: 4, CANCELADO: 5 } as Record<string, number>)[status] ?? 6; }
function inPeriod(value: string, period: string) { const dateValue = new Date(value.length === 10 ? `${value}T12:00:00` : value); const now = new Date(); if (period === "TODOS") return true; if (period === "MES") return dateValue.getFullYear() === now.getFullYear() && dateValue.getMonth() === now.getMonth(); if (period === "TRIMESTRE") return dateValue.getFullYear() === now.getFullYear() && Math.floor(dateValue.getMonth() / 3) === Math.floor(now.getMonth() / 3); return dateValue.getFullYear() === now.getFullYear(); }

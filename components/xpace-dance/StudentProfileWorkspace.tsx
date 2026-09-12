"use client";

import { AlertTriangle, CalendarClock, Camera, CheckCircle2, ChevronLeft, CircleDollarSign, Crown, FileText, Gift, History, Mail, MessageCircle, MoreHorizontal, Pencil, Plus, Send, StickyNote, WalletCards } from "lucide-react";
import { ChangeEvent, FormEvent, ReactNode, useEffect, useRef, useState } from "react";

import { supabase } from "@/lib/supabase";

type Tab = "RESUMO" | "COMUNICACAO" | "VENDAS" | "CONTRATOS" | "FINANCEIRO";
type Profile = {
  student: { id: string; personNumber: number; name: string; cpfMasked: string; mobile: string; birthDate: string; email: string; gender: string; whatsappOptIn: boolean; postalCode: string; street: string; streetNumber: string; complement: string; district: string; city: string; state: string; photoUrl: string; active: boolean; age: number | null };
  benefitProfiles: Array<{ id: string; name: string; kind: string; discountType: "PERCENTUAL" | "FIXO"; discountValue: number; active: boolean }>;
  benefits: Array<{ id: string; profileId: string; profile: { id: string; name: string; kind: string; discountType: "PERCENTUAL" | "FIXO"; discountValue: number } | null; startsOn: string; endsOn: string | null; status: "ATIVO" | "ENCERRADO"; note: string; createdAt: string }>;
  summary: { activeContract: boolean; overdueCents: number; debtCents: number; creditCents: number; rewardsBalance: number; nextDueOn: string | null };
  contracts: Array<{ id: string; contractNumber: number; planName: string; billingInterval: string; durationMonths: number; baseAmountCents: number; amountCents: number; benefitName: string; renewsAutomatically: boolean; startsOn: string; endsOn: string; status: string; statusNote: string; cancelEffectiveOn: string | null }>;
  charges: Array<{ id: string; contractId: string; competenceOn: string; dueOn: string; baseAmountCents: number; amountCents: number; status: string; paidAmountCents: number; paidAt: string | null; benefitName: string }>;
  activities: Array<{ id: string; type: string; subject: string; content: string; occurredAt: string }>;
  rewards: Array<{ points_delta: number; reason: string; occurred_at: string }>;
};

export default function StudentProfileWorkspace({ studentId, onBack }: { studentId: string; onBack: () => void }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tab, setTab] = useState<Tab>("RESUMO");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(false);
  const [benefitOpen, setBenefitOpen] = useState(false);
  const [benefitProfileId, setBenefitProfileId] = useState("");
  const [benefitNote, setBenefitNote] = useState("");
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

  if (loading || !profile) return <section className="xd-student-profile"><button className="xd-return" type="button" onClick={onBack}><ChevronLeft size={16} /> COMUNIDADE</button><p className="xd-profile-loading">CARREGANDO PERFIL DO ALUNO...</p>{notice ? <p className="xd-feedback">{notice}</p> : null}</section>;

  const activeBenefit = profile.benefits.find((benefit) => benefit.status === "ATIVO");
  const whatsapp = profile.student.mobile.replace(/\D/g, "");

  return <section className="xd-student-profile">
    <button className="xd-return" type="button" onClick={onBack}><ChevronLeft size={16} /> COMUNIDADE</button>
    <header className="xd-profile-identity">
      <div className="xd-profile-avatar"><div>{profile.student.photoUrl ? <img src={profile.student.photoUrl} alt={`Foto de ${profile.student.name}`} /> : <span>{initials(profile.student.name)}</span>}</div><button type="button" title="Enviar foto" disabled={saving} onClick={() => fileRef.current?.click()}><Camera size={16} /></button><input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadPhoto} /></div>
      <div className="xd-profile-name"><div><h1>{profile.student.name}</h1><span className={profile.summary.activeContract ? "xd-status-pill is-active" : "xd-status-pill"}><CheckCircle2 size={14} /> {profile.summary.activeContract ? "ATIVO" : "SEM CONTRATO ATIVO"}</span>{activeBenefit ? <button type="button" className="xd-benefit-pill" onClick={openBenefitDialog}><Crown size={14} /> {activeBenefit.profile?.name ?? "BENEFÍCIO"}</button> : <button type="button" className="xd-benefit-pill is-empty" onClick={openBenefitDialog}><Gift size={14} /> BENEFÍCIO</button>}</div><p>{profile.student.age ?? "—"} ANOS · {labelGender(profile.student.gender)}</p><div className="xd-profile-actions"><button type="button" className="xd-primary" onClick={() => setEditing(true)}><Pencil size={16} /> CADASTRO</button><a className={whatsapp ? "xd-secondary" : "xd-secondary is-disabled"} href={whatsapp ? `https://wa.me/55${whatsapp}` : undefined} target="_blank" rel="noreferrer" aria-disabled={!whatsapp}><MessageCircle size={16} /> WHATSAPP</a><button type="button" className="xd-icon-copy" title="Mais ações" onClick={openBenefitDialog}><MoreHorizontal size={19} /></button></div></div>
    </header>
    <nav className="xd-profile-tabs" aria-label="Seções do aluno">{(["RESUMO", "COMUNICACAO", "VENDAS", "CONTRATOS", "FINANCEIRO"] as Tab[]).map((item) => <button type="button" key={item} className={tab === item ? "is-active" : ""} onClick={() => setTab(item)}>{item === "COMUNICACAO" ? "COMUNICAÇÃO" : item}</button>)}</nav>
    {notice ? <p className="xd-feedback">{notice}</p> : null}
    {tab === "RESUMO" ? <Summary profile={profile} activeBenefit={activeBenefit} onBenefit={openBenefitDialog} /> : null}
    {tab === "COMUNICACAO" ? <Communication activity={activity} setActivity={setActivity} saving={saving} onSubmit={saveActivity} activities={profile.activities} /> : null}
    {tab === "VENDAS" ? <Sales /> : null}
    {tab === "CONTRATOS" ? <Contracts contracts={profile.contracts} /> : null}
    {tab === "FINANCEIRO" ? <Finance charges={profile.charges} /> : null}
    {editing ? <StudentEdit profile={profile} saving={saving} onClose={() => setEditing(false)} onSaved={async () => { setEditing(false); await loadProfile(); setNotice("CADASTRO ATUALIZADO."); }} request={request} /> : null}
    {benefitOpen ? <BenefitDialog profiles={profile.benefitProfiles} current={activeBenefit} selected={benefitProfileId} note={benefitNote} saving={saving} onSelect={setBenefitProfileId} onNote={setBenefitNote} onClose={() => setBenefitOpen(false)} onSubmit={saveBenefit} onEnd={endBenefit} onCreate={createBenefitProfile} /> : null}
  </section>;
}

function Summary({ profile, activeBenefit, onBenefit }: { profile: Profile; activeBenefit: Profile["benefits"][number] | undefined; onBenefit: () => void }) {
  const activeContracts = profile.contracts.filter((contract) => ["ATIVO", "AGENDADO", "PAUSADO"].includes(contract.status));
  return <div className="xd-profile-content"><div className="xd-summary-metrics"><Metric icon={<AlertTriangle size={18} />} label="EM ATRASO" value={currency(profile.summary.overdueCents)} tone="danger" /><Metric icon={<CircleDollarSign size={18} />} label="SALDO DEVEDOR" value={currency(profile.summary.debtCents)} tone="danger" /><Metric icon={<WalletCards size={18} />} label="CRÉDITOS" value={currency(profile.summary.creditCents)} tone="blue" /><Metric icon={<Gift size={18} />} label="SALDO XPACE" value={`${profile.summary.rewardsBalance} PTS`} tone="purple" /><Metric icon={<CalendarClock size={18} />} label="PRÓX. VENCIMENTO" value={profile.summary.nextDueOn ? date(profile.summary.nextDueOn) : "—"} tone="green" /></div><div className="xd-summary-grid"><section className="xd-profile-panel xd-profile-panel--contracts"><header><span><FileText size={18} /> CONTRATOS</span><small>{activeContracts.length} EM VIGOR</small></header>{activeContracts.length ? activeContracts.map((contract) => <article key={contract.id}><div><strong>{contract.planName}</strong><small>{contract.renewsAutomatically ? `RENOVA A CADA ${contract.billingInterval}` : `VIGENTE ATÉ ${date(contract.endsOn)}`}</small></div><b>{currency(contract.amountCents)}</b></article>) : <Empty title="SEM CONTRATO ATIVO" copy="O status do aluno será atualizado quando um contrato for registrado." />}</section><section className="xd-profile-panel"><header><span><Crown size={18} /> BENEFÍCIO</span><button type="button" title="Gerenciar benefício" onClick={onBenefit}><Pencil size={15} /></button></header>{activeBenefit?.profile ? <div className="xd-benefit-summary"><strong>{activeBenefit.profile.name}</strong><span>{benefitLabel(activeBenefit.profile.discountType, activeBenefit.profile.discountValue)}</span><small>DESDE {date(activeBenefit.startsOn)}</small></div> : <Empty title="SEM BENEFÍCIO" copy="VIP e bolsas são aplicados aqui antes da nova matrícula." />}</section><section className="xd-profile-panel"><header><span><Gift size={18} /> CLUBE DE RECOMPENSAS</span></header>{profile.rewards.length ? <div className="xd-reward-list">{profile.rewards.slice(0, 4).map((reward, index) => <article key={`${reward.occurred_at}-${index}`}><span>{reward.reason}</span><b className={reward.points_delta >= 0 ? "is-positive" : ""}>{reward.points_delta >= 0 ? "+" : ""}{reward.points_delta} PTS</b></article>)}</div> : <Empty title="SEM MOVIMENTAÇÕES" copy="A pontuação será registrada pela operação quando o clube estiver configurado." />}</section></div></div>;
}

function Communication({ activity, setActivity, saving, onSubmit, activities }: { activity: { type: string; subject: string; content: string }; setActivity: (value: { type: string; subject: string; content: string }) => void; saving: boolean; onSubmit: (event: FormEvent) => void; activities: Profile["activities"] }) { return <div className="xd-profile-content xd-communication"><form className="xd-activity-form" onSubmit={onSubmit}><header><span><StickyNote size={18} /> REGISTRAR ATIVIDADE</span><small>TUDO O QUE FOR REGISTRADO FICA NA LINHA DO TEMPO.</small></header><div><label>TIPO<select value={activity.type} onChange={(event) => setActivity({ ...activity, type: event.target.value })}><option value="ATIVIDADE">ATIVIDADE</option><option value="NOTA">NOTA</option><option value="WHATSAPP">WHATSAPP</option><option value="EMAIL">E-MAIL</option></select></label><label>ASSUNTO<input value={activity.subject} onChange={(event) => setActivity({ ...activity, subject: event.target.value })} required placeholder="EX.: RETORNO SOBRE A MATRÍCULA" /></label><label className="xd-activity-text">DESCRIÇÃO<textarea value={activity.content} onChange={(event) => setActivity({ ...activity, content: event.target.value })} placeholder="REGISTRE O QUE FOI TRATADO..." /></label><button type="submit" className="xd-primary" disabled={saving}><Plus size={16} /> ADICIONAR</button></div></form><section className="xd-timeline"><header><span><History size={19} /> LINHA DO TEMPO</span><small>{activities.length} REGISTRO(S)</small></header>{activities.length ? activities.map((item) => <article key={item.id}><div className={`xd-timeline-icon xd-timeline-icon--${item.type.toLowerCase()}`}>{item.type === "WHATSAPP" ? <MessageCircle size={16} /> : item.type === "EMAIL" ? <Mail size={16} /> : <StickyNote size={16} />}</div><div><strong>{item.subject}</strong>{item.content ? <p>{item.content}</p> : null}<small>{labelActivity(item.type)} · {dateTime(item.occurredAt)}</small></div></article>) : <Empty title="A LINHA DO TEMPO COMEÇA AQUI" copy="Registre contatos, e-mails, WhatsApp e observações para manter o contexto do aluno." />}</section></div>; }
function Sales() { return <div className="xd-profile-content"><section className="xd-profile-panel xd-history-empty"><header><span><CircleDollarSign size={18} /> HISTÓRICO DE VENDAS</span><small>FILTRO POR PERÍODO</small></header><Empty title="SEM VENDAS REGISTRADAS" copy="As vendas do BALCÃO aparecerão aqui automaticamente quando esse módulo estiver em operação." /></section></div>; }
function Contracts({ contracts }: { contracts: Profile["contracts"] }) { return <div className="xd-profile-content"><section className="xd-profile-panel xd-contract-history"><header><span><FileText size={18} /> HISTÓRICO DE CONTRATOS</span><small>{contracts.length} REGISTRO(S)</small></header>{contracts.length ? contracts.map((contract) => <article key={contract.id}><div><strong>#{String(contract.contractNumber).padStart(5, "0")} · {contract.planName}</strong><small>{contract.renewsAutomatically ? `RECORRENTE · ${contract.billingInterval}` : `${date(contract.startsOn)} ATÉ ${date(contract.endsOn)}`}{contract.benefitName ? ` · ${contract.benefitName}` : ""}</small></div><b>{currency(contract.amountCents)}</b><span className={`xd-contract-state xd-contract-state--${contract.status.toLowerCase()}`}>{contract.status}</span></article>) : <Empty title="SEM CONTRATOS" copy="Os contratos emitidos para o aluno ficarão listados aqui, ativos ou encerrados." />}</section></div>; }
function Finance({ charges }: { charges: Profile["charges"] }) { return <div className="xd-profile-content"><section className="xd-profile-panel xd-finance-history"><header><span><WalletCards size={18} /> RESUMO FINANCEIRO</span><small>{charges.length} LANÇAMENTO(S)</small></header>{charges.length ? <div className="xd-finance-table"><div className="xd-finance-head"><span>COMPETÊNCIA</span><span>VENCIMENTO</span><span>VALOR</span><span>SITUAÇÃO</span></div>{charges.map((charge) => <article key={charge.id}><span>{date(charge.competenceOn)}</span><span>{date(charge.dueOn)}</span><b>{currency(charge.amountCents)}</b><span className={`xd-charge-state xd-charge-state--${charge.status.toLowerCase()}`}>{charge.status}</span></article>)}</div> : <Empty title="SEM MOVIMENTAÇÃO FINANCEIRA" copy="As cobranças mensais nascem automaticamente a partir de contratos vigentes." />}</section></div>; }
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
function initials(value: string) { return value.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); }
function labelGender(value: string) { return ({ FEMININO: "FEMININO", MASCULINO: "MASCULINO", NAO_BINARIO: "NÃO BINÁRIO" } as Record<string, string>)[value] ?? "NÃO INFORMADO"; }
function labelActivity(value: string) { return ({ ATIVIDADE: "ATIVIDADE", NOTA: "NOTA", WHATSAPP: "WHATSAPP", EMAIL: "E-MAIL", SISTEMA: "SISTEMA" } as Record<string, string>)[value] ?? value; }
function benefitLabel(type: "PERCENTUAL" | "FIXO", value: number) { return type === "PERCENTUAL" ? `${(value / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% DE DESCONTO` : `${currency(value)} DE DESCONTO`; }

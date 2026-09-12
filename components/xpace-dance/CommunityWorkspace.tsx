"use client";

import { ArrowLeft, Filter, MessageCircle, Plus, Search, Send, UserPlus, UsersRound } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { supabase } from "@/lib/supabase";

type Person = { id: string; personNumber: number; name: string; cpfMasked: string; mobile: string; birthDate: string; email: string; gender: string; isStudent: boolean; whatsappOptIn: boolean; city: string; state: string; guardians: Array<{ id: string; name: string; cpfMasked: string; mobile: string }> };
type Draft = { cpf: string; fullName: string; mobile: string; birthDate: string; email: string; gender: string; whatsappOptIn: boolean; postalCode: string; street: string; streetNumber: string; complement: string; district: string; city: string; state: string };

const emptyDraft = (): Draft => ({ cpf: "", fullName: "", mobile: "", birthDate: "", email: "", gender: "NAO_INFORMADO", whatsappOptIn: false, postalCode: "", street: "", streetNumber: "", complement: "", district: "", city: "", state: "" });

export default function CommunityWorkspace({ onOpenProfile }: { onOpenProfile: (id: string) => void }) {
  const [people, setPeople] = useState<Person[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"ALL" | "STUDENTS" | "GUARDIANS">("ALL");
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"LIST" | "FORM">("LIST");
  const [student, setStudent] = useState<Draft>(emptyDraft);
  const [guardian, setGuardian] = useState<Draft>(emptyDraft);
  const [guardianId, setGuardianId] = useState("");
  const [createGuardian, setCreateGuardian] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lookingUpCep, setLookingUpCep] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => { void loadPeople(); }, []);

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("SESSÃO NÃO ENCONTRADA.");
    const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init?.headers } });
    const payload = await response.json().catch(() => ({})) as { success?: boolean; message?: string } & T;
    if (!response.ok || !payload.success) throw new Error(payload.message || "NÃO FOI POSSÍVEL CONCLUIR A OPERAÇÃO.");
    return payload;
  }

  async function loadPeople() {
    setLoading(true);
    try {
      const payload = await request<{ people: Person[] }>("/api/xpace/comunidade");
      setPeople(payload.people);
    } catch (error) { setNotice(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL CARREGAR A COMUNIDADE."); }
    finally { setLoading(false); }
  }

  const visiblePeople = useMemo(() => {
    const term = normalize(search);
    return people.filter((person) => (filter === "ALL" || filter === "STUDENTS" ? person.isStudent : !person.isStudent) && (!term || normalize(`${person.name} ${person.mobile} ${person.cpfMasked}`).includes(term)));
  }, [filter, people, search]);
  const isMinor = student.birthDate ? ageInYears(student.birthDate) < 18 : false;
  const guardians = people.filter((person) => !person.isStudent);

  function startForm() { setStudent(emptyDraft()); setGuardian(emptyDraft()); setGuardianId(""); setCreateGuardian(false); setNotice(""); setMode("FORM"); }
  function updateDraft(setter: (value: Draft) => void, draft: Draft, field: keyof Draft, value: string | boolean) { setter({ ...draft, [field]: value }); }

  async function lookupAddressFromCep() {
    const cep = student.postalCode.replace(/\D/g, "");
    if (cep.length !== 8 || lookingUpCep) return;
    setLookingUpCep(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const address = await response.json() as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
      if (!response.ok || address.erro) return;
      setStudent((current) => current.postalCode.replace(/\D/g, "") !== cep ? current : {
        ...current,
        street: address.logradouro || current.street,
        district: address.bairro || current.district,
        city: address.localidade || current.city,
        state: address.uf || current.state,
      });
    } catch { /* O endereço continua disponível para preenchimento manual se o serviço estiver indisponível. */ }
    finally { setLookingUpCep(false); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true); setNotice("");
    try {
      await request("/api/xpace/comunidade", { method: "POST", body: JSON.stringify({ student, guardian: isMinor ? (createGuardian ? { person: guardian } : { id: guardianId }) : undefined }) });
      await loadPeople();
      setMode("LIST");
      setNotice("ALUNO CADASTRADO COM SUCESSO.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL SALVAR O ALUNO."); }
    finally { setSaving(false); }
  }

  if (mode === "FORM") return <section className="xd-community">
    <header className="xd-community-header"><button type="button" className="xd-return" onClick={() => setMode("LIST")}><ArrowLeft size={17} /> COMUNIDADE</button><span>NOVO CADASTRO</span></header>
    <form className="xd-person-form" onSubmit={submit}>
      <section className="xd-form-block"><div><span>01</span><h2>ALUNO</h2><p>Identificação e contatos da pessoa que vai frequentar a escola.</p></div><div className="xd-fields xd-fields--three">
        <Field label="CPF" value={student.cpf} onChange={(value) => updateDraft(setStudent, student, "cpf", formatCpf(value))} inputMode="numeric" />
        <Field label="NOME COMPLETO" value={student.fullName} onChange={(value) => updateDraft(setStudent, student, "fullName", value)} />
        <Field label="CELULAR" value={student.mobile} onChange={(value) => updateDraft(setStudent, student, "mobile", formatPhone(value))} inputMode="tel" />
        <Field label="DATA DE NASCIMENTO" value={student.birthDate} onChange={(value) => updateDraft(setStudent, student, "birthDate", value)} type="date" />
        <Field label="E-MAIL" value={student.email} onChange={(value) => updateDraft(setStudent, student, "email", value)} type="email" />
        <label>SEXO<select value={student.gender} onChange={(event) => updateDraft(setStudent, student, "gender", event.target.value)}><option value="NAO_INFORMADO">NÃO INFORMAR</option><option value="FEMININO">FEMININO</option><option value="MASCULINO">MASCULINO</option><option value="NAO_BINARIO">NÃO BINÁRIO</option></select></label>
      </div></section>

      {isMinor ? <section className="xd-form-block"><div><span>02</span><h2>RESPONSÁVEL</h2><p>O responsável também entra na Comunidade, sem duplicar pessoas.</p></div><div className="xd-guardian-tools"><label>BUSCAR RESPONSÁVEL JÁ CADASTRADO<select value={guardianId} disabled={createGuardian} onChange={(event) => setGuardianId(event.target.value)}><option value="">SELECIONE NA COMUNIDADE</option>{guardians.map((person) => <option value={person.id} key={person.id}>{person.name} · {person.cpfMasked}</option>)}</select></label><button type="button" className="xd-add-guardian" onClick={() => { setCreateGuardian((current) => !current); setGuardianId(""); }}><Plus size={16} /> {createGuardian ? "USAR CADASTRO EXISTENTE" : "CADASTRAR RESPONSÁVEL"}</button></div>
        {createGuardian ? <div className="xd-fields xd-fields--three xd-guardian-fields"><Field label="CPF" value={guardian.cpf} onChange={(value) => updateDraft(setGuardian, guardian, "cpf", formatCpf(value))} inputMode="numeric" /><Field label="NOME COMPLETO" value={guardian.fullName} onChange={(value) => updateDraft(setGuardian, guardian, "fullName", value)} /><Field label="CELULAR" value={guardian.mobile} onChange={(value) => updateDraft(setGuardian, guardian, "mobile", formatPhone(value))} inputMode="tel" /><Field label="DATA DE NASCIMENTO" value={guardian.birthDate} onChange={(value) => updateDraft(setGuardian, guardian, "birthDate", value)} type="date" /><Field label="E-MAIL" value={guardian.email} onChange={(value) => updateDraft(setGuardian, guardian, "email", value)} type="email" /><label>SEXO<select value={guardian.gender} onChange={(event) => updateDraft(setGuardian, guardian, "gender", event.target.value)}><option value="NAO_INFORMADO">NÃO INFORMAR</option><option value="FEMININO">FEMININO</option><option value="MASCULINO">MASCULINO</option><option value="NAO_BINARIO">NÃO BINÁRIO</option></select></label></div> : null}</section> : null}

      <section className="xd-form-block"><div><span>03</span><h2>ENDEREÇO</h2><p>Informe o CEP para preencher o endereço. Complete apenas número e complemento.</p></div><div className="xd-address-fields"><div className="xd-address-main"><Field label={lookingUpCep ? "CEP · BUSCANDO..." : "CEP"} value={student.postalCode} onChange={(value) => updateDraft(setStudent, student, "postalCode", formatCep(value))} onBlur={lookupAddressFromCep} inputMode="numeric" /><Field label="RUA / AVENIDA" value={student.street} onChange={(value) => updateDraft(setStudent, student, "street", value)} /><Field label="NÚMERO" value={student.streetNumber} onChange={(value) => updateDraft(setStudent, student, "streetNumber", value)} /></div><div className="xd-address-details"><Field label="COMPLEMENTO" value={student.complement} onChange={(value) => updateDraft(setStudent, student, "complement", value)} /><Field label="BAIRRO" value={student.district} onChange={(value) => updateDraft(setStudent, student, "district", value)} /><Field label="CIDADE" value={student.city} onChange={(value) => updateDraft(setStudent, student, "city", value)} /><Field label="UF" value={student.state} onChange={(value) => updateDraft(setStudent, student, "state", value.toUpperCase().slice(0, 2))} /></div></div></section>

      <section className="xd-form-block xd-notification"><div><span>04</span><h2>NOTIFICAÇÕES</h2><p>O envio automático só será liberado para quem autorizar o contato.</p></div><button type="button" className={student.whatsappOptIn ? "is-active" : ""} onClick={() => updateDraft(setStudent, student, "whatsappOptIn", !student.whatsappOptIn)}><MessageCircle size={19} /><span>{student.whatsappOptIn ? "WHATSAPP AUTOMÁTICO ATIVADO" : "WHATSAPP AUTOMÁTICO DESATIVADO"}</span></button></section>
      {notice ? <p className="xd-feedback">{notice}</p> : null}<footer><button type="button" className="xd-secondary" onClick={() => setMode("LIST")}>CANCELAR</button><button type="submit" className="xd-primary" disabled={saving}>{saving ? "SALVANDO..." : "SALVAR ALUNO"}</button></footer>
    </form>
  </section>;

  return <section className="xd-community">
    <div className="xd-community-title"><div><span>CADASTRO E RELACIONAMENTO</span><h1>PESSOAS DA XPACE.</h1><p>Alunos e responsáveis em uma única base, sem cadastros duplicados.</p></div><button type="button" className="xd-primary" onClick={startForm}><UserPlus size={17} /> CADASTRAR ALUNO</button></div>
    <div className="xd-community-actions"><label><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="BUSCAR POR NOME, CPF OU CELULAR" /></label><label className="xd-filter"><Filter size={16} /><select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}><option value="ALL">TODOS</option><option value="STUDENTS">ALUNOS</option><option value="GUARDIANS">RESPONSÁVEIS</option></select></label><button type="button" className="xd-secondary" onClick={() => setNotice("OS CONVITES SERÃO ENVIADOS QUANDO O CANAL OFICIAL DE WHATSAPP FOR CONECTADO.")}><Send size={16} /> CONVIDAR</button></div>
    {notice ? <p className="xd-feedback">{notice}</p> : null}
    <div className="xd-people-list">{loading ? <p>CARREGANDO COMUNIDADE...</p> : visiblePeople.length ? visiblePeople.map((person) => <article key={person.id} className="xd-person-row"><div className="xd-person-icon"><UsersRound size={20} /></div><div><button type="button" className="xd-person-open" disabled={!person.isStudent} onDoubleClick={() => person.isStudent && onOpenProfile(person.id)} onClick={() => person.isStudent && onOpenProfile(person.id)} title={person.isStudent ? "Abrir perfil do aluno" : "O perfil geral está disponível apenas para alunos"}><strong>{person.name}</strong></button><small>{person.isStudent ? "ALUNO" : "RESPONSÁVEL"} · {person.cpfMasked} · {person.mobile || "SEM CELULAR"}</small></div><div className="xd-person-meta"><span>{person.city ? `${person.city}/${person.state}` : "SEM ENDEREÇO"}</span>{person.isStudent && person.guardians.length ? <small>RESP.: {person.guardians.map((guardian) => guardian.name).join(", ")}</small> : null}</div>{person.isStudent ? <button type="button" className="xd-person-profile-action" onClick={() => onOpenProfile(person.id)}>ABRIR</button> : null}<i>{String(person.personNumber).padStart(4, "0")}</i></article>) : <p className="xd-empty-community">NENHUMA PESSOA ENCONTRADA. CADASTRE O PRIMEIRO ALUNO.</p>}</div>
  </section>;
}

function Field({ label, value, onChange, onBlur, type = "text", inputMode }: { label: string; value: string; onChange: (value: string) => void; onBlur?: () => void; type?: string; inputMode?: "numeric" | "tel" }) { return <label>{label}<input type={type} inputMode={inputMode} value={value} onChange={(event) => onChange(event.target.value)} onBlur={onBlur} /></label>; }
function normalize(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/\D/g, "") || value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR"); }
function ageInYears(date: string) { const birth = new Date(`${date}T12:00:00`); const today = new Date(); let age = today.getFullYear() - birth.getFullYear(); if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age -= 1; return age; }
function formatCpf(value: string) { const digits = value.replace(/\D/g, "").slice(0, 11); return digits.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2"); }
function formatPhone(value: string) { const digits = value.replace(/\D/g, "").slice(0, 11); return digits.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2"); }
function formatCep(value: string) { const digits = value.replace(/\D/g, "").slice(0, 8); return digits.replace(/(\d{5})(\d)/, "$1-$2"); }

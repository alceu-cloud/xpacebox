import { NextResponse } from "next/server";

import { AutentiqueError, createAutentiqueSignatureDocument } from "@/lib/server/autentique";
import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";
import { ContractTemplateError, renderXpaceContractTemplate, type ContractTemplateData } from "@/lib/server/xpace-contract-template";
import { todayIso } from "@/lib/xpace/billing";

const companySlug = "xpace";
type Body = { saleId?: string; resend?: boolean };

export async function POST(request: Request) {
  let saleId = "";
  let access: Awaited<ReturnType<typeof requireCompanyAccess>> | null = null;
  let dispatchStarted = false;
  try {
    const body = (await request.json()) as Body;
    saleId = body.saleId?.trim() ?? "";
    if (!saleId) throw new RequestError("VENDA NÃO INFORMADA.", 400);
    access = await requireCompanyAccess(request, companySlug);
    if (!["platform_owner", "company_manager"].includes(access.profile.platform_role)) throw new AccessError("APENAS GESTORES PODEM ENVIAR CONTRATOS PARA ASSINATURA.", 403);

    const { data: sale, error: saleError } = await access.admin.from("xpace_contract_sales").select("id,contract_id,status,signature_required,signature_status,signature_envelope_id").eq("id", saleId).eq("tenant_company_id", access.company.id).maybeSingle();
    if (saleError) throw saleError;
    if (!sale) throw new RequestError("VENDA NÃO ENCONTRADA NESTA EMPRESA.", 404);
    const resend = Boolean(body.resend);
    if ((sale.signature_envelope_id || ["ENVIADA", "ASSINADA"].includes(sale.signature_status)) && !resend) throw new RequestError("ESTE CONTRATO JÁ FOI ENVIADO. USE O LINK GERADO OU ESCOLHA REENVIAR.", 409);

    const { data: contract, error: contractError } = await access.admin.from("xpace_student_contracts").select("id,contract_number,status,plan_id,student_id,duration_months_snapshot,modality_rules_snapshot,enrollment_service_snapshot").eq("id", sale.contract_id).eq("tenant_company_id", access.company.id).maybeSingle();
    if (contractError) throw contractError;
    if (!contract?.plan_id) throw new RequestError("O PLANO DE ORIGEM DESTE CONTRATO NÃO ESTÁ DISPONÍVEL PARA ASSINATURA.", 409);

    if (sale.status === "CANCELADA" || ["CANCELADO", "ENCERRADO"].includes(contract.status)) throw new RequestError("ESTE CONTRATO FOI ENCERRADO. NÃO É POSSÍVEL SOLICITAR NOVA ASSINATURA.", 409);

    const [{ data: plan, error: planError }, { data: student, error: studentError }, { data: school, error: schoolError }, { data: charges, error: chargesError }, { data: groupLinks, error: groupLinksError }] = await Promise.all([
      access.admin.from("xpace_membership_plans").select("contract_template_path,contract_template_name").eq("id", contract.plan_id).eq("tenant_company_id", access.company.id).maybeSingle(),
      access.admin.from("xpace_people").select("id,full_name,email,mobile,cpf,birth_date,postal_code,street,street_number,district,city,state").eq("id", contract.student_id).eq("tenant_company_id", access.company.id).eq("is_student", true).maybeSingle(),
      access.admin.from("xpace_school_profiles").select("legal_name,trade_name,cnpj,postal_code,street,street_number,district,city,state").eq("tenant_company_id", access.company.id).maybeSingle(),
      access.admin.from("xpace_contract_charges").select("amount_cents,due_on,competence_on").eq("tenant_company_id", access.company.id).eq("contract_id", contract.id).neq("status", "CANCELADO").order("competence_on"),
      access.admin.from("xpace_contract_class_groups").select("class_group_id,modality_id").eq("tenant_company_id", access.company.id).eq("contract_id", contract.id),
    ]);
    if (planError) throw planError;
    if (studentError) throw studentError;
    if (schoolError) throw schoolError;
    if (chargesError) throw chargesError;
    if (groupLinksError) throw groupLinksError;
    if (!plan?.contract_template_path) throw new RequestError("ANTES DE ENVIAR, IMPORTE O MODELO DOCX DESTE CONTRATO NO CADASTRO DO PLANO.", 409);
    if (!plan.contract_template_path.toLowerCase().endsWith(".docx")) throw new RequestError("PARA PREENCHER O CONTRATO AUTOMATICAMENTE, IMPORTE O MODELO ORIGINAL EM DOCX.", 409);
    if (!student) throw new RequestError("ALUNO NÃO ENCONTRADO PARA ASSINATURA.", 404);

    const guardian = await resolveGuardian(access, student);
    const templateData = await buildTemplateData(access, { contract, student, school, charges: charges ?? [], groupLinks: groupLinks ?? [], guardian });

    const { data: file, error: fileError } = await access.admin.storage.from("xpace-contract-templates").download(plan.contract_template_path);
    if (fileError || !file) throw new RequestError("NÃO FOI POSSÍVEL LER O MODELO DOCX DO CONTRATO.", 409);
    if (file.size > 5 * 1024 * 1024) throw new RequestError("O MODELO DOCX EXCEDE 5 MB, LIMITE ATUAL DA AUTENTIQUE PARA O PLANO GRATUITO.", 409);
    const renderedFile = renderXpaceContractTemplate(await file.arrayBuffer(), templateData);

    const now = new Date().toISOString();
    const { error: processingError } = await access.admin.from("xpace_contract_sales").update({ signature_required: true, signature_status: "PENDENTE", signature_error: null, updated_by: access.user.id, updated_at: now }).eq("id", sale.id).eq("tenant_company_id", access.company.id);
    if (processingError) throw processingError;
    dispatchStarted = true;
    const document = await createAutentiqueSignatureDocument({ file: renderedFile, fileName: `xpace-contrato-${contract.contract_number}.docx`, documentName: `XPACE · CONTRATO #${String(contract.contract_number).padStart(5, "0")} · ${student.full_name}`, signer: { name: student.full_name, email: student.email, mobile: student.mobile, cpf: student.cpf } });
    const { error: updateError } = await access.admin.from("xpace_contract_sales").update({ signature_required: true, signature_status: "ENVIADA", signature_provider: "AUTENTIQUE", signature_envelope_id: document.documentId, signature_url: document.signatureUrl || null, signature_error: null, sent_for_signature_at: now, signature_due_on: addDays(todayIso(), 7), signature_reminder_day_2_at: null, signature_reminder_day_5_at: null, updated_by: access.user.id, updated_at: now }).eq("id", sale.id).eq("tenant_company_id", access.company.id);
    if (updateError) throw updateError;
    const { error: eventError } = await access.admin.from("xpace_contract_events").insert({ tenant_company_id: access.company.id, contract_id: contract.id, event_type: "ASSINATURA_ENVIADA", note: resend ? "ASSINATURA REENVIADA." : document.sandbox ? "ENVIADO À AUTENTIQUE EM MODO DE TESTE (SANDBOX)." : "ENVIADO À AUTENTIQUE PARA ASSINATURA.", created_by: access.user.id });
    if (eventError) console.error("XPACE SIGNATURE EVENT ERROR", eventError);
    return NextResponse.json({ success: true, signatureUrl: document.signatureUrl, sandbox: document.sandbox });
  } catch (error) {
    if (access && saleId && dispatchStarted) await access.admin.from("xpace_contract_sales").update({ signature_status: "ERRO", signature_error: error instanceof Error ? error.message.slice(0, 500) : "NÃO FOI POSSÍVEL ENVIAR O DOCUMENTO PARA ASSINATURA.", updated_by: access.user.id, updated_at: new Date().toISOString() }).eq("id", saleId).eq("tenant_company_id", access.company.id);
    if (error instanceof AccessError || error instanceof RequestError || error instanceof AutentiqueError) return NextResponse.json({ success: false, message: error.message }, { status: error.status });
    if (error instanceof ContractTemplateError) return NextResponse.json({ success: false, message: error.message }, { status: 409 });
    console.error("XPACE AUTENTIQUE SEND ERROR", error);
    return NextResponse.json({ success: false, message: "NÃO FOI POSSÍVEL ENVIAR O CONTRATO PARA ASSINATURA." }, { status: 500 });
  }
}

class RequestError extends Error { constructor(message: string, public status: number) { super(message); } }

type Person = {
  id: string;
  full_name: string;
  email: string | null;
  mobile: string | null;
  cpf: string | null;
  birth_date: string | null;
  postal_code: string | null;
  street: string | null;
  street_number: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
};

async function resolveGuardian(access: Awaited<ReturnType<typeof requireCompanyAccess>>, student: Person) {
  if (!isMinor(student.birth_date)) return student;
  const { data: relationship, error: relationshipError } = await access.admin.from("xpace_guardianships").select("guardian_id").eq("tenant_company_id", access.company.id).eq("student_id", student.id).limit(1).maybeSingle();
  if (relationshipError) throw relationshipError;
  if (!relationship) throw new RequestError("CADASTRE O RESPONSÁVEL LEGAL ANTES DE ENVIAR O CONTRATO DE UM ALUNO MENOR DE IDADE.", 409);
  const { data: guardian, error: guardianError } = await access.admin.from("xpace_people").select("id,full_name,email,mobile,cpf,birth_date,postal_code,street,street_number,district,city,state").eq("tenant_company_id", access.company.id).eq("id", relationship.guardian_id).maybeSingle();
  if (guardianError) throw guardianError;
  if (!guardian) throw new RequestError("O RESPONSÁVEL LEGAL DESTE ALUNO NÃO ESTÁ DISPONÍVEL.", 409);
  return guardian as Person;
}

async function buildTemplateData(access: Awaited<ReturnType<typeof requireCompanyAccess>>, input: {
  contract: { id: string; duration_months_snapshot: number; modality_rules_snapshot: unknown; enrollment_service_snapshot: unknown };
  student: Person;
  guardian: Person;
  school: { legal_name: string | null; trade_name: string | null; cnpj: string | null; postal_code: string | null; street: string | null; street_number: string | null; district: string | null; city: string | null; state: string | null } | null;
  charges: Array<{ amount_cents: number; due_on: string; competence_on: string }>;
  groupLinks: Array<{ class_group_id: string; modality_id: string | null }>;
}): Promise<ContractTemplateData> {
  const { contract, student, guardian, school, charges, groupLinks } = input;
  validateSchoolProfile(school);
  if (!school) throw new RequestError("PREENCHA O PERFIL DA ESCOLA ANTES DE ENVIAR O CONTRATO.", 409);
  validatePerson(student, "ALUNO");
  validatePerson(guardian, "RESPONSÁVEL");
  if (!charges.length) throw new RequestError("A VENDA NÃO POSSUI PARCELAS VÁLIDAS PARA GERAR O CONTRATO.", 409);
  if (!groupLinks.length) throw new RequestError("SELECIONE UMA GRADE DE AULA PARA ESTE CONTRATO ANTES DE ENVIAR PARA ASSINATURA.", 409);

  const groupIds = groupLinks.map((link) => link.class_group_id);
  const [{ data: groups, error: groupsError }, { data: schedules, error: schedulesError }] = await Promise.all([
    access.admin.from("xpace_class_groups").select("id,name,modality_id").eq("tenant_company_id", access.company.id).in("id", groupIds),
    access.admin.from("xpace_class_schedules").select("class_group_id,weekday,starts_at,ends_at").eq("tenant_company_id", access.company.id).eq("active", true).in("class_group_id", groupIds).order("weekday").order("starts_at"),
  ]);
  if (groupsError) throw groupsError;
  if (schedulesError) throw schedulesError;
  if ((groups ?? []).length !== groupIds.length) throw new RequestError("UMA DAS GRADES VINCULADAS AO CONTRATO NÃO ESTÁ MAIS DISPONÍVEL.", 409);

  const modalityIds = [...new Set((groups ?? []).map((group) => group.modality_id).filter((id): id is string => Boolean(id)))];
  const { data: modalities, error: modalitiesError } = await access.admin.from("xpace_modalities").select("id,name").eq("tenant_company_id", access.company.id).in("id", modalityIds);
  if (modalitiesError) throw modalitiesError;
  if (!modalities?.length) throw new RequestError("A GRADE VINCULADA PRECISA TER UMA MODALIDADE ATIVA.", 409);

  const rules = Array.isArray(contract.modality_rules_snapshot) ? contract.modality_rules_snapshot : [];
  const templateModalities = (groups ?? []).map((group) => {
    const modality = modalities.find((item) => item.id === group.modality_id);
    const groupSchedules = (schedules ?? []).filter((schedule) => schedule.class_group_id === group.id);
    const rule = rules.find((value) => isRecord(value) && value.modalityId === group.modality_id);
    return {
      DescricaoModalidade: modality?.name ?? group.name,
      LimiteAcessos: accessLimit(rule),
      DiasLiberadosParaAcesso: unique(groupSchedules.map((schedule) => weekdayName(schedule.weekday))).join(", ") || "CONFORME GRADE",
      HorariosLiberadosParaAcesso: groupSchedules.map((schedule) => `${weekdayName(schedule.weekday)} ${formatTime(schedule.starts_at)} ÀS ${formatTime(schedule.ends_at)}`).join(" · ") || "CONFORME GRADE",
    };
  });
  const enrollmentFee = enrollmentFeeCents(contract.enrollment_service_snapshot);
  const total = charges.reduce((sum, charge) => sum + charge.amount_cents, 0);

  return {
    RazaoSocialFilial: school.legal_name!,
    NomeFantasiaFilial: school.trade_name || school.legal_name!,
    CnpjCpfFilial: formatCnpj(school.cnpj!),
    CidadeFilial: school.city!,
    EnderecoFilial: school.street!,
    NumeroEnderecoFilial: school.street_number!,
    BairroFilial: school.district!,
    CepFilial: formatCep(school.postal_code!),
    UfFilial: school.state!,
    NomeCliente: student.full_name,
    CpfCliente: formatCpf(student.cpf!),
    EnderecoCliente: student.street!,
    NumeroEnderecoCliente: student.street_number!,
    BairroCliente: student.district!,
    CepCliente: formatCep(student.postal_code!),
    CidadeCliente: student.city!,
    UfCliente: student.state!,
    NomeResponsavel: guardian.full_name,
    CpfResponsavel: formatCpf(guardian.cpf!),
    EnderecoResponsavel: guardian.street!,
    NumeroEnderecoResponsavel: guardian.street_number!,
    BairroResponsavel: guardian.district!,
    CepResponsavel: formatCep(guardian.postal_code!),
    DuracaoContrato: formatDuration(contract.duration_months_snapshot),
    DescricaoContrato: templateModalities.map((modality) => modality.DescricaoModalidade).join(" · "),
    ValorTotalContratoFormatado: formatCurrency(total),
    ValorAdesaoFormatado: formatCurrency(enrollmentFee),
    TemAdesao: enrollmentFee > 0 ? [{}] : [],
    TemResponsavel: isMinor(student.birth_date) ? [{}] : [],
    Modalidades: templateModalities,
    Parcelas: charges.map((charge) => ({ ValorFormatado: formatCurrency(charge.amount_cents), DataVencimento: formatDate(charge.due_on) })),
  };
}

function validateSchoolProfile(school: Parameters<typeof buildTemplateData>[1]["school"]) {
  const fields: Array<[string, string | null | undefined]> = [["RAZÃO SOCIAL", school?.legal_name], ["CNPJ", school?.cnpj], ["CEP", school?.postal_code], ["ENDEREÇO", school?.street], ["NÚMERO", school?.street_number], ["BAIRRO", school?.district], ["CIDADE", school?.city], ["UF", school?.state]];
  const missing = fields.filter(([, value]) => !value?.trim()).map(([name]) => name);
  if (missing.length) throw new RequestError(`PREENCHA NO PERFIL DA ESCOLA: ${missing.join(", ")}.`, 409);
}

function validatePerson(person: Person, label: string) {
  const fields: Array<[string, string | null | undefined]> = [["NOME", person.full_name], ["CPF", person.cpf], ["CEP", person.postal_code], ["ENDEREÇO", person.street], ["NÚMERO", person.street_number], ["BAIRRO", person.district], ["CIDADE", person.city], ["UF", person.state]];
  const missing = fields.filter(([, value]) => !value?.trim()).map(([name]) => name);
  if (missing.length) throw new RequestError(`PREENCHA NO CADASTRO DO ${label}: ${missing.join(", ")}.`, 409);
}

function isMinor(value: string | null) {
  if (!value) return false;
  const birth = new Date(`${value}T12:00:00`);
  const current = new Date();
  let age = current.getFullYear() - birth.getFullYear();
  if (current.getMonth() < birth.getMonth() || (current.getMonth() === birth.getMonth() && current.getDate() < birth.getDate())) age -= 1;
  return age < 18;
}

function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object"; }
function accessLimit(value: unknown) {
  if (!isRecord(value)) return "CONFORME CONTRATO";
  const sessions = Number(value.sessionsPerWeek);
  if (Number.isInteger(sessions) && sessions > 0) return `${sessions} ${sessions === 1 ? "VEZ" : "VEZES"} POR SEMANA`;
  return "CONFORME CONTRATO";
}
function enrollmentFeeCents(value: unknown) { return isRecord(value) && Number.isInteger(value.salePriceCents) ? Math.max(0, Number(value.salePriceCents)) : 0; }
function unique(values: string[]) { return [...new Set(values)]; }
function weekdayName(value: number) { return ["DOMINGO", "SEGUNDA-FEIRA", "TERÇA-FEIRA", "QUARTA-FEIRA", "QUINTA-FEIRA", "SEXTA-FEIRA", "SÁBADO"][value] ?? "DIA NÃO INFORMADO"; }
function formatTime(value: string) { return value.slice(0, 5); }
function formatDuration(value: number) { return `${value} ${value === 1 ? "MÊS" : "MESES"}`; }
function formatCurrency(value: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value / 100); }
function formatDate(value: string) { const [year, month, day] = value.split("-"); return `${day}/${month}/${year}`; }
function digits(value: string) { return value.replace(/\D/g, ""); }
function formatCpf(value: string) { const number = digits(value); return `${number.slice(0, 3)}.${number.slice(3, 6)}.${number.slice(6, 9)}-${number.slice(9, 11)}`; }
function formatCnpj(value: string) { const number = digits(value); return `${number.slice(0, 2)}.${number.slice(2, 5)}.${number.slice(5, 8)}/${number.slice(8, 12)}-${number.slice(12, 14)}`; }
function formatCep(value: string) { const number = digits(value); return `${number.slice(0, 5)}-${number.slice(5, 8)}`; }
function addDays(value: string, days: number) { const date = new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }

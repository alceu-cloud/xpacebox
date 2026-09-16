import { NextResponse } from "next/server";

import { todayIso } from "@/lib/xpace/billing";
import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";

const companySlug = "xpace";
type Context = { params: Promise<{ id: string }> };
type PersonInput = { cpf?: string; fullName?: string; mobile?: string; birthDate?: string; email?: string; gender?: string; whatsappOptIn?: boolean; postalCode?: string; street?: string; streetNumber?: string; complement?: string; district?: string; city?: string; state?: string };
type Body = { action?: "UPDATE_PERSON" | "ADD_ACTIVITY" | "SET_BENEFIT" | "END_BENEFIT"; person?: PersonInput; activity?: { type?: string; subject?: string; content?: string; occurredAt?: string }; benefit?: { benefitProfileId?: string; startsOn?: string; note?: string } };

export async function GET(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const access = await requireCompanyAccess(request, companySlug);
    const { data: person, error: personError } = await access.admin.from("xpace_people").select("id,person_number,cpf,full_name,mobile,birth_date,email,gender,whatsapp_opt_in,postal_code,street,street_number,complement,district,city,state,photo_path,active").eq("id", id).eq("tenant_company_id", access.company.id).eq("is_student", true).maybeSingle();
    if (personError) throw personError;
    if (!person) throw new RequestError("ALUNO NÃO ENCONTRADO NA COMUNIDADE.", 404);

    const { data: contracts, error: contractError } = await access.admin.from("xpace_student_contracts").select("id,contract_number,student_id,plan_id,plan_name_snapshot,billing_interval_snapshot,duration_months_snapshot,base_amount_cents,amount_cents,benefit_name_snapshot,discount_type_snapshot,discount_value_snapshot,renews_automatically,starts_on,ends_on,status,status_note,cancel_effective_on,created_at,created_by").eq("tenant_company_id", access.company.id).eq("student_id", id).order("starts_on", { ascending: false });
    if (contractError) throw contractError;
    const photoRequest = person.photo_path
      ? access.admin.storage.from("xpace-people").createSignedUrl(person.photo_path, 60 * 30)
      : Promise.resolve({ data: null, error: null });
    const [chargesResult, activitiesResult, benefitsResult, profilesResult, rewardsResult, enrollmentsResult, salesResult, eventsResult, contractGroupsResult, groupSchedulesResult, modalitiesResult, photoResult] = await Promise.all([
      access.admin.from("xpace_contract_charges").select("id,contract_id,competence_on,due_on,base_amount_cents,benefit_name_snapshot,discount_type_snapshot,discount_value_snapshot,amount_cents,paid_amount_cents,status,paid_at,provider_payment_id,provider_status,pix_copy_paste,pix_qr_code_url,provider_error").eq("tenant_company_id", access.company.id).eq("student_id", id).order("due_on", { ascending: false }).limit(240),
      access.admin.from("xpace_person_activities").select("id,activity_type,subject,content,occurred_at,created_by").eq("tenant_company_id", access.company.id).eq("person_id", id).order("occurred_at", { ascending: false }).limit(160),
      access.admin.from("xpace_person_benefits").select("id,benefit_profile_id,starts_on,ends_on,status,note,created_at").eq("tenant_company_id", access.company.id).eq("person_id", id).order("created_at", { ascending: false }),
      access.admin.from("xpace_benefit_profiles").select("id,name,kind,discount_type,discount_value,active").eq("tenant_company_id", access.company.id).order("name"),
      access.admin.from("xpace_rewards_ledger").select("points_delta,reason,occurred_at").eq("tenant_company_id", access.company.id).eq("person_id", id).order("occurred_at", { ascending: false }).limit(50),
      access.admin.from("xpace_class_enrollments").select("id,class_group_id,starts_on,ends_on,status").eq("tenant_company_id", access.company.id).eq("student_id", id).eq("status", "ATIVA"),
      access.admin.from("xpace_contract_sales").select("id,sale_number,contract_id,sold_on,status,signature_required,signature_status,signature_provider,signature_url,signed_document_url,signature_error,sent_for_signature_at,signed_at,cancelled_at,cancellation_reason,created_at").eq("tenant_company_id", access.company.id).eq("student_id", id).order("sold_on", { ascending: false }).order("created_at", { ascending: false }).limit(240),
      access.admin.from("xpace_contract_events").select("id,contract_id,event_type,previous_status,next_status,note,created_by,created_at").eq("tenant_company_id", access.company.id).order("created_at", { ascending: false }).limit(500),
      access.admin.from("xpace_contract_class_groups").select("contract_id,class_group_id,modality_id").eq("tenant_company_id", access.company.id),
      access.admin.from("xpace_class_schedules").select("class_group_id,weekday,starts_at,ends_at,room_name").eq("tenant_company_id", access.company.id).eq("active", true),
      access.admin.from("xpace_modalities").select("id,name").eq("tenant_company_id", access.company.id),
      photoRequest,
    ]);
    for (const result of [chargesResult, activitiesResult, benefitsResult, profilesResult, rewardsResult, enrollmentsResult, salesResult, eventsResult, contractGroupsResult, groupSchedulesResult, modalitiesResult]) if (result.error) throw result.error;

    const profilesById = new Map((profilesResult.data ?? []).map((profile) => [profile.id, profile]));
    const benefits = (benefitsResult.data ?? []).map((benefit) => ({ id: benefit.id, profileId: benefit.benefit_profile_id, profile: profilesById.get(benefit.benefit_profile_id) ?? null, startsOn: benefit.starts_on, endsOn: benefit.ends_on, status: benefit.status, note: benefit.note ?? "", createdAt: benefit.created_at }));
    const charges = chargesResult.data ?? [];
    const today = todayIso();
    const openCharges = charges.filter((charge) => charge.status === "ABERTO");
    const contractsById = new Map((contracts ?? []).map((contract) => [contract.id, contract]));
    const salesByContract = new Map((salesResult.data ?? []).map((sale) => [sale.contract_id, sale]));
    const groupsByContract = new Map<string, Array<{ classGroupId: string; modalityId: string }>>();
    for (const group of contractGroupsResult.data ?? []) groupsByContract.set(group.contract_id, [...(groupsByContract.get(group.contract_id) ?? []), { classGroupId: group.class_group_id, modalityId: group.modality_id ?? "" }]);
    const modalitiesById = new Map((modalitiesResult.data ?? []).map((modality) => [modality.id, modality.name]));
    const schedulesByGroup = new Map<string, Array<{ weekday: number; startsAt: string; endsAt: string; roomName: string }>>();
    for (const schedule of groupSchedulesResult.data ?? []) schedulesByGroup.set(schedule.class_group_id, [...(schedulesByGroup.get(schedule.class_group_id) ?? []), { weekday: schedule.weekday, startsAt: schedule.starts_at.slice(0, 5), endsAt: schedule.ends_at.slice(0, 5), roomName: schedule.room_name ?? "" }]);
    const activeContract = (contracts ?? []).find((contract) => contract.status === "ATIVO" && (!contract.cancel_effective_on || contract.cancel_effective_on > today));
    const photoUrl = photoResult.data?.signedUrl ?? "";

    return NextResponse.json({
      success: true,
      student: { id: person.id, personNumber: person.person_number, name: person.full_name, cpfMasked: maskCpf(person.cpf), mobile: person.mobile ?? "", birthDate: person.birth_date ?? "", email: person.email ?? "", gender: person.gender, whatsappOptIn: person.whatsapp_opt_in, postalCode: person.postal_code ?? "", street: person.street ?? "", streetNumber: person.street_number ?? "", complement: person.complement ?? "", district: person.district ?? "", city: person.city ?? "", state: person.state ?? "", photoUrl, active: person.active, age: person.birth_date ? age(person.birth_date) : null },
      benefitProfiles: (profilesResult.data ?? []).map((profile) => ({ id: profile.id, name: profile.name, kind: profile.kind, discountType: profile.discount_type, discountValue: profile.discount_value, active: profile.active })),
      benefits,
      summary: {
        activeContract: Boolean(activeContract),
        overdueCents: openCharges.filter((charge) => charge.due_on < today).reduce((sum, charge) => sum + charge.amount_cents, 0),
        debtCents: openCharges.reduce((sum, charge) => sum + charge.amount_cents, 0),
        creditCents: 0,
        rewardsBalance: (rewardsResult.data ?? []).reduce((sum, reward) => sum + reward.points_delta, 0),
        nextDueOn: openCharges.slice().sort((a, b) => a.due_on.localeCompare(b.due_on))[0]?.due_on ?? null,
      },
      contracts: (contracts ?? []).map((contract) => ({ id: contract.id, planId: contract.plan_id ?? "", contractNumber: contract.contract_number, planName: contract.plan_name_snapshot, billingInterval: contract.billing_interval_snapshot, durationMonths: contract.duration_months_snapshot, baseAmountCents: contract.base_amount_cents, amountCents: contract.amount_cents, benefitName: contract.benefit_name_snapshot ?? "", renewsAutomatically: contract.renews_automatically, startsOn: contract.starts_on, endsOn: contract.ends_on, status: contract.status, statusNote: contract.status_note ?? "", cancelEffectiveOn: contract.cancel_effective_on, createdAt: contract.created_at, sale: (() => { const sale = salesByContract.get(contract.id); return sale ? { id: sale.id, signatureRequired: sale.signature_required, signatureStatus: sale.signature_status, signatureUrl: sale.signature_url ?? "", signedDocumentUrl: sale.signed_document_url ?? "", signatureError: sale.signature_error ?? "", sentAt: sale.sent_for_signature_at, signedAt: sale.signed_at } : null; })(), groups: (groupsByContract.get(contract.id) ?? []).map((group) => ({ modalityName: modalitiesById.get(group.modalityId) ?? "MODALIDADE", schedules: schedulesByGroup.get(group.classGroupId) ?? [] })), events: (eventsResult.data ?? []).filter((event) => event.contract_id === contract.id).map((event) => ({ id: event.id, type: event.event_type, previousStatus: event.previous_status ?? "", nextStatus: event.next_status ?? "", note: event.note ?? "", createdAt: event.created_at })) })),
      sales: (salesResult.data ?? []).flatMap((sale) => {
        const contract = contractsById.get(sale.contract_id);
        if (!contract) return [];
        return [{ id: sale.id, saleNumber: sale.sale_number, contractId: sale.contract_id, contractNumber: contract.contract_number, planName: contract.plan_name_snapshot, soldAt: sale.sold_on ?? sale.created_at.slice(0, 10), status: sale.status, signatureRequired: sale.signature_required, signatureStatus: sale.signature_status, signatureProvider: sale.signature_provider ?? "", signatureUrl: sale.signature_url ?? "", signedDocumentUrl: sale.signed_document_url ?? "", signatureError: sale.signature_error ?? "", signedAt: sale.signed_at, cancelledAt: sale.cancelled_at, cancellationReason: sale.cancellation_reason ?? "", baseAmountCents: contract.base_amount_cents, amountCents: contract.amount_cents, discountCents: Math.max(0, contract.base_amount_cents - contract.amount_cents) }];
      }),
      charges: charges.map((charge) => ({ id: charge.id, contractId: charge.contract_id, competenceOn: charge.competence_on, dueOn: charge.due_on, baseAmountCents: charge.base_amount_cents, amountCents: charge.amount_cents, status: charge.status, paidAmountCents: charge.paid_amount_cents, paidAt: charge.paid_at, benefitName: charge.benefit_name_snapshot ?? "", providerPaymentId: charge.provider_payment_id ?? "", providerStatus: charge.provider_status ?? "", pixCopyPaste: charge.pix_copy_paste ?? "", pixQrCodeUrl: charge.pix_qr_code_url ?? "", providerError: charge.provider_error ?? "" })),
      activities: (activitiesResult.data ?? []).map((activity) => ({ id: activity.id, type: activity.activity_type, subject: activity.subject, content: activity.content ?? "", occurredAt: activity.occurred_at })),
      rewards: rewardsResult.data ?? [],
      enrollments: enrollmentsResult.data ?? [],
    });
  } catch (error) { return handleError(error); }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as Body;
    const access = await requireCompanyAccess(request, companySlug);
    const { data: student, error } = await access.admin.from("xpace_people").select("id").eq("id", id).eq("tenant_company_id", access.company.id).eq("is_student", true).maybeSingle();
    if (error) throw error;
    if (!student) throw new RequestError("ALUNO NÃO ENCONTRADO NA COMUNIDADE.", 404);
    if (body.action === "UPDATE_PERSON") return updatePerson(access, id, body.person);
    if (body.action === "ADD_ACTIVITY") return addActivity(access, id, body.activity);
    if (body.action === "SET_BENEFIT") return setBenefit(access, id, body.benefit);
    if (body.action === "END_BENEFIT") return endBenefit(access, id);
    throw new RequestError("ATUALIZAÇÃO DE ALUNO INVÁLIDA.", 400);
  } catch (error) { return handleError(error); }
}

async function updatePerson(access: Awaited<ReturnType<typeof requireCompanyAccess>>, id: string, input?: PersonInput) {
  const { data: current, error: currentError } = await access.admin.from("xpace_people").select("cpf").eq("id", id).eq("tenant_company_id", access.company.id).maybeSingle();
  if (currentError) throw currentError;
  if (!current) throw new RequestError("ALUNO NÃO ENCONTRADO NA COMUNIDADE.", 404);
  const person = normalizePerson({ ...input, cpf: input?.cpf || current.cpf || "" });
  validatePerson(person);
  const { error } = await access.admin.from("xpace_people").update({ ...toDatabase(person), updated_by: access.user.id, updated_at: new Date().toISOString() }).eq("id", id).eq("tenant_company_id", access.company.id);
  if (error) throw error;
  return NextResponse.json({ success: true });
}

async function addActivity(access: Awaited<ReturnType<typeof requireCompanyAccess>>, id: string, input?: Body["activity"]) {
  const type = input?.type?.trim().toUpperCase();
  const subject = input?.subject?.trim().replace(/\s+/g, " ");
  const content = input?.content?.trim();
  const occurredAt = input?.occurredAt?.trim() || new Date().toISOString();
  if (!['ATIVIDADE', 'NOTA', 'WHATSAPP', 'EMAIL', 'SISTEMA'].includes(type ?? "") || !subject) throw new RequestError("INFORME O TIPO E O ASSUNTO DO REGISTRO.", 400);
  if (Number.isNaN(Date.parse(occurredAt))) throw new RequestError("DATA DA ATIVIDADE INVÁLIDA.", 400);
  const { error } = await access.admin.from("xpace_person_activities").insert({ tenant_company_id: access.company.id, person_id: id, activity_type: type, subject, content: content || null, occurred_at: occurredAt, created_by: access.user.id });
  if (error) throw error;
  return NextResponse.json({ success: true });
}

async function setBenefit(access: Awaited<ReturnType<typeof requireCompanyAccess>>, id: string, input?: Body["benefit"]) {
  const benefitProfileId = input?.benefitProfileId?.trim();
  const startsOn = input?.startsOn?.trim() || todayIso();
  if (!benefitProfileId || !isDate(startsOn)) throw new RequestError("SELECIONE O BENEFÍCIO E A DATA DE INÍCIO.", 400);
  const { data: profile, error: profileError } = await access.admin.from("xpace_benefit_profiles").select("id,active").eq("id", benefitProfileId).eq("tenant_company_id", access.company.id).maybeSingle();
  if (profileError) throw profileError;
  if (!profile?.active) throw new RequestError("ESCOLHA UM BENEFÍCIO ATIVO.", 400);
  const now = new Date().toISOString();
  const { error: closeError } = await access.admin.from("xpace_person_benefits").update({ status: "ENCERRADO", ends_on: startsOn, ended_at: now, ended_by: access.user.id }).eq("tenant_company_id", access.company.id).eq("person_id", id).eq("status", "ATIVO");
  if (closeError) throw closeError;
  const { error } = await access.admin.from("xpace_person_benefits").insert({ tenant_company_id: access.company.id, person_id: id, benefit_profile_id: benefitProfileId, starts_on: startsOn, note: input?.note?.trim() || null, created_by: access.user.id });
  if (error) throw error;
  return NextResponse.json({ success: true });
}

async function endBenefit(access: Awaited<ReturnType<typeof requireCompanyAccess>>, id: string) {
  const { error } = await access.admin.from("xpace_person_benefits").update({ status: "ENCERRADO", ends_on: todayIso(), ended_at: new Date().toISOString(), ended_by: access.user.id }).eq("tenant_company_id", access.company.id).eq("person_id", id).eq("status", "ATIVO");
  if (error) throw error;
  return NextResponse.json({ success: true });
}

function normalizePerson(value?: PersonInput) { const person = value ?? {}; return { cpf: digits(person.cpf ?? ""), fullName: (person.fullName ?? "").trim().replace(/\s+/g, " "), mobile: digits(person.mobile ?? ""), birthDate: (person.birthDate ?? "").trim(), email: (person.email ?? "").trim().toLowerCase(), gender: normalizeGender(person.gender), whatsappOptIn: Boolean(person.whatsappOptIn), postalCode: digits(person.postalCode ?? ""), street: (person.street ?? "").trim(), streetNumber: (person.streetNumber ?? "").trim(), complement: (person.complement ?? "").trim(), district: (person.district ?? "").trim(), city: (person.city ?? "").trim(), state: (person.state ?? "").trim().toUpperCase() }; }
function validatePerson(person: ReturnType<typeof normalizePerson>) { if (!person.fullName || !person.cpf || !person.birthDate) throw new RequestError("PREENCHA CPF, NOME E DATA DE NASCIMENTO DO ALUNO.", 400); if (!isCpf(person.cpf)) throw new RequestError("CPF DO ALUNO INVÁLIDO.", 400); if (!isDate(person.birthDate)) throw new RequestError("DATA DE NASCIMENTO INVÁLIDA.", 400); if (person.email && !/^\S+@\S+\.\S+$/.test(person.email)) throw new RequestError("E-MAIL INVÁLIDO.", 400); }
function toDatabase(person: ReturnType<typeof normalizePerson>) { return { cpf: person.cpf, full_name: person.fullName, mobile: person.mobile || null, birth_date: person.birthDate, email: person.email || null, gender: person.gender, whatsapp_opt_in: person.whatsappOptIn, whatsapp_opt_in_at: person.whatsappOptIn ? new Date().toISOString() : null, postal_code: person.postalCode || null, street: person.street || null, street_number: person.streetNumber || null, complement: person.complement || null, district: person.district || null, city: person.city || null, state: person.state || null }; }
function normalizeGender(value?: string) { return ['FEMININO', 'MASCULINO', 'NAO_BINARIO', 'PREFIRO_NAO_INFORMAR'].includes(value ?? "") ? value : 'NAO_INFORMADO'; }
function isDate(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00`)); }
function isCpf(cpf: string) { if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false; const digit = (length: number) => { const total = cpf.slice(0, length).split("").reduce((sum, value, index) => sum + Number(value) * (length + 1 - index), 0); const result = (total * 10) % 11; return result === 10 ? 0 : result; }; return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]); }
function maskCpf(cpf: string | null) { const value = digits(cpf ?? ""); return value ? `***.***.***-${value.slice(-2)}` : "NÃO INFORMADO"; }
function digits(value: string) { return value.replace(/\D/g, ""); }
function age(date: string) { const birth = new Date(`${date}T12:00:00`); const today = new Date(); let value = today.getFullYear() - birth.getFullYear(); if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) value -= 1; return value; }
class RequestError extends Error { constructor(message: string, public status: number) { super(message); } }
function handleError(error: unknown) { if (error instanceof AccessError || error instanceof RequestError) return NextResponse.json({ success: false, message: error.message }, { status: error.status }); const code = (error as { code?: string })?.code; if (code === '23505') return NextResponse.json({ success: false, message: "ESTE ALUNO JÁ POSSUI UM BENEFÍCIO ATIVO. ENCERRAMOS O ANTERIOR ANTES DE APLICAR O NOVO." }, { status: 409 }); console.error("XPACE STUDENT PROFILE ERROR", error); return NextResponse.json({ success: false, message: "NÃO FOI POSSÍVEL ATUALIZAR O PERFIL DO ALUNO." }, { status: 500 }); }

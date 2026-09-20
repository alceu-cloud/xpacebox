import { NextResponse } from "next/server";
import { processPaymentCancellations } from "@/lib/server/xpace-payment-cancellations";

import { calculateDiscountedAmount, ensureContractCharges, todayIso } from "@/lib/xpace/billing";
import { ensureContractEnrollment } from "@/lib/xpace/enrollment";
import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";
import { issuePixChargesForContract } from "@/lib/server/xpace-charge-issuance";

const companySlug = "xpace";
const intervals = ["DIARIO", "MENSAL", "SEMESTRAL", "ANUAL"] as const;
const supportedCycles: Record<(typeof intervals)[number], number> = { DIARIO: 1, MENSAL: 1, SEMESTRAL: 6, ANUAL: 12 };
const statuses = ["AGUARDANDO_ASSINATURA", "AGENDADO", "ATIVO", "PAUSADO", "CANCELADO", "ENCERRADO"] as const;

type BillingInterval = (typeof intervals)[number];
type ContractStatus = (typeof statuses)[number];
type AccessPeriod = "SEM_LIMITE" | "DIA" | "SEMANA" | "MES";
type EnrollmentChargeMode = "PRIMEIRA_PARCELA" | "RATEAR_PARCELAS";
type PlanModalityInput = { modalityId?: string; sessionsPerWeek?: number; accessPeriod?: string; accessLimit?: number | null; allowEarlyAccess?: boolean; allowReschedule?: boolean; requiresEnrollment?: boolean; limitPromotionalTimes?: boolean };
type RequestBody = {
  action?: "CREATE_PLAN" | "CREATE_CONTRACT" | "GENERATE_PIX" | "UPDATE_PLAN" | "SET_PLAN_ACTIVE" | "SET_CONTRACT_STATUS" | "DELETE_PLAN";
  plan?: { id?: string; name?: string; description?: string; billingInterval?: string; durationMonths?: number; amountCents?: number; active?: boolean; renewsAutomatically?: boolean; modalities?: string[]; modalityRules?: PlanModalityInput[]; catalogSettings?: Record<string, unknown> };
  contract?: { id?: string; studentId?: string; planId?: string; classGroupId?: string; classGroupIds?: string[]; saleOn?: string; startsOn?: string; firstDueOn?: string; amountCents?: number; discountType?: string; discountValue?: number; enrollmentFeeEnabled?: boolean; paymentMethod?: string; renewsAutomatically?: boolean; status?: string; statusNote?: string; effectiveOn?: string };
};

export async function GET(request: Request) {
  try {
    const { admin, company } = await requireCompanyAccess(request, companySlug);
    const [plansResult, studentsResult, contractsResult, modalitiesResult, servicesResult, classGroupsResult, schedulesResult] = await Promise.all([
      admin.from("xpace_membership_plans").select("id,name,description,billing_interval,duration_months,amount_cents,renews_automatically,modalities,modality_rules,catalog_settings,contract_template_path,contract_template_name,active,created_at").eq("tenant_company_id", company.id).order("active", { ascending: false }).order("name"),
      admin.from("xpace_people").select("id,person_number,full_name,mobile").eq("tenant_company_id", company.id).eq("is_student", true).eq("active", true).order("full_name").limit(500),
      admin.from("xpace_student_contracts").select("id,contract_number,student_id,plan_id,plan_name_snapshot,billing_interval_snapshot,duration_months_snapshot,base_amount_cents,amount_cents,benefit_name_snapshot,discount_type_snapshot,discount_value_snapshot,renews_automatically,starts_on,ends_on,status,status_note,created_at,cancel_effective_on").eq("tenant_company_id", company.id).order("created_at", { ascending: false }).limit(300),
      admin.from("xpace_modalities").select("id,name,active").eq("tenant_company_id", company.id).eq("active", true).order("name"),
      admin.from("xpace_services").select("id,description,sale_price_cents,active").eq("tenant_company_id", company.id).eq("active", true).order("description"),
      admin.from("xpace_class_groups").select("id,name,modality_id,active").eq("tenant_company_id", company.id).eq("active", true).order("name"),
      admin.from("xpace_class_schedules").select("class_group_id,weekday,starts_at,ends_at").eq("tenant_company_id", company.id).eq("active", true).order("weekday").order("starts_at"),
    ]);
    if (plansResult.error) throw plansResult.error;
    if (studentsResult.error) throw studentsResult.error;
    if (contractsResult.error) throw contractsResult.error;
    if (modalitiesResult.error) throw modalitiesResult.error;
    if (servicesResult.error) throw servicesResult.error;
    if (classGroupsResult.error) throw classGroupsResult.error;
    if (schedulesResult.error) throw schedulesResult.error;
    const studentsById = new Map((studentsResult.data ?? []).map((student) => [student.id, student]));
    return NextResponse.json({
      success: true,
      plans: (plansResult.data ?? []).map((plan) => ({ id: plan.id, name: plan.name, description: plan.description ?? "", billingInterval: plan.billing_interval, durationMonths: plan.duration_months, amountCents: plan.amount_cents, renewsAutomatically: plan.renews_automatically, modalities: plan.modalities ?? [], modalityRules: plan.modality_rules ?? [], catalogSettings: plan.catalog_settings ?? {}, templateFileName: plan.contract_template_name ?? templateNameFromPath(plan.contract_template_path), active: plan.active, createdAt: plan.created_at })),
      modalities: (modalitiesResult.data ?? []).map((modality) => ({ id: modality.id, name: modality.name, active: modality.active })),
      services: (servicesResult.data ?? []).map((service) => ({ id: service.id, description: service.description, salePriceCents: service.sale_price_cents })),
      classGroups: (classGroupsResult.data ?? []).map((group) => ({ id: group.id, name: group.name, modalityId: group.modality_id ?? "", schedules: (schedulesResult.data ?? []).filter((schedule) => schedule.class_group_id === group.id).map((schedule) => ({ weekday: schedule.weekday, startsAt: schedule.starts_at.slice(0, 5), endsAt: schedule.ends_at.slice(0, 5) })) })).filter((group) => group.schedules.length),
      students: (studentsResult.data ?? []).map((student) => ({ id: student.id, personNumber: student.person_number, name: student.full_name, mobile: student.mobile ?? "" })),
      contracts: (contractsResult.data ?? []).map((contract) => {
        const student = studentsById.get(contract.student_id);
        return { id: contract.id, contractNumber: contract.contract_number, studentId: contract.student_id, studentName: student?.full_name ?? "ALUNO INATIVO", studentMobile: student?.mobile ?? "", planId: contract.plan_id, planName: contract.plan_name_snapshot, billingInterval: contract.billing_interval_snapshot, durationMonths: contract.duration_months_snapshot, baseAmountCents: contract.base_amount_cents, amountCents: contract.amount_cents, benefitName: contract.benefit_name_snapshot ?? "", renewsAutomatically: contract.renews_automatically, startsOn: contract.starts_on, endsOn: contract.ends_on, status: contract.status, statusNote: contract.status_note ?? "", cancelEffectiveOn: contract.cancel_effective_on, createdAt: contract.created_at };
      }),
    });
  } catch (error) { return handleError(error); }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const access = await requireCompanyAccess(request, companySlug);
    if (body.action === "CREATE_PLAN") return createPlan(access, body.plan);
    if (body.action === "CREATE_CONTRACT") return createContract(access, body.contract);
    if (body.action === "GENERATE_PIX") return generatePix(access, body.contract?.id);
    throw new RequestError("ACAO DE CONTRATO INVALIDA.", 400);
  } catch (error) { return handleError(error); }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const access = await requireCompanyAccess(request, companySlug);
    if (body.action === "SET_PLAN_ACTIVE") return setPlanActive(access, body.plan);
    if (body.action === "UPDATE_PLAN") return updatePlan(access, body.plan);
    if (body.action === "SET_CONTRACT_STATUS") return setContractStatus(access, body.contract);
    throw new RequestError("ATUALIZACAO DE CONTRATO INVALIDA.", 400);
  } catch (error) { return handleError(error); }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const access = await requireCompanyAccess(request, companySlug);
    requireManager(access.profile.platform_role);
    const planId = body.action === "DELETE_PLAN" ? body.plan?.id?.trim() : "";
    if (!planId) throw new RequestError("CONTRATO INVÁLIDO.", 400);
    const { data: plan, error: planError } = await access.admin.from("xpace_membership_plans").select("id,name").eq("id", planId).eq("tenant_company_id", access.company.id).maybeSingle();
    if (planError) throw planError;
    if (!plan) throw new RequestError("CONTRATO NÃO ENCONTRADO NESTA EMPRESA.", 404);
    const { data: studentContract, error: contractError } = await access.admin.from("xpace_student_contracts").select("id").eq("tenant_company_id", access.company.id).eq("plan_id", plan.id).limit(1).maybeSingle();
    if (contractError) throw contractError;
    if (studentContract) throw new RequestError("NÃO É POSSÍVEL EXCLUIR: ESTE CONTRATO JÁ FOI VINCULADO A UM ALUNO. ARQUIVE-O PARA PRESERVAR O HISTÓRICO.", 409);
    const { error } = await access.admin.from("xpace_membership_plans").delete().eq("id", plan.id).eq("tenant_company_id", access.company.id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) { return handleError(error); }
}

async function createPlan(access: Awaited<ReturnType<typeof requireCompanyAccess>>, input?: RequestBody["plan"]) {
  requireManager(access.profile.platform_role);
  const plan = normalizePlan(input);
  if (!plan.name || !isSupportedCycle(plan) || !isCurrency(plan.amountCents)) throw new RequestError("PREENCHA NOME, CICLO, DURAÇÃO E VALOR DO PLANO.", 400);
  validateCatalogSettings(plan.catalogSettings);
  const modalityRules = await resolveModalityRules(access, plan.modalityRules);
  await resolveEnrollmentService(access, plan.catalogSettings);
  const catalogSettings = { ...plan.catalogSettings, enrollmentChargeMode: plan.catalogSettings.enrollmentFeeEnabled && ["DIARIO", "MENSAL"].includes(plan.billingInterval) ? "PRIMEIRA_PARCELA" : plan.catalogSettings.enrollmentChargeMode };
  const { data, error } = await access.admin.from("xpace_membership_plans").insert({ tenant_company_id: access.company.id, name: plan.name, description: plan.description || null, billing_interval: plan.billingInterval, duration_months: plan.durationMonths, amount_cents: plan.amountCents, renews_automatically: plan.renewsAutomatically, modalities: modalityRules.map((rule) => rule.modalityName), modality_rules: modalityRules.map(({ modalityName: _modalityName, ...rule }) => rule), catalog_settings: catalogSettings, created_by: access.user.id, updated_by: access.user.id }).select("id,name").single();
  if (error) throw error;
  return NextResponse.json({ success: true, plan: { id: data.id, name: data.name } }, { status: 201 });
}

async function createContract(access: Awaited<ReturnType<typeof requireCompanyAccess>>, input?: RequestBody["contract"]) {
  const contract = normalizeContract(input);
  if (!contract.studentId || !contract.planId || !contract.classGroupIds.length || !isDate(contract.saleOn) || !isDate(contract.firstDueOn)) throw new RequestError("SELECIONE O ALUNO, O PLANO, AS GRADES E AS DATAS DA VENDA.", 400);
  if (contract.paymentMethod === "CARTAO") throw new RequestError("O CARTÃO AINDA NÃO ESTÁ LIBERADO: FALTA A TOKENIZAÇÃO SEGURA COM O ASAAS. USE PIX NO SANDBOX POR ENQUANTO.", 409);
  const [{ data: student, error: studentError }, { data: plan, error: planError }, { data: activeBenefit, error: benefitError }] = await Promise.all([
    access.admin.from("xpace_people").select("id,birth_date").eq("id", contract.studentId).eq("tenant_company_id", access.company.id).eq("is_student", true).eq("active", true).maybeSingle(),
    access.admin.from("xpace_membership_plans").select("id,name,billing_interval,duration_months,amount_cents,renews_automatically,modality_rules,catalog_settings,active").eq("id", contract.planId).eq("tenant_company_id", access.company.id).maybeSingle(),
    access.admin.from("xpace_person_benefits").select("benefit_profile_id").eq("tenant_company_id", access.company.id).eq("person_id", contract.studentId).eq("status", "ATIVO").maybeSingle(),
  ]);
  if (studentError) throw studentError;
  if (planError) throw planError;
  if (benefitError) throw benefitError;
  if (!student) throw new RequestError("ALUNO NAO ENCONTRADO NA COMUNIDADE.", 404);
  if (!plan?.active) throw new RequestError("ESCOLHA UM PLANO ATIVO.", 400);
  validateSaleRestrictions(plan.catalog_settings, student.birth_date);
  const { data: classGroups, error: classGroupError } = await access.admin.from("xpace_class_groups").select("id,name,modality_id").eq("tenant_company_id", access.company.id).eq("active", true).in("id", contract.classGroupIds);
  if (classGroupError) throw classGroupError;
  if ((classGroups ?? []).length !== contract.classGroupIds.length) throw new RequestError("SELECIONE APENAS GRADES ATIVAS DA XPACE.", 409);
  const rules = (Array.isArray(plan.modality_rules) ? plan.modality_rules : []) as Array<{ modalityId?: string; sessionsPerWeek?: number }>;
  const ruleByModality = new Map(rules.filter((rule) => rule?.modalityId).map((rule) => [String(rule.modalityId), Number(rule.sessionsPerWeek)]));
  const selectedPerModality = new Map<string, number>();
  for (const group of classGroups ?? []) {
    if (!group.modality_id || !ruleByModality.has(group.modality_id)) throw new RequestError("A GRADE ESCOLHIDA NÃO PERTENCE A UMA MODALIDADE DESTE CONTRATO.", 409);
    selectedPerModality.set(group.modality_id, (selectedPerModality.get(group.modality_id) ?? 0) + 1);
  }
  for (const [modalityId, sessionsPerWeek] of ruleByModality) {
    const selected = selectedPerModality.get(modalityId) ?? 0;
    if (!selected) throw new RequestError("SELECIONE AO MENOS UMA GRADE PARA CADA MODALIDADE DO CONTRATO.", 409);
    if (selected > sessionsPerWeek) throw new RequestError(`ESTE CONTRATO PERMITE APENAS ${sessionsPerWeek} HORÁRIO(S) POR SEMANA NESTA MODALIDADE.`, 409);
  }
  const { data: classSchedules, error: classSchedulesError } = await access.admin.from("xpace_class_schedules").select("class_group_id,weekday,starts_at,ends_at").eq("tenant_company_id", access.company.id).in("class_group_id", contract.classGroupIds).eq("active", true).order("weekday").order("starts_at");
  if (classSchedulesError) throw classSchedulesError;
  if ((classGroups ?? []).some((group) => !(classSchedules ?? []).some((schedule) => schedule.class_group_id === group.id))) throw new RequestError("UMA DAS GRADES ESCOLHIDAS NÃO POSSUI HORÁRIOS ATIVOS.", 409);
  if (plan.billing_interval !== "DIARIO" && plan.catalog_settings && typeof plan.catalog_settings === "object" && (plan.catalog_settings as { durationUnit?: unknown }).durationUnit && (plan.catalog_settings as { durationUnit?: unknown }).durationUnit !== "MÊS") throw new RequestError("A VENDA DE CONTRATOS COM DURAÇÃO EM DIA OU SEMANA SERÁ LIBERADA QUANDO AS REGRAS FINANCEIRAS FOREM DEFINIDAS.", 400);
  const { data: benefitProfile, error: benefitProfileError } = activeBenefit ? await access.admin.from("xpace_benefit_profiles").select("id,name,discount_type,discount_value").eq("id", activeBenefit.benefit_profile_id).eq("tenant_company_id", access.company.id).eq("active", true).maybeSingle() : { data: null, error: null };
  if (benefitProfileError) throw benefitProfileError;
  const manualDiscount = contract.discountType === "PERCENTUAL" || contract.discountType === "FIXO"
    ? { discountType: contract.discountType, discountValue: Math.max(0, Math.floor(contract.discountValue ?? 0)) } as const
    : null;
  const benefitDiscount = benefitProfile ? { discountType: benefitProfile.discount_type as "PERCENTUAL" | "FIXO", discountValue: benefitProfile.discount_value } : null;
  const appliedDiscount = manualDiscount ?? benefitDiscount;
  const amountCents = calculateDiscountedAmount(plan.amount_cents, appliedDiscount);
  if (!isCurrency(amountCents)) throw new RequestError("VALOR DO CONTRATO INVALIDO.", 400);
  const startsOn = contract.saleOn;
  const firstDueOn = contract.firstDueOn;
  const endsOn = endOfTerm(startsOn, plan.billing_interval, plan.duration_months);
  const signatureRequired = Boolean((plan.catalog_settings as { sendForSignature?: unknown } | null)?.sendForSignature);
  const status: ContractStatus = startsOn > today() ? "AGENDADO" : "ATIVO";
  const renewsAutomatically = contract.renewsAutomatically ?? plan.renews_automatically;
  const enrollmentService = contract.enrollmentFeeEnabled === false ? null : await resolveEnrollmentService(access, plan.catalog_settings);
  const enrollmentServiceSnapshot = enrollmentService ? { serviceId: enrollmentService.id, description: enrollmentService.description, salePriceCents: enrollmentService.salePriceCents, chargeMode: ["DIARIO", "MENSAL"].includes(plan.billing_interval) ? "PRIMEIRA_PARCELA" : enrollmentService.chargeMode } : {};
  const { data: existing, error: conflictError } = await access.admin.from("xpace_student_contracts").select("id,starts_on,ends_on,renews_automatically").eq("tenant_company_id", access.company.id).eq("student_id", student.id).eq("plan_id", plan.id).in("status", ["AGUARDANDO_ASSINATURA", "AGENDADO", "ATIVO", "PAUSADO"]);
  if (conflictError) throw conflictError;
  if ((existing ?? []).some((item) => item.renews_automatically || (item.starts_on <= endsOn && item.ends_on >= startsOn))) throw new RequestError("ESTE ALUNO JÁ POSSUI UM CONTRATO EM VIGOR PARA ESTE PLANO.", 409);
  const snapshot = benefitProfile && !manualDiscount
    ? { benefit_profile_id: benefitProfile.id, benefit_name_snapshot: benefitProfile.name, discount_type_snapshot: benefitProfile.discount_type, discount_value_snapshot: benefitProfile.discount_value }
    : manualDiscount
      ? { benefit_profile_id: null, benefit_name_snapshot: "CONDIÇÃO COMERCIAL", discount_type_snapshot: manualDiscount.discountType, discount_value_snapshot: manualDiscount.discountValue }
      : { benefit_profile_id: null, benefit_name_snapshot: null, discount_type_snapshot: null, discount_value_snapshot: null };
  const primaryGroup = (classGroups ?? [])[0];
  if (!primaryGroup) throw new RequestError("SELECIONE UMA GRADE ATIVA.", 409);
  const { data: saved, error: savedError } = await access.admin.from("xpace_student_contracts").insert({ tenant_company_id: access.company.id, student_id: student.id, plan_id: plan.id, class_group_id: primaryGroup.id, class_group_name_snapshot: primaryGroup.name, class_schedule_snapshot: classSchedules ?? [], plan_name_snapshot: plan.name, billing_interval_snapshot: plan.billing_interval, duration_months_snapshot: plan.duration_months, base_amount_cents: plan.amount_cents, amount_cents: amountCents, modality_rules_snapshot: plan.modality_rules ?? [], enrollment_service_snapshot: enrollmentServiceSnapshot, enrollment_fee_enabled: Boolean(enrollmentService), payment_method: contract.paymentMethod || null, renews_automatically: renewsAutomatically, starts_on: startsOn, first_due_on: firstDueOn, ends_on: endsOn, status, created_by: access.user.id, updated_by: access.user.id, ...snapshot }).select("id,contract_number,student_id,class_group_id,starts_on,first_due_on,ends_on,billing_interval_snapshot,duration_months_snapshot,base_amount_cents,amount_cents,benefit_name_snapshot,discount_type_snapshot,discount_value_snapshot,enrollment_service_snapshot,renews_automatically,status,cancel_effective_on").single();
  if (savedError) throw savedError;
  const discountCents = Math.max(0, plan.amount_cents - amountCents);
  const { data: sale, error: saleError } = await access.admin.from("xpace_contract_sales").insert({ tenant_company_id: access.company.id, student_id: student.id, contract_id: saved.id, sold_on: contract.saleOn, starts_on: startsOn, first_due_on: firstDueOn, payment_method: contract.paymentMethod || null, enrollment_fee_enabled: Boolean(enrollmentService), discount_type: manualDiscount?.discountType ?? null, discount_value: manualDiscount?.discountValue ?? 0, discount_cents: discountCents, status: "EM_PREPARACAO", signature_required: signatureRequired, signature_status: signatureRequired ? "PENDENTE" : "NAO_SOLICITADA", signature_due_on: null, signed_at: null, created_by: access.user.id, updated_by: access.user.id }).select("id").single();
  if (saleError) {
    await access.admin.from("xpace_student_contracts").delete().eq("id", saved.id).eq("tenant_company_id", access.company.id);
    throw saleError;
  }
  const { error: groupsError } = await access.admin.from("xpace_contract_class_groups").insert((classGroups ?? []).map((group) => ({ tenant_company_id: access.company.id, contract_id: saved.id, class_group_id: group.id, modality_id: group.modality_id })));
  if (groupsError) throw groupsError;
  const { error: eventError } = await access.admin.from("xpace_contract_events").insert({ tenant_company_id: access.company.id, contract_id: saved.id, event_type: "CRIADO", next_status: status, created_by: access.user.id });
  if (eventError) throw eventError;
  await ensureContractCharges(access.admin, access.company.id, saved);
  if (status === "ATIVO") await Promise.all((classGroups ?? []).map((group) => ensureContractEnrollment(access.admin, { tenant_company_id: access.company.id, student_id: saved.student_id, class_group_id: group.id, starts_on: saved.starts_on })));
  if (contract.paymentMethod === "PIX") await issuePixChargesForContract(access.admin, access.company.id, saved.id);
  return NextResponse.json({ success: true, pendingSignature: signatureRequired, saleId: sale?.id, contract: { id: saved.id, contractNumber: saved.contract_number } }, { status: 201 });
}

async function setPlanActive(access: Awaited<ReturnType<typeof requireCompanyAccess>>, input?: RequestBody["plan"]) {
  requireManager(access.profile.platform_role);
  if (!input?.id || typeof input.active !== "boolean") throw new RequestError("PLANO INVALIDO.", 400);
  const { error } = await access.admin.from("xpace_membership_plans").update({ active: input.active, updated_by: access.user.id, updated_at: new Date().toISOString() }).eq("id", input.id).eq("tenant_company_id", access.company.id);
  if (error) throw error;
  return NextResponse.json({ success: true });
}

async function setContractStatus(access: Awaited<ReturnType<typeof requireCompanyAccess>>, input?: RequestBody["contract"]) {
  const contract = normalizeContract(input);
  if (!contract.id || !statuses.includes(contract.status)) throw new RequestError("STATUS DE CONTRATO INVALIDO.", 400);
  if (contract.status === "CANCELADO" && !contract.statusNote) throw new RequestError("INFORME O MOTIVO DO CANCELAMENTO.", 400);
  const { data: current, error: currentError } = await access.admin.from("xpace_student_contracts").select("id,status").eq("id", contract.id).eq("tenant_company_id", access.company.id).maybeSingle();
  if (currentError) throw currentError;
  if (!current) throw new RequestError("CONTRATO NAO ENCONTRADO.", 404);
  const requestedEffectiveOn = input?.effectiveOn && isDate(input.effectiveOn) ? input.effectiveOn : todayIso();
  const scheduledEnding = ["CANCELADO", "ENCERRADO"].includes(contract.status) && requestedEffectiveOn > todayIso();
  const effectiveOn = contract.status === "CANCELADO" || contract.status === "ENCERRADO" || contract.status === "PAUSADO" ? requestedEffectiveOn : null;
  const nextStatus = scheduledEnding ? current.status : contract.status;
  const nextNote = scheduledEnding ? `ENCERRAMENTO AGENDADO PARA ${requestedEffectiveOn}.` : contract.statusNote || null;
  const { error } = await access.admin.from("xpace_student_contracts").update({ status: nextStatus, status_note: nextNote, cancelled_at: contract.status === "CANCELADO" && !scheduledEnding ? new Date().toISOString() : null, cancel_effective_on: ["CANCELADO", "ENCERRADO"].includes(contract.status) ? effectiveOn : null, updated_by: access.user.id, updated_at: new Date().toISOString() }).eq("id", current.id).eq("tenant_company_id", access.company.id);
  if (error) throw error;
  // Database triggers persist the contract, sale, charges and cancellation
  // intent in the same transaction. Provider processing is independently retryable.
  if (current.status !== nextStatus || scheduledEnding) {
    const { error: eventError } = await access.admin.from("xpace_contract_events").insert({ tenant_company_id: access.company.id, contract_id: current.id, event_type: "STATUS_ALTERADO", previous_status: current.status, next_status: contract.status, note: nextNote, created_by: access.user.id });
    if (eventError) throw eventError;
  }
  const cancellations = await processPaymentCancellations(access.admin, access.company.id, current.id);
  return NextResponse.json({ success: true, cancellations });
}

function normalizePlan(value?: RequestBody["plan"]) {
  const settings = value?.catalogSettings ?? {};
  return {
    name: value?.name?.trim().replace(/\s+/g, " ") ?? "",
    description: value?.description?.trim() ?? "",
    billingInterval: value?.billingInterval as BillingInterval,
    durationMonths: Number(value?.durationMonths),
    amountCents: Number(value?.amountCents),
    renewsAutomatically: Boolean(value?.renewsAutomatically),
    modalityRules: normalizeModalityRules(value?.modalityRules),
    catalogSettings: {
      allowManualRenewal: Boolean(settings.allowManualRenewal),
      allowInstallments: Boolean(settings.allowInstallments),
      allowAppSale: Boolean(settings.allowAppSale),
      sendForSignature: Boolean(settings.sendForSignature),
      limitSalePeriod: Boolean(settings.limitSalePeriod),
      saleStartsOn: isDate(typeof settings.saleStartsOn === "string" ? settings.saleStartsOn : "") ? settings.saleStartsOn : "",
      saleEndsOn: isDate(typeof settings.saleEndsOn === "string" ? settings.saleEndsOn : "") ? settings.saleEndsOn : "",
      maxSuspensions: boundedInteger(settings.maxSuspensions, 0, 99),
      maxSuspensionDays: boundedInteger(settings.maxSuspensionDays, 0, 365),
      allowPreSale: Boolean(settings.allowPreSale),
      limitAgeRange: Boolean(settings.limitAgeRange),
      minAge: boundedInteger(settings.minAge, 0, 120),
      maxAge: boundedInteger(settings.maxAge, 0, 120),
      enrollmentFeeEnabled: Boolean(settings.enrollmentFeeEnabled),
      enrollmentServiceId: typeof settings.enrollmentServiceId === "string" ? settings.enrollmentServiceId.trim() : "",
      enrollmentChargeMode: settings.enrollmentChargeMode === "RATEAR_PARCELAS" ? "RATEAR_PARCELAS" as EnrollmentChargeMode : "PRIMEIRA_PARCELA" as EnrollmentChargeMode,
      salesCommissionEnabled: Boolean(settings.salesCommissionEnabled),
      revenueCategory: typeof settings.revenueCategory === "string" && settings.revenueCategory.trim() ? settings.revenueCategory.trim().slice(0, 80) : "VENDAS",
      durationUnit: settings.durationUnit === "DIA" || settings.durationUnit === "SEMANA" || settings.durationUnit === "MÊS" ? settings.durationUnit : "MÊS",
    },
  };
}
function isSupportedCycle(plan: ReturnType<typeof normalizePlan>) {
  return intervals.includes(plan.billingInterval) && supportedCycles[plan.billingInterval] === plan.durationMonths;
}
function normalizeModalityRules(value?: PlanModalityInput[]) {
  const seen = new Set<string>();
  return (Array.isArray(value) ? value : []).flatMap((rule) => {
    const modalityId = rule?.modalityId?.trim() ?? "";
    if (!modalityId || seen.has(modalityId)) return [];
    seen.add(modalityId);
    const accessPeriod = rule?.accessPeriod === "DIA" || rule?.accessPeriod === "SEMANA" || rule?.accessPeriod === "MES" ? rule.accessPeriod : "SEM_LIMITE";
    return [{ modalityId, sessionsPerWeek: Number(rule?.sessionsPerWeek), accessPeriod: accessPeriod as AccessPeriod, accessLimit: accessPeriod === "SEM_LIMITE" ? null : Number(rule?.accessLimit), allowEarlyAccess: Boolean(rule?.allowEarlyAccess), allowReschedule: Boolean(rule?.allowReschedule), requiresEnrollment: Boolean(rule?.requiresEnrollment), limitPromotionalTimes: Boolean(rule?.limitPromotionalTimes) }];
  }).slice(0, 12);
}

async function updatePlan(access: Awaited<ReturnType<typeof requireCompanyAccess>>, input?: RequestBody["plan"]) {
  requireManager(access.profile.platform_role);
  const planId = input?.id?.trim();
  if (!planId) throw new RequestError("CONTRATO INVÁLIDO.", 400);
  const plan = normalizePlan(input);
  if (!plan.name || !isSupportedCycle(plan) || !isCurrency(plan.amountCents)) throw new RequestError("PREENCHA NOME, CICLO, DURAÇÃO E VALOR DO CONTRATO.", 400);
  validateCatalogSettings(plan.catalogSettings);
  const modalityRules = await resolveModalityRules(access, plan.modalityRules);
  await resolveEnrollmentService(access, plan.catalogSettings);
  const catalogSettings = { ...plan.catalogSettings, enrollmentChargeMode: plan.catalogSettings.enrollmentFeeEnabled && ["DIARIO", "MENSAL"].includes(plan.billingInterval) ? "PRIMEIRA_PARCELA" : plan.catalogSettings.enrollmentChargeMode };
  const { data, error } = await access.admin.from("xpace_membership_plans").update({ name: plan.name, description: plan.description || null, billing_interval: plan.billingInterval, duration_months: plan.durationMonths, amount_cents: plan.amountCents, renews_automatically: plan.renewsAutomatically, modalities: modalityRules.map((rule) => rule.modalityName), modality_rules: modalityRules.map(({ modalityName: _modalityName, ...rule }) => rule), catalog_settings: catalogSettings, updated_by: access.user.id, updated_at: new Date().toISOString() }).eq("id", planId).eq("tenant_company_id", access.company.id).select("id,name").maybeSingle();
  if (error) throw error;
  if (!data) throw new RequestError("CONTRATO NÃO ENCONTRADO NESTA EMPRESA.", 404);
  return NextResponse.json({ success: true, plan: { id: data.id, name: data.name } });
}
async function resolveModalityRules(access: Awaited<ReturnType<typeof requireCompanyAccess>>, rules: ReturnType<typeof normalizeModalityRules>) {
  if (!rules.length) throw new RequestError("ADICIONE AO MENOS UMA MODALIDADE AO CONTRATO.", 400);
  const ids = rules.map((rule) => rule.modalityId);
  const { data, error } = await access.admin.from("xpace_modalities").select("id,name").eq("tenant_company_id", access.company.id).eq("active", true).in("id", ids);
  if (error) throw error;
  if ((data ?? []).length !== ids.length) throw new RequestError("SELECIONE APENAS MODALIDADES ATIVAS CADASTRADAS.", 400);
  return rules.map((rule) => {
    const modalityName = (data ?? []).find((modality) => modality.id === rule.modalityId)?.name;
    if (!modalityName || !Number.isInteger(rule.sessionsPerWeek) || rule.sessionsPerWeek < 1 || rule.sessionsPerWeek > 14) throw new RequestError("INFORME ENTRE 1 E 14 SESSÕES POR SEMANA PARA CADA MODALIDADE.", 400);
    if (rule.accessPeriod !== "SEM_LIMITE" && (!Number.isInteger(rule.accessLimit) || !rule.accessLimit || rule.accessLimit < 1 || rule.accessLimit > 100)) throw new RequestError("INFORME UMA QUANTIDADE DE ACESSOS VÁLIDA PARA O PERÍODO ESCOLHIDO.", 400);
    return { ...rule, modalityName };
  });
}
function validateSaleRestrictions(value: unknown, birthDate: string | null) {
  if (!value || typeof value !== "object") return;
  const settings = value as Record<string, unknown>;
  if (settings.limitSalePeriod) {
    const startsOn = typeof settings.saleStartsOn === "string" ? settings.saleStartsOn : "";
    const endsOn = typeof settings.saleEndsOn === "string" ? settings.saleEndsOn : "";
    if (!isDate(startsOn) || !isDate(endsOn) || startsOn > endsOn) throw new RequestError("ESTE CONTRATO POSSUI UM PERÍODO DE VENDA INVÁLIDO.", 409);
    const current = today();
    if (current < startsOn || current > endsOn) throw new RequestError("ESTE CONTRATO NÃO ESTÁ DISPONÍVEL PARA VENDA NESTA DATA.", 409);
  }
  if (settings.limitAgeRange) {
    const minAge = boundedInteger(settings.minAge, 0, 120); const maxAge = boundedInteger(settings.maxAge, 0, 120);
    if (minAge > maxAge) throw new RequestError("A FAIXA ETÁRIA DO CONTRATO É INVÁLIDA.", 409);
    if (!birthDate) throw new RequestError("INFORME A DATA DE NASCIMENTO DO ALUNO PARA VENDER ESTE CONTRATO.", 409);
    const studentAge = ageOnToday(birthDate);
    if (studentAge < minAge || studentAge > maxAge) throw new RequestError(`ESTE CONTRATO É PERMITIDO SOMENTE PARA ALUNOS ENTRE ${minAge} E ${maxAge} ANOS.`, 409);
  }
}
function validateCatalogSettings(settings: ReturnType<typeof normalizePlan>["catalogSettings"]) {
  if (settings.limitSalePeriod && (!settings.saleStartsOn || !settings.saleEndsOn || settings.saleStartsOn > settings.saleEndsOn)) throw new RequestError("INFORME O INÍCIO E O FIM VÁLIDOS DO PERÍODO DE VENDA.", 400);
  if (settings.limitAgeRange && settings.minAge > settings.maxAge) throw new RequestError("A IDADE MÍNIMA NÃO PODE SER MAIOR QUE A IDADE MÁXIMA.", 400);
  if (settings.enrollmentFeeEnabled && !settings.enrollmentServiceId) throw new RequestError("SELECIONE O SERVIÇO DE ADESÃO OU MATRÍCULA.", 400);
}
async function resolveEnrollmentService(access: Awaited<ReturnType<typeof requireCompanyAccess>>, value: unknown) {
  if (!value || typeof value !== "object") return null;
  const settings = value as Record<string, unknown>;
  if (!settings.enrollmentFeeEnabled) return null;
  const serviceId = typeof settings.enrollmentServiceId === "string" ? settings.enrollmentServiceId.trim() : "";
  if (!serviceId) throw new RequestError("SELECIONE O SERVIÇO DE ADESÃO OU MATRÍCULA.", 400);
  const { data, error } = await access.admin.from("xpace_services").select("id,description,sale_price_cents,active").eq("id", serviceId).eq("tenant_company_id", access.company.id).eq("active", true).maybeSingle();
  if (error) throw error;
  if (!data) throw new RequestError("O SERVIÇO DE ADESÃO SELECIONADO NÃO ESTÁ DISPONÍVEL. ATUALIZE O CONTRATO.", 409);
  return { id: data.id, description: data.description, salePriceCents: data.sale_price_cents, chargeMode: settings.enrollmentChargeMode === "RATEAR_PARCELAS" ? "RATEAR_PARCELAS" as EnrollmentChargeMode : "PRIMEIRA_PARCELA" as EnrollmentChargeMode };
}
function normalizeContract(value?: RequestBody["contract"]) {
  const legacyGroupId = value?.classGroupId?.trim() ?? "";
  const classGroupIds = [...new Set((Array.isArray(value?.classGroupIds) ? value.classGroupIds : [legacyGroupId]).map((id) => id?.trim()).filter((id): id is string => Boolean(id)))];
  const saleOn = value?.saleOn?.trim() || value?.startsOn?.trim() || "";
  return { id: value?.id?.trim() ?? "", studentId: value?.studentId?.trim() ?? "", planId: value?.planId?.trim() ?? "", classGroupIds, saleOn, firstDueOn: value?.firstDueOn?.trim() || saleOn, amountCents: value?.amountCents === undefined ? undefined : Number(value.amountCents), discountType: value?.discountType === "PERCENTUAL" || value?.discountType === "FIXO" ? value.discountType : "", discountValue: Number(value?.discountValue ?? 0), enrollmentFeeEnabled: value?.enrollmentFeeEnabled, paymentMethod: value?.paymentMethod === "PIX" || value?.paymentMethod === "CARTAO" ? value.paymentMethod : "", renewsAutomatically: value?.renewsAutomatically, status: value?.status as ContractStatus, statusNote: value?.statusNote?.trim() ?? "", effectiveOn: value?.effectiveOn?.trim() ?? "" };
}

async function generatePix(access: Awaited<ReturnType<typeof requireCompanyAccess>>, contractId?: string) {
  const id = contractId?.trim() ?? "";
  if (!id) throw new RequestError("CONTRATO INVÁLIDO PARA GERAR O PIX.", 400);
  const { data: contract, error: contractError } = await access.admin.from("xpace_student_contracts").select("id,student_id,plan_name_snapshot,payment_method,status").eq("id", id).eq("tenant_company_id", access.company.id).maybeSingle();
  if (contractError) throw contractError;
  if (!contract) throw new RequestError("CONTRATO NÃO ENCONTRADO NESTA EMPRESA.", 404);
  if (contract.payment_method !== "PIX") throw new RequestError("ESTE CONTRATO NÃO FOI VENDIDO COM PIX.", 409);
  if (!["ATIVO", "AGENDADO"].includes(contract.status)) throw new RequestError("SÓ É POSSÍVEL GERAR PIX PARA UM CONTRATO ATIVO OU AGENDADO.", 409);

  await issuePixChargesForContract(access.admin, access.company.id, contract.id);
  const { data: charge, error: chargeError } = await access.admin.from("xpace_contract_charges").select("id,pix_copy_paste,pix_qr_code_url,provider_status,provider_error").eq("tenant_company_id", access.company.id).eq("contract_id", contract.id).not("provider_payment_id", "is", null).order("competence_on", { ascending: false }).limit(1).maybeSingle();
  if (chargeError) throw chargeError;
  if (!charge?.pix_copy_paste) throw new RequestError(charge?.provider_error || "O PIX AINDA NÃO FOI GERADO. TENTE NOVAMENTE.", 409);
  return NextResponse.json({ success: true, charge: { id: charge.id, pixCopyPaste: charge.pix_copy_paste, pixQrCodeUrl: charge.pix_qr_code_url ?? "", providerStatus: charge.provider_status ?? "PENDING" } });
}

function requireManager(role: string) { if (!["platform_owner", "company_manager"].includes(role)) throw new AccessError("APENAS GESTORES PODEM ALTERAR O CATALOGO DE PLANOS.", 403); }
function isPositiveInteger(value: number) { return Number.isInteger(value) && value > 0 && value <= 60; }
function isCurrency(value: number | undefined): value is number { return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100_000_000; }
function boundedInteger(value: unknown, min: number, max: number) { const number = Number(value); return Number.isInteger(number) ? Math.min(max, Math.max(min, number)) : min; }
function isDate(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00`)); }
function endOfTerm(startsOn: string, billingInterval: BillingInterval, months: number) {
  if (billingInterval === "DIARIO") return startsOn;
  const [year, month, day] = startsOn.split("-").map(Number);
  const targetMonth = month - 1 + months;
  const targetYear = year + Math.floor(targetMonth / 12);
  const targetMonthNumber = (targetMonth % 12) + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonthNumber, 0)).getUTCDate();
  const boundary = Date.UTC(targetYear, targetMonthNumber - 1, Math.min(day, lastDay));
  return new Date(boundary - 86_400_000).toISOString().slice(0, 10);
}
function templateNameFromPath(value: string | null) { return value ? value.split("/").at(-1)?.replace(/^modelo-\d+\./, "MODELO.") ?? "MODELO IMPORTADO" : ""; }
function today() { return todayIso(); }
function ageOnToday(value: string) { const birth = new Date(`${value}T12:00:00`); const current = new Date(`${today()}T12:00:00`); let age = current.getFullYear() - birth.getFullYear(); if (current.getMonth() < birth.getMonth() || (current.getMonth() === birth.getMonth() && current.getDate() < birth.getDate())) age -= 1; return age; }
class RequestError extends Error { constructor(message: string, public status: number) { super(message); } }
function handleError(error: unknown) {
  if (error instanceof AccessError || error instanceof RequestError) return NextResponse.json({ success: false, message: error.message }, { status: error.status });
  const code = (error as { code?: string })?.code;
  if (code === "23505") return NextResponse.json({ success: false, message: "JA EXISTE UM PLANO COM ESTE NOME NA XPACE." }, { status: 409 });
  console.error("XPACE CONTRACTS ERROR", error);
  return NextResponse.json({ success: false, message: "NAO FOI POSSIVEL CONCLUIR A OPERACAO DE CONTRATOS." }, { status: 500 });
}

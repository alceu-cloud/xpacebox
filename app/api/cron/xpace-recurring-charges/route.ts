import { NextResponse } from "next/server";
import { processPaymentCancellations } from "@/lib/server/xpace-payment-cancellations";

import { ensureContractCharges, todayIso } from "@/lib/xpace/billing";
import { resendAutentiqueSignature } from "@/lib/server/autentique";
import { createSupabaseAdmin } from "@/lib/server/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ success: false, message: "NÃO AUTORIZADO." }, { status: 401 });

  try {
    const admin = createSupabaseAdmin();
    const { data: company, error: companyError } = await admin.from("companies").select("id").eq("slug", "xpace").eq("active", true).maybeSingle();
    if (companyError) throw companyError;
    if (!company) return NextResponse.json({ success: true, generatedFor: 0 });
    const { data: contracts, error: contractsError } = await admin.from("xpace_student_contracts").select("id,student_id,starts_on,first_due_on,ends_on,billing_interval_snapshot,duration_months_snapshot,base_amount_cents,amount_cents,benefit_name_snapshot,discount_type_snapshot,discount_value_snapshot,enrollment_service_snapshot,renews_automatically,status,cancel_effective_on,payment_access_blocked,signature_access_blocked").eq("tenant_company_id", company.id).in("status", ["AGENDADO", "ATIVO", "PAUSADO"]).limit(1000);
    if (contractsError) throw contractsError;
    const today = todayIso();
    const scheduledToEnd = (contracts ?? []).filter((contract) => contract.cancel_effective_on && contract.cancel_effective_on <= today && ["AGENDADO", "ATIVO", "PAUSADO"].includes(contract.status));
    await Promise.all(scheduledToEnd.map(async (contract) => {
      const now = new Date().toISOString();
      // Contract triggers close eligible charges and enrollment atomically.
      const { error: contractError } = await admin.from("xpace_student_contracts").update({ status: "ENCERRADO", status_note: "ENCERRAMENTO AGENDADO EXECUTADO.", updated_at: now }).eq("id", contract.id).eq("tenant_company_id", company.id);
      if (contractError) throw contractError;
    }));
    await Promise.all((contracts ?? []).filter((contract) => !scheduledToEnd.some((ending) => ending.id === contract.id)).map((contract) => ensureContractCharges(admin, company.id, contract)));
    const activeContracts = (contracts ?? []).filter((contract) => !scheduledToEnd.some((ending) => ending.id === contract.id) && ["AGENDADO", "ATIVO"].includes(contract.status));
    const [overdueResult, pendingSignaturesResult, signatureRemindersResult] = await Promise.all([
      admin.from("xpace_contract_charges").select("contract_id").eq("tenant_company_id", company.id).eq("status", "ABERTO").lte("due_on", addDays(today, -4)),
      admin.from("xpace_contract_sales").select("id,contract_id,signature_due_on").eq("tenant_company_id", company.id).eq("signature_required", true).neq("signature_status", "ASSINADA").not("signature_due_on", "is", null).lt("signature_due_on", today),
      admin.from("xpace_contract_sales").select("id,contract_id,signature_provider_signature_id,signature_due_on,signature_reminder_day_2_at,signature_reminder_day_5_at").eq("tenant_company_id", company.id).eq("signature_required", true).eq("signature_provider", "AUTENTIQUE").eq("signature_status", "ENVIADA").not("signature_provider_signature_id", "is", null).gte("signature_due_on", today),
    ]);
    if (overdueResult.error) throw overdueResult.error;
    if (pendingSignaturesResult.error) throw pendingSignaturesResult.error;
    if (signatureRemindersResult.error) throw signatureRemindersResult.error;
    const overdueContractIds = new Set((overdueResult.data ?? []).map((charge) => charge.contract_id));
    const signatureBlockedIds = new Set((pendingSignaturesResult.data ?? []).map((sale) => sale.contract_id));
    await Promise.all(activeContracts.flatMap((contract) => {
      const updates: Promise<void>[] = [];
      if (overdueContractIds.has(contract.id) && !contract.payment_access_blocked) updates.push(setPaymentBlock(admin, company.id, contract.id, true));
      if (signatureBlockedIds.has(contract.id) && !contract.signature_access_blocked) updates.push(setSignatureBlock(admin, company.id, contract.id, true));
      return updates;
    }));
    const reminders = await sendSignatureReminders(admin, company.id, today, new Set(activeContracts.map((contract) => contract.id)), signatureRemindersResult.data ?? []);
    const cancellations = await processPaymentCancellations(admin, company.id);
    return NextResponse.json({ success: true, cancellations, reminders, generatedFor: contracts?.length ?? 0, paymentBlocked: overdueContractIds.size, signatureBlocked: signatureBlockedIds.size });
  } catch (error) {
    console.error("XPACE RECURRING CHARGES CRON ERROR", error);
    return NextResponse.json({ success: false, message: "NÃO FOI POSSÍVEL GERAR AS COBRANÇAS RECORRENTES." }, { status: 500 });
  }
}

async function setPaymentBlock(admin: ReturnType<typeof createSupabaseAdmin>, companyId: string, contractId: string, blocked: boolean) {
  const now = new Date().toISOString();
  const { error } = await admin.from("xpace_student_contracts").update({ payment_access_blocked: blocked, payment_access_blocked_at: blocked ? now : null, updated_at: now }).eq("tenant_company_id", companyId).eq("id", contractId);
  if (error) throw error;
  const { error: eventError } = await admin.from("xpace_contract_events").insert({ tenant_company_id: companyId, contract_id: contractId, event_type: blocked ? "ACESSO_BLOQUEADO_INADIMPLENCIA" : "ACESSO_LIBERADO_PAGAMENTO", note: blocked ? "ACESSO BLOQUEADO APÓS 3 DIAS COMPLETOS DE TOLERÂNCIA NO VENCIMENTO." : "ACESSO LIBERADO APÓS A REGULARIZAÇÃO FINANCEIRA.", created_by: null });
  if (eventError) throw eventError;
}

async function setSignatureBlock(admin: ReturnType<typeof createSupabaseAdmin>, companyId: string, contractId: string, blocked: boolean) {
  const now = new Date().toISOString();
  const { error } = await admin.from("xpace_student_contracts").update({ signature_access_blocked: blocked, signature_access_blocked_at: blocked ? now : null, updated_at: now }).eq("tenant_company_id", companyId).eq("id", contractId);
  if (error) throw error;
  const { error: eventError } = await admin.from("xpace_contract_events").insert({ tenant_company_id: companyId, contract_id: contractId, event_type: blocked ? "ACESSO_BLOQUEADO_ASSINATURA" : "ACESSO_LIBERADO_ASSINATURA", note: blocked ? "ACESSO BLOQUEADO: O PRAZO DE 7 DIAS PARA ASSINATURA EXPIROU." : "ACESSO LIBERADO APÓS A ASSINATURA DO CONTRATO.", created_by: null });
  if (eventError) throw eventError;
}

function addDays(value: string, days: number) { const date = new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }

async function sendSignatureReminders(admin: ReturnType<typeof createSupabaseAdmin>, companyId: string, today: string, activeContractIds: Set<string>, sales: Array<{ id: string; contract_id: string; signature_provider_signature_id: string | null; signature_due_on: string | null; signature_reminder_day_2_at: string | null; signature_reminder_day_5_at: string | null }>) {
  const result = { sent: 0, failed: 0, skipped: 0 };
  const stages = [
    { field: "signature_reminder_day_2_at", startsOn: (dueOn: string) => addDays(dueOn, -5), label: "2º DIA" },
    { field: "signature_reminder_day_5_at", startsOn: (dueOn: string) => addDays(dueOn, -2), label: "5º DIA" },
  ] as const;
  for (const sale of sales) {
    if (!activeContractIds.has(sale.contract_id) || !sale.signature_due_on || !sale.signature_provider_signature_id) { result.skipped += 1; continue; }
    for (const stage of stages) {
      if (sale[stage.field] || today < stage.startsOn(sale.signature_due_on)) continue;
      const now = new Date().toISOString();
      const { data: locked, error: lockError } = await admin.from("xpace_contract_sales").update({ [stage.field]: now, updated_at: now }).eq("id", sale.id).eq("tenant_company_id", companyId).is(stage.field, null).select("id").maybeSingle();
      if (lockError) throw lockError;
      if (!locked) { result.skipped += 1; continue; }
      try {
        await resendAutentiqueSignature(sale.signature_provider_signature_id);
        const { error: eventError } = await admin.from("xpace_contract_events").insert({ tenant_company_id: companyId, contract_id: sale.contract_id, event_type: "LEMBRETE_ASSINATURA", note: `LEMBRETE DE ASSINATURA REENVIADO PELA AUTENTIQUE NO ${stage.label}.`, created_by: null });
        if (eventError) throw eventError;
        result.sent += 1;
      } catch (error) {
        await admin.from("xpace_contract_sales").update({ [stage.field]: null, updated_at: new Date().toISOString() }).eq("id", sale.id).eq("tenant_company_id", companyId);
        result.failed += 1;
        console.error("XPACE SIGNATURE REMINDER ERROR", { saleId: sale.id, stage: stage.label, error });
      }
    }
  }
  return result;
}

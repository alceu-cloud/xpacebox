import { NextResponse } from "next/server";

import { ensureContractCharges, todayIso } from "@/lib/xpace/billing";
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
    const { data: contracts, error: contractsError } = await admin.from("xpace_student_contracts").select("id,student_id,starts_on,first_due_on,ends_on,billing_interval_snapshot,duration_months_snapshot,base_amount_cents,amount_cents,benefit_name_snapshot,discount_type_snapshot,discount_value_snapshot,enrollment_service_snapshot,renews_automatically,status,cancel_effective_on").eq("tenant_company_id", company.id).in("status", ["AGENDADO", "ATIVO", "PAUSADO"]).limit(1000);
    if (contractsError) throw contractsError;
    const today = todayIso();
    const scheduledToEnd = (contracts ?? []).filter((contract) => contract.cancel_effective_on && contract.cancel_effective_on <= today && ["AGENDADO", "ATIVO", "PAUSADO"].includes(contract.status));
    await Promise.all(scheduledToEnd.map(async (contract) => {
      const now = new Date().toISOString();
      const { data: mappings, error: mappingsError } = await admin.from("xpace_contract_class_groups").select("class_group_id").eq("tenant_company_id", company.id).eq("contract_id", contract.id);
      if (mappingsError) throw mappingsError;
      const groupIds = (mappings ?? []).map((mapping) => mapping.class_group_id).filter(Boolean);
      const { error: contractError } = await admin.from("xpace_student_contracts").update({ status: "ENCERRADO", status_note: "ENCERRAMENTO AGENDADO EXECUTADO.", updated_at: now }).eq("id", contract.id).eq("tenant_company_id", company.id);
      if (contractError) throw contractError;
      const [{ error: chargesError }, { error: enrollmentsError }, { error: eventError }] = await Promise.all([
        admin.from("xpace_contract_charges").update({ status: "CANCELADO", cancelled_at: now, updated_at: now }).eq("tenant_company_id", company.id).eq("contract_id", contract.id).eq("status", "ABERTO").gte("due_on", contract.cancel_effective_on),
        groupIds.length ? admin.from("xpace_class_enrollments").update({ status: "ENCERRADA", ends_on: contract.cancel_effective_on, updated_at: now }).eq("tenant_company_id", company.id).eq("student_id", contract.student_id).in("class_group_id", groupIds).eq("status", "ATIVA") : Promise.resolve({ error: null }),
        admin.from("xpace_contract_events").insert({ tenant_company_id: company.id, contract_id: contract.id, event_type: "STATUS_ALTERADO", previous_status: contract.status, next_status: "ENCERRADO", note: "ENCERRAMENTO AGENDADO EXECUTADO.", created_by: null }),
      ]);
      if (chargesError) throw chargesError; if (enrollmentsError) throw enrollmentsError; if (eventError) throw eventError;
    }));
    await Promise.all((contracts ?? []).filter((contract) => !scheduledToEnd.some((ending) => ending.id === contract.id)).map((contract) => ensureContractCharges(admin, company.id, contract)));
    return NextResponse.json({ success: true, generatedFor: contracts?.length ?? 0 });
  } catch (error) {
    console.error("XPACE RECURRING CHARGES CRON ERROR", error);
    return NextResponse.json({ success: false, message: "NÃO FOI POSSÍVEL GERAR AS COBRANÇAS RECORRENTES." }, { status: 500 });
  }
}

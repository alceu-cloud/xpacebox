import { NextResponse } from "next/server";

import { ensureContractCharges } from "@/lib/xpace/billing";
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
    const { data: contracts, error: contractsError } = await admin.from("xpace_student_contracts").select("id,student_id,starts_on,ends_on,billing_interval_snapshot,duration_months_snapshot,base_amount_cents,amount_cents,benefit_name_snapshot,discount_type_snapshot,discount_value_snapshot,renews_automatically,status,cancel_effective_on").eq("tenant_company_id", company.id).in("status", ["AGENDADO", "ATIVO", "PAUSADO"]).limit(1000);
    if (contractsError) throw contractsError;
    await Promise.all((contracts ?? []).map((contract) => ensureContractCharges(admin, company.id, contract)));
    return NextResponse.json({ success: true, generatedFor: contracts?.length ?? 0 });
  } catch (error) {
    console.error("XPACE RECURRING CHARGES CRON ERROR", error);
    return NextResponse.json({ success: false, message: "NÃO FOI POSSÍVEL GERAR AS COBRANÇAS RECORRENTES." }, { status: 500 });
  }
}

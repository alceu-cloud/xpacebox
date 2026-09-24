import { NextResponse } from "next/server";

import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";

const pageSize = 500;
const leadBatchSize = 80;

function monthPeriod() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  return {
    from: `${year}-${String(month).padStart(2, "0")}-01`,
    to: new Date(Date.UTC(year, month, 1, 12)).toISOString().slice(0, 10),
  };
}

export async function GET(request: Request) {
  try {
    const { admin, company } = await requireCompanyAccess(request, "xpace");
    const period = monthPeriod();
    const monthBookings: Array<{ id: string; lead_id: string; scheduled_on: string }> = [];

    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await admin.from("xpace_lead_appointments")
        .select("id,lead_id,scheduled_on")
        .eq("tenant_company_id", company.id)
        .gte("scheduled_on", period.from).lt("scheduled_on", period.to)
        .neq("attendance_status", "CANCELADO")
        .order("scheduled_on").order("id")
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      monthBookings.push(...(data ?? []));
      if (!data || data.length < pageSize) break;
    }

    const leadIds = [...new Set(monthBookings.map((booking) => booking.lead_id))];
    const leads: Array<{ id: string; full_name: string; pipeline_stage: string; won_at: string | null }> = [];
    const appointments: Array<{ id: string; lead_id: string; scheduled_on: string; starts_at: string | null; class_name_snapshot: string | null; confirmation_status: string; attendance_status: string; enrollment_outcome: string; outcome_recorded_at: string | null }> = [];

    for (let start = 0; start < leadIds.length; start += leadBatchSize) {
      const batch = leadIds.slice(start, start + leadBatchSize);
      const { data: leadData, error: leadError } = await admin.from("xpace_leads")
        .select("id,full_name,pipeline_stage,won_at")
        .eq("tenant_company_id", company.id).in("id", batch);
      if (leadError) throw leadError;
      leads.push(...(leadData ?? []));

      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await admin.from("xpace_lead_appointments")
          .select("id,lead_id,scheduled_on,starts_at,class_name_snapshot,confirmation_status,attendance_status,enrollment_outcome,outcome_recorded_at")
          .eq("tenant_company_id", company.id).in("lead_id", batch)
          .neq("attendance_status", "CANCELADO")
          .order("scheduled_on").order("starts_at").order("id")
          .range(offset, offset + pageSize - 1);
        if (error) throw error;
        appointments.push(...(data ?? []));
        if (!data || data.length < pageSize) break;
      }
    }

    return NextResponse.json({ success: true, monthFrom: period.from, leads, appointments });
  } catch (error) {
    if (error instanceof AccessError) return NextResponse.json({ success: false, message: error.message }, { status: error.status });
    console.error("XPACE MOBILE LEADS ERROR", error);
    return NextResponse.json({ success: false, message: "Não foi possível carregar os leads do mês." }, { status: 500 });
  }
}

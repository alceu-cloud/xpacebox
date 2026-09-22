import { NextResponse } from "next/server";

import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";

function saoPauloDay() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function iso(date: Date) {
  return date.toISOString().slice(0, 10);
}

function periods() {
  const today = saoPauloDay();
  const [year, month, day] = today.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  const monday = new Date(date);
  monday.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  const nextMonday = new Date(monday);
  nextMonday.setUTCDate(monday.getUTCDate() + 7);
  return {
    today,
    weekFrom: iso(monday),
    weekTo: iso(nextMonday),
    monthFrom: `${year}-${String(month).padStart(2, "0")}-01`,
    nextMonth: iso(new Date(Date.UTC(year, month, 1, 12))),
  };
}

export async function GET(request: Request) {
  try {
    const { admin, company, profile } = await requireCompanyAccess(request, "xpace");
    const period = periods();
    const [trials, contracts, newContracts, newBookings, recentBookings] = await Promise.all([
      admin.from("xpace_lead_appointments").select("id", { count: "exact", head: true })
        .eq("tenant_company_id", company.id).gte("scheduled_on", period.weekFrom).lt("scheduled_on", period.weekTo)
        .not("class_schedule_id", "is", null).neq("attendance_status", "CANCELADO"),
      admin.from("xpace_student_contracts").select("student_id")
        .eq("tenant_company_id", company.id).eq("status", "ATIVO")
        .lte("starts_on", period.today).gte("ends_on", period.today).limit(5000),
      admin.from("xpace_student_contracts").select("student_id")
        .eq("tenant_company_id", company.id).gte("starts_on", period.monthFrom)
        .lt("starts_on", period.nextMonth).in("status", ["ATIVO", "AGENDADO", "PAUSADO"])
        .limit(5000),
      admin.from("xpace_lead_appointments").select("lead_id")
        .eq("tenant_company_id", company.id).gte("scheduled_on", period.monthFrom)
        .lt("scheduled_on", period.nextMonth).neq("attendance_status", "CANCELADO")
        .limit(5000),
      admin.from("xpace_lead_appointments").select("id,lead_id,created_at,scheduled_on")
        .eq("tenant_company_id", company.id).neq("attendance_status", "CANCELADO")
        .order("created_at", { ascending: false }).limit(8),
    ]);
    for (const result of [trials, contracts, newContracts, newBookings, recentBookings]) {
      if (result.error) throw result.error;
    }
    const leadIds = [...new Set((recentBookings.data ?? []).map((item) => item.lead_id))];
    const names = new Map<string, string>();
    if (leadIds.length) {
      const { data, error } = await admin.from("xpace_leads").select("id,full_name")
        .eq("tenant_company_id", company.id).in("id", leadIds);
      if (error) throw error;
      for (const lead of data ?? []) names.set(lead.id, lead.full_name);
    }
    return NextResponse.json({
      success: true,
      profileName: profile.full_name || profile.email || "Equipe XPACE",
      metrics: {
        trialsThisWeek: trials.count ?? 0,
        activeClients: new Set((contracts.data ?? []).map((row) => row.student_id)).size,
        newClientsThisMonth: new Set((newContracts.data ?? []).map((row) => row.student_id)).size,
        newLeadsThisMonth: new Set((newBookings.data ?? []).map((row) => row.lead_id)).size,
      },
      notifications: (recentBookings.data ?? []).map((row) => ({
        id: row.id,
        title: "Aula experimental agendada",
        detail: `${names.get(row.lead_id) ?? "Lead"} · ${row.scheduled_on}`,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ success: false, message: error.message }, { status: error.status });
    }
    console.error("XPACE MOBILE OVERVIEW ERROR", error);
    return NextResponse.json({ success: false, message: "Não foi possível carregar o painel." }, { status: 500 });
  }
}

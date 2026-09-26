import { NextResponse } from "next/server";

import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";

const PAGE_SIZE = 3;

function saoPauloPeriod() {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const [year, month] = today.split("-").map(Number);
  return {
    today,
    monthFrom: `${year}-${String(month).padStart(2, "0")}-01`,
    nextMonth: new Date(Date.UTC(year, month, 1, 12)).toISOString().slice(0, 10),
  };
}

function saoPauloMidnight(day: string) {
  const noon = new Date(`${day}T12:00:00Z`);
  const offset = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", timeZoneName: "longOffset" })
    .formatToParts(noon).find((part) => part.type === "timeZoneName")?.value ?? "GMT-03:00";
  const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(offset);
  const minutes = match ? (match[1] === "+" ? 1 : -1) * (Number(match[2]) * 60 + Number(match[3])) : -180;
  return new Date(Date.parse(`${day}T00:00:00Z`) - minutes * 60_000).toISOString();
}

export async function GET(request: Request) {
  try {
    const { admin, company } = await requireCompanyAccess(request, "xpace");
    const params = new URL(request.url).searchParams;
    const requestedPage = Number(params.get("page") ?? 0);
    const page = Number.isSafeInteger(requestedPage) && requestedPage >= 0 ? Math.min(requestedPage, 1000) : 0;
    const seenAt = params.get("seenAt") ?? "";
    const validSeenAt = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(seenAt) && !Number.isNaN(Date.parse(seenAt)) ? seenAt : "";
    const period = saoPauloPeriod();
    const monthFrom = saoPauloMidnight(period.monthFrom);
    const nextMonth = saoPauloMidnight(period.nextMonth);

    const activeStudents = new Set<string>();
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await admin.from("xpace_student_contracts").select("student_id")
        .eq("tenant_company_id", company.id).eq("status", "ATIVO")
        .lte("starts_on", period.today).gte("ends_on", period.today)
        .order("student_id").range(offset, offset + 999);
      if (error) throw error;
      for (const contract of data ?? []) activeStudents.add(contract.student_id);
      if (!data || data.length < 1000) break;
    }
    const newStudents = new Set<string>();
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await admin.from("xpace_contract_sales").select("student_id")
        .eq("tenant_company_id", company.id).eq("status", "CONCLUIDA")
        .gte("effective_at", monthFrom).lt("effective_at", nextMonth)
        .order("student_id").range(offset, offset + 999);
      if (error) throw error;
      for (const sale of data ?? []) newStudents.add(sale.student_id);
      if (!data || data.length < 1000) break;
    }
    // Renovação de alguém que já havia comprado antes não é cliente novo.
    const monthlyStudentIds = [...newStudents];
    for (let index = 0; index < monthlyStudentIds.length; index += 100) {
      const chunk = monthlyStudentIds.slice(index, index + 100);
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await admin.from("xpace_contract_sales").select("student_id")
          .eq("tenant_company_id", company.id).eq("status", "CONCLUIDA")
          .lt("effective_at", monthFrom).in("student_id", chunk)
          .order("student_id").range(offset, offset + 999);
        if (error) throw error;
        for (const sale of data ?? []) newStudents.delete(sale.student_id);
        if (!data || data.length < 1000) break;
      }
    }

    const bookings = admin.from("xpace_lead_appointments")
      .select("id,lead_id,created_at,scheduled_on", { count: "exact" })
      .eq("tenant_company_id", company.id).neq("attendance_status", "CANCELADO")
      .is("legacy_week_label", null)
      .order("created_at", { ascending: false }).order("id", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    const unread = admin.from("xpace_lead_appointments")
      .select("id", { count: "exact", head: true })
      .eq("tenant_company_id", company.id).neq("attendance_status", "CANCELADO")
      .is("legacy_week_label", null);
    if (validSeenAt) unread.gt("created_at", validSeenAt);
    const [bookingResult, unreadResult, latestResult] = await Promise.all([
      bookings,
      unread,
      admin.from("xpace_lead_appointments").select("created_at")
        .eq("tenant_company_id", company.id).neq("attendance_status", "CANCELADO")
        .is("legacy_week_label", null)
        .order("created_at", { ascending: false }).limit(1),
    ]);
    for (const result of [bookingResult, unreadResult, latestResult]) if (result.error) throw result.error;

    const leadIds = [...new Set((bookingResult.data ?? []).map((booking) => booking.lead_id))];
    const leadNames = new Map<string, string>();
    if (leadIds.length) {
      const { data, error } = await admin.from("xpace_leads").select("id,full_name")
        .eq("tenant_company_id", company.id).in("id", leadIds);
      if (error) throw error;
      for (const lead of data ?? []) leadNames.set(lead.id, lead.full_name);
    }

    return NextResponse.json({
      success: true,
      metrics: { activeClients: activeStudents.size, newClientsThisMonth: newStudents.size },
      notifications: {
        items: (bookingResult.data ?? []).map((booking) => ({
          id: booking.id,
          title: leadNames.get(booking.lead_id) ?? "Lead",
          scheduledOn: booking.scheduled_on,
          createdAt: booking.created_at,
        })),
        total: bookingResult.count ?? 0,
        unread: unreadResult.count ?? 0,
        latestCreatedAt: latestResult.data?.[0]?.created_at ?? null,
        page,
        pageSize: PAGE_SIZE,
      },
    });
  } catch (error) {
    if (error instanceof AccessError) return NextResponse.json({ success: false, message: error.message }, { status: error.status });
    console.error("XPACE HOME ERROR", error);
    return NextResponse.json({ success: false, message: "Não foi possível carregar o resumo da XPACE." }, { status: 500 });
  }
}

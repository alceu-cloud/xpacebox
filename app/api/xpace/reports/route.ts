import { NextResponse } from "next/server";
import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";
import { buildTrialReport, type TrialRecord } from "@/lib/xpace/report-metrics";
import { contractedRevenueForMonthCents, dateInSaoPaulo, lifecycleForMonth, saleValueCents, validDay } from "@/lib/xpace/dashboard-metrics";
import { historyDestinations, historySource, historySources, reportHistory2026 } from "@/lib/server/xpace-report-history";

export const dynamic = "force-dynamic";
type Appointment = { id: string; lead_id: string; scheduled_on: string; starts_at: string | null; booking_kind: string; modality_name_snapshot: string | null; actual_instructor_name_snapshot: string | null; instructor_name_snapshot: string | null; attendance_status: string; enrollment_outcome: string };
type Lead = { id: string; full_name: string; linked_student_id: string | null; converted_person_id: string | null; legacy_import_batch_id: string | null; legacy_payload: unknown };
type Contract = { id: string; student_id: string; starts_on: string; ends_on: string; status: string; cancel_effective_on: string | null; cancelled_at: string | null; amount_cents: number; billing_interval_snapshot: string; duration_months_snapshot: number };
type Sale = { id: string; student_id: string; contract_id: string; status: string; sold_on: string; effective_at: string | null };
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  try {
    const { admin, company } = await requireCompanyAccess(request, "xpace");
    const params = new URL(request.url).searchParams;
    const today = dateInSaoPaulo(new Date().toISOString());
    const from = params.get("from") ?? `${today.slice(0, 4)}-01-01`;
    const to = params.get("to") ?? `${today.slice(0, 4)}-12-31`;
    if (!validDay(from) || !validDay(to) || from > to || (Number(to.slice(0, 4)) * 12 + Number(to.slice(5, 7))) - (Number(from.slice(0, 4)) * 12 + Number(from.slice(5, 7))) > 23) {
      return NextResponse.json({ success: false, message: "Escolha datas válidas, em um período de até 24 meses." }, { status: 400, headers });
    }
    const appointments: Appointment[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await admin.from("xpace_lead_appointments")
        .select("id,lead_id,scheduled_on,starts_at,booking_kind,modality_name_snapshot,actual_instructor_name_snapshot,instructor_name_snapshot,attendance_status,enrollment_outcome")
        .eq("tenant_company_id", company.id).gte("scheduled_on", from).lte("scheduled_on", to).order("id").range(offset, offset + 999);
      if (error) throw error;
      appointments.push(...(data ?? [])); if (!data || data.length < 1000) break;
    }
    const ids = [...new Set(appointments.map((a) => a.lead_id))]; const leads: Lead[] = [];
    for (let offset = 0; offset < ids.length; offset += 200) {
      const { data, error } = await admin.from("xpace_leads")
        .select("id,full_name,linked_student_id,converted_person_id,legacy_import_batch_id,legacy_payload")
        .eq("tenant_company_id", company.id).in("id", ids.slice(offset, offset + 200));
      if (error) throw error; leads.push(...(data ?? []));
    }
    const leadById = new Map(leads.map((l) => [l.id, l]));
    const records: TrialRecord[] = appointments.map((a) => {
      const lead = leadById.get(a.lead_id);
      const payload = lead?.legacy_payload && typeof lead.legacy_payload === "object" && !Array.isArray(lead.legacy_payload) ? lead.legacy_payload as Record<string, unknown> : {};
      return { id: a.id, leadId: a.lead_id, personId: lead?.linked_student_id ?? lead?.converted_person_id ?? null,
        on: a.scheduled_on, startsAt: a.starts_at, kind: a.booking_kind, modality: a.modality_name_snapshot?.trim() ?? "",
        instructor: (a.actual_instructor_name_snapshot || a.instructor_name_snapshot || "").trim(),
        attendance: a.attendance_status, enrollment: a.enrollment_outcome, legacy: Boolean(lead?.legacy_import_batch_id),
        legacyMonth: typeof payload["Mês"] === "string" ? payload["Mês"] : null };
    });
    const report = buildTrialReport(records, from, to);
    if (params.get("detail") === "1") {
      const group = params.get("group") ?? "month"; const key = params.get("key") ?? "";
      if (!["month", "modality", "instructor", "all"].includes(group)) return NextResponse.json({ success: false, message: "Agrupamento inválido." }, { status: 400, headers });
      const matching = report.records.filter((r) => group === "all" || (group === "month" ? r.on.slice(0, 7) === key : group === "modality" ? (r.modality || "SEM MODALIDADE") === key : (r.instructor || "SEM PROFESSOR") === key)).sort((a, b) => a.on.localeCompare(b.on) || (a.startsAt ?? "").localeCompare(b.startsAt ?? "") || a.id.localeCompare(b.id));
      const rawPage = Number(params.get("page") ?? "1");
      if (!Number.isInteger(rawPage) || rawPage < 1) return NextResponse.json({ success: false, message: "Página inválida." }, { status: 400, headers });
      const pages = Math.max(1, Math.ceil(matching.length / 30)); const page = Math.min(rawPage, pages);
      return NextResponse.json({ success: true, total: matching.length, page, pages,
        items: matching.slice((page - 1) * 30, page * 30).map((r) => ({ ...r, name: leadById.get(r.leadId)?.full_name ?? "Lead não encontrado" })) }, { headers });
    }
    const { records: _records, ...summary } = report;
    // Manual source values remain separate. A partial month is not comparable to a monthly snapshot.
    const history = reportHistory2026.filter((h) => `${h.month}-01` <= to && `${h.month}-31` >= from).map((h) => {
      const last = new Date(Date.UTC(Number(h.month.slice(0, 4)), Number(h.month.slice(5, 7)), 0)).toISOString().slice(0, 10);
      return { ...h, fullMonth: from <= `${h.month}-01` && to >= last };
    });
    async function load<T>(table: string, columns: string): Promise<T[]> {
      const rows: T[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await admin.from(table).select(columns).eq("tenant_company_id", company.id).order("id").range(offset, offset + 999);
        if (error) throw error; rows.push(...((data ?? []) as T[])); if (!data || data.length < 1000) break;
      }
      return rows;
    }
    const [contracts, sales] = await Promise.all([
      load<Contract>("xpace_student_contracts", "id,student_id,starts_on,ends_on,status,cancel_effective_on,cancelled_at,amount_cents,billing_interval_snapshot,duration_months_snapshot"),
      load<Sale>("xpace_contract_sales", "id,student_id,contract_id,status,sold_on,effective_at"),
    ]);
    const completed = sales.filter((s) => s.status === "CONCLUIDA");
    const completedIds = new Set(completed.map((s) => s.contract_id));
    const spans = contracts.filter((c) => completedIds.has(c.id));
    const byContract = new Map(contracts.map((c) => [c.id, c]));
    const firstSale = new Map<string, string>();
    for (const sale of completed) {
      const day = sale.effective_at ? dateInSaoPaulo(sale.effective_at) : sale.sold_on;
      if (!firstSale.has(sale.student_id) || day < firstSale.get(sale.student_id)!) firstSale.set(sale.student_id, day);
    }
    const systemMonths = report.months.map(({ key: month }) => {
      const first = `${month}-01`;
      const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
      const until = [last, today, to].sort()[0]; const start = from > first ? from : first;
      const future = start > until;
      const monthSales = completed.filter((s) => s.sold_on >= start && s.sold_on <= until);
      const values = monthSales.map((s) => { const c = byContract.get(s.contract_id); return c ? saleValueCents(c) : null; });
      const salesCents = !future && values.every((v) => v !== null) ? values.reduce<number>((sum, v) => sum + (v ?? 0), 0) : null;
      const active = new Set(spans.filter((c) => {
        const end = c.cancel_effective_on ?? (c.cancelled_at ? dateInSaoPaulo(c.cancelled_at) : c.ends_on);
        return c.status !== "PAUSADO" && c.starts_on <= until && c.ends_on >= until && end >= until;
      }).map((c) => c.student_id)).size;
      const revenue = spans.map((c) => contractedRevenueForMonthCents(c, month));
      return { month, future, partial: start !== first || until !== last, active: future ? null : active,
        newClients: future ? null : [...firstSale.values()].filter((day) => day >= start && day <= until).length,
        churn: future || start !== first ? null : lifecycleForMonth(spans, month, until).churn,
        salesCents, ticketCents: values.length && salesCents !== null ? Math.round(salesCents / values.length) : null,
        revenueCents: future || !spans.length || revenue.some((v) => v === null) ? null : Math.round(revenue.reduce<number>((sum, v) => sum + (v ?? 0), 0)) };
    });
    return NextResponse.json({ success: true, from, to, today, report: summary, history, historySource,
      historySources, historyDestinations, systemMonths, transition: from <= "2026-09-30" && to >= "2026-09-01" }, { headers });
  } catch (error) {
    if (error instanceof AccessError) return NextResponse.json({ success: false, message: error.message }, { status: error.status, headers });
    console.error("XPACE REPORTS ERROR", error instanceof Error ? error.message : "Unexpected error");
    return NextResponse.json({ success: false, message: "Não foi possível carregar os relatórios da XPACE." }, { status: 500, headers });
  }
}

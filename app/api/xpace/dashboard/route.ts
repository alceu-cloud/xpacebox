import { NextResponse } from "next/server";

import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";
import { addMonthsToDay, ageBand, ageOn, contractedRevenueForMonthCents, dateInSaoPaulo, leadCohortDay, lifecycleForMonth, monthKeys, nextBirthday, percent, saleValueCents, validDay } from "@/lib/xpace/dashboard-metrics";

type Admin = Awaited<ReturnType<typeof requireCompanyAccess>>["admin"];
type Lead = { id: string; pipeline_stage: string; source_id: string | null; source_note: string | null; loss_reason_id: string | null; legacy_payload: unknown; created_at: string };
type Person = { id: string; full_name: string; birth_date: string | null; is_student: boolean; active: boolean };
type Contract = { id: string; student_id: string; plan_name_snapshot: string; billing_interval_snapshot: string; duration_months_snapshot: number; amount_cents: number; starts_on: string; ends_on: string; status: string; cancel_effective_on: string | null; cancelled_at: string | null; payment_access_blocked: boolean; renews_automatically: boolean };
type Sale = { id: string; student_id: string; contract_id: string; sold_on: string; status: string; effective_at: string | null };
type Label = { id: string; name: string };

const sections = ["CRM", "GERENCIAL", "OPERACIONAL", "CLIENTES", "FINANCEIRO"] as const;

async function load<T>(admin: Admin, companyId: string, table: string, columns: string): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.from(table).select(columns).eq("tenant_company_id", companyId)
      .order("id").range(offset, offset + 999);
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

function tally(values: string[]) {
  const map = new Map<string, number>();
  for (const value of values) map.set(value, (map.get(value) ?? 0) + 1);
  return [...map].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "pt-BR"));
}

function topSlices(values: string[]) {
  const items = tally(values);
  return items.length <= 6 ? items : [...items.slice(0, 5), { name: "OUTROS", count: items.slice(5).reduce((sum, item) => sum + item.count, 0) }];
}

function dateParts(request: Request) {
  const today = dateInSaoPaulo(new Date().toISOString());
  const params = new URL(request.url).searchParams;
  const section = params.get("section") ?? "CRM";
  const from = params.get("from") ?? `${today.slice(0, 4)}-01-01`;
  const to = params.get("to") ?? today;
  if (!sections.some((item) => item === section)) throw new Error("Categoria inválida.");
  if (!validDay(from) || !validDay(to) || from > to || Number(to.slice(0, 4)) - Number(from.slice(0, 4)) > 5) throw new Error("Escolha um período válido de até cinco anos.");
  return { section, from, to, today };
}

export async function GET(request: Request) {
  try {
    const { admin, company } = await requireCompanyAccess(request, "xpace");
    const { section, from, to, today } = dateParts(request);
    if (section === "FINANCEIRO") return NextResponse.json({ success: true, section, from, to });

    if (section === "CRM") {
      const [leads, sources, reasons, people] = await Promise.all([
        load<Lead>(admin, company.id, "xpace_leads", "id,pipeline_stage,source_id,source_note,loss_reason_id,legacy_payload,created_at"),
        load<Label>(admin, company.id, "xpace_lead_sources", "id,name"),
        load<Label>(admin, company.id, "xpace_lead_loss_reasons", "id,name"),
        load<Person>(admin, company.id, "xpace_people", "id,full_name,birth_date,is_student,active"),
      ]);
      const sourceNames = new Map(sources.map((item) => [item.id, item.name]));
      const reasonNames = new Map(reasons.map((item) => [item.id, item.name]));
      const cohort = leads.filter((lead) => { const day = leadCohortDay(lead); return day >= from && day <= to; });
      const won = cohort.filter((lead) => lead.pipeline_stage === "GANHO");
      const lost = cohort.filter((lead) => lead.pipeline_stage === "PERDIDO");
      const open = cohort.length - won.length - lost.length;
      const keys = monthKeys(from, to);
      const trend = keys.map((month) => ({ month, won: won.filter((lead) => leadCohortDay(lead).startsWith(month)).length, lost: lost.filter((lead) => leadCohortDay(lead).startsWith(month)).length }));
      const sourceLabels = cohort.map((lead) => (lead.source_id ? sourceNames.get(lead.source_id) ?? "" : lead.source_note?.trim() ?? "").toLocaleUpperCase("pt-BR"));
      const lossLabels = lost.map((lead) => (lead.loss_reason_id ? reasonNames.get(lead.loss_reason_id) ?? "" : "").toLocaleUpperCase("pt-BR"));
      const birthdays = people.filter((person) => person.active && person.is_student && person.birth_date)
        .map((person) => ({ id: person.id, name: person.full_name, on: nextBirthday(person.birth_date!, today), age: ageOn(person.birth_date!, today) + 1 }))
        .sort((a, b) => a.on.localeCompare(b.on) || a.name.localeCompare(b.name, "pt-BR")).slice(0, 10);
      return NextResponse.json({ success: true, section, from, to,
        metrics: { leads: cohort.length, open, won: won.length, lost: lost.length, conversion: percent(won.length, cohort.length) },
        trend, birthdays,
        sources: topSlices(sourceLabels.filter(Boolean)), sourceMissing: sourceLabels.filter((value) => !value).length,
        losses: topSlices(lossLabels.filter(Boolean)), lossMissing: lossLabels.filter((value) => !value).length,
        imported: cohort.filter((lead) => Boolean(lead.legacy_payload)).length,
      });
    }

    if (section === "GERENCIAL") {
      const [sales, contracts] = await Promise.all([
        load<Sale>(admin, company.id, "xpace_contract_sales", "id,student_id,contract_id,sold_on,status,effective_at"),
        load<Contract>(admin, company.id, "xpace_student_contracts", "id,student_id,plan_name_snapshot,billing_interval_snapshot,duration_months_snapshot,amount_cents,starts_on,ends_on,status,cancel_effective_on,cancelled_at,payment_access_blocked,renews_automatically"),
      ]);
      const contractById = new Map(contracts.map((contract) => [contract.id, contract]));
      const done = sales.filter((sale) => sale.status === "CONCLUIDA");
      const concludedContractIds = new Set(done.map((sale) => sale.contract_id));
      const lifecycleContracts = contracts.filter((contract) => concludedContractIds.has(contract.id));
      const asOf = to < today ? to : today;
      const inPeriod = done.filter((sale) => sale.sold_on >= from && sale.sold_on <= to);
      const contractValue = (sale: Sale) => {
        const contract = contractById.get(sale.contract_id);
        return contract ? saleValueCents(contract) : null;
      };
      const allValued = inPeriod.every((sale) => contractValue(sale) !== null);
      const salesCents = done.length && allValued ? inPeriod.reduce((sum, sale) => sum + (contractValue(sale) ?? 0), 0) : null;
      const keys = monthKeys(addMonthsToDay(`${to.slice(0, 7)}-01`, -3), to, 4);
      const trend = keys.map((month) => {
        const monthSales = done.filter((sale) => sale.sold_on.startsWith(month));
        const saleValue = done.length && monthSales.every((sale) => contractValue(sale) !== null)
          ? monthSales.reduce((sum, sale) => sum + (contractValue(sale) ?? 0), 0) : null;
        const monthlyRevenue = contracts.reduce((sum, contract) => {
          if (!concludedContractIds.has(contract.id)) return sum;
          return sum + (contractedRevenueForMonthCents(contract, month) ?? 0);
        }, 0);
        const lifecycle = lifecycleForMonth(lifecycleContracts, month, asOf);
        return { month, salesCents: saleValue, revenueCents: done.length ? Math.round(monthlyRevenue) : null, count: monthSales.length,
          ticketCents: saleValue !== null && monthSales.length ? Math.round(saleValue / monthSales.length) : null,
          ltMonths: lifecycle.ltMonths, churn: lifecycle.churn };
      });
      const periodExits = monthKeys(from, to, 60).flatMap((month) => lifecycleForMonth(lifecycleContracts, month, asOf).exits.filter((exit) => exit.on >= from && exit.on <= asOf));
      const ltMonths = periodExits.length ? Math.round(periodExits.reduce((sum, exit) => sum + exit.months, 0) / periodExits.length * 10) / 10 : null;
      return NextResponse.json({ success: true, section, from, to,
        metrics: { salesCents, salesCount: inPeriod.length, ticketCents: salesCents !== null && inPeriod.length ? Math.round(salesCents / inPeriod.length) : null, ltMonths, churn: trend.at(-1)?.churn ?? null, cacCents: null, renewal: null },
        trend, plans: topSlices(inPeriod.map((sale) => contractById.get(sale.contract_id)?.plan_name_snapshot ?? "PLANO NÃO ENCONTRADO")), closures: [],
        notes: { sales: "Valor contratual estimado na venda, não valor recebido. Contratos renovados podem ter preço atualizado.", revenue: "Receita contratual mensalizada, não caixa recebido; sujeita a ajustes de cancelamento e renovação." },
      });
    }

    if (section === "OPERACIONAL") {
      const [contracts, people, schedules, groups] = await Promise.all([
        load<Contract>(admin, company.id, "xpace_student_contracts", "id,student_id,plan_name_snapshot,billing_interval_snapshot,duration_months_snapshot,amount_cents,starts_on,ends_on,status,cancel_effective_on,cancelled_at,payment_access_blocked,renews_automatically"),
        load<Person>(admin, company.id, "xpace_people", "id,full_name,birth_date,is_student,active"),
        load<{ id: string; class_group_id: string; weekday: number; starts_at: string; room_name: string | null; capacity: number | null; active: boolean }>(admin, company.id, "xpace_class_schedules", "id,class_group_id,weekday,starts_at,room_name,capacity,active"),
        load<{ id: string; name: string; active: boolean }>(admin, company.id, "xpace_class_groups", "id,name,active"),
      ]);
      const nameById = new Map(people.map((person) => [person.id, person.full_name]));
      const groupById = new Map(groups.map((group) => [group.id, group]));
      const until = addMonthsToDay(today, 1);
      const expiring = contracts.filter((contract) => ["ATIVO", "PAUSADO"].includes(contract.status) && contract.ends_on >= today && contract.ends_on <= until)
        .sort((a, b) => a.ends_on.localeCompare(b.ends_on)).slice(0, 12)
        .map((contract) => ({ id: contract.id, client: nameById.get(contract.student_id) ?? "Cliente", plan: contract.plan_name_snapshot, on: contract.ends_on, automatic: contract.renews_automatically }));
      const slots = schedules.filter((schedule) => schedule.active && groupById.get(schedule.class_group_id)?.active)
        .sort((a, b) => a.weekday - b.weekday || a.starts_at.localeCompare(b.starts_at))
        .map((schedule) => ({ id: schedule.id, className: groupById.get(schedule.class_group_id)?.name ?? "Turma", weekday: schedule.weekday, startsAt: schedule.starts_at, room: schedule.room_name, capacity: schedule.capacity }));
      return NextResponse.json({ success: true, section, from, to, metrics: { occupancy: null, renewal: null, atRisk: null, activeSchedules: slots.length }, expiring, slots });
    }

    const [people, contracts, sales, benefits, profiles, groups, memberships] = await Promise.all([
      load<Person>(admin, company.id, "xpace_people", "id,full_name,birth_date,is_student,active"),
      load<Contract>(admin, company.id, "xpace_student_contracts", "id,student_id,plan_name_snapshot,billing_interval_snapshot,duration_months_snapshot,amount_cents,starts_on,ends_on,status,cancel_effective_on,cancelled_at,payment_access_blocked,renews_automatically"),
      load<Sale>(admin, company.id, "xpace_contract_sales", "id,student_id,contract_id,sold_on,status,effective_at"),
      load<{ person_id: string; benefit_profile_id: string; status: string; starts_on: string; ends_on: string | null }>(admin, company.id, "xpace_person_benefits", "id,person_id,benefit_profile_id,status,starts_on,ends_on"),
      load<{ id: string; kind: string }>(admin, company.id, "xpace_benefit_profiles", "id,kind"),
      load<{ id: string; modality: string | null }>(admin, company.id, "xpace_class_groups", "id,modality"),
      load<{ contract_id: string; class_group_id: string }>(admin, company.id, "xpace_contract_class_groups", "id,contract_id,class_group_id"),
    ]);
    const activeContracts = contracts.filter((contract) => contract.status === "ATIVO" && contract.starts_on <= today && contract.ends_on >= today);
    const activeIds = new Set(activeContracts.map((contract) => contract.student_id));
    const paidBlocked = new Set(activeContracts.filter((contract) => contract.payment_access_blocked).map((contract) => contract.student_id));
    const suspended = new Set(contracts.filter((contract) => contract.status === "PAUSADO" && !activeIds.has(contract.student_id)).map((contract) => contract.student_id));
    const profileById = new Map(profiles.map((profile) => [profile.id, profile.kind]));
    const vip = new Set(benefits.filter((benefit) => activeIds.has(benefit.person_id) && benefit.status === "ATIVO" && benefit.starts_on <= today && (!benefit.ends_on || benefit.ends_on >= today) && profileById.get(benefit.benefit_profile_id) === "VIP").map((benefit) => benefit.person_id));
    const completedSales = sales.filter((sale) => sale.status === "CONCLUIDA").map((sale) => ({ ...sale, completedOn: sale.effective_at ? dateInSaoPaulo(sale.effective_at) : sale.sold_on }));
    const priorBuyers = new Set(completedSales.filter((sale) => sale.completedOn < from).map((sale) => sale.student_id));
    const newClients = new Set(completedSales.filter((sale) => sale.completedOn >= from && sale.completedOn <= to && !priorBuyers.has(sale.student_id)).map((sale) => sale.student_id));
    const groupById = new Map(groups.map((group) => [group.id, group.modality?.trim() ?? ""]));
    const contractById = new Map(activeContracts.map((contract) => [contract.id, contract]));
    const modalities = new Map<string, Set<string>>();
    for (const membership of memberships) {
      const student = contractById.get(membership.contract_id)?.student_id;
      const modality = groupById.get(membership.class_group_id);
      if (!student || !modality) continue;
      if (!modalities.has(modality)) modalities.set(modality, new Set());
      modalities.get(modality)!.add(student);
    }
    const activePeople = people.filter((person) => activeIds.has(person.id));
    return NextResponse.json({ success: true, section, from, to,
      metrics: { active: activeIds.size, new: newClients.size, blocked: paidBlocked.size, suspended: suspended.size, vip: vip.size },
      modalities: [...modalities].map(([name, students]) => ({ name, count: students.size })).sort((a, b) => b.count - a.count),
      ages: tally(activePeople.filter((person) => person.birth_date && ageOn(person.birth_date, today) >= 0).map((person) => ageBand(ageOn(person.birth_date!, today)))),
      ageMissing: activePeople.filter((person) => !person.birth_date || ageOn(person.birth_date, today) < 0).length,
    });
  } catch (error) {
    if (error instanceof AccessError) return NextResponse.json({ success: false, message: error.message }, { status: error.status });
    if (error instanceof Error && (error.message.startsWith("Escolha um período") || error.message === "Categoria inválida.")) return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    console.error("XPACE DASHBOARD ERROR", error);
    return NextResponse.json({ success: false, message: "Não foi possível carregar o dashboard da XPACE." }, { status: 500 });
  }
}

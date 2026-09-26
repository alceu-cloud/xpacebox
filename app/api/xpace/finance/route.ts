import { NextResponse } from "next/server";

import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";
import { recurrenceFrequencies, shiftedFinanceDate, type RecurrenceFrequency } from "@/lib/xpace/finance-recurrence";

type AccountRow = { id: string; description: string; account_type: string; bank_name: string | null; agency_number: string | null; account_number: string | null; active: boolean };
type EntryRow = { id: string; direction: "PAGAR" | "RECEBER"; description: string; counterparty_name: string; expense_category_id: string | null; competence_on: string; due_on: string; amount_cents: number; created_at: string };
type CategoryRow = { id: string; name: string; active: boolean };
type SettlementRow = { entry_id: string; amount_cents: number; settled_on: string };
type ChargeRow = { id: string; contract_id: string; student_id: string; competence_on: string; due_on: string; amount_cents: number; paid_amount_cents: number; paid_at: string | null; status: string; provider_payment_id: string | null; provider_status: string | null };
type FinancialItem = { id: string; source: "MANUAL" | "XPAY"; counterparty: string; description: string; categoryName: string | null; competenceOn: string; dueOn: string; amountCents: number; paidAmountCents: number; paidOn: string | null; status: "ABERTO" | "ANDAMENTO" | "PARCIAL" | "PAGO" };

const pageSize = 20;
const accountTypes = ["CONTA_CORRENTE", "POUPANCA", "CAIXA", "CARTEIRA_DIGITAL", "OUTRA"];

function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function saoPauloDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(value));
}

function clean(value: unknown, max = 180) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function fail(message: string, status: number) {
  return NextResponse.json({ success: false, message }, { status });
}

function handleError(error: unknown) {
  if (error instanceof AccessError) return fail(error.message, error.status);
  if (error instanceof RequestError) return fail(error.message, error.status);
  console.error("XPACE FINANCE ERROR", error);
  return fail("Não foi possível processar o financeiro da XPACE.", 500);
}

class RequestError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

function requireManager(role: string) {
  if (!["platform_owner", "company_manager"].includes(role)) throw new AccessError("Apenas gestores podem cadastrar contas e registrar pagamentos.", 403);
}

export async function GET(request: Request) {
  try {
    const { admin, company, profile } = await requireCompanyAccess(request, "xpace");
    const params = new URL(request.url).searchParams;
    const view = params.get("view") ?? "PAGAR";
    const canManage = ["platform_owner", "company_manager"].includes(profile.platform_role);
    if (!["PAGAR", "RECEBER", "CONTAS", "CATEGORIAS", "CLIENTES"].includes(view)) throw new RequestError("Área financeira inválida.");

    if (view === "CLIENTES") {
      const search = clean(params.get("q"), 80);
      let query = admin.from("xpace_people").select("id,full_name,person_number")
        .eq("tenant_company_id", company.id).eq("is_student", true).eq("active", true)
        .order("full_name").limit(40);
      if (search) query = query.ilike("full_name", `%${search}%`);
      const { data, error } = await query;
      if (error) throw error;
      return NextResponse.json({ success: true, clients: (data ?? []).map((person) => ({ id: person.id, name: person.full_name, number: person.person_number })) });
    }

    const categories: CategoryRow[] = [];
    if (view === "PAGAR" || view === "CATEGORIAS") {
      const { data, error } = await admin.from("xpace_expense_categories").select("id,name,active")
        .eq("tenant_company_id", company.id).order("name");
      if (error) throw error;
      categories.push(...(data ?? []));
    }
    if (view === "CATEGORIAS") return NextResponse.json({ success: true, canManage, categories });

    const accounts: AccountRow[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await admin.from("xpace_financial_accounts")
        .select("id,description,account_type,bank_name,agency_number,account_number,active")
        .eq("tenant_company_id", company.id).order("description").order("id")
        .range(offset, offset + 999);
      if (error) throw error;
      accounts.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    if (view === "CONTAS") {
      const search = (params.get("q") ?? "").trim().toLocaleLowerCase("pt-BR");
      const filtered = accounts.filter((account) => !search || `${account.description} ${account.bank_name ?? ""}`.toLocaleLowerCase("pt-BR").includes(search));
      return NextResponse.json({ success: true, canManage, accounts: filtered.map((account) => ({
        id: account.id, description: account.description, accountType: account.account_type,
        bankName: account.bank_name, active: account.active,
        agencyNumber: canManage ? account.agency_number : null,
        accountNumber: canManage ? account.account_number : null,
      })) });
    }

    const entries: EntryRow[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await admin.from("xpace_manual_financial_entries")
        .select("id,direction,description,counterparty_name,expense_category_id,competence_on,due_on,amount_cents,created_at")
        .eq("tenant_company_id", company.id).eq("direction", view)
        .order("due_on", { ascending: false }).order("id")
        .range(offset, offset + 999);
      if (error) throw error;
      entries.push(...((data ?? []) as EntryRow[]));
      if (!data || data.length < 1000) break;
    }
    const settlements: SettlementRow[] = [];
    if (entries.length) {
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await admin.from("xpace_manual_financial_settlements")
          .select("entry_id,amount_cents,settled_on")
          .eq("tenant_company_id", company.id).order("created_at").order("id")
          .range(offset, offset + 999);
        if (error) throw error;
        settlements.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
    }
    const byEntry = new Map<string, { paid: number; last: string | null }>();
    for (const settlement of settlements) {
      const current = byEntry.get(settlement.entry_id) ?? { paid: 0, last: null };
      current.paid += settlement.amount_cents;
      if (!current.last || settlement.settled_on > current.last) current.last = settlement.settled_on;
      byEntry.set(settlement.entry_id, current);
    }
    const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
    const items: FinancialItem[] = entries.map((entry) => {
      const settlement = byEntry.get(entry.id) ?? { paid: 0, last: null };
      return {
        id: entry.id, source: "MANUAL", counterparty: entry.counterparty_name,
        description: entry.description, categoryName: entry.expense_category_id ? categoryNames.get(entry.expense_category_id) ?? null : null,
        competenceOn: entry.competence_on, dueOn: entry.due_on,
        amountCents: entry.amount_cents, paidAmountCents: settlement.paid, paidOn: settlement.last,
        status: settlement.paid >= entry.amount_cents ? "PAGO" : settlement.paid > 0 ? "PARCIAL" : "ABERTO",
      };
    });

    if (view === "RECEBER") {
      const charges: ChargeRow[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await admin.from("xpace_contract_charges")
          .select("id,contract_id,student_id,competence_on,due_on,amount_cents,paid_amount_cents,paid_at,status,provider_payment_id,provider_status")
          .eq("tenant_company_id", company.id).neq("status", "CANCELADO")
          .order("due_on", { ascending: false }).order("id")
          .range(offset, offset + 999);
        if (error) throw error;
        charges.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      const people = new Map<string, string>();
      const plans = new Map<string, string>();
      for (let index = 0; index < charges.length; index += 100) {
        const slice = charges.slice(index, index + 100);
        const [students, contracts] = await Promise.all([
          admin.from("xpace_people").select("id,full_name").eq("tenant_company_id", company.id).in("id", [...new Set(slice.map((charge) => charge.student_id))]),
          admin.from("xpace_student_contracts").select("id,plan_name_snapshot").eq("tenant_company_id", company.id).in("id", [...new Set(slice.map((charge) => charge.contract_id))]),
        ]);
        if (students.error) throw students.error;
        if (contracts.error) throw contracts.error;
        for (const student of students.data ?? []) people.set(student.id, student.full_name);
        for (const contract of contracts.data ?? []) plans.set(contract.id, contract.plan_name_snapshot);
      }
      for (const charge of charges) items.push({
        id: charge.id, source: "XPAY", counterparty: people.get(charge.student_id) ?? "Cliente XPACE",
        description: plans.get(charge.contract_id) ?? "Parcela de contrato", categoryName: null,
        competenceOn: charge.competence_on, dueOn: charge.due_on,
        amountCents: charge.amount_cents, paidAmountCents: charge.paid_amount_cents,
        paidOn: charge.paid_at ? saoPauloDate(charge.paid_at) : null,
        status: charge.status === "RECEBIDO" ? "PAGO" : charge.provider_payment_id ? "ANDAMENTO" : "ABERTO",
      });
    }

    const dateBy = params.get("dateBy") ?? "VENCIMENTO";
    if (!["VENCIMENTO", "PAGAMENTO", "COMPETENCIA"].includes(dateBy)) throw new RequestError("Tipo de data inválido.");
    const from = params.get("from") ?? "";
    const to = params.get("to") ?? "";
    if ((from && !isDate(from)) || (to && !isDate(to)) || (from && to && from > to)) throw new RequestError("Período inválido.");
    const status = params.get("status") ?? "TODOS";
    if (!["TODOS", "ABERTOS", "FECHADOS"].includes(status)) throw new RequestError("Filtro de situação inválido.");
    const search = (params.get("q") ?? "").trim().slice(0, 180).toLocaleLowerCase("pt-BR");
    const filtered = items.filter((item) => {
      const date = dateBy === "PAGAMENTO" ? item.paidOn : dateBy === "COMPETENCIA" ? item.competenceOn : item.dueOn;
      if ((from && (!date || date < from)) || (to && (!date || date > to))) return false;
      if (search && !`${item.counterparty} ${item.description}`.toLocaleLowerCase("pt-BR").includes(search)) return false;
      if (status === "ABERTOS" && item.status === "PAGO") return false;
      if (status === "FECHADOS" && item.status !== "PAGO") return false;
      return true;
    });
    filtered.sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.counterparty.localeCompare(b.counterparty, "pt-BR") || a.id.localeCompare(b.id));
    const metrics = { total: 0, paid: 0, open: 0, inProgress: 0 };
    for (const item of filtered) {
      metrics.total += item.amountCents;
      metrics.paid += item.paidAmountCents;
      const remaining = Math.max(0, item.amountCents - item.paidAmountCents);
      if (item.status === "ANDAMENTO") metrics.inProgress += remaining;
      else metrics.open += remaining;
    }
    const requestedPage = Number(params.get("page") ?? 0);
    const page = Number.isSafeInteger(requestedPage) && requestedPage >= 0 ? requestedPage : 0;
    return NextResponse.json({ success: true, canManage, metrics, items: filtered.slice(page * pageSize, (page + 1) * pageSize), totalRows: filtered.length, page, pageSize, accounts: accounts.filter((account) => account.active).map((account) => ({ id: account.id, description: account.description })), categories: categories.filter((category) => category.active) });
  } catch (error) { return handleError(error); }
}

export async function POST(request: Request) {
  try {
    const access = await requireCompanyAccess(request, "xpace");
    requireManager(access.profile.platform_role);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) throw new RequestError("Dados inválidos.");
    if (body.action === "saveCategory") {
      const id = clean(body.id, 50);
      const name = clean(body.name, 100).replace(/\s+/g, " ").toLocaleUpperCase("pt-BR");
      const active = body.active !== false;
      if (name.length < 2) throw new RequestError("Informe o nome da categoria.");
      if (id) {
        const { data, error } = await access.admin.from("xpace_expense_categories")
          .update({ name, active, updated_by: access.profile.id, updated_at: new Date().toISOString() })
          .eq("tenant_company_id", access.company.id).eq("id", id).select("id").maybeSingle();
        if (error?.code === "23505") throw new RequestError("Esta categoria já existe.", 409);
        if (error) throw error;
        if (!data) throw new RequestError("Categoria não encontrada nesta empresa.", 404);
        return NextResponse.json({ success: true, id: data.id });
      }
      const { data, error } = await access.admin.from("xpace_expense_categories")
        .insert({ tenant_company_id: access.company.id, name, active, created_by: access.profile.id, updated_by: access.profile.id })
        .select("id").single();
      if (error?.code === "23505") throw new RequestError("Esta categoria já existe.", 409);
      if (error) throw error;
      return NextResponse.json({ success: true, id: data.id }, { status: 201 });
    }
    if (body.action === "createAccount") {
      const description = clean(body.description, 120);
      const accountType = clean(body.accountType, 30);
      if (description.length < 2 || !accountTypes.includes(accountType)) throw new RequestError("Informe a descrição e o tipo da conta.");
      const differentHolder = body.differentHolder === true;
      const holderName = clean(body.holderName, 160);
      const holderDocument = clean(body.holderDocument, 30).replace(/\D/g, "");
      if (differentHolder && (!holderName || ![11, 14].includes(holderDocument.length))) throw new RequestError("Informe nome e CPF/CNPJ do titular diferente.");
      const { data, error } = await access.admin.from("xpace_financial_accounts").insert({
        tenant_company_id: access.company.id, description, account_type: accountType,
        bank_name: clean(body.bankName, 120) || null,
        agency_number: clean(body.agencyNumber, 20) || null,
        agency_digit: clean(body.agencyDigit, 4) || null,
        account_number: clean(body.accountNumber, 30) || null,
        account_digit: clean(body.accountDigit, 4) || null,
        different_holder: differentHolder,
        holder_name: differentHolder ? holderName : null,
        holder_document: differentHolder ? holderDocument : null,
        created_by: access.user.id,
      }).select("id").single();
      if (error) throw error;
      return NextResponse.json({ success: true, id: data.id }, { status: 201 });
    }
    if (body.action === "createEntry") {
      const direction = clean(body.direction, 10);
      const description = clean(body.description);
      let counterpartyName = clean(body.counterpartyName);
      const amountCents = Number(body.amountCents);
      const categoryId = clean(body.expenseCategoryId, 50);
      const clientId = clean(body.clientId, 50);
      const groupId = clean(body.recurrenceGroupId, 50);
      const recurring = direction === "PAGAR" && body.recurring === true;
      const frequency = recurring ? clean(body.recurrenceFrequency, 20) : "UNICA";
      const count = recurring ? Number(body.recurrenceCount) : 1;
      if (!["PAGAR", "RECEBER"].includes(direction) || description.length < 2 || !isDate(body.competenceOn) || !isDate(body.dueOn) || !Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > 2_147_483_647) throw new RequestError("Revise descrição, datas e valor.");
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(groupId)) throw new RequestError("Identificador do cadastro inválido.");
      if (!Number.isInteger(count) || count < 1 || count > 120 || (recurring && !recurrenceFrequencies.some((item) => item === frequency))) throw new RequestError("Escolha uma frequência e quantidade entre 1 e 120.");
      if (direction === "PAGAR") {
        if (counterpartyName.length < 2 || !categoryId) throw new RequestError("Informe favorecido e categoria de despesa.");
        const { data: category, error } = await access.admin.from("xpace_expense_categories")
          .select("id").eq("tenant_company_id", access.company.id).eq("id", categoryId).eq("active", true).maybeSingle();
        if (error) throw error;
        if (!category) throw new RequestError("Categoria de despesa inválida nesta empresa.", 400);
      } else {
        if (!clientId) throw new RequestError("Selecione um cliente cadastrado na XPACE.");
        const { data: client, error } = await access.admin.from("xpace_people")
          .select("id,full_name").eq("tenant_company_id", access.company.id).eq("id", clientId)
          .eq("is_student", true).eq("active", true).maybeSingle();
        if (error) throw error;
        if (!client) throw new RequestError("Cliente não encontrado nesta empresa.", 400);
        counterpartyName = client.full_name;
      }
      let rows;
      try {
        rows = Array.from({ length: count }, (_, index) => ({
          tenant_company_id: access.company.id, direction, description,
          counterparty_name: counterpartyName, expense_category_id: direction === "PAGAR" ? categoryId : null,
          client_id: direction === "RECEBER" ? clientId : null,
          competence_on: shiftedFinanceDate(body.competenceOn as string, frequency as RecurrenceFrequency, index),
          due_on: shiftedFinanceDate(body.dueOn as string, frequency as RecurrenceFrequency, index),
          amount_cents: amountCents, note: clean(body.note, 1000) || null,
          recurrence_group_id: groupId, recurrence_sequence: index + 1,
          recurrence_total: count, recurrence_frequency: frequency, created_by: access.user.id,
        }));
      } catch { throw new RequestError("O período da recorrência contém uma data inválida."); }
      const { data: existing, error: existingError } = await access.admin.from("xpace_manual_financial_entries")
        .select("id,direction,description,counterparty_name,expense_category_id,client_id,competence_on,due_on,amount_cents,note,recurrence_sequence,recurrence_total,recurrence_frequency")
        .eq("tenant_company_id", access.company.id).eq("recurrence_group_id", groupId)
        .order("recurrence_sequence");
      if (existingError) throw existingError;
      if (existing?.length) {
        if (existing.length !== count || existing.some((entry, index) => {
          const expected = rows[index];
          return entry.direction !== expected.direction || entry.description !== expected.description
            || entry.counterparty_name !== expected.counterparty_name
            || entry.expense_category_id !== expected.expense_category_id || entry.client_id !== expected.client_id
            || entry.competence_on !== expected.competence_on || entry.due_on !== expected.due_on
            || entry.amount_cents !== expected.amount_cents || entry.note !== expected.note
            || entry.recurrence_sequence !== expected.recurrence_sequence
            || entry.recurrence_total !== expected.recurrence_total
            || entry.recurrence_frequency !== expected.recurrence_frequency;
        })) throw new RequestError("Este cadastro já foi processado com dados diferentes. Reabra o formulário para cadastrar outro.", 409);
        return NextResponse.json({ success: true, id: existing[0].id, createdCount: count, alreadyCreated: true });
      }
      const { data, error } = await access.admin.from("xpace_manual_financial_entries").insert(rows).select("id");
      if (error?.code === "23505") throw new RequestError("Este cadastro foi enviado mais de uma vez. Atualize a lista antes de tentar novamente.", 409);
      if (error) throw error;
      return NextResponse.json({ success: true, id: data?.[0]?.id, createdCount: count }, { status: 201 });
    }
    if (body.action === "settleEntry") {
      const entryId = clean(body.entryId, 50);
      const amountCents = Number(body.amountCents);
      const accountId = clean(body.financialAccountId, 50);
      if (!/^[0-9a-f-]{36}$/i.test(entryId) || !isDate(body.settledOn) || body.settledOn > saoPauloDate(new Date().toISOString()) || !Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > 2_147_483_647) throw new RequestError("Revise lançamento, data e valor da baixa.");
      const { data: entry, error: entryError } = await access.admin.from("xpace_manual_financial_entries").select("id").eq("tenant_company_id", access.company.id).eq("id", entryId).maybeSingle();
      if (entryError) throw entryError;
      if (!entry) throw new RequestError("Lançamento manual não encontrado nesta empresa.", 404);
      if (accountId) {
        const { data: account, error: accountError } = await access.admin.from("xpace_financial_accounts").select("id").eq("tenant_company_id", access.company.id).eq("id", accountId).eq("active", true).maybeSingle();
        if (accountError) throw accountError;
        if (!account) throw new RequestError("Conta financeira não encontrada nesta empresa.", 404);
      }
      const { data, error } = await access.admin.from("xpace_manual_financial_settlements").insert({
        tenant_company_id: access.company.id, entry_id: entryId,
        financial_account_id: accountId || null, amount_cents: amountCents,
        settled_on: body.settledOn, note: clean(body.note, 1000) || null,
        created_by: access.user.id,
      }).select("id").single();
      if (error) {
        if (error.message.includes("VALOR DA BAIXA EXCEDE")) throw new RequestError("O valor supera o saldo restante. Atualize a lista e tente novamente.", 409);
        throw error;
      }
      return NextResponse.json({ success: true, id: data.id }, { status: 201 });
    }
    throw new RequestError("Ação financeira inválida.");
  } catch (error) { return handleError(error); }
}

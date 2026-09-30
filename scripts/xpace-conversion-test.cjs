// Local-only regression suite. No customer writes or WhatsApp sends.
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm"),
  ts = require("typescript");
function moduleFrom(file, imports) {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    {
      exports,
      require: (n) => {
        if (n in imports) return imports[n];
        throw Error("Unexpected import " + n);
      },
      Date,
      Intl,
      URL,
      console,
    },
  );
  return exports;
}
const reports = require("../lib/xpace/report-metrics.ts"),
  dashboard = require("../lib/xpace/dashboard-metrics.ts");
const m = moduleFrom("lib/xpace/conversion-metrics.ts", {
  "./report-metrics": reports,
});
const lead = (id, extra = {}) => ({
  id,
  full_name: "ALUNO " + id,
  mobile: null,
  pipeline_stage: "AULA_EXPERIMENTAL",
  linked_student_id: null,
  converted_person_id: null,
  assigned_to: null,
  loss_reason_id: null,
  loss_note: null,
  ...extra,
});
const trial = (id, lead_id, extra = {}) => ({
  id,
  lead_id,
  scheduled_on: "2026-09-20",
  starts_at: "19:00",
  class_name_snapshot: "JAZZ",
  modality_name_snapshot: "JAZZ",
  instructor_name_snapshot: "PREVISTO",
  actual_instructor_name_snapshot: "PROFESSOR REAL",
  attendance_status: "COMPARECEU",
  enrollment_outcome: "PENDENTE",
  survey_status: "PENDENTE",
  whatsapp_opt_in: false,
  whatsapp_legacy_allowed_at: null,
  ...extra,
});
const leads = [
  lead("a"),
  lead("b", { pipeline_stage: "GANHO" }),
  lead("c", { pipeline_stage: "PERDIDO" }),
  lead("existing", { linked_student_id: "person-existing" }),
  lead("duplicate", { converted_person_id: "same" }),
  lead("duplicate2", { converted_person_id: "same" }),
  lead("pending"),
  lead("cancelled"),
  lead("late"),
];
const trials = [
  trial("a1", "a"),
  trial("a2", "a", {
    scheduled_on: "2026-09-21",
    actual_instructor_name_snapshot: "OUTRO",
  }),
  trial("b", "b", { enrollment_outcome: "MATRICULOU" }),
  trial("c", "c", {
    attendance_status: "FALTOU",
    enrollment_outcome: "NAO_MATRICULOU",
  }),
  trial("existing", "existing"),
  trial("d1", "duplicate"),
  trial("d2", "duplicate2"),
  trial("p", "pending", { attendance_status: "AGENDADO" }),
  trial("cancel", "cancelled", { attendance_status: "CANCELADO" }),
  trial("late", "late"),
  trial("late-won", "late", {
    scheduled_on: "2026-10-02",
    enrollment_outcome: "MATRICULOU",
  }),
];
const activity = (id, lead_id, appointment_id, payload, created_at) => ({
  id,
  lead_id,
  appointment_id,
  payload,
  created_at,
});
const activities = [
  activity(
    "1",
    "a",
    null,
    {
      kind: "conversion_followup",
      action: "Antiga",
      dueOn: "2026-09-01",
      status: "PENDENTE",
    },
    "2026-09-21T12:00:00Z",
  ),
  activity(
    "2",
    "a",
    null,
    {
      kind: "conversion_followup",
      action: "Telefonar",
      dueOn: "2026-09-25",
      status: "PENDENTE",
      responsibleId: "team",
    },
    "2026-09-22T12:00:00Z",
  ),
  activity(
    "3",
    "a",
    "a1",
    {
      kind: "conversion_survey",
      response: "NEGATIVA",
      note: "Horário",
      reviewed: false,
    },
    "2026-09-22T12:00:00Z",
  ),
];
const overview = m.buildConversionOverview(
  leads,
  trials,
  activities,
  [],
  "2026-09-01",
  "2026-09-30",
  "2026-09-29",
);
assert.equal(
  overview.funnel.scheduled,
  6,
  "Deduplicate two classes and two leads of same person; exclude existing client and cancelled",
);
assert.equal(overview.funnel.attended, 4);
assert.equal(
  overview.funnel.enrolled,
  2,
  "Enrollment outside selection still resolves follow-up",
);
assert.equal(overview.funnel.mismatches, 1);
assert.equal(overview.queue.length, 2);
assert.equal(overview.queue[0].name, "ALUNO a");
assert.equal(overview.queue[0].followUp.action, "Telefonar");
assert.equal(overview.queue[0].overdue, true);
assert.equal(overview.surveyTotals.negative, 1);
assert.equal(overview.surveyTotals.responded, 1);
assert.equal(
  overview.surveyTotals.sent,
  0,
  "Response does not manufacture sent state",
);
assert.equal(overview.losses[0].name, "Não informado");
assert.equal(overview.losses[0].count, 1);
const teacher = overview.teachers.find((t) => t.name === "PROFESSOR REAL");
assert.equal(teacher.converted, 1);
assert.equal(teacher.sample, "Baixa · coletar dados");
assert.equal(
  teacher.attended,
  4,
  "Same person under same teacher counted once; existing clients excluded",
);
activities.push(
  activity(
    "4",
    "a",
    "a1",
    {
      kind: "conversion_survey",
      response: "NEGATIVA",
      note: "Conversamos",
      reviewed: true,
    },
    "2026-09-23T12:00:00Z",
  ),
);
assert.equal(
  m.buildConversionOverview(
    leads,
    trials,
    activities,
    [],
    "2026-09-01",
    "2026-09-30",
    "2026-09-29",
  ).surveyTotals.negative,
  0,
);
assert.equal(
  m.buildConversionOverview(
    [],
    [],
    [],
    [],
    "2026-09-01",
    "2026-09-30",
    "2026-09-29",
  ).funnel.generalConversionRate,
  null,
);
const samePersonEvents = [
  activity(
    "5",
    "duplicate",
    null,
    {
      kind: "conversion_followup",
      action: "Manter acompanhamento",
      dueOn: "2026-09-30",
      responsibleId: "team",
      status: "PENDENTE",
    },
    "2026-09-29T12:00:00Z",
  ),
];
assert.equal(
  m
    .buildConversionOverview(
      leads,
      trials,
      samePersonEvents,
      [],
      "2026-09-01",
      "2026-09-30",
      "2026-09-29",
    )
    .queue.find((q) => q.name.includes("duplicate")).followUp.action,
  "Manter acompanhamento",
  "Next action survives another lead of the same linked person",
);
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
class AccessError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}
function fakeAdmin(tables) {
  const calls = [];
  let sequence = 0;
  return {
    calls,
    from(table) {
      const call = { table, filters: [], operation: "select" },
        chain = {};
      for (const method of [
        "select",
        "eq",
        "in",
        "order",
        "range",
        "maybeSingle",
        "insert",
      ])
        chain[method] = (...args) => {
          if (method === "insert") {
            call.operation = method;
            call.value = args[0];
          } else if (["eq", "in"].includes(method))
            call.filters.push([method, ...args]);
          else call[method] = args;
          return chain;
        };
      chain.then = (yes, no) => {
        calls.push(call);
        let rows = (tables[table] ?? []).filter((r) =>
          call.filters.every(([method, key, value]) => {
            const actual = key === "payload->>kind" ? r.payload?.kind : r[key];
            return method === "eq" ? actual === value : value.includes(actual);
          }),
        );
        if (call.range) rows = rows.slice(call.range[0], call.range[1] + 1);
        if (call.operation === "insert") {
          const record = {
            ...call.value,
            id: uuid(900 + sequence++),
            created_at: `2026-09-29T12:00:${String(sequence).padStart(2, "0")}Z`,
          };
          (tables[table] ??= []).push(record);
          rows = [record];
        }
        return Promise.resolve({
          data: call.maybeSingle ? (rows[0] ?? null) : rows,
          error: null,
        }).then(yes, no);
      };
      return chain;
    },
  };
}
(async () => {
  const tenant = "xpace",
    lid = uuid(1),
    aid = uuid(2),
    responsible = uuid(3),
    foreign = uuid(4);
  const tables = {
    xpace_leads: [
      { ...lead(lid), tenant_company_id: tenant },
      { ...lead(foreign), tenant_company_id: "dawos" },
    ],
    xpace_lead_appointments: [
      { ...trial(aid, lid), tenant_company_id: tenant },
      { ...trial(uuid(5), foreign), tenant_company_id: "dawos" },
    ],
    profiles: [{ id: responsible, full_name: "ATENDENTE", active: true }],
    company_members: [
      { profile_id: responsible, company_id: tenant, active: true },
    ],
  };
  const admin = fakeAdmin(tables);
  let denied = 0;
  const api = moduleFrom("app/api/xpace/conversion/route.ts", {
    "next/server": {
      NextResponse: {
        json: (body, options) => ({
          body,
          status: options?.status ?? 200,
          headers: options?.headers,
        }),
      },
    },
    "@/lib/server/company-access": {
      AccessError,
      requireCompanyAccess: async () => {
        if (denied) throw new AccessError("Negado", denied);
        return { admin, company: { id: tenant }, profile: { id: responsible } };
      },
      requireCompanyProfile: async (_admin, company, id) => {
        assert.equal(company, tenant);
        if (id !== responsible)
          throw new AccessError("Responsável de outra empresa", 400);
      },
    },
    "@/lib/xpace/dashboard-metrics": dashboard,
    "@/lib/xpace/conversion-metrics": m,
  });
  const get = () =>
      api.GET({
        url: "http://localhost/api/xpace/conversion?from=2026-09-01&to=2026-09-30",
      }),
    post = (body) => api.POST({ json: async () => body });
  let result = await get();
  assert.equal(result.status, 200);
  assert.equal(result.body.overview.queue.length, 1);
  assert.equal(result.headers["Cache-Control"], "private, no-store");
  assert.ok(!JSON.stringify(result.body).includes("ALUNO " + foreign));
  const followup = {
    action: "SAVE_FOLLOWUP",
    leadId: lid,
    nextAction: "Conversar",
    dueOn: "2026-09-30",
    responsibleId: responsible,
    status: "PENDENTE",
    result: "",
  };
  assert.equal((await post(followup)).status, 200);
  result = await get();
  assert.equal(
    result.body.overview.queue[0].followUp.action,
    "Conversar",
    "Persists across reload",
  );
  assert.equal((await post({ ...followup, leadId: foreign })).status, 404);
  assert.equal(
    (await post({ ...followup, responsibleId: foreign })).status,
    400,
  );
  assert.equal((await post({ ...followup, dueOn: "2026-02-30" })).status, 400);
  assert.equal((await post({ ...followup, status: "CONCLUIDA" })).status, 400);
  const survey = {
    action: "SAVE_SURVEY",
    leadId: lid,
    appointmentId: aid,
    response: "NEGATIVA",
    note: "Aula lotada",
    reviewed: false,
  };
  assert.equal((await post(survey)).status, 200);
  result = await get();
  assert.equal(result.body.overview.surveyTotals.negative, 1);
  assert.equal((await post({ ...survey, appointmentId: uuid(5) })).status, 404);
  assert.equal((await post({ ...survey, note: "" })).status, 400);
  assert.equal(
    (await post({ ...survey, note: "Conversei com o aluno", reviewed: true }))
      .status,
    200,
  );
  assert.equal((await get()).body.overview.surveyTotals.negative, 0);
  tables.xpace_lead_appointments[0].attendance_status = "FALTOU";
  assert.equal((await post(survey)).status, 409);
  for (const call of admin.calls) {
    if (["company_members", "profiles"].includes(call.table)) continue;
    if (call.operation === "insert")
      assert.equal(call.value.tenant_company_id, tenant);
    else
      assert.ok(
        call.filters.some(
          ([, key, value]) => key === "tenant_company_id" && value === tenant,
        ),
        call.table + " isolated",
      );
  }
  for (const status of [401, 403]) {
    denied = status;
    assert.equal((await get()).status, status);
    assert.equal((await post(followup)).status, status);
  }
  console.log(
    "PASS: conversion identities, funnel, missing values, teacher samples, follow-up persistence, survey responses, consent unchanged and tenant/role isolation.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function load(file, imports = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    exports, Date, Intl, Number, Set, Map,
    require(name) {
      if (imports[name]) return imports[name];
      throw new Error("Unexpected import " + name);
    },
  });
  return exports;
}

const commercial = load("lib/saas/commercial.ts");
const billing = load("lib/saas/billing-cycle.ts", { "./commercial": commercial });
const { measureStudents } = load("lib/saas/student-measurement.ts", {
  "./commercial": commercial,
  "./billing-cycle": billing,
});
const tenant = "school-a";
const record = (date, activeStudents = 50, source = "DAY_CLOSE") => ({
  tenantCompanyId: tenant, date, activeStudents, source,
});
const input = (overrides = {}) => ({
  tenantCompanyId: tenant,
  period: "2026-10",
  metric: "ACTIVE_STUDENTS",
  records: [record("2026-10-31")],
  asOf: new Date("2026-11-01T03:00:00.000Z"),
  ...overrides,
});
const completeMonth = (period, days, count = 50) => Array.from({ length: days }, (_, index) =>
  record(`${period}-${String(index + 1).padStart(2, "0")}`, count));

test("active-at-close is a preview, preserves the 50/51 band boundary and never charges", () => {
  for (const [count, monthlyCents] of [[0, 9900], [50, 9900], [51, 14900]]) {
    const result = measureStudents(input({ records: [record("2026-10-31", count)] }));
    assert.equal(result.complete, true);
    assert.equal(result.billableStudents, count);
    assert.equal(result.numerator, count);
    assert.equal(result.denominator, 1);
    assert.equal(result.canCharge, false);
    assert.equal(result.kind, "PREVIEW");
    assert.equal(result.blockers.length, 0);
    assert.equal(commercial.quoteMonthly(commercial.emptyPricebook(), tenant, "owner", result.billableStudents, []).monthlyCents, monthlyCents);
  }
});

test("active-at-close does not use the previous close or a last-day observation", () => {
  const result = measureStudents(input({ records: [record("2026-10-30", 51), record("2026-10-31", 70, "OBSERVATION")] }));
  assert.equal(result.complete, false);
  assert.equal(result.billableStudents, null);
  assert.equal(result.numerator, null);
  assert.equal(result.coverage.missingDates.join(","), "2026-10-31");
  assert.equal(result.coverage.ignoredObservations, 1);
  assert.match(result.blockers.join(" "), /REGISTRO EXATO/);
});

test("pending metric remains pending even with complete historical data; no implicit default", () => {
  const result = measureStudents(input({ metric: "PENDING", records: completeMonth("2026-10", 31) }));
  assert.equal(result.complete, false);
  assert.equal(result.billableStudents, null);
  assert.equal(result.numerator, null);
  assert.equal(result.canCharge, false);
  assert.match(result.blockers.join(" "), /DEFINIR QUAIS ALUNOS/);
  assert.throws(() => measureStudents(input({ metric: undefined })));
  assert.throws(() => measureStudents(input({ metric: "UNKNOWN" })));
});

test("daily average needs every closing record and returns an exact unrounded ratio", () => {
  const records = completeMonth("2026-10", 31);
  records[30] = record("2026-10-31", 51);
  const result = measureStudents(input({ metric: "DAILY_AVERAGE", records }));
  assert.equal(result.complete, true);
  assert.equal(result.coverage.expectedDays, 31);
  assert.equal(result.coverage.coveredDays, 31);
  assert.equal(result.numerator, 1551);
  assert.equal(result.denominator, 31);
  assert.equal(result.billableStudents, null);
  assert.equal(result.canCharge, false);
  assert.match(result.blockers.join(" "), /ARREDONDAMENTO/);
  const integral = measureStudents(input({ metric: "DAILY_AVERAGE", records: completeMonth("2026-10", 31, 51) }));
  assert.equal(integral.numerator, 1581);
  assert.equal(integral.billableStudents, null);
  assert.match(integral.blockers.join(" "), /ARREDONDAMENTO/);
});

test("leap February and ordinary February require exactly their real calendar days", () => {
  for (const [period, days, asOf] of [
    ["2028-02", 29, "2028-03-01T03:00:00Z"],
    ["2026-02", 28, "2026-03-01T03:00:00Z"],
  ]) {
    const result = measureStudents(input({ period, metric: "DAILY_AVERAGE", records: completeMonth(period, days, 51), asOf: new Date(asOf) }));
    assert.equal(result.complete, true);
    assert.equal(result.numerator, days * 51);
    assert.equal(result.denominator, days);
    assert.equal(result.coverage.expectedDays, days);
  }
  assert.throws(() => measureStudents(input({ period: "2026-02", records: [record("2026-02-29")], asOf: new Date("2026-03-01T03:00:00Z") })));
});

test("missing daily closes cannot be filled by observations or treated as zero", () => {
  const records = completeMonth("2026-10", 31).filter(item => item.date !== "2026-10-10");
  records.push(record("2026-10-10", 500, "OBSERVATION"));
  const result = measureStudents(input({ metric: "DAILY_AVERAGE", records }));
  assert.equal(result.complete, false);
  assert.equal(result.numerator, null);
  assert.equal(result.denominator, null);
  assert.equal(result.billableStudents, null);
  assert.equal(result.coverage.coveredDays, 30);
  assert.equal(result.coverage.missingDates.join(","), "2026-10-10");
  assert.match(result.blockers.join(" "), /NÃO RECONSTRUIR/);
});

test("observation may coexist with a close but is never included in its count or average", () => {
  const result = measureStudents(input({ metric: "DAILY_AVERAGE", records: [
    ...completeMonth("2026-10", 31), record("2026-10-31", 900, "OBSERVATION"),
  ] }));
  assert.equal(result.complete, true);
  assert.equal(result.numerator, 1550);
  assert.equal(result.denominator, 31);
  assert.equal(result.coverage.ignoredObservations, 1);
});

test("trusted clock uses Brasília, not the host timezone or the UTC month boundary", () => {
  const beforeClose = measureStudents(input({ records: [], asOf: new Date("2026-11-01T02:59:59.999Z") }));
  assert.equal(beforeClose.asOfDate, "2026-10-31");
  assert.equal(beforeClose.periodClosed, false);
  assert.equal(beforeClose.complete, false);
  assert.match(beforeClose.blockers.join(" "), /BRASÍLIA/);
  const afterClose = measureStudents(input());
  assert.equal(afterClose.asOfDate, "2026-11-01");
  assert.equal(afterClose.periodClosed, true);
  assert.equal(afterClose.complete, true);
  assert.throws(() => measureStudents(input({ asOf: undefined })));
  assert.throws(() => measureStudents(input({ asOf: new Date("invalid") })));
});

test("future/current month remains incomplete and a premature DAY_CLOSE is rejected", () => {
  const result = measureStudents(input({ records: [], asOf: new Date("2026-10-01T03:00:00Z") }));
  assert.equal(result.periodClosed, false);
  assert.equal(result.complete, false);
  assert.equal(result.billableStudents, null);
  const future = measureStudents(input({ period: "2026-11", records: [], asOf: new Date("2026-10-31T03:00:00Z") }));
  assert.equal(future.periodClosed, false);
  assert.equal(future.complete, false);
  assert.equal(future.billableStudents, null);
  assert.equal(future.coverage.missingDates.join(","), "2026-11-30");
  assert.throws(() => measureStudents(input({ records: [record("2026-10-31")], asOf: new Date("2026-11-01T02:59:59Z") })), /PREMATURO/);
  assert.throws(() => measureStudents(input({ records: [record("2026-10-02")], asOf: new Date("2026-10-01T03:00:00Z") })), /FUTURO/);
});

test("cross-tenant, duplicate, out-of-period and invalid counts/sources are rejected", () => {
  assert.throws(() => measureStudents(input({ records: [{ ...record("2026-10-31"), tenantCompanyId: "school-b" }] })), /OUTRA EMPRESA/);
  assert.throws(() => measureStudents(input({ records: [record("2026-10-31"), record("2026-10-31")] })), /DUPLICADO/);
  assert.throws(() => measureStudents(input({ records: [record("2026-10-31", 50, "OBSERVATION"), record("2026-10-31", 51, "OBSERVATION")] })), /DUPLICADO/);
  for (const date of ["2026-09-30", "2026-11-01", "2026-10-32", "2026-10-1"]) {
    assert.throws(() => measureStudents(input({ records: [record(date)] })), /COMPETÊNCIA/);
  }
  for (const count of [-1, 1.5, NaN, Infinity, "50", Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => measureStudents(input({ records: [record("2026-10-31", count)] })), /QUANTIDADE/);
  }
  assert.throws(() => measureStudents(input({ records: [record("2026-10-31", 50, "IMPORTED")] })), /ORIGEM/);
  assert.throws(() => measureStudents(input({ period: "2026-13", records: [] })), /COMPETÊNCIA/);
});

test("daily totals never silently lose integer precision and input records are not mutated", () => {
  const records = completeMonth("2026-10", 31, Number.MAX_SAFE_INTEGER);
  assert.throws(() => measureStudents(input({ metric: "DAILY_AVERAGE", records })), /LIMITE SEGURO/);
  const original = Object.freeze([Object.freeze(record("2026-10-31", 51))]);
  assert.equal(measureStudents(input({ records: original })).billableStudents, 51);
  assert.equal(original[0].activeStudents, 51);
});

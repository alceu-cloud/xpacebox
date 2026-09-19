const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const output = ts.transpileModule(fs.readFileSync('lib/xpace/billing.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const box = { exports: {} };
vm.runInNewContext(output, box);

test('daily cycle advances one calendar day across a month boundary', () => {
  assert.equal(box.exports.nextBillingDate('2026-01-31', 1, 'DIARIO'), '2026-02-01');
});

test('monthly cycle keeps the existing month-aware billing behavior', () => {
  assert.equal(box.exports.nextBillingDate('2026-01-31', 1, 'MENSAL'), '2026-02-28');
});

test('daily plans create one financial item for each day in the active term', async () => {
  const submitted = [];
  const admin = {
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }) }),
      upsert: async (rows) => { submitted.push(...rows); return { error: null }; },
    }),
  };
  await box.exports.ensureContractCharges(admin, 'tenant', {
    id: 'contract', student_id: 'student', starts_on: '2026-09-19', first_due_on: '2026-09-19', ends_on: '2026-09-21',
    billing_interval_snapshot: 'DIARIO', duration_months_snapshot: 1, base_amount_cents: 1000, amount_cents: 950,
    benefit_name_snapshot: null, discount_type_snapshot: 'PERCENTUAL', discount_value_snapshot: 500,
    renews_automatically: true, status: 'ATIVO', cancel_effective_on: null,
  });
  assert.deepEqual(submitted.map((row) => [row.competence_on, row.due_on]), [
    ['2026-09-19', '2026-09-19'], ['2026-09-20', '2026-09-20'], ['2026-09-21', '2026-09-21'],
  ]);
});

test('daily plans only emit charges missing after the latest daily item', async () => {
  const submitted = [];
  const admin = {
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: { competence_on: '2026-09-20' }, error: null }) }) }) }) }) }),
      upsert: async (rows) => { submitted.push(...rows); return { error: null }; },
    }),
  };
  await box.exports.ensureContractCharges(admin, 'tenant', {
    id: 'contract', student_id: 'student', starts_on: '2026-09-19', first_due_on: '2026-09-19', ends_on: '2026-09-21',
    billing_interval_snapshot: 'DIARIO', duration_months_snapshot: 1, base_amount_cents: 1000, amount_cents: 950,
    benefit_name_snapshot: null, discount_type_snapshot: 'PERCENTUAL', discount_value_snapshot: 500,
    renews_automatically: true, status: 'ATIVO', cancel_effective_on: null,
  });
  assert.deepEqual(submitted.map((row) => [row.competence_on, row.due_on]), [['2026-09-21', '2026-09-21']]);
});

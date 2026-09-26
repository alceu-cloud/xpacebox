const assert = require('node:assert/strict');
const { addMonthsToDay, ageBand, ageOn, contractedRevenueForMonthCents, leadCohortDay, lifecycleForMonth, monthKeys, nextBirthday, percent, saleValueCents, validDay } = require('../lib/xpace/dashboard-metrics.ts');

assert.equal(validDay('2026-02-30'), false);
assert.equal(validDay('2024-02-29'), true);
assert.equal(addMonthsToDay('2026-01-31', 1), '2026-02-28');
assert.deepEqual(monthKeys('2026-01-01', '2026-04-30'), ['2026-01', '2026-02', '2026-03', '2026-04']);
assert.equal(leadCohortDay({ created_at: '2026-09-21T15:00:00Z', legacy_payload: { Data: '2026-03-02' } }), '2026-03-02');
assert.equal(ageOn('2014-10-01', '2026-09-26'), 11);
assert.equal(ageBand(8), '5–8');
assert.equal(ageBand(9), '9–12');
assert.equal(nextBirthday('2000-02-29', '2026-02-01'), '2026-02-28');
assert.equal(percent(117, 426), 27.5);
assert.equal(percent(0, 0), null);
const history = [
  { student_id: 'a', starts_on: '2026-01-01', ends_on: '2026-09-10', cancel_effective_on: null, cancelled_at: null },
  { student_id: 'b', starts_on: '2026-01-01', ends_on: '2026-12-31', cancel_effective_on: null, cancelled_at: null },
];
assert.equal(lifecycleForMonth(history, '2026-09', '2026-09-26').activeAtStart, 2);
assert.equal(lifecycleForMonth(history, '2026-09', '2026-09-26').exits.length, 1);
assert.equal(lifecycleForMonth(history, '2026-09', '2026-09-26').churn, 50);
assert.equal(lifecycleForMonth(history, '2026-08', '2026-09-26').churn, 0);
const annual = { student_id: 'a', starts_on: '2026-01-01', ends_on: '2026-12-31', cancel_effective_on: null, cancelled_at: null, amount_cents: 120000, billing_interval_snapshot: 'ANUAL', duration_months_snapshot: 12 };
const monthly = { ...annual, amount_cents: 10000, billing_interval_snapshot: 'MENSAL' };
assert.equal(saleValueCents(annual), 120000);
assert.equal(contractedRevenueForMonthCents(annual, '2026-03'), 10000);
assert.equal(saleValueCents(monthly), 120000);
assert.equal(contractedRevenueForMonthCents(monthly, '2026-03'), 10000);
assert.equal(contractedRevenueForMonthCents(annual, '2025-12'), 0);
console.log('XPACE dashboard metrics passed.');

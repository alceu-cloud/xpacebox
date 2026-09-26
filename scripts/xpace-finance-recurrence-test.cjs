const assert = require('node:assert/strict');
const { shiftedFinanceDate } = require('../lib/xpace/finance-recurrence.ts');

assert.deepEqual(
  Array.from({ length: 12 }, (_, index) => shiftedFinanceDate('2026-01-31', 'MENSAL', index)),
  ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31', '2026-06-30', '2026-07-31', '2026-08-31', '2026-09-30', '2026-10-31', '2026-11-30', '2026-12-31'],
);
assert.equal(shiftedFinanceDate('2024-02-29', 'ANUAL', 1), '2025-02-28');
assert.equal(shiftedFinanceDate('2026-12-31', 'DIARIA', 1), '2027-01-01');
assert.equal(shiftedFinanceDate('2026-11-30', 'BIMESTRAL', 1), '2027-01-30');
assert.equal(shiftedFinanceDate('2026-01-31', 'TRIMESTRAL', 1), '2026-04-30');
assert.equal(shiftedFinanceDate('2026-01-31', 'SEMESTRAL', 1), '2026-07-31');
assert.throws(() => shiftedFinanceDate('2026-02-30', 'MENSAL', 0));
assert.throws(() => shiftedFinanceDate('2026-01-31', 'UNICA', 1));
console.log('XPACE finance recurrence dates passed.');

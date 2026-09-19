const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const output = ts.transpileModule(fs.readFileSync('lib/xpace/asaas-cancellation.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const box = { exports: {}, Set, Error };
vm.runInNewContext(output, box);
const { cancelPendingPayment } = box.exports;
const id = 'pay_test';
test('pending charge is read and deleted only after provider confirmation', async () => {
  const calls = [];
  const result = await cancelPendingPayment(id, async (path, method) => { calls.push(method); return method === 'GET' ? { id, status: 'PENDING' } : { id, deleted: true }; });
  assert.equal(result.deleted, true); assert.deepEqual(calls, ['GET', 'DELETE']);
});
for (const status of ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH']) test(`${status} is preserved without a delete or refund`, async () => {
  await cancelPendingPayment(id, async (_, method) => { assert.equal(method, 'GET'); return { id, status }; });
});
test('already deleted is idempotent', async () => {
  await cancelPendingPayment(id, async (_, method) => { assert.equal(method, 'GET'); return { id, deleted: true }; });
});
test('timeout after accepted deletion reconciles without deleting twice', async () => {
  let reads = 0; let deletes = 0;
  const result = await cancelPendingPayment(id, async (_, method) => {
    if (method === 'DELETE') { deletes++; throw new Error('timeout'); }
    return ++reads === 1 ? { id, status: 'PENDING' } : { id, deleted: true };
  });
  assert.equal(deletes, 1); assert.equal(result.deleted, true);
});
test('payment winning the cancellation race remains a receipt', async () => {
  let reads = 0;
  const result = await cancelPendingPayment(id, async (_, method) => {
    if (method === 'DELETE') throw new Error('already paid');
    return { id, status: ++reads === 1 ? 'PENDING' : 'RECEIVED', value: 295 };
  });
  assert.equal(result.status, 'RECEIVED'); assert.equal(result.deleted, undefined);
});
test('404 is not assumed to be cancellation success', async () => {
  await assert.rejects(cancelPendingPayment(id, async () => { throw new Error('404'); }), /404/);
});
test('unsupported financial state does not cause deletion', async () => {
  await assert.rejects(cancelPendingPayment(id, async (_, method) => { assert.equal(method, 'GET'); return { id, status: 'REFUNDED' }; }), /REVISÃO/);
});
test('unconfirmed deletion remains an error for a durable retry', async () => {
  await assert.rejects(cancelPendingPayment(id, async (_, method) => method === 'GET' ? { id, status: 'PENDING' } : { id, deleted: false }), /NÃO CONFIRMOU/);
});

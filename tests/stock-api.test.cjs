// Isolated API authorization/tenant contracts. No real credentials or database.
const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript'), vm = require('node:vm');
function load(file, imports) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, require: name => { if (name in imports) return imports[name]; throw Error(name); }, Request, Response, URL, Date, Map, Set, Intl, console: { error() {} } });
  return exports;
}
class AccessError extends Error { constructor(message, status) { super(message); this.status = status; } }
const next = { NextResponse: { json: (payload, init) => Response.json(payload, init) } };
const helpers = load('lib/server/xpace-stock.ts', { 'server-only': {}, 'next/server': next, '@/lib/server/company-access': { AccessError } });
const stock = load('lib/xpace/stock.ts', {});
const company = '00000000-0000-4000-8000-000000000001', actor = '00000000-0000-4000-8000-000000000002', product = '00000000-0000-4000-8000-000000000003';
let role = 'company_manager', accessDenied = false, calls = [], rpcCalls = [];
const admin = {
  from(table) {
    const call = { table, filters: [], changes: null }; calls.push(call);
    const chain = { select() { return chain; }, eq(...filter) { call.filters.push(filter); return chain; }, order() { return chain; }, range() { return chain; }, ilike() { return chain; }, in() { return chain; }, limit() { return chain; }, update(row) { call.changes = row; return chain; }, insert(row) { call.changes = row; return chain; }, delete() { return chain; }, single() { return chain; }, maybeSingle() { return chain; }, then(resolve, reject) {
      const data = table === 'xpace_stock_settings' ? { alert_phone: 'fixture-only' } : call.changes ? { id: product } : table === 'xpace_stock_products' ? [{ id: product, description: 'PRODUTO', cost_price_cents: 123, sale_price_cents: 500, category_id: company, unit_id: company, controls_stock: true, minimum_stock: 5, stock_quantity: 5, code: '00123', code_mode: 'EXTERNAL', image_path: '', active: true }] : [];
      return Promise.resolve({ data, error: null, count: 1 }).then(resolve, reject);
    } }; return chain;
  },
  async rpc(name, args) { rpcCalls.push({ name, args }); return { data: { stockQuantity: 4, movementId: product }, error: null }; },
  storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: 'fixture' } }) }) }
};
const route = load('app/api/xpace/estoque/route.ts', { 'node:crypto': require('node:crypto'), 'next/server': next, '@/lib/server/company-access': { async requireCompanyAccess(request, slug) { assert.equal(slug, 'xpace'); if (accessDenied) throw new AccessError('SEM ACESSO', 403); return { admin, user: { id: actor }, profile: { platform_role: role }, company: { id: company } }; } }, '@/lib/server/xpace-stock': helpers, '@/lib/xpace/stock': stock });
const post = body => route.POST(new Request('http://fixture.test/api/xpace/estoque', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
const movement = { action: 'MOVE', productId: product, requestId: '00000000-0000-4000-8000-000000000004', direction: 'SAIDA', quantity: 1, tenant_company_id: 'forged', actor: 'forged' };
(async () => {
  const manager = await route.GET(new Request('http://fixture.test/api/xpace/estoque?code=00123'));
  const result = await manager.json(); assert.equal(result.products[0].costPriceCents, 123); assert.equal(result.alertConfigured, true); assert.equal(JSON.stringify(result).includes('fixture-only'), false, 'Alert recipient is never exposed');
  assert.ok(calls.every(call => call.filters.some(([column,value]) => column === 'tenant_company_id' && value === company)));
  role = 'employee'; calls = [];
  const employee = await (await route.GET(new Request('http://fixture.test/api/xpace/estoque'))).json();
  assert.equal(employee.canManage, false); assert.equal(employee.products[0].costPriceCents, null, 'Cost visible only to managers');
  for (const action of ['SAVE_PRODUCT', 'SAVE_CATEGORY', 'SAVE_UNIT', 'SET_ACTIVE', 'DELETE_LOOKUP']) assert.equal((await post({ action })).status, 403);
  assert.equal((await post(movement)).status, 200);
  assert.equal(rpcCalls[0].args.p_tenant, company); assert.equal(rpcCalls[0].args.p_actor, actor); assert.equal(rpcCalls[0].name, 'xpace_move_stock');
  for (const quantity of [0, -1, 0.0001, 'NaN', null]) assert.equal((await post({ ...movement, quantity })).status, 400);
  assert.equal(rpcCalls.length, 1, 'Invalid inputs never reach RPC');
  accessDenied = true;
  assert.equal((await post(movement)).status, 403); assert.equal((await route.GET(new Request('http://fixture.test/api/xpace/estoque'))).status, 403);
  accessDenied = false; role = 'company_manager'; calls = [];
  assert.equal((await post({ action: 'SAVE_PRODUCT', product: { id: product, description: 'NOVO', costPriceCents: 100, salePriceCents: 500, controlsStock: true, minimumStock: 5, categoryId: company, unitId: company, codeMode: 'EXTERNAL', code: '00123', stock_quantity: 999, stockQuantity: 999, tenant_company_id: 'forged' } })).status, 200);
  const update = calls.at(-1); assert.equal(update.changes.code, '00123'); assert.equal('stock_quantity' in update.changes, false); assert.equal('stockQuantity' in update.changes, false); assert.ok(update.filters.some(([key,value]) => key === 'tenant_company_id' && value === company));
  console.log('PASS stock API: authenticated XPACE scope, catalog manager-only, costs/recipient privacy, movement actor/tenant trusted, exact codes, ledger-only balances and invalid-input rejection.');
})().catch(error => { console.error(error); process.exitCode = 1; });

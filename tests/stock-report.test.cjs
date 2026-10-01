const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript'), vm = require('node:vm');
function load(file, imports) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, require: name => { if (name in imports) return imports[name]; throw Error(name); }, Request, Response, URL, URLSearchParams, Date, Map, Set, console: { error() {} } });
  return exports;
}
class AccessError extends Error { constructor(message, status) { super(message); this.status = status; } }
const next = { NextResponse: { json: (payload, init) => Response.json(payload, init) } };
const helpers = load('lib/server/xpace-stock.ts', { 'server-only': {}, 'next/server': next, '@/lib/server/company-access': { AccessError } });
const report = load('lib/xpace/stock-report.ts', {});
const parse = query => report.stockReportFilters(new URLSearchParams(query));
const range = parse('from=2026-10-01&to=2026-10-01');
assert.equal(new Date(range.since).toISOString(), '2026-10-01T03:00:00.000Z');
assert.equal(range.until, '2026-10-02T03:00:00.000Z');
assert.equal(parse('from=2024-02-29&to=2024-02-29').until, '2024-03-01T03:00:00.000Z');
for (const query of ['from=2026-02-29&to=2026-03-01', 'from=2026-11-31&to=2026-12-01', 'from=2026-10-02&to=2026-10-01', 'from=2026-10-01&to=2026-10-01&page=0', 'from=2026-10-01&to=2026-10-01&direction=DELETE', 'from=2026-10-01']) assert.throws(() => parse(query));
assert.equal(report.stockReportSearch('100%_\\'), '%100\\%\\_\\\\%');
let role = 'company_manager', denied = false, calls = [];
const company = 'fixture-company';
const admin = { from(table) {
  const call = { table, filters: [], orders: [] }; calls.push(call);
  const chain = { select(columns) { call.columns = columns; return chain; }, eq(...args) { call.filters.push(args); return chain; }, gte(...args) { call.since = args; return chain; }, lt(...args) { call.until = args; return chain; }, ilike(...args) { call.filters.push(args); return chain; }, order(...args) { call.orders.push(args); return chain; }, range(...args) { call.range = args; return chain; }, in() { return chain; }, then(resolve, reject) {
    const data = table === 'xpace_stock_units' ? [{ id: 'fixture-unit', abbreviation: 'UN' }] : [{ id: 'fixture-movement', product_id: 'fixture-product', product: { description: 'Produto arquivado', code: 'XP-OWN', unit_id: 'fixture-unit' }, direction: 'SAIDA', quantity: '2.000', stock_before: '5.000', stock_after: '3.000', actor_id: 'fixture-actor', actor_name: 'Nome no momento do lançamento', created_at: '2026-10-02T02:59:59Z', note: 'Consumo interno' }];
    return Promise.resolve({ data, error: null, count: 51 }).then(resolve, reject);
  } }; return chain;
} };
const route = load('app/api/xpace/estoque/relatorio/route.ts', { 'next/server': next, '@/lib/server/company-access': { async requireCompanyAccess(_request, slug) { assert.equal(slug, 'xpace'); if (denied) throw new AccessError('SEM ACESSO', 403); return { admin, company: { id: company }, profile: { platform_role: role } }; } }, '@/lib/server/xpace-stock': helpers, '@/lib/xpace/stock-report': report });
const get = query => route.GET(new Request(`http://fixture.test/api/xpace/estoque/relatorio?${query}`));
(async () => {
  const response = await get('from=2026-10-01&to=2026-10-01&direction=SAIDA&actor=Nome&product=100%25&page=2&tenant_company_id=forged');
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  const data = await response.json();
  assert.equal(data.items[0].actor, 'Nome no momento do lançamento'); assert.equal(data.items[0].actorId, 'fixture-actor'); assert.equal(data.items[0].quantity, 2); assert.equal(data.items[0].unit, 'UN'); assert.equal(data.total, 51); assert.equal(data.pages, 2);
  assert.ok(calls.every(call => call.filters.some(([key, value]) => key === 'tenant_company_id' && value === company)));
  assert.deepEqual(calls[0].range, [50, 99]); assert.equal(calls[0].orders[1][0], 'id');
  assert.ok(calls[0].filters.some(([key, value]) => key === 'product.description' && value === '%100\\%%'));
  assert.equal(calls[0].filters.some(([key]) => key === 'active'), false, 'Archived products retain history');
  assert.equal(calls[0].columns.includes('cost_price'), false);
  role = 'employee'; calls = []; assert.equal((await get('from=2026-10-01&to=2026-10-01')).status, 403); assert.equal(calls.length, 0);
  role = 'platform_owner'; assert.equal((await get('from=2026-10-01&to=2026-10-01')).status, 200);
  denied = true; calls = []; assert.equal((await get('from=2026-10-01&to=2026-10-01')).status, 403); assert.equal(calls.length, 0);
  denied = false; assert.equal((await get('from=bad&to=2026-10-01')).status, 400);
  console.log('PASS stock report: manager-only scope, original actor, inclusive local dates, archived history, filters and pagination.');
})().catch(error => { console.error(error); process.exitCode = 1; });

const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const { linkHubAddon, linkHubSections, publicLinkHubPath, validateLinkHubLinks } = require('../lib/saas/link-hub.ts');
const rules = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/saas/commercial.ts','utf8'), {
  compilerOptions: { module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022 },
}).outputText, { exports:rules, Set });
const { addonCodes, quoteMonthly, emptyPricebook } = rules;
const link = (changes = {}) => ({ code: 'CONTRACTS', title: 'Comprar plano', url: 'https://shop.school.com/planos', ...changes });

test('new catalog preparation fixes R$19.90 and four requested destinations', () => {
  assert.equal(linkHubAddon.monthlyCents, 1990);
  assert.equal(linkHubAddon.status, 'PREPARATION');
  assert.deepEqual(linkHubSections.map(s => s.code), ['CONTRACTS','PRODUCTS','EVENTS','TRIAL_BOOKING']);
  assert.equal(publicLinkHubPath('xpace'), '/links/xpace');
  assert.equal(publicLinkHubPath('outra-escola'), '/links/outra-escola');
  for (const slug of ['', '../xpace', 'XPACE', 'a/b', 'a?x=1', 'a%2fb', '-xpace', 'xpace-', 'a'.repeat(81)]) assert.throws(() => publicLinkHubPath(slug));
});

test('preparation does not silently add a paid addon to old preferences or quotes', () => {
  assert.equal(addonCodes.includes('LINK_HUB'), false);
  assert.throws(() => quoteMonthly(emptyPricebook(), 'school', 'xpace', 51, ['LINK_HUB']));
  assert.equal(quoteMonthly(emptyPricebook(), 'xpace', 'xpace', 51, ['WHATSAPP']).monthlyCents, 0);
  assert.equal(quoteMonthly(emptyPricebook(), 'school', 'xpace', 51, ['WHATSAPP']).monthlyCents, 29900);
});

test('safe HTTPS destinations are normalized without mutating input or fetching', () => {
  const input = [link({ title: '  Comprar plano  ' }), link({code:'TRIAL_BOOKING',title:'Agendar aula',url:'https://www.xpacebox.com.br/aula-experimental'})];
  const before = structuredClone(input);
  assert.deepEqual(validateLinkHubLinks(input), [link(), input[1]]);
  assert.deepEqual(input, before);
  assert.deepEqual(validateLinkHubLinks([]), []);
});

test('unsafe protocol, credentials, local IPs/networks and private endpoints are refused', () => {
  for (const url of ['javascript:alert(1)','data:text/html,test','http://school.com','https://user:pass@school.com',
    'https://school.com:8443','https://localhost','https://school.local','https://intranet.internal','https://127.0.0.1',
    'https://2130706433','https://0x7f000001','https://[::1]','https://school.com/api/test','https://school.com/admin',
    'https://school.com/?access_token=secret','https://school.com/?Client_Token=secret','https://school.com\\@evil.com',
    ' https://school.com','https://school.com\n']) assert.throws(() => validateLinkHubLinks([link({url})]), url);
});

test('malformed/duplicate links and injected fields fail closed', () => {
  for (const input of [null,{},[null],[[]],[link(),link()],[link({code:'UNKNOWN'})],
    [link({title:''})],[link({title:'a'.repeat(81)})],[link({title:'x\n'})],[link({companyId:'other'})],
    [link({html:'<script>alert(1)</script>'})],Array.from({length:5},()=>link())]) assert.throws(() => validateLinkHubLinks(input));
});

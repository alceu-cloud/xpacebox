const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const exported = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/server/zapi-client.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: exported, URL, AbortSignal, fetch, Date, Set, Buffer });
const credentials = { instanceId: 'i'.repeat(32), instanceToken: 't'.repeat(24), clientToken: 'c'.repeat(32) };
const now = Date.now();
const base = { instanceId: credentials.instanceId, phone: '5511999999999', ids: ['provider_1'], momment: now, type: 'MessageStatusCallback', isGroup: false };

test('IDs returned by send are acceptance only; text uses official endpoint', async () => {
  const client = exported.createZapiClient(credentials, async (url, options) => {
    assert.match(url, /https:\/\/api\.z-api\.io\/instances\/.+\/send-text$/);
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers['Client-Token'], credentials.clientToken);
    return Response.json({ messageId: 'provider_1', zaapId: 'alias_1' });
  });
  const result = await client.send({ destination_phone: base.phone, body: 'test' });
  assert.equal(result.messageId, 'provider_1'); assert.equal(result.delivered, undefined);
});

test('receipt diagnostics are read-only, scoped to the private callback and expose no secrets', async () => {
  const secret = 's'.repeat(43), url = 'https://www.xpacebox.com.br/api/xpace/message-connector/zapi/webhook/' + secret;
  const client = exported.createZapiClient(credentials, async (endpoint, options) => {
    assert.match(endpoint, /\/me$/); assert.equal(options.method, 'GET'); assert.equal(options.body, undefined);
    return Response.json({ token: 'private-token', deliveryCallbackUrl: url, messageStatusCallbackUrl: url,
      receivedCallbackUrl: 'https://atendimento-xpace.onrender.com/webhook', callbackTypeFilters: ['FILTER_MESSAGE_STATUS_CALLBACK'] });
  });
  const result = await client.receiptConfiguration(secret);
  assert.equal(result.sendingConfigured, true); assert.equal(result.statusConfigured, true);
  assert.equal(result.statusIgnored, true); assert.equal(result.botPreserved, true);
  assert.equal(JSON.stringify(result).includes(secret), false); assert.equal(JSON.stringify(result).includes('private-token'), false);
  const mismatch = await client.receiptConfiguration('different-secret');
  assert.equal(mismatch.sendingConfigured, false); assert.equal(mismatch.statusConfigured, false);
});
test('video requires Cloudinary HTTPS and async-success shortcut is off', async () => {
  let calls = 0;
  const client = exported.createZapiClient(credentials, async (url, options) => {
    calls++; assert.match(url, /send-video$/); assert.equal(JSON.parse(options.body).async, false);
    return Response.json({ messageId: 'video_1' });
  });
  await assert.rejects(client.send({ destination_phone: base.phone, body: 'test', mediaUrl: 'https://other.invalid/video.mp4' }), /ZAPI_MEDIA_INVALID/);
  assert.equal(calls, 0);
  await client.send({ destination_phone: base.phone, body: 'test', mediaUrl: 'https://res.cloudinary.com/demo/video/upload/test.mp4' });
});
test('network error is sanitized, ambiguous and not retried', async () => {
  let calls = 0;
  const client = exported.createZapiClient(credentials, async () => { calls++; throw new Error('private-data'); });
  await assert.rejects(client.send({ destination_phone: base.phone, body: 'test' }), error => error.code === 'ZAPI_NETWORK_OR_TIMEOUT' && error.ambiguous && !error.message.includes('private-data'));
  assert.equal(calls, 1);
});
test('missing ID cannot produce successful acceptance', async () => {
  const client = exported.createZapiClient(credentials, async () => Response.json({}));
  await assert.rejects(client.send({ destination_phone: base.phone, body: 'test' }), /ZAPI_NO_CONFIRMATION/);
});
test('status mappings separate acceptance, delivery and reading', () => {
  for (const [status, expected] of [['SENT','ACCEPTED'],['RECEIVED','DELIVERED'],['READ','READ']]) assert.equal(exported.parseZapiEvent({ ...base, status }, credentials.instanceId, now).state, expected);
});
test('school own reading, groups and wrong instance do not create delivery', () => {
  assert.equal(exported.parseZapiEvent({ ...base, status: 'READ_BY_ME' }, credentials.instanceId, now), null);
  assert.equal(exported.parseZapiEvent({ ...base, status: 'READ', isGroup: true }, credentials.instanceId, now), null);
  assert.equal(exported.parseZapiEvent({ ...base, status: 'READ', instanceId: 'other' }, credentials.instanceId, now), null);
});
test('DeliveryCallback is not delivery to contact; error details are sanitized', () => {
  const payload = { ...base, type: 'DeliveryCallback', messageId: 'provider_1' };
  assert.equal(exported.parseZapiEvent(payload, credentials.instanceId, now).state, 'ACCEPTED');
  const failed = exported.parseZapiEvent({ ...payload, error: 'private-data', errorCode: 'SHADOW_BAN' }, credentials.instanceId, now);
  assert.equal(failed.state, 'ERROR'); assert.equal(failed.errorCode, 'ZAPI_SHADOW_BAN'); assert.equal(JSON.stringify(failed).includes('private-data'), false);
});
test('Brazilian mobile callbacks match with or without ninth digit, but landlines remain distinct', () => {
  assert.equal(exported.canonicalZapiPhone('5547999110328'), exported.canonicalZapiPhone('554799110328'));
  assert.equal(exported.canonicalZapiPhone('554733110328'), '554733110328');
  assert.notEqual(exported.canonicalZapiPhone('5547999110328'), exported.canonicalZapiPhone('5547999110329'));
  assert.throws(() => exported.canonicalZapiPhone('123456789012345@lid'), /ZAPI_PHONE_INVALID/);
});
test('a callback without ninth digit is accepted; malformed PN and old/future moments are ignored', () => {
  assert.equal(exported.parseZapiEvent({ ...base, phone: '554799110328', status: 'RECEIVED' }, credentials.instanceId, now).state, 'DELIVERED');
  for (const phone of ['554799110328@lid', '+554799110328', '1234']) assert.equal(exported.parseZapiEvent({ ...base, phone, status: 'READ' }, credentials.instanceId, now), null);
  assert.equal(exported.parseZapiEvent({ ...base, status: 'READ', momment: now + 600000 }, credentials.instanceId, now), null);
});

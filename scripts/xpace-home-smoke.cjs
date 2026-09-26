const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('@playwright/test');

const origin = process.env.TEST_ORIGIN || 'http://localhost:3007';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const publicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || fs.readFileSync('.env.local', 'utf8').match(/^NEXT_PUBLIC_SUPABASE_URL\s*=\s*["']?([^\s"']+)/m)?.[1];
const project = new URL(publicUrl).hostname.split('.')[0];
const output = process.env.TEST_OUTPUT || path.join(os.tmpdir(), 'xpace-home-smoke');
fs.mkdirSync(output, { recursive: true });
const user = { id: '00000000-0000-4000-8000-000000000001', email: 'visual@example.test', aud: 'authenticated', role: 'authenticated', created_at: '2026-01-01T00:00:00Z', app_metadata: { provider: 'email' }, user_metadata: {} };
const notices = Array.from({ length: 4 }, (_, index) => ({ id: `booking-${index}`, title: `Aluno ${index + 1}`, scheduledOn: `2026-09-${String(26 + index).padStart(2, '0')}`, createdAt: `2026-09-26T12:00:0${4 - index}.000Z` }));

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    for (const [label, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }], ['small-mobile', { width: 320, height: 740 }]]) {
      const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
      await context.addInitScript(({ key, user }) => localStorage.setItem(key, JSON.stringify({ access_token: 'test-only-token', refresh_token: 'test-only-refresh', token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, user })), { key: `sb-${project}-auth-token`, user });
      const writes = [];
      await context.route('**/*', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const send = (data) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
        if (url.hostname.endsWith('.supabase.co')) {
          if (request.method() !== 'GET') { writes.push(`${request.method()} ${url.pathname}`); return send({}); }
          if (url.pathname.includes('/auth/')) return send(user);
          return send([]);
        }
        if (url.pathname === '/api/empresas/xpace') return send({ success: true, canAccessCentral: false });
        if (url.pathname === '/api/xpace/home') {
          const page = Number(url.searchParams.get('page') || 0);
          const seenAt = url.searchParams.get('seenAt') || '';
          return send({ success: true, metrics: { activeClients: 23, newClientsThisMonth: 5 }, notifications: { items: notices.slice(page * 3, page * 3 + 3), total: notices.length, unread: notices.filter((item) => !seenAt || item.createdAt > seenAt).length, latestCreatedAt: notices[0].createdAt, page, pageSize: 3 } });
        }
        if (url.pathname.startsWith('/api/')) return send({ success: true });
        if (url.origin !== origin) return route.abort();
        return route.continue();
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`${origin}/xpace`);
      await page.getByText('Pessoas com contrato ativo hoje').waitFor();
      await page.locator('.xd-home-stat--active strong').getByText('23').waitFor();
      await page.locator('.xd-home-stat--new strong').getByText('5').waitFor();
      assert.equal(await page.locator('.xd-home-notification').count(), 3);
      await page.getByRole('button', { name: 'Próximos avisos' }).click();
      await page.getByText('Aluno 4').waitFor();
      await page.getByRole('button', { name: 'Marcar todas como lidas' }).click();
      assert.equal(await page.locator('.xd-home-bell b').count(), 0);
      assert.equal(await page.evaluate((id) => localStorage.getItem(`xpace_home_notifications_seen_${id}`), user.id), notices[0].createdAt);
      await page.getByRole('button', { name: 'Avisos anteriores' }).click();
      await page.getByText('Aluno 1').waitFor();
      assert.equal(await page.locator('.xd-home-bell b').count(), 0);
      assert.equal(await page.locator('.xd-home-revision').evaluate((element) => getComputedStyle(element).position), 'static');
      await page.screenshot({ path: path.join(output, `${label}.png`), fullPage: true });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2);
      assert.equal(overflow, false, `${label} has horizontal overflow`);
      assert.deepEqual(errors, [], `${label} page errors`);
      assert.deepEqual(writes, [], `${label} unexpected writes`);
      await context.close();
    }
    console.log(`XPACE home visual smoke passed. Screenshots: ${output}`);
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });

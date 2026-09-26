const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('@playwright/test');

const origin = process.env.TEST_ORIGIN || 'http://localhost:3008';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const publicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || fs.readFileSync('.env.local', 'utf8').match(/^NEXT_PUBLIC_SUPABASE_URL\s*=\s*["']?([^\s"']+)/m)?.[1];
const project = new URL(publicUrl).hostname.split('.')[0];
const output = process.env.TEST_OUTPUT || path.join(os.tmpdir(), 'xpace-dashboard-smoke');
fs.mkdirSync(output, { recursive: true });
const user = { id: '00000000-0000-4000-8000-000000000001', email: 'visual@example.test', aud: 'authenticated', role: 'authenticated', created_at: '2026-01-01T00:00:00Z', app_metadata: { provider: 'email' }, user_metadata: {} };
const base = { success: true, from: '2026-01-01', to: '2026-09-26' };
const fixtures = {
  CRM: { ...base, section: 'CRM', metrics: { leads: 426, open: 32, won: 117, lost: 277, conversion: 27.5 }, trend: ['01', '02', '03', '04', '05', '06', '07', '08', '09'].map((month, index) => ({ month: `2026-${month}`, won: [0, 0, 11, 13, 16, 21, 22, 19, 15][index], lost: [0, 0, 24, 31, 36, 43, 53, 49, 41][index] })), birthdays: [{ id: 'a', name: 'Ana Ferreira', on: '2026-09-28', age: 19 }, { id: 'b', name: 'Mariana Silva', on: '2026-10-02', age: 12 }], sources: [{ name: 'INDICAÇÃO', count: 35 }, { name: 'INSTAGRAM', count: 24 }], sourceMissing: 367, losses: [{ name: 'SEM HORÁRIO', count: 18 }, { name: 'VALOR', count: 10 }], lossMissing: 249, imported: 414 },
  GERENCIAL: { ...base, section: 'GERENCIAL', metrics: { salesCents: 1940000, salesCount: 8, ticketCents: 242500, ltMonths: null, churn: null, cacCents: null, renewal: null }, trend: [{ month: '2026-06', salesCents: 180000, revenueCents: 15000, ticketCents: 90000, count: 2 }, { month: '2026-07', salesCents: 450000, revenueCents: 54000, ticketCents: 150000, count: 3 }, { month: '2026-08', salesCents: 610000, revenueCents: 85000, ticketCents: 305000, count: 2 }, { month: '2026-09', salesCents: 700000, revenueCents: 107000, ticketCents: 700000, count: 1 }], plans: [{ name: 'Ballet anual', count: 5 }, { name: 'Dança urbana mensal', count: 3 }], closures: [], notes: { sales: 'Valor contratual estimado.', revenue: 'Receita contratual mensalizada.' } },
  OPERACIONAL: { ...base, section: 'OPERACIONAL', metrics: { occupancy: null, renewal: null, atRisk: null, activeSchedules: 69 }, expiring: [{ id: 'c', client: 'Ana Ferreira', plan: 'Ballet anual', on: '2026-10-04', automatic: true }], slots: [{ id: 's1', className: 'Ballet Adulto', weekday: 1, startsAt: '18:30:00', room: 'Sala 1', capacity: 18 }, { id: 's2', className: 'Jazz Infantil', weekday: 2, startsAt: '16:00:00', room: 'Sala 2', capacity: 14 }] },
  CLIENTES: { ...base, section: 'CLIENTES', metrics: { active: 81, new: 12, blocked: 3, suspended: 2, vip: 7 }, modalities: [{ name: 'BALLET', count: 33 }, { name: 'JAZZ', count: 24 }, { name: 'DANÇAS URBANAS', count: 16 }], ages: [{ name: '5–8', count: 20 }, { name: '9–12', count: 18 }, { name: '13–20', count: 14 }, { name: '21–30', count: 12 }], ageMissing: 2 },
  FINANCEIRO: { ...base, section: 'FINANCEIRO' },
};

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    for (const [label, viewport] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }], ['small-mobile', { width: 320, height: 740 }]]) {
      const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
      await context.addInitScript(({ key, user }) => localStorage.setItem(key, JSON.stringify({ access_token: 'test-only-token', refresh_token: 'test-only-refresh', token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, user })), { key: `sb-${project}-auth-token`, user });
      const calls = [];
      await context.route('**/*', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const send = (data) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
        if (url.hostname.endsWith('.supabase.co')) return send(url.pathname.includes('/auth/') ? user : []);
        if (url.pathname === '/api/empresas/xpace') return send({ success: true, canAccessCentral: false });
        if (url.pathname === '/api/xpace/home') return send({ success: true, metrics: { activeClients: 0, newClientsThisMonth: 0 }, notifications: { items: [], total: 0, unread: 0, latestCreatedAt: null, page: 0, pageSize: 2 } });
        if (url.pathname === '/api/xpace/dashboard') { calls.push(url.searchParams.toString()); return send(fixtures[url.searchParams.get('section')] || fixtures.CRM); }
        if (url.pathname.startsWith('/api/')) return send({ success: true });
        if (url.origin !== origin) return route.abort();
        return route.continue();
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`${origin}/xpace`);
      await page.locator('.xd-modules').getByRole('button', { name: /DASHBOARD/ }).click();
      await page.waitForFunction(() => scrollY === 0);
      await page.screenshot({ path: path.join(output, `${label}-top.png`) });
      for (const section of ['CRM', 'GERENCIAL', 'OPERACIONAL', 'CLIENTES', 'FINANCEIRO']) {
        await page.locator('.xdd-tabs').getByRole('button', { name: section, exact: true }).click();
        await page.locator('.xdd-tabs').getByRole('button', { name: section, exact: true }).getAttribute('aria-pressed').then((selected) => assert.equal(selected, 'true'));
        await page.locator('.xdd-loading').waitFor({ state: 'hidden' });
        await page.screenshot({ path: path.join(output, `${label}-${section.toLowerCase()}.png`), fullPage: true });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2);
        assert.equal(overflow, false, `${label} ${section} has horizontal overflow`);
      }
      await page.locator('.xdd-tabs').getByRole('button', { name: 'CRM', exact: true }).click();
      await page.getByRole('textbox', { name: 'Data inicial' }).fill('2026-03-01');
      await page.getByRole('button', { name: 'APLICAR' }).click();
      await page.locator('.xdd-loading').waitFor({ state: 'hidden' });
      assert.ok(calls.some((call) => call.includes('from=2026-03-01')), `${label} date filter was not sent`);
      assert.deepEqual(errors, [], `${label} page errors`);
      await context.close();
    }
    console.log(`XPACE dashboard smoke passed. Screenshots: ${output}`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { chromium, expect } = require('@playwright/test');

const origin = process.env.TEST_ORIGIN || 'http://localhost:3023';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname), 'Fixture test must target localhost');
const localEnv = fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf8') : '';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || localEnv.match(/^NEXT_PUBLIC_SUPABASE_URL\s*=\s*["']?([^\s"']+)/m)?.[1] || 'https://crm-fixture.supabase.co';
const project = new URL(supabaseUrl).hostname.split('.')[0];
const user = { id: '00000000-0000-4000-8000-000000000001', email: 'test@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} };
const company = { id: 'company-test', name: 'DAWOS', slug: 'dawos' };
const clients = [{ id: 'client-test', legalName: 'CLIENTE DO MES ANTERIOR', tradeName: 'CLIENTE DO MES ANTERIOR', cnpj: '12345678000100', clientCode: 'CLI-TEST', sellerCompanyId: company.id, active: true }];
const openStages = ['CONTACT_PENDING', 'CONTACTED', 'QUOTE_PREPARATION', 'QUOTE_SENT', 'NEGOTIATION'];
const opportunity = (id, stage, overrides = {}) => ({ id, clientId: clients[0].id, representativeProfileId: user.id, representativeName: 'TESTE', title: id, productFichaId: '', productReference: '', productQuantity: 1, productUnitPrice: 100, stage, estimatedValue: 100, expectedCloseDate: '2026-08-31', quoteId: '', notes: '', lostReason: '', closedAt: '', createdAt: '2026-08-31T12:00:00Z', updatedAt: '2026-08-31T12:00:00Z', ...overrides });
const fixture = [
  ...openStages.map((stage, index) => opportunity(`ABERTA AGOSTO ${index + 1}`, stage, index === 3 ? { clientId: '', quoteId: 'direct-test' } : {})),
  ...Array.from({ length: 12 }, (_, index) => opportunity(`GANHO SETEMBRO ${index + 1}`, 'WON', { closedAt: '2026-09-10', createdAt: '2026-06-01T12:00:00Z', updatedAt: '2026-07-01T12:00:00Z' })),
  opportunity('GANHO AGOSTO', 'WON', { closedAt: '2026-08-31', updatedAt: '2026-09-11T12:00:00Z' }),
  opportunity('PERDA JUNHO', 'LOST', { closedAt: '2026-06-30', updatedAt: '2026-09-11T12:00:00Z' }),
  opportunity('PERDA JULHO', 'LOST', { closedAt: '2026-07-01', updatedAt: '2026-09-11T12:00:00Z' }),
  opportunity('PERDA SETEMBRO', 'LOST', { closedAt: '2026-09-11', updatedAt: '2026-08-01T12:00:00Z' }),
];

async function dropCard(page, title, stage) {
  // Native HTML5 drag events exercise the same handlers on desktop and narrow viewports.
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  const card = page.locator('.crm-opportunity-card').filter({ has: page.getByText(title, { exact: true }) });
  await expect(card).toHaveAttribute('draggable', 'true');
  await card.dispatchEvent('dragstart', { dataTransfer: transfer });
  await page.locator(`.crm-stage-${stage.toLowerCase()}`).dispatchEvent('drop', { dataTransfer: transfer });
  await transfer.dispose();
}

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, timezoneId: 'America/Sao_Paulo', serviceWorkers: 'block' });
      await context.addInitScript(({ project, user }) => {
        localStorage.setItem(`sb-${project}-auth-token`, JSON.stringify({ access_token: 'fixture-token', refresh_token: 'fixture-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user }));
      }, { project, user });
      let opportunities = structuredClone(fixture);
      const stageWrites = [], unexpectedWrites = [], errors = [];
      await context.route('**/*', async (route) => {
        const request = route.request(), url = new URL(request.url());
        const send = (json) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(json) });
        if (url.hostname.endsWith('.supabase.co')) {
          if (url.pathname.includes('/auth/')) return send(user);
          if (url.pathname.endsWith('/profiles')) {
            const profile = { ...user, full_name: 'TESTE', active: true, platform_role: 'platform_owner', company_members: [{ company_id: company.id, company_role: 'company_manager', companies: [company] }] };
            return send(url.searchParams.has('id') ? profile : [profile]);
          }
          if (url.pathname.endsWith('/companies')) return send([company]);
          return send([]);
        }
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return route.continue();
        if (request.method() !== 'GET') {
          if (url.pathname === '/api/crm/opportunities' && request.method() === 'PATCH') {
            const { opportunity: input } = request.postDataJSON();
            stageWrites.push(input);
            opportunities = opportunities.map((item) => item.id === input.id ? { ...item, ...input, closedAt: '2026-09-11', updatedAt: '2026-09-11T15:00:00Z' } : item);
            return send({ success: true, opportunity: opportunities.find((item) => item.id === input.id), cycleScheduled: false });
          }
          unexpectedWrites.push(`${request.method()} ${url.pathname}`);
          return send({ success: false, message: 'FIXTURE BLOCKS UNEXPECTED WRITES' });
        }
        if (url.pathname === '/api/gerenciador') return send({ success: true, settings: { lostReasons: [{ id: 'reason-test', name: 'SEM DEMANDA', active: true }] }, representatives: [] });
        if (url.pathname === '/api/clientes') return send({ success: true, clients });
        if (url.pathname === '/api/clientes/opcoes') return send({ success: true, options: { sellerCompanies: [company], representatives: [] } });
        if (url.pathname === '/api/crm') return send({ success: true, overview: { currentProfileId: user.id, currentProfileName: 'TESTE', isManager: true, profiles: [], activities: [], telephonyCalls: [], opportunities, quotes: [], expiredQuotes: [], samples: [], whatsappConnections: [] } });
        return send({ success: true, lock: null, salesOrders: [], orders: [], quotes: [], connections: [] });
      });
      const page = await context.newPage();
      await page.clock.setFixedTime(new Date('2026-09-11T15:00:00Z'));
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`${origin}/empresa/dawos`);
      await page.getByRole('button', { name: 'CLIENTES', exact: true }).click();
      await page.getByRole('button', { name: 'CRM', exact: true }).click();
      const navigation = page.getByRole('navigation', { name: 'VISOES DO CRM' });
      await navigation.getByRole('button', { name: 'OPORTUNIDADES', exact: true }).click();
      const board = page.locator('.crm-pipeline');
      const summary = page.getByLabel('RESUMO DO FUNIL');
      const toggle = page.getByRole('button', { name: /(?:EXIBIR|OCULTAR) GANHOS E PERDIDOS/ });
      const period = page.getByRole('combobox', { name: 'FECHADOS EM', exact: true });
      const openCards = page.locator('.crm-pipeline-column:not(.crm-stage-won):not(.crm-stage-lost) .crm-opportunity-card');
      await expect(board.locator('.crm-pipeline-column')).toHaveCount(5);
      await expect(board).toHaveClass(/crm-pipeline-open-only/);
      await expect(page.locator('.crm-stage-won, .crm-stage-lost')).toHaveCount(0);
      await expect(toggle).toHaveAccessibleName('EXIBIR GANHOS E PERDIDOS (16)');
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(period).toHaveValue('ALL');
      await expect(openCards).toHaveCount(5);
      const hiddenOutput = path.join(os.tmpdir(), `xpacebox-crm-pipeline-${width}-hidden.png`);
      await page.screenshot({ path: hiddenOutput, fullPage: true });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Only the board may scroll horizontally');
      const initialSummary = await summary.innerText();
      const hiddenWidth = await page.locator('.crm-pipeline-column').first().evaluate((element) => element.getBoundingClientRect().width);
      await toggle.click();
      await expect(board.locator('.crm-pipeline-column')).toHaveCount(7);
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(board).not.toHaveClass(/crm-pipeline-open-only/);
      assert.equal(await summary.innerText(), initialSummary, 'Hiding columns must not change summary totals');
      await expect(page.locator('.crm-stage-won .crm-opportunity-card')).toHaveCount(13);
      await expect(page.locator('.crm-stage-lost .crm-opportunity-card')).toHaveCount(3);
      const shownOutput = path.join(os.tmpdir(), `xpacebox-crm-pipeline-${width}-shown.png`);
      await page.screenshot({ path: shownOutput, fullPage: true });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Showing closed columns must not cause page overflow');
      if (width === 1440) {
        const expandedWidth = await page.locator('.crm-pipeline-column').first().evaluate((element) => element.getBoundingClientRect().width);
        assert.ok(hiddenWidth > expandedWidth, 'Open columns should expand when closed columns are hidden');
      }
      for (const [value, won, lost] of [['MONTH', 12, 1], ['QUARTER', 13, 2], ['SEMESTER', 13, 2]]) {
        await period.selectOption(value);
        await expect(openCards).toHaveCount(5);
        await expect(page.locator('.crm-stage-won .crm-opportunity-card')).toHaveCount(won);
        await expect(page.locator('.crm-stage-lost .crm-opportunity-card')).toHaveCount(lost);
        await expect(page.getByText('ABERTA AGOSTO 1', { exact: true })).toBeVisible();
      }
      await period.selectOption('CUSTOM');
      await page.getByLabel('FECHADOS A PARTIR DE', { exact: true }).fill('2026-08-31');
      await page.getByLabel('FECHADOS ATE', { exact: true }).fill('2026-08-31');
      await expect(page.locator('.crm-stage-won .crm-opportunity-card')).toHaveCount(1);
      await expect(page.locator('.crm-stage-lost .crm-opportunity-card')).toHaveCount(0);
      await expect(openCards).toHaveCount(5);
      await period.selectOption('ALL');
      await toggle.click();
      assert.equal(await summary.innerText(), initialSummary);
      await toggle.click();
      await navigation.getByRole('button', { name: 'AGENDA', exact: true }).click();
      await navigation.getByRole('button', { name: 'OPORTUNIDADES', exact: true }).click();
      await expect(board.locator('.crm-pipeline-column')).toHaveCount(5);
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await toggle.click();
      await dropCard(page, 'ABERTA AGOSTO 1', 'WON');
      await expect.poll(() => stageWrites.some((item) => item.id === 'ABERTA AGOSTO 1' && item.stage === 'WON')).toBe(true);
      await expect(page.locator('.crm-stage-won .crm-opportunity-card')).toHaveCount(14);
      await dropCard(page, 'ABERTA AGOSTO 2', 'LOST');
      const lossDialog = page.getByRole('dialog', { name: 'MOTIVO DA PERDA', exact: true });
      await expect(lossDialog).toBeVisible();
      await lossDialog.getByRole('combobox', { name: 'MOTIVO DA PERDA', exact: true }).selectOption('SEM DEMANDA');
      await lossDialog.getByRole('button', { name: 'CONFIRMAR PERDA', exact: true }).click();
      await expect.poll(() => stageWrites.some((item) => item.id === 'ABERTA AGOSTO 2' && item.stage === 'LOST' && item.lostReason === 'SEM DEMANDA')).toBe(true);
      await expect(page.locator('.crm-stage-lost .crm-opportunity-card')).toHaveCount(4);
      await toggle.click();
      const output = path.join(os.tmpdir(), `xpacebox-crm-pipeline-${width}.png`);
      await page.screenshot({ path: output, fullPage: true });
      assert.deepEqual(unexpectedWrites, []);
      assert.equal(stageWrites.length, 2);
      assert.deepEqual(errors, []);
      console.log(`PASS ${width}px: hidden default, expanded columns, summary stability, closure-date periods, old open/direct opportunities, uncapped closed cards, reentry reset, mocked WON/LOST drag. ${hiddenOutput} ${shownOutput} ${output}`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });

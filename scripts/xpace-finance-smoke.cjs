const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('@playwright/test');

const origin = process.env.TEST_ORIGIN || 'http://localhost:3007';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const publicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || fs.readFileSync('.env.local', 'utf8').match(/^NEXT_PUBLIC_SUPABASE_URL\s*=\s*["']?([^\s"']+)/m)?.[1];
const project = new URL(publicUrl).hostname.split('.')[0];
const output = process.env.TEST_OUTPUT || path.join(os.tmpdir(), 'xpace-finance-smoke');
fs.mkdirSync(output, { recursive: true });
const user = { id: '00000000-0000-4000-8000-000000000001', email: 'visual@example.test', aud: 'authenticated', role: 'authenticated', created_at: '2026-01-01T00:00:00Z', app_metadata: { provider: 'email' }, user_metadata: {} };
const due = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const manual = { id: '11111111-1111-4111-8111-111111111111', source: 'MANUAL', counterparty: 'Fornecedor da escola', description: 'Aluguel do estúdio', competenceOn: due, dueOn: due, amountCents: 180000, paidAmountCents: 30000, paidOn: due, status: 'PARCIAL' };
const charge = { id: '22222222-2222-4222-8222-222222222222', source: 'XPAY', counterparty: 'Aluno de teste', description: 'Plano de dança', competenceOn: due, dueOn: due, amountCents: 22000, paidAmountCents: 22000, paidOn: due, status: 'PAGO' };
const category = { id: '44444444-4444-4444-8444-444444444444', name: 'ALUGUEL', active: true };

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    for (const [label, viewport] of [['desktop', { width: 1440, height: 960 }], ['mobile', { width: 390, height: 844 }], ['small-mobile', { width: 320, height: 740 }]]) {
      const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
      await context.addInitScript(({ key, user }) => localStorage.setItem(key, JSON.stringify({ access_token: 'test-only-token', refresh_token: 'test-only-refresh', token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, user })), { key: `sb-${project}-auth-token`, user });
      const writes = [];
      await context.route('**/*', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const send = (data) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
        if (url.hostname.endsWith('.supabase.co')) {
          if (request.method() !== 'GET') { writes.push(`unexpected Supabase write: ${request.method()} ${url.pathname}`); return send({}); }
          if (url.pathname.includes('/auth/')) return send(user);
          return send([]);
        }
        if (url.pathname === '/api/empresas/xpace') return send({ success: true, canAccessCentral: false });
        if (url.pathname === '/api/xpace/home') return send({ success: true, metrics: { activeClients: 0, newClientsThisMonth: 0 }, notifications: { items: [], total: 0, unread: 0, latestCreatedAt: null, page: 0, pageSize: 2 } });
        if (url.pathname === '/api/xpace/leads') return send({ success: true, canManage: true, sources: [], lossReasons: [], winReasons: [{ id: 'reason-test', name: 'ATENDIMENTO', active: true }], leads: [], appointments: [], activities: [], attendants: [], instructors: [], groups: [] });
        if (url.pathname === '/api/xpace/finance') {
          if (request.method() === 'POST') { writes.push(JSON.parse(request.postData() || '{}')); return send({ success: true, id: '33333333-3333-4333-8333-333333333333' }); }
          if (url.searchParams.get('view') === 'CATEGORIAS') return send({ success: true, canManage: true, categories: [category] });
          if (url.searchParams.get('view') === 'CLIENTES') return send({ success: true, clients: [{ id: '55555555-5555-4555-8555-555555555555', name: 'Aluno de teste', number: 42 }] });
          if (url.searchParams.get('view') === 'CONTAS') return send({ success: true, canManage: true, accounts: [{ id: 'account-test', description: 'Banco da escola', accountType: 'CONTA_CORRENTE', bankName: 'Inter', active: true }] });
          const receive = url.searchParams.get('view') === 'RECEBER';
          const items = receive ? [charge] : [manual];
          return send({ success: true, canManage: true, metrics: receive ? { total: 22000, paid: 22000, open: 0, inProgress: 0 } : { total: 180000, paid: 30000, open: 150000, inProgress: 0 }, items, totalRows: items.length, page: 0, pageSize: 20, accounts: [{ id: 'account-test', description: 'Banco da escola' }], categories: [category] });
        }
        if (url.pathname.startsWith('/api/')) return send({ success: true });
        if (url.origin !== origin) return route.abort();
        return route.continue();
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`${origin}/xpace`);
      await page.locator('.xd-modules').getByRole('button', { name: /FINANCEIRO/ }).click();
      await page.getByRole('button', { name: /CONTAS A PAGAR/ }).click();
      await page.getByText('Aluguel do estúdio').waitFor();
      await page.screenshot({ path: path.join(output, `${label}-pagar.png`), fullPage: true });
      await page.getByRole('button', { name: 'Pagar', exact: true }).click();
      await page.getByRole('dialog').getByRole('heading', { name: 'Registrar pagamento' }).waitFor();
      await page.getByRole('dialog').getByRole('button', { name: 'Fechar' }).click();
      await page.getByRole('button', { name: 'Conta a pagar', exact: true }).click();
      await page.getByRole('dialog').getByRole('combobox', { name: /Categoria de despesa/ }).selectOption(category.id);
      await page.getByRole('dialog').getByRole('checkbox', { name: 'Esta conta é recorrente' }).check();
      await page.getByText('Serão criadas 12 contas').waitFor();
      await page.screenshot({ path: path.join(output, `${label}-recorrencia.png`), fullPage: true });
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('button', { name: 'Cadastrar 12 contas' }).scrollIntoViewIfNeeded();
      const saveReachable = await dialog.evaluate((element) => {
        const button = element.querySelector('button[type="submit"]');
        const bounds = element.getBoundingClientRect();
        const buttonBounds = button?.getBoundingClientRect();
        return Boolean(buttonBounds && buttonBounds.top >= bounds.top && buttonBounds.bottom <= bounds.bottom);
      });
      assert.equal(saveReachable, true, `${label} recurrence save button cannot be reached by scrolling`);
      await page.screenshot({ path: path.join(output, `${label}-recorrencia-bottom.png`), fullPage: true });
      await page.getByRole('dialog').getByRole('button', { name: 'Fechar' }).click();
      await page.getByRole('button', { name: 'Voltar ao financeiro' }).click();
      await page.getByRole('button', { name: /CONTAS A RECEBER/ }).click();
      await page.getByText('Plano de dança').waitFor();
      await page.getByText('Cobranças XPay são somente leitura aqui.').waitFor();
      await page.screenshot({ path: path.join(output, `${label}-receber.png`), fullPage: true });
      await page.getByRole('button', { name: 'Conta a receber', exact: true }).click();
      await page.getByRole('dialog').getByRole('combobox', { name: /Cliente cadastrado/ }).selectOption('55555555-5555-4555-8555-555555555555');
      await page.screenshot({ path: path.join(output, `${label}-receber-cliente.png`), fullPage: true });
      await page.getByRole('dialog').getByRole('button', { name: 'Fechar' }).click();
      await page.getByRole('button', { name: 'Voltar ao financeiro' }).click();
      await page.getByRole('button', { name: /CONTAS FINANCEIRAS/ }).click();
      await page.getByText('Banco da escola').waitFor();
      await page.screenshot({ path: path.join(output, `${label}-contas.png`), fullPage: true });
      await page.getByRole('button', { name: 'Conta financeira', exact: true }).click();
      await page.getByRole('dialog').getByRole('heading', { name: 'Nova conta financeira' }).waitFor();
      await page.screenshot({ path: path.join(output, `${label}-nova-conta.png`), fullPage: true });
      await page.getByRole('dialog').getByRole('button', { name: 'Fechar' }).click();
      await page.locator('.xd-active-module').click();
      await page.locator('.xd-modules').getByRole('button', { name: /CONFIGURAÇÕES/ }).click();
      await page.getByRole('button', { name: /FINANCEIRO CATEGORIAS DE DESPESA/ }).click();
      await page.getByRole('button', { name: /CATEGORIAS DE DESPESA Organize/ }).click();
      await page.getByText('ALUGUEL').waitFor();
      await page.screenshot({ path: path.join(output, `${label}-categorias.png`), fullPage: true });
      await page.getByRole('button', { name: 'Voltar para Financeiro' }).click();
      await page.getByRole('button', { name: 'Voltar para Configurações' }).click();
      await page.getByRole('button', { name: /CRM MOTIVOS DE GANHO E PERDA/ }).click();
      await page.getByRole('button', { name: /MOTIVOS DE GANHO\/PERDA/ }).click();
      await page.getByText('MOTIVOS DE GANHO', { exact: true }).waitFor();
      await page.screenshot({ path: path.join(output, `${label}-motivos.png`), fullPage: true });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2);
      assert.equal(overflow, false, `${label} has horizontal overflow`);
      assert.deepEqual(errors, [], `${label} page errors`);
      assert.deepEqual(writes, [], `${label} unexpected writes`);
      await context.close();
    }
    console.log(`XPACE finance smoke passed. Screenshots: ${output}`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });

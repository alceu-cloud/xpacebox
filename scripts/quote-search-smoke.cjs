const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { chromium, expect } = require('@playwright/test');

const origin = process.env.TEST_ORIGIN || 'http://localhost:3022';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const project = new URL(fs.readFileSync('.env.local', 'utf8').match(/^NEXT_PUBLIC_SUPABASE_URL\s*=\s*["']?([^\s"']+)/m)[1]).hostname.split('.')[0];
const user = { id: '00000000-0000-4000-8000-000000000001', email: 'test@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} };
const company = { id: 'company-test', name: 'DAWOS', slug: 'dawos' };
const clients = ['CROCANTE CANUDOS', 'OUTRO CLIENTE'].map((name, index) => ({ id: `client-${index}`, legalName: name, tradeName: name, cnpj: `1234567800010${index}`, clientCode: `CLI-00000${index}`, active: true }));
const quotes = clients.map((client, index) => ({ id: `quote-${index}`, kind: 'ENGINEERING', phone: '', buyerName: '', email: '', address: '', representativeName: '', paymentTerms: '', freight: '', deliveryDate: '', observations: '', quoteNumber: `OE-00000${index + 1}`, clientId: client.id, clientName: client.tradeName, clientCnpj: client.cnpj, crmOpportunityId: `opportunity-${index}`, crmStage: 'QUOTE_SENT', sellerCompanyName: 'DAWOS', sellerCompanySlug: 'dawos', issueDate: '2026-09-11', validUntil: '2026-09-20', grandTotal: 100, items: [{ itemNumber: 1, ftNumber: 'FT-0001', description: 'CAIXA DE TESTE', quantity: 10, unitPrice: 10, total: 100 }] }));

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 } });
      await context.addInitScript(({ project, user }) => {
        localStorage.setItem(`sb-${project}-auth-token`, JSON.stringify({ access_token: 'fixture-token', refresh_token: 'fixture-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user }));
      }, { project, user });
      const searches = [], writes = [], errors = [];
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
        if (request.method() !== 'GET') { writes.push(request.method()); return send({ success: false, message: 'FIXTURE BLOCKS WRITES' }); }
        if (url.pathname === '/api/gerenciador') return send({ success: true, settings: {}, representatives: [] });
        if (url.pathname === '/api/clientes') return send({ success: true, clients });
        if (url.pathname === '/api/clientes/opcoes') return send({ success: true, options: { sellerCompanies: [company], representatives: [] } });
        if (url.pathname === '/api/pedidos') return send({ success: true, orders: [] });
        if (url.pathname === '/api/orcamentos') {
          const term = (url.searchParams.get('search') || '').toLowerCase();
          const clientId = url.searchParams.get('clientId');
          searches.push({ term, clientId });
          const results = url.searchParams.get('kind') === 'ENGINEERING' ? quotes.filter((q) => clientId ? q.clientId === clientId : `${q.quoteNumber} ${q.clientName} ${q.clientCnpj}`.toLowerCase().includes(term)) : [];
          if (term === 'croc') await new Promise((resolve) => setTimeout(resolve, 800));
          return send({ success: true, quotes: results });
        }
        return send({ success: true, lock: null, salesOrders: [], connections: [] });
      });
      const page = await context.newPage();
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`${origin}/empresa/dawos`);
      await page.getByRole('button', { name: 'FINANCEIRO', exact: true }).click();
      await page.getByRole('button', { name: 'ORCAMENTO ENGENHARIA', exact: true }).click();
      const search = page.getByRole('combobox', { name: 'BUSCAR CLIENTE NOS ORCAMENTOS' });
      await search.fill('croc');
      await expect(page.getByRole('option', { name: /CROCANTE CANUDOS/ })).toBeVisible();
      await expect.poll(() => searches.some((item) => item.term === 'croc')).toBe(true);
      await search.fill('outro');
      await expect(page.getByText('OE-000002', { exact: true })).toBeVisible();
      await page.waitForTimeout(900);
      await expect(page.getByText('OE-000001', { exact: true })).toHaveCount(0);
      await search.fill('12345678000100');
      await page.getByRole('option', { name: /CROCANTE CANUDOS/ }).click();
      await expect.poll(() => searches.some((item) => item.clientId === 'client-0')).toBe(true);
      await expect(page.getByText('OE-000001', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'LIMPAR SELECAO', exact: true }).click();
      await expect(page.getByText('OE-000002', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'EDITAR', exact: true }).first().click();
      await page.getByRole('button', { name: 'EXCLUIR ITEM 1', exact: true }).click();
      await expect(page.getByRole('button', { name: 'EXCLUIR ITEM 1', exact: true })).toHaveCount(0);
      await page.getByRole('button', { name: 'SALVAR ALTERACOES E PDF', exact: true }).click();
      await expect(page.getByText('PREENCHA O CLIENTE E A DESCRICAO DE PELO MENOS UM ITEM.', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: '+ ITEM MANUAL', exact: true }).click();
      await expect(page.getByRole('button', { name: 'EXCLUIR ITEM 1', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'FECHAR', exact: true }).click();
      await search.fill('croc');
      const output = path.join(os.tmpdir(), `xpacebox-quote-search-${width}.png`);
      await page.screenshot({ path: output, fullPage: true });
      assert.deepEqual(writes, []);
      assert.deepEqual(errors, []);
      console.log(`PASS ${width}px: live search, suggestions, CNPJ selection, clearing, stale response, last-item removal, empty-save guard. ${output}`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });

// Local fixtures only. All API, auth and provider requests are intercepted.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { chromium } = require('@playwright/test');
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:3007';
const publicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || fs.readFileSync('.env.local','utf8').match(/^NEXT_PUBLIC_SUPABASE_URL\s*=\s*["']?([^\s"']+)/m)?.[1];
const storageKey = `sb-${new URL(publicUrl).hostname.split('.')[0]}-auth-token`;
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname));
const output = process.env.TEST_OUTPUT || path.join(os.tmpdir(), 'xpace-stock-visual');
fs.mkdirSync(output, { recursive: true });
const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'fixture@example.test', app_metadata: {}, user_metadata: {} };
const category = { id: '00000000-0000-4000-8000-000000000002', description: 'Bebidas', active: true };
const unit = { id: '00000000-0000-4000-8000-000000000003', description: 'Unidade', abbreviation: 'UN', active: true };
const item = { id: '00000000-0000-4000-8000-000000000004', description: 'Água com gás', code: '0012345678905', codeMode: 'EXTERNAL', costPriceCents: 200, salePriceCents: 500, categoryId: category.id, unitId: unit.id, categoryName: 'Bebidas', unitName: 'Unidade', unitAbbreviation: 'UN', controlsStock: true, minimumStock: 5, stockQuantity: 5, imageUrl: '', active: true };
const internal = { ...item, id: '00000000-0000-4000-8000-000000000005', description: 'Café XPACE', code: 'XP-00000000-0000-4000-8000-000000000005', codeMode: 'INTERNAL', stockQuantity: 20 };

async function setup(browser, width, ambiguous = false, seedProducts = [item, internal]) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 500, hasTouch: width < 500, serviceWorkers: 'block' });
  await context.addInitScript(({ user, storageKey }) => localStorage.setItem(storageKey, JSON.stringify({ access_token: 'fixture-only', refresh_token: 'fixture-only', token_type: 'bearer', expires_at: Math.floor(Date.now()/1000)+3600, expires_in: 3600, user })), { user, storageKey });
  const writes = [], requests = [], products = structuredClone(seedProducts);
  const movements = new Map();
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    const send = payload => route.fulfill({ contentType: 'application/json', body: JSON.stringify(payload) });
    if (url.hostname.endsWith('.supabase.co')) {
      if (url.pathname.includes('/auth/')) return send(user);
      return send([]);
    }
    if (url.pathname.startsWith('/api/')) {
      requests.push(url.pathname + url.search);
      if (url.pathname === '/api/empresas/xpace') return send({ success: true, canAccessCentral: false });
      if (url.pathname === '/api/notifications') return send({ success: true, items: [], total: 0, unread: 0, issueCount: 0, issueSignals: [], todayErrors: 0, page: 0, pageSize: 2, snapshotAt: new Date().toISOString() });
      if (url.pathname === '/api/xpace/xpay') return send({ success: true, providerConfigured: false, environment: 'SANDBOX', accounts: [] });
      if (url.pathname === '/api/xpace/message-connector/status') return send({ success: true, configured: true, status: 'CONNECTED' });
      if (url.pathname === '/api/xpace/agenda') return send({ success: true, groups: [], trialAppointments: [] });
      if (url.pathname === '/api/xpace/mobile/overview') return send({ success: true, profileName: 'Alceu', metrics: { trialsThisWeek: 0, trialsNextWeek: 0, activeClients: 0, newClientsThisMonth: 0, newLeadsThisMonth: 0 }, notifications: [] });
      if (url.pathname === '/api/xpace/estoque/relatorio') return send({ success: true, total: 51, page: Number(url.searchParams.get('page')), pages: 2, items: [{ id: 'fixture-movement', product: 'Camiseta fixture · TAM P', code: 'XP-FIXTURE', unit: 'UN', direction: 'ENTRADA', quantity: 3, before: 0, after: 3, actor: 'Operador fixture', at: '2026-10-01T19:00:00Z', note: 'Reposição fixture' }] });
      if (url.pathname === '/api/xpace/estoque') {
        if (request.method() === 'POST') {
          const body = request.postDataJSON(); writes.push(body);
          if (body.action === 'MOVE') {
            if (movements.has(body.requestId)) return send({ ...movements.get(body.requestId), replayed: true });
            const product = products.flatMap(product => [product, ...(product.variants ?? [])]).find(product => product.id === body.productId);
            product.stockQuantity += body.direction === 'ENTRADA' ? body.quantity : -body.quantity;
            const result = { success: true, movementId: 'fixture-movement', stockQuantity: product.stockQuantity, lowStock: product.stockQuantity < product.minimumStock, lowStockCrossed: product.stockQuantity < product.minimumStock, alertQueued: true, replayed: false };
            movements.set(body.requestId, result);
            if (ambiguous) { ambiguous = false; return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'Fixture lost response after commit' }) }); }
            return send(result);
          }
          return send({ success: true, id: item.id });
        }
        if (url.searchParams.has('history')) return send({ success: true, movements: [] });
        const filtered = url.searchParams.has('code') ? products.filter(product => product.code === url.searchParams.get('code')) : url.searchParams.has('sheet') ? products.filter(product => product.codeMode === 'INTERNAL') : products;
        return send({ success: true, canManage: true, products: filtered, total: filtered.length, categories: [category], units: [unit], alertConfigured: true });
      }
      if (url.pathname === '/api/xpace/message-connector/zapi') return send({ success: true, configured: true, enabled: true, paused: false, connected: true, schedulerReady: true });
      if (url.pathname === '/api/xpace/message-connector') {
        const notifications = url.searchParams.get('scope') === 'NOTIFICATIONS';
        return send({ success: true, connector: { configured: true, status: 'CONNECTED' }, schedulerReady: true, pagination: { page: 0, pageSize: 5, total: notifications ? 1 : 0 }, summary: { registered: notifications ? 1 : 0, sent: notifications ? 1 : 0, queued: 0, confirmed: 0, failures: 0, receiptPending: 0, lateQueue: 0, monitoringSince: null }, messages: notifications ? [{ id: 'fixture-alert', kind: 'ESTOQUE_BAIXO', appointment_id: null, contact_name: 'ALCEU · ESTOQUE', destination_phone: 'fixture', body: 'Estoque baixo: Água com gás. Saldo 4 UN, mínimo 5.', status: 'SENT', created_at: new Date().toISOString(), scheduled_at: new Date().toISOString(), sent_at: new Date().toISOString(), delivered_at: null, read_at: null, error_message: null }] : [] });
      }
      if (request.method() !== 'GET') { writes.push({ unexpected: url.pathname }); return send({ success: false, message: 'Fixture blocks unknown writes' }); }
      return send({ success: true, notifications: [], count: 0, enabled: false });
    }
    if (url.origin !== origin && url.protocol !== 'data:') return route.abort();
    return route.continue();
  });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => { errors.push(error.message); console.error('Fixture page error:', error.message); });
  page.on('framenavigated', frame => { if (frame === page.mainFrame()) console.log('Fixture navigation:', frame.url()); });
  page.setDefaultTimeout(20000);
  return { context, page, errors, writes, requests };
}
async function snapshot(page, name) {
  await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false, `${name}: page overflow`);
}
module.exports = { setup, snapshot, item, internal, origin, output };
if (require.main === module) (async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const { context, page, errors, writes, requests } = await setup(browser, 1440);
    await page.goto(`${origin}/xpace`);
    await page.locator('.xd-module').filter({ hasText: 'ESTOQUE' }).click();
    await page.getByText('Água com gás', { exact: true }).waitFor();
    await snapshot(page, 'desktop-products');
    await page.getByRole('button', { name: 'PRODUTO', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'NOVO PRODUTO' });
    await dialog.waitFor();
    await snapshot(page, 'desktop-product-modal');
    await dialog.getByRole('button', { name: 'CANCELAR' }).click();
    for (const [tab, add, modal] of [['Categorias', 'CATEGORIA', 'NOVA CATEGORIA'], ['Unidades', 'UNIDADE', 'NOVA UNIDADE DE MEDIDA']]) {
      await page.getByRole('button', { name: tab, exact: true }).click();
      await page.getByRole('button', { name: add, exact: true }).click();
      await page.getByRole('dialog', { name: modal }).waitFor();
      await page.getByRole('dialog', { name: modal }).getByRole('button', { name: 'CANCELAR' }).click();
    }
    await page.getByRole('button', { name: 'Folha de códigos' }).click();
    const qr = page.getByAltText('QR de Café XPACE'); await qr.waitFor();
    await page.addScriptTag({ path: require.resolve('@zxing/browser/umd/zxing-browser.min.js') });
    const decoded = await qr.evaluate(async image => (await new ZXingBrowser.BrowserMultiFormatReader().decodeFromImageElement(image)).getText());
    assert.equal(decoded, internal.code, 'Generated QR roundtrip');
    await snapshot(page, 'desktop-qr-sheet');
    await page.emulateMedia({ media: 'print' });
    assert.equal(await page.locator('.xd-topbar').isVisible(), false, 'Print hides application header');
    await page.screenshot({ path: path.join(output, 'print-sheet.png'), fullPage: true });
    await page.emulateMedia({ media: 'screen' });
    await page.locator('.xd-active-module').click();
    await page.locator('.xd-module').filter({ hasText: 'LOJA' }).click();
    await page.getByRole('button', { name: 'WHATSAPP E ENVIOS', exact: true }).click();
    await page.getByRole('button', { name: 'NOTIFICAÇÕES', exact: true }).click();
    await page.getByText('ACEITO PELO SERVIDOR', { exact: true }).waitFor();
    assert.equal(await page.locator('.xd-msg-step--delivered').count(), 0, 'Accepted alone is not green');
    assert.equal(await page.getByText('WHATSAPP NA NUVEM · Z-API').count(), 0, 'Configuration hidden by default');
    await snapshot(page, 'desktop-notifications');
    await page.getByRole('button', { name: 'CONFIGURAR Z-API', exact: true }).click();
    await page.getByText('WHATSAPP NA NUVEM · Z-API').waitFor();
    assert.ok(requests.some(request => request.includes('scope=NOTIFICATIONS')));
    assert.deepEqual(writes, []); assert.deepEqual(errors, []);
    await context.close();

    // Compact A4 print regression: 30 actual generated QR cards, not 30 empty boxes.
    const names = ['RED HORSE CREATINA MAÇÃ VERDE', 'ÁGUA COM GÁS', 'CAMISETA XPACE PRETA M', 'CAFÉ XPACE', 'GARRAFINHA XPACE ANO 3'];
    const printProducts = Array.from({ length: 30 }, (_, index) => {
      const id = `00000000-0000-4000-8000-${String(index + 10).padStart(12, '0')}`;
      return { ...internal, id, code: `XP-${id}`, description: `${names[index % names.length]} ${index + 1}`, imageUrl: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="40" height="80"%3E%3Crect x="5" y="5" width="30" height="70" rx="6" fill="%2391b62b"/%3E%3Ctext x="20" y="43" text-anchor="middle" font-size="10"%3EXP%3C/text%3E%3C/svg%3E' };
    });
    const printFixture = await setup(browser, 1440, false, printProducts);
    await printFixture.page.goto(`${origin}/xpace`);
    await printFixture.page.locator('.xd-module').filter({ hasText: 'ESTOQUE' }).click();
    await printFixture.page.getByRole('button', { name: 'Folha de códigos' }).click();
    await printFixture.page.locator('.xs-sheet-qr').last().waitFor();
    await printFixture.page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.querySelectorAll('.xs-sheet img')].map(image => image.decode())); });
    const printFile = path.join(output, 'compact-sheet-30.pdf');
    await printFixture.page.pdf({ path: printFile, preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false });
    const printInfo = execFileSync(process.env.PDFINFO || 'pdfinfo', [printFile], { encoding: 'utf8' });
    assert.match(printInfo, /Pages:\s+1\s/, '30 typical products fit in one A4 page');
    assert.equal(await printFixture.page.locator('.xs-code-grid article').count(), 30);
    await printFixture.page.emulateMedia({ media: 'print' });
    await printFixture.page.setViewportSize({ width: 718, height: 1047 });
    assert.equal(await printFixture.page.locator('.xs-code-grid small').first().isVisible(), false, 'Print omits long internal IDs');
    await printFixture.page.addScriptTag({ path: require.resolve('@zxing/browser/umd/zxing-browser.min.js') });
    const qrPixels = await printFixture.page.locator('.xs-sheet-qr').first().screenshot({ scale: 'css' });
    const qrText = await printFixture.page.evaluate(async data => {
      const image = new Image(); image.src = data; await image.decode();
      return new ZXingBrowser.BrowserMultiFormatReader().decodeFromImageElement(image).then(result => result.getText());
    }, `data:image/png;base64,${qrPixels.toString('base64')}`);
    assert.equal(qrText, printProducts[0].code, '22mm QR remains decodable at print CSS size');
    await printFixture.page.screenshot({ path: path.join(output, 'compact-sheet-30.png'), fullPage: true });
    assert.deepEqual(printFixture.writes, []); assert.deepEqual(printFixture.errors, []);
    await printFixture.context.close();

    for (const width of [390, 320]) {
      const { context, page, errors, writes } = await setup(browser, width, width === 390);
      await page.goto(`${origin}/xpace/app`);
      await page.getByRole('button', { name: 'Estoque', exact: true }).click();
      await snapshot(page, `mobile-${width}-scanner`);
      await page.getByRole('textbox', { name: 'Código do produto' }).fill(item.code);
      await page.getByRole('button', { name: 'BUSCAR', exact: true }).click();
      await page.getByRole('button', { name: 'BAIXA', exact: true }).click();
      await snapshot(page, `mobile-${width}-movement`);
      await page.getByRole('button', { name: 'CONFIRMAR BAIXA', exact: true }).click();
      if (width === 390) {
        await page.getByRole('button', { name: 'CONFERIR / TENTAR A MESMA OPERAÇÃO' }).waitFor();
        assert.equal(await page.getByRole('textbox', { name: 'Quantidade para movimentar' }).isDisabled(), true, 'Ambiguous operation freezes its original payload');
        await page.getByRole('button', { name: 'CONFERIR / TENTAR A MESMA OPERAÇÃO' }).click();
        assert.equal(writes[0].requestId, writes[1].requestId, 'Retry uses the same idempotency key');
      }
      await page.getByText('ESTOQUE ABAIXO DO MÍNIMO', { exact: true }).waitFor();
      await snapshot(page, `mobile-${width}-minimum-warning`);
      assert.equal(writes.length, width === 390 ? 2 : 1); assert.equal(writes[0].action, 'MOVE'); assert.equal(writes[0].quantity, 1); assert.match(writes[0].requestId, /^[a-f0-9-]{36}$/);
      await page.getByText('4 UN', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'ENTENDI · PRÓXIMO PRODUTO' }).click();
      await page.getByRole('textbox', { name: 'Código do produto' }).waitFor();
      assert.deepEqual(errors, []);
      await context.close();
    }
    // Multi-format decoder also reads a real EAN-13, not just generated QR codes.
    const context2 = await browser.newContext(); const p = await context2.newPage();
    await context2.route('**/*', route => route.abort());
    await p.setContent('<canvas id="code" width="500" height="180"></canvas>');
    await p.addScriptTag({ path: require.resolve('@zxing/browser/umd/zxing-browser.min.js') });
    const ean = await p.evaluate(() => {
      const L=['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
      const G=['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];
      const R=['1110010','1100110','1101100','1000010','1011100','1001110','1010000','1000100','1001000','1110100'];
      const canvas=document.getElementById('code'), ctx=canvas.getContext('2d');
      return [['4006381333931','LGLLGG'],['7891234567895','LGLGLG']].map(([value,parity]) => {
        const bits='101'+value.slice(1,7).split('').map((n,i)=>(parity[i]==='L'?L:G)[Number(n)]).join('')+'01010'+value.slice(7).split('').map(n=>R[Number(n)]).join('')+'101';
        ctx.fillStyle='#fff';ctx.fillRect(0,0,500,180);ctx.fillStyle='#000'; [...bits].forEach((bit,i)=>{if(bit==='1')ctx.fillRect(60+i*4,20,4,130)});
        return new ZXingBrowser.BrowserMultiFormatReader().decodeFromCanvas(canvas).getText();
      });
    });
    assert.deepEqual(ean, ['4006381333931','7891234567895']); await context2.close();
    console.log('PASS stock browser: desktop catalog/dialogs/QR print, mobile 390/320 scanner/manual/movement/low-stock, isolated writes, notification tabs, accepted-not-delivered, QR/EAN13 decoders.');
    console.log(`Visual fixtures: ${output}`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

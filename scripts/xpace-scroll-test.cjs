// Isolated browser fixture: no login, production requests or database writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { chromium } = require('@playwright/test');

const css = fs.readFileSync(path.join(__dirname, '../app/globals.css'), 'utf8');

async function touchRefreshContract() {
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../components/xpace-dance/RefreshableScreen.tsx'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  let scrollY = 0, dialog = false, confirmations = 0, dispatches = 0, approved = false;
  const exports = {};
  const react = { Fragment: 'fragment', useEffect() {}, useRef: value => ({ current: value }), useState: value => [value, () => {}] };
  const jsx = (type, props) => ({ type, props });
  vm.runInNewContext(source, {
    exports,
    require: name => {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (name === 'lucide-react') return { RefreshCw: 'icon' };
      throw Error(`Unexpected import: ${name}`);
    },
    window: {
      get scrollY() { return scrollY; },
      confirm() { confirmations++; return approved; },
      dispatchEvent(event) { dispatches++; assert.equal(event.type, 'xpace:refresh'); event.detail.tasks.push(Promise.resolve()); }
    },
    document: { querySelector: () => dialog ? {} : null },
    getComputedStyle: element => ({ overflowY: element.overflowY || 'visible' }),
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } }
  });
  const { props } = exports.default({ children: 'fixture', screenKey: 'AGENDA' });
  const main = {};
  const target = { closest: () => null, parentElement: main };
  async function pull(element = target, distance = 200) {
    props.onTouchStart({ touches: [{ clientX: 10, clientY: 10 }], target: element, currentTarget: main });
    props.onTouchMove({ touches: [{ clientX: 10, clientY: 10 + distance }] });
    props.onTouchEnd();
    await new Promise(resolve => setImmediate(resolve));
  }
  await pull();
  assert.equal(dispatches, 1, 'pull at page top still refreshes');
  await pull(target, 40);
  assert.equal(dispatches, 1, 'short gestures do not refresh');
  scrollY = 100; await pull(); scrollY = 0;
  dialog = true; await pull(); dialog = false;
  await pull({ ...target, closest: () => ({}) });
  const scroller = { parentElement: main, scrollHeight: 500, clientHeight: 100, overflowY: 'auto', closest: () => null };
  await pull({ ...target, parentElement: scroller });
  assert.equal(dispatches, 1, 'scrolling, dialogs, controls and child scrollers do not refresh');
  props.onChangeCapture({ target: { matches: () => false, closest: () => ({}) } });
  await pull();
  assert.equal(dispatches, 1, 'unsaved changes require agreement');
  approved = true; await pull();
  assert.equal(confirmations, 2);
  assert.equal(dispatches, 2, 'approved refresh remains functional');
  console.log('PASS touch refresh: threshold, top-only, dialog/form guards and unsaved changes');
}

async function wheelScrollsPage(page, label) {
  await page.mouse.move(300, 250);
  await page.mouse.wheel(0, 550);
  await page.waitForFunction(() => window.scrollY > 100, null, { timeout: 3000 });
  assert.ok(await page.evaluate(() => window.scrollY > 100), `${label}: wheel over content must scroll the page`);
}

(async () => {
  await touchRefreshContract();
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    for (const mobile of [false, true]) {
      const context = await browser.newContext({ viewport: { width: mobile ? 390 : 1440, height: 800 }, hasTouch: mobile, isMobile: mobile });
      // Even stylesheet font URLs must not access a live service.
      await context.route('**/*', route => route.abort());
      const page = await context.newPage();
      const label = mobile ? 'touch-capable viewport' : 'desktop';
      await page.setContent(`<html class="xpace-pull-enabled"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><main class="xd-shell xd-refreshable"><div class="xd-pull-feedback" style="height:0">Atualizar</div><section style="height:2400px">XPACE scroll fixture</section></main></body></html>`);
      await wheelScrollsPage(page, label);
      const styles = await page.locator('main').evaluate(element => ({ overflow: getComputedStyle(element).overflowY, chaining: getComputedStyle(element).overscrollBehaviorY, root: getComputedStyle(document.documentElement).overscrollBehaviorY }));
      assert.equal(styles.overflow, 'clip', `${label}: wrapper must not become a hidden scroll container`);
      assert.equal(styles.chaining, 'auto', `${label}: page scrolling must not be trapped`);
      assert.equal(styles.root, 'none', `${label}: retain suppression of the browser's own pull-to-refresh`);

      // A real child scroller remains independent, including at its boundaries.
      await page.setContent(`<html class="xpace-pull-enabled"><head><style>${css}</style></head><body><main class="xd-shell xd-refreshable"><div id="child" style="height:200px;overflow:auto;overscroll-behavior:contain"><div style="height:1200px">Inner fixture</div></div><section style="height:2000px"></section></main></body></html>`);
      await page.locator('#child').hover();
      await page.mouse.wheel(0, 300);
      await page.waitForFunction(() => document.getElementById('child').scrollTop > 50, null, { timeout: 3000 });
      assert.equal(await page.evaluate(() => window.scrollY), 0, `${label}: nested scrolling must not move the page behind it`);
      await page.mouse.move(300, 400);
      await page.mouse.wheel(0, 300);
      await page.waitForFunction(() => window.scrollY > 50, null, { timeout: 3000 });
      console.log(`PASS ${label}: content wheel, nested scrolling, mobile pull CSS`);
      await context.close();
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

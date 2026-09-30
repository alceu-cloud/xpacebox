// Isolated UI fixture. Does not authenticate or inspect any real password.
const assert = require('node:assert/strict');
const {chromium} = require('@playwright/test');
const origin = process.env.TEST_ORIGIN || 'http://localhost:3007';
assert.ok(['localhost','127.0.0.1'].includes(new URL(origin).hostname));
(async () => {
  const browser = await chromium.launch({headless:true,channel:'chrome'});
  try {
    const context = await browser.newContext();
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const page = await context.newPage();
    await page.goto(origin+'/login');
    const password = page.locator('input[autocomplete="current-password"]');
    await password.fill('mJ-Fixture-Only');
    assert.equal(await password.getAttribute('type'),'password');
    assert.equal(await password.evaluate(el=>getComputedStyle(el).textTransform),'none');
    await page.getByRole('button',{name:'Ver',exact:true}).click();
    assert.equal(await password.getAttribute('type'),'text');
    assert.equal(await password.evaluate(el=>getComputedStyle(el).textTransform),'none');
    assert.equal(await password.inputValue(),'mJ-Fixture-Only');
    assert.equal(await password.getAttribute('autocapitalize'),'none');
    await page.getByRole('button',{name:'Ocultar',exact:true}).click();
    assert.equal(await password.getAttribute('type'),'password');
    console.log('PASS: password case preserved and displayed faithfully; no real credentials or login requests.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1});

// Local UI fixtures only. setup intercepts all auth, API and external traffic.
const assert = require('node:assert/strict');
const { chromium } = require('@playwright/test');
const { setup, snapshot, origin } = require('./stock-browser-test.cjs');
const bands = [{min:0,max:50,monthlyCents:9900},{min:51,max:200,monthlyCents:14900},{min:201,max:300,monthlyCents:19900},{min:301,max:500,monthlyCents:24900},{min:501,max:800,monthlyCents:29900},{min:801,max:null,monthlyCents:34900}];
const title = page => page.locator('.xd-topbar-context .xd-active-module strong');
const back = page => page.locator('.xd-topbar-context button.xb-back-title');
const moduleButton = (page, name) => page.locator('.xd-module').filter({hasText:name});
async function fixtures(context) {
  await context.route('**/api/xpace/leads', route => route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,leads:[],appointments:[],activities:[],sources:[],lossReasons:[],winReasons:[],attendants:[],instructors:[],groups:[],canOverrideTrialLimit:false,canDeleteLeads:false})}));
  await context.route('**/api/saas/store?**', route => {
    assert.equal(route.request().method(),'GET');
    return route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,company:{name:'XPACE DANÇA'},exempt:true,canManage:false,canManagePrices:false,book:{id:null,revision:0,config:{bands,addons:{WHATSAPP:15000},studentMetric:'PENDING',billingTiming:'MONTH_END',graceDays:null,rangeChange:'PENDING'}},account:{account_mode:'PARENT',status:'PREPARATION'},whatsappConfigured:false,drafts:[]})});
  });
  await context.route('**/api/xpace/finance?**', route => {
    assert.equal(route.request().method(),'GET');
    return route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,canManage:true,metrics:{total:0,paid:0,open:0,inProgress:0},items:[],totalRows:0,page:0,pageSize:10,accounts:[],categories:[]})});
  });
  await context.route('**/api/saas/plan?**', route => {
    assert.equal(route.request().method(),'GET');
    return route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,company:{name:'XPACE DANÇA'},exempt:true,preferences:{payment_method:null,addons:[]},activeStudents:51,measurement:'PENDING',preview:{monthlyCents:0},bands,addonMonthlyCents:15000,invoices:[],observations:[],total:0,pageSize:10})});
  });
  await context.route('**/api/notifications?**', route => route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,userName:'Operador fixture',preferences:{categories:['AULA_EXPERIMENTAL','WHATSAPP']},items:[],total:0,unread:0,issueCount:0,issueSignals:[],todayErrors:0,pageSize:2})}));
}
(async()=>{
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  try {
    for(const width of [1440,1024,768,390,320]) {
      const f=await setup(browser,width);await fixtures(f.context);
      await f.page.goto(`${origin}/xpace`);
      await moduleButton(f.page,'Config').click();
      await f.page.getByRole('button',{name:/PLANOS E PAGAMENTOS/}).click();
      await f.page.getByRole('heading',{name:'Preferências do plano',exact:true}).waitFor();
      await title(f.page).filter({hasText:'PLANOS E PAGAMENTOS'}).waitFor();
      assert.equal(await title(f.page).evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }),true,'Entire title must be inside viewport, not merely hidden by root overflow');
      assert.equal(await f.page.locator('button.xb-back-title').count(),1);
      assert.equal(await f.page.locator('.xb-back-title svg, .xb-back-button, .lucide-arrow-left').count(),0,'Return is the existing title, never a navigation arrow');
      assert.equal(await back(f.page).evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
      assert.equal(await f.page.locator('.saas-plan-details[open]').count(),0);
      assert.match(await f.page.locator('.saas-plan-metrics').innerText(),/R\$\s*0,00/);
      assert.equal(await f.page.locator('.saas-plan-primary').evaluate(el=>getComputedStyle(el).borderRadius),'999px');
      if(width>760) {
        const boxes=await f.page.locator('.saas-plan-grid > section').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().top));
        assert.ok(Math.abs(boxes[0]-boxes[1])<1);
      }
      await snapshot(f.page,`navigation-plan-embedded-${width}`);
      await f.page.getByText('Entender como funciona',{exact:true}).click();
      assert.equal(await f.page.locator('#saas-plan-how').evaluate(el=>el.open),true);
      await f.page.locator('.saas-plan-details').filter({hasText:'Tabela de preços'}).locator('summary').click();
      await f.page.getByRole('link',{name:'Abrir loja e simular',exact:true}).click();
      await f.page.waitForURL(`${origin}/loja/xpace`);
      await f.page.locator('button.xb-back-title').click();
      await title(f.page).filter({hasText:'PLANOS E PAGAMENTOS'}).waitFor();
      // Unsaved preferences must survive refusing either navigation action.
      await f.page.getByLabel('Forma de pagamento',{exact:true}).selectOption('BOLETO');
      f.page.once('dialog',dialog=>dialog.dismiss());await back(f.page).click();
      assert.equal(await f.page.getByLabel('Forma de pagamento').inputValue(),'BOLETO');
      f.page.once('dialog',dialog=>dialog.dismiss());await f.page.getByRole('button',{name:'XPACE · ir para o início',exact:true}).click();
      assert.equal(await f.page.getByLabel('Forma de pagamento').inputValue(),'BOLETO');
      f.page.once('dialog',dialog=>dialog.accept());await back(f.page).click();
      await title(f.page).filter({hasText:'CONFIGURAÇÕES'}).waitFor();
      assert.equal(await f.page.locator('.xd-modules').count(),0);
      await f.page.getByRole('button',{name:/USUÁRIO E NOTIFICAÇÕES/}).click();
      await title(f.page).filter({hasText:'USUÁRIO E NOTIFICAÇÕES'}).waitFor();
      await f.page.getByRole('heading',{name:'USUÁRIO E NOTIFICAÇÕES',exact:true}).waitFor();
      assert.equal(await title(f.page).evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }),true);
      assert.equal(await f.page.locator('button.xb-back-title').count(),1);
      assert.equal(await f.page.locator('.xb-back-title svg, .xb-back-button, .lucide-arrow-left').count(),0,'Return is the existing title, never a navigation arrow');
      assert.equal(await back(f.page).evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
      await snapshot(f.page,`navigation-notifications-${width}`);
      await back(f.page).focus();await f.page.keyboard.press('Enter');await title(f.page).filter({hasText:'CONFIGURAÇÕES'}).waitFor();
      await back(f.page).click();await moduleButton(f.page,'LOJA').waitFor();
      // This route used to return from account straight to Store incorrectly.
      await moduleButton(f.page,'LOJA').click();
      await f.page.getByRole('button',{name:'CONSULTE TAXAS',exact:true}).click();
      await f.page.getByRole('button',{name:'CONFERIR CONTA',exact:true}).click();
      await title(f.page).filter({hasText:'CONTA XPAY'}).waitFor();
      await back(f.page).click();await title(f.page).filter({hasText:'BENEFÍCIOS XPAY'}).waitFor();
      await back(f.page).click();await f.page.getByRole('heading',{name:'RECURSOS XPACE.',exact:true}).waitFor();
      await f.page.getByRole('button',{name:'XPACE · ir para o início',exact:true}).click();
      await moduleButton(f.page,'LOJA').waitFor();
      await moduleButton(f.page,'FINANCEIRO').click();
      await f.page.getByRole('button',{name:/CONTAS A PAGAR/}).click();
      await title(f.page).filter({hasText:'CONTAS A PAGAR'}).waitFor();
      await back(f.page).click();await f.page.getByRole('heading',{name:'O ritmo das suas contas.',exact:true}).waitFor();
      await back(f.page).click();await moduleButton(f.page,'LOJA').waitFor();
      await moduleButton(f.page,'CRM').click();
      await f.page.getByRole('heading',{name:'CRM DE LEADS.',exact:true}).waitFor();
      await f.page.getByRole('button',{name:'CRM',exact:true}).click();
      await moduleButton(f.page,'Config').waitFor();
      // A hard-opened standalone link has an internal fallback, not an external back.
      await f.page.goto(`${origin}/planos/xpace`);
      await f.page.getByRole('heading',{name:'Planos e Pagamentos',exact:true}).waitFor();
      await f.page.locator('button.xb-back-title').click();
      await f.page.waitForURL(`${origin}/xpace`);await moduleButton(f.page,'LOJA').waitFor();
      assert.deepEqual(f.writes,[]);assert.deepEqual(f.errors,[]);await f.context.close();
    }
    console.log('PASS navigation: embedded plan/notifications desktop1440/1024/tablet768/mobile390/320, aligned layout, clickable titles without arrows, keyboard return, actual XPay path, finance levels, unsaved guards, logo home, direct route fallback; no real writes/errors/overflow.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});

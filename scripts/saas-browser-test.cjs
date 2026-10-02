// Local fixtures only: intercept all SaaS requests; never contact billing providers.
const assert=require('node:assert/strict');const path=require('node:path');const {chromium}=require('@playwright/test');
const {setup,snapshot,origin,output}=require('./stock-browser-test.cjs');
const bands=[{min:0,max:50,monthlyCents:9900},{min:51,max:200,monthlyCents:14900},{min:201,max:300,monthlyCents:19900},{min:301,max:500,monthlyCents:24900},{min:501,max:800,monthlyCents:29900},{min:801,max:null,monthlyCents:34900}];
async function checkLinkHub(page,exempt,slug,writes,screenshot,compareLegacyPanels=false){
 const hub=page.locator('.saas-link-hub');
 await hub.getByRole('heading',{name:'Árvore de links',exact:true}).waitFor();
 assert.equal(await hub.getByText('PREPARAÇÃO',{exact:true}).count(),1);
 const price=await hub.locator('.saas-link-hub-price').innerText();
 assert.match(price,exempt?/Isento/i:/19,90/);if(exempt)assert.doesNotMatch(price,/19,90/);
 const preview=hub.locator('details'),summary=preview.locator('summary');
 assert.equal(await summary.count(),1);assert.equal(await preview.evaluate(el=>el.open),false);
 const visual=hub.locator('.xd-xpay-card-visual');
 assert.equal(await visual.count(),1);assert.equal(await visual.getAttribute('aria-hidden'),'true');
 assert.equal(await visual.locator('.xd-xpay-mark').count(),1);
 assert.ok(await visual.locator('svg').count()>0);assert.equal(await visual.locator('svg').evaluateAll(elements=>elements.every(el=>el.closest('[aria-hidden="true"]')!==null)),true);
 assert.notEqual(await visual.evaluate(el=>getComputedStyle(el).backgroundImage),'none');
 await page.evaluate(()=>document.fonts.ready);
 if(compareLegacyPanels){
  const dimensions=await page.locator('.xd-store > .xd-xpay-card:not(.saas-link-hub) > .xd-xpay-card-visual').evaluateAll(elements=>elements.map(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height})));
  assert.equal(dimensions.length,2);
  const hubDimensions=await visual.evaluate(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height}));
  const tablet=page.viewportSize().width>=681&&page.viewportSize().width<=980;
  for(const reference of dimensions){
   assert.ok(Math.abs(hubDimensions.width-reference.width)<=1,`${screenshot}: visual width differs from XPay/messages`);
   if(tablet)assert.ok(hubDimensions.height>=reference.height-1,`${screenshot}: tablet visual shrank below XPay/messages`);
   else assert.ok(Math.abs(hubDimensions.height-reference.height)<=1,`${screenshot}: visual height differs from XPay/messages`);
  }
  if(tablet)assert.ok(Math.abs(hubDimensions.height-await hub.evaluate(el=>el.clientHeight))<=1,`${screenshot}: tablet visual does not fill the card height`);
 }
 await snapshot(page,`${screenshot}-collapsed`);
 if(compareLegacyPanels)await hub.screenshot({path:path.join(output,`${screenshot}-card-collapsed.png`)});
 const before=writes.length;await summary.focus();await page.keyboard.press('Space');
 assert.equal(await preview.evaluate(el=>el.open),true);assert.equal(await hub.locator('.saas-link-hub-sections > li').count(),4);
 const summaryBox=await summary.boundingBox(),companyBox=await hub.locator('.saas-link-hub-company').boundingBox();assert.ok(companyBox.y>=summaryBox.y+summaryBox.height+6,'preview focus must not cover the company name');
 for(const section of await hub.locator('.saas-link-hub-sections > li').all())assert.equal(await section.isVisible(),true);
 assert.equal(await hub.locator('a,button,input,select,textarea').count(),0);assert.equal(await hub.locator('code').innerText(),`/links/${slug}`);
 assert.equal(await hub.getByText('Não publicado. Nenhum endereço público ativo nesta preparação.',{exact:true}).count(),1);assert.equal(writes.length,before);
 await snapshot(page,`${screenshot}-expanded`);
 if(compareLegacyPanels)await hub.screenshot({path:path.join(output,`${screenshot}-card-expanded.png`)});
 await summary.focus();await page.keyboard.press('Enter');assert.equal(await preview.evaluate(el=>el.open),false);assert.equal(writes.length,before);
}
(async()=>{const browser=await chromium.launch({headless:true,channel:'chrome'});try{
 for(const [width,owner]of [[1440,true],[390,false],[320,false]]){
  const f=await setup(browser,width);const writes=[];let preferences={payment_method:null,addons:[]};let config={bands:structuredClone(bands),addons:{WHATSAPP:15000},studentMetric:'PENDING',billingTiming:'MONTH_END',graceDays:null,rangeChange:'PENDING'};
  await f.context.route('**/api/saas/**',async route=>{const req=route.request(),url=new URL(req.url());const send=data=>route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,...data})});if(req.method()==='POST'){const input=req.postDataJSON();writes.push(input);if(url.pathname.endsWith('/plan')){preferences={payment_method:input.paymentMethod,addons:input.addons};return send({message:'PREFERÊNCIA SALVA EM PREPARAÇÃO. NÃO ATIVA SERVIÇOS NEM COBRANÇAS.'});}if(input.action==='SAVE_PRICEBOOK'){config=input.config;return send({book:{id:'00000000-0000-4000-8000-000000000008',revision:2}});}if(input.action==='QUOTE'||input.action==='SAVE_DRAFT'){const band=config.bands.find(b=>input.studentCount>=b.min&&(b.max===null||input.studentCount<=b.max));const quote={exempt:owner,monthlyCents:owner?0:band.monthlyCents+(input.addons.length?15000:0),blockers:['TESTE SEM COBRANÇA'],lines:[]};return send(input.action==='QUOTE'?{quote}:{draft:{id:'fixture-draft',quote}});}return send({message:'PREPARAÇÃO SALVA.'});}
    if(url.pathname.endsWith('/plan'))return send({company:{name:owner?'XPACE':'Escola fixture'},exempt:owner,preferences,activeStudents:51,measurement:'PENDING',preview:{monthlyCents:owner?0:14900+(preferences.addons.length?15000:0)},bands:config.bands,addonMonthlyCents:15000,invoices:[],page:0,total:0,pageSize:10});
    return send({company:{name:owner?'XPACE':'Escola fixture'},exempt:owner,canManage:true,canManagePrices:owner,book:{id:'00000000-0000-4000-8000-000000000008',revision:1,config},account:{account_mode:owner?'PARENT':'SUBACCOUNT',status:'NOT_PREPARED'},whatsappConfigured:false,drafts:[]});
  });
  await f.page.goto(`${origin}/planos/school`);await f.page.getByRole('heading',{name:'Tabela de preços',exact:true}).waitFor();assert.equal(await f.page.locator('.saas-price-list li').count(),6);assert.equal(await f.page.getByText(/Z-API/i).count(),0);await snapshot(f.page,`saas-plan-initial-${width}`);
  await f.page.getByLabel('Forma de pagamento',{exact:true}).selectOption('CREDIT_CARD');await f.page.getByRole('checkbox',{name:/Integrador de mensagens/}).check();await f.page.getByRole('button',{name:'Salvar preferência em preparação',exact:true}).click();await f.page.getByRole('status').filter({hasText:'PREFERÊNCIA SALVA'}).waitFor();assert.equal(writes[0].paymentMethod,'CREDIT_CARD');assert.deepEqual(writes[0].addons,['WHATSAPP']);assert.equal(await f.page.locator('input[type=password]').count(),0);await snapshot(f.page,`saas-plan-${width}`);
  await f.page.goto(`${origin}/loja/school`);await f.page.getByRole('heading',{name:'Integrador de mensagens',exact:true}).waitFor();await f.page.getByLabel('Alunos para simulação',{exact:true}).fill('51');await f.page.getByRole('checkbox',{name:'Incluir WhatsApp',exact:true}).check();await f.page.getByRole('button',{name:'Simular',exact:true}).click();await f.page.getByText(/Total simulado:/).waitFor();if(!owner)assert.match(await f.page.getByText(/Total simulado:/).innerText(),/299/);
  if(owner){await f.page.getByRole('button',{name:'Configurar faixas e adicionais',exact:true}).click();assert.equal(await f.page.locator('fieldset').count(),6);await f.page.locator('fieldset').first().getByLabel('Mensalidade (R$)',{exact:true}).fill('109,00');await f.page.getByRole('button',{name:'Salvar nova versão em preparação',exact:true}).click();await f.page.getByRole('status').filter({hasText:'NOVA VERSÃO SALVA'}).waitFor();assert.equal(writes.find(w=>w.action==='SAVE_PRICEBOOK').config.bands[0].monthlyCents,10900);assert.equal(JSON.stringify(writes).includes('whatsappCostCents'),false);}
  else {assert.equal(await f.page.getByRole('button',{name:'Configurar faixas e adicionais',exact:true}).count(),0);assert.equal(await f.page.getByText(/Z-API/i).count(),0);}
  await checkLinkHub(f.page,owner,'school',writes,`saas-link-hub-${width}`);await snapshot(f.page,`saas-store-${width}`);assert.deepEqual(f.errors,[]);await f.context.close();
 }
 for(const width of [1440,768,390,320]){
  const legacy=await setup(browser,width);await legacy.page.goto(`${origin}/xpace`);await legacy.page.locator('.xd-module').filter({hasText:'LOJA'}).click();await checkLinkHub(legacy.page,true,'xpace',legacy.writes,`saas-link-hub-xpace-legacy-${width}`,true);assert.deepEqual(legacy.writes,[]);assert.deepEqual(legacy.errors,[]);await legacy.context.close();
 }
 console.log('PASS SaaS browser: plans/store desktop and mobile320/390, billing preference, combined quote, owner price editor, provider/cost privacy, link hub exemption, decorative visual matching XPay/messages, keyboard preview without writes or live links, legacy XPACE store1440/768/390/320 collapsed and expanded, no overflow.');
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('@playwright/test');
const os = require('node:os');
const origin = process.env.TEST_ORIGIN || 'http://localhost:3007';
assert.ok(['localhost','127.0.0.1'].includes(new URL(origin).hostname), 'Visual fixtures must only run against a local server');
const out = process.env.TEST_OUTPUT || path.join(os.tmpdir(),'xpacebox-visual');
fs.mkdirSync(out,{recursive:true});
const publicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || fs.readFileSync('.env.local','utf8').match(/^NEXT_PUBLIC_SUPABASE_URL\s*=\s*["']?([^\s"']+)/m)?.[1];
const project = new URL(publicUrl).hostname.split('.')[0];
const user = {id:'00000000-0000-4000-8000-000000000001',email:'visual@example.test',aud:'authenticated',role:'authenticated',created_at:'2026-01-01T00:00:00Z',app_metadata:{provider:'email'},user_metadata:{}};
const company={id:'company-test',name:'DAWOS',slug:'dawos'};
const rep={id:user.id,name:'Representante de teste',email:user.email};
const client = {id:'client-test',clientNumber:1,clientCode:'CLI-000001',legalName:'CLIENTE DE TESTE VISUAL',tradeName:'TESTE VISUAL',buyerName:'Contato',whatsapp:'47999999999',phone:'4730000000',cnpj:'00000000000000',sellerCompanyId:company.id,sellerCompanyName:'DAWOS',representativeUserId:user.id,representativeName:rep.name,active:true,updatedAt:'2026-09-01',state:'SC',city:'Joinville'};
const emptyOverview={currentProfileId:user.id,currentProfileName:rep.name,isManager:true,profiles:[],activities:[],telephonyCalls:[],opportunities:[],quotes:[],expiredQuotes:[],samples:[{id:'sample-test',clientId:client.id,responsibleProfileId:rep.id,deliveryDate:'2026-09-08',status:'IN_PRODUCTION',productDescription:'AMOSTRA DE TESTE'}],whatsappConnections:[]};
const report={isManager:true,currentProfileId:user.id,clients:[],profiles:[],opportunities:[],activities:[],quotes:[],productFichas:[],materials:[],representatives:[rep],salesGoals:{},lostReasons:[]};

const visualEngineeringFormulas=[
  ['mn-b','MALETA NORMAL - B','MALETA','B','(L/2)+3 + A+6 + (L/2)+3','C+3 + L+3 + C+3 + L+3 + 30'],
  ['mn-bc','MALETA NORMAL - BC','MALETA','BC','(L/2)+6 + A+12 + (L/2)+6','C+6 + L+6 + C+6 + L+6 + 35'],
  ['mn-positive-b','MALETA NORMAL FUNDO POSITIVO - B','MALETA','B','L + A + 12','C + L + 30'],
  ['mn-positive-bc','MALETA NORMAL FUNDO POSITIVO - BC','MALETA','BC','L + A + 24','C + L + 42'],
  ['mt-b','MALETA TRANSPASSE TOTAL - B','MALETA','B','L+3 + A+6 + L+3','C+3 + L+3 + C+3 + L+3 + 30'],
  ['mt-bc','MALETA TRANSPASSE TOTAL - BC','MALETA','BC','L+6 + A+12 + L+6','C+6 + L+6 + C+6 + L+6 + 35'],
  ['env-trans-b','CAIXA ENVOLTÓRIA ABA TRANSPASSADA - B','CAIXA ENVOLTÓRIA','B','(L/2)+3+S + A+3 + L+6 + A+3 + (L/2)+3+S','C+6 + L+6 + C+6 + L+6 + 35'],
  ['env-trans-bc','CAIXA ENVOLTÓRIA ABA TRANSPASSADA - BC','CAIXA ENVOLTÓRIA','BC','(L/2)+6+S + A+6 + L+12 + A+6 + (L/2)+6+S','C+12 + L+12 + C+12 + L+12 + 70'],
  ['cv-geral','CORTE E VINCO GERAL','CORTE-VINCO','B / BC','L + 30','C + 30'],
  ['sedex-b','CAIXA SEDEX - B','CORTE-VINCO','B','A + L + 30','C + L + 30'],
  ['sedex-bc','CAIXA SEDEX - BC','CORTE-VINCO','BC','A + L + 60','C + L + 60'],
  ['tab-b','TABULEIRO - B','ACESSÓRIO','B','L','C'],
  ['tab-bc','TABULEIRO - BC','ACESSÓRIO','BC','L','C'],
].map(([id,description,category,wave,widthFormula,lengthFormula])=>({id,style:id.toUpperCase(),description,category,wave,widthFormula,lengthFormula}));

async function setup(browser,viewport,role='platform_owner') {
  const context=await browser.newContext({viewport,deviceScaleFactor:1});
  // Test-only session and network fixtures. No authentication or data changes reach Supabase.
  if (role) await context.addInitScript(({key,user})=>localStorage.setItem(key,JSON.stringify({access_token:'test-only-token',refresh_token:'test-only-refresh',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,user})),{key:`sb-${project}-auth-token`,user});
  const writes=[];
  await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    const send=json=>route.fulfill({contentType:'application/json',body:JSON.stringify(json)});
    if(url.hostname.endsWith('.supabase.co')) {
      if(req.method()!=='GET') {writes.push(req.method()+' '+url.pathname);return send({});}
      if(url.pathname.includes('/auth/')) return send(user);
      if(url.pathname.endsWith('/profiles')) {
        const profile={...user,full_name:rep.name,platform_role:role,active:true,company_members:[{company_id:company.id,company_role:role,companies:[company]}]};
        return send(url.searchParams.has('id')?profile:[profile]);
      }
      if(url.pathname.endsWith('/companies')) return send([company]);
      return send([]);
    }
    if(url.pathname.startsWith('/api/')) {
      if(req.method()!=='GET'){writes.push(req.method()+' '+url.pathname);return send({success:false,message:'Test blocks writes'});}
      if(url.pathname==='/api/gerenciador')return send({success:true,settings:{engineeringFormulas:visualEngineeringFormulas},representatives:[rep]});
      if(url.pathname==='/api/clientes')return send({success:true,clients:[client]});
      if(url.pathname==='/api/clientes/opcoes')return send({success:true,options:{sellerCompanies:[company],representatives:[rep]}});
      if(url.pathname==='/api/crm')return send({success:true,overview:emptyOverview});
      if(url.pathname==='/api/relatorios')return send({success:true,report});
      return send({success:true,lock:null,quotes:[],samples:[],emails:[],connections:[]});
    }
    if(url.origin!==origin) return route.abort();
    return route.continue();
  });
  const page=await context.newPage();
  page.setDefaultTimeout(20000);
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  return {context,page,errors,writes};
}

async function snapshot(page,name){
  await page.evaluate(()=>document.fonts.ready);
  await page.locator('img:visible').evaluateAll(images=>Promise.all(images.map(img=>img.decode().catch(()=>{}))));
  await page.screenshot({path:path.join(out,`${name}.png`),fullPage:true});
  const overflow=await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>{
    const r=e.getBoundingClientRect(),s=getComputedStyle(e);
    if(!r.width||s.position==='absolute'||s.position==='fixed')return false;
    for(let p=e.parentElement;p&&p!==document.body;p=p.parentElement){const x=getComputedStyle(p).overflowX;if(x==='auto'||x==='scroll')return false;}
    return r.right>innerWidth+2||r.left< -2;
  }).slice(0,10).map(e=>({tag:e.tagName,class:e.className,text:e.textContent.slice(0,60)})));
  console.log(name,JSON.stringify(overflow));
  assert.deepEqual(overflow,[],`${name}: content outside viewport`);
}

(async()=>{
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  try {
    for(const [label,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}],['small-mobile',{width:320,height:740}],['tablet',{width:768,height:1024}]]) {
      const {page,context,errors,writes}=await setup(browser,viewport);
      await page.goto(`${origin}/empresa/dawos`);
      await page.locator('.xb-module-chip').first().waitFor();
      await page.waitForFunction(()=>document.querySelectorAll('.xb-module-chip').length===6);
      await page.locator('.xb-welcome-art img').evaluate(img=>img.decode());
      await snapshot(page,`${label}-home`);
      const moving=page.locator('.xb-welcome-art');
      const before=await moving.evaluate(e=>getComputedStyle(e).transform);
      await page.waitForTimeout(400);
      assert.notEqual(await moving.evaluate(e=>getComputedStyle(e).transform),before,'Banner animates');
      await page.getByRole('button',{name:'Pausar animação'}).click();
      await page.waitForFunction(()=>getComputedStyle(document.querySelector('.xb-welcome-art')).animationPlayState==='paused');
      await page.waitForTimeout(100);
      const paused=await moving.evaluate(e=>getComputedStyle(e).transform);
      await page.waitForTimeout(250);
      assert.equal(await moving.evaluate(e=>getComputedStyle(e).transform),paused,'Pause is stable');
      await page.emulateMedia({reducedMotion:'reduce'});
      assert.equal(await moving.evaluate(e=>getComputedStyle(e).animationName),'none','Reduced motion');
      for(const [key,title] of [['manager','GERENCIADOR'],['clients','CLIENTES'],['products','PRODUTOS'],['pricing','FORMACAO DE PRECO'],['finance','FINANCEIRO'],['reports','RELATORIOS']]) {
        await page.locator('.xb-module-list').getByRole('button',{name:title,exact:true}).click();
        await page.waitForTimeout(350);
        await snapshot(page,`${label}-${key}`);
        if(key==='manager') {
          const banner=page.locator('.xb-manager-empty');
          const signal=banner.locator('.xb-manager-signal-track span').first();
          await banner.scrollIntoViewIfNeeded();
          await banner.locator('img').evaluate(img=>img.decode());
          assert.equal(await signal.evaluate(e=>getComputedStyle(e).animationName),'none','Manager respects reduced motion');
          await page.emulateMedia({reducedMotion:'no-preference'});
          await page.waitForFunction(()=>document.querySelector('.xb-manager-empty').dataset.paused==='false');
          const firstFrame=await signal.evaluate(e=>getComputedStyle(e).transform);
          const firstPixels=await banner.screenshot();
          await page.waitForTimeout(450);
          assert.notEqual(await signal.evaluate(e=>getComputedStyle(e).transform),firstFrame,'Manager signal moves');
          assert.notDeepEqual(await banner.screenshot(),firstPixels,'Manager pixels change');
          await banner.getByRole('button',{name:'Pausar animação'}).click();
          await page.waitForTimeout(100);
          const pausedFrame=await signal.evaluate(e=>getComputedStyle(e).transform);
          await page.waitForTimeout(250);
          assert.equal(await signal.evaluate(e=>getComputedStyle(e).transform),pausedFrame,'Manager pause is stable');
          await snapshot(page,`${label}-manager-motion`);
          await banner.getByRole('button',{name:'Retomar animação'}).click();
          await page.waitForTimeout(150);
          assert.notEqual(await signal.evaluate(e=>getComputedStyle(e).transform),pausedFrame,'Manager resumes');
          await page.emulateMedia({reducedMotion:'reduce'});
          await banner.locator('button').waitFor({state:'hidden'});
          assert.equal(await banner.locator('button').count(),0,'No motion control needed with reduced motion');
          for(const [section,child] of [
            ['CONFIGURACOES DAS EMBALAGENS','TIPOS DE PAPELAO'],
            ['CONFIGURACOES DOS FORNECEDORES','FORNECEDORES'],
            ['CADASTROS DE PRODUTOS','ENGENHARIA DA CAIXA'],
            ['CONFIGURACOES DA EMPRESA','PARAMETROS DE PRECO'],
            ['CADASTROS GERAIS','CADASTROS'],
          ]) {
            await page.getByRole('button',{name:section,exact:true}).click();
            await page.getByRole('button',{name:child,exact:true}).waitFor();
            await snapshot(page,`${label}-${section.replaceAll(' ','-')}`);
            await page.locator('.xb-manager-navigation').getByRole('button',{name:'GERENCIADOR',exact:true}).click();
          }
        }
        if(key==='clients') {
          console.log('client buttons',await page.locator('.clients-tabs button').allTextContents());
          await page.getByRole('button',{name:'CRM',exact:true}).click();
          await page.waitForTimeout(350);
          await snapshot(page,`${label}-crm`);
          await page.getByRole('button',{name:'CARTEIRA',exact:true}).click();
          await page.waitForTimeout(350);
          await snapshot(page,`${label}-portfolio`);
        }
        if(key==='pricing') {
          await page.getByRole('button',{name:'PRECO DIRETO',exact:true}).click();
          for (const step of ['TIPO DE CAIXA','CONFIGURAR DIMENSOES','LOTE & LOGISTICA','EMPRESA','VER PRECO']) {
            await page.getByRole('button',{name:step,exact:true}).click();
            if(step==='TIPO DE CAIXA') {
              assert.equal(await page.getByRole('button',{name:/^Em desenvolvimento/}).count(),2,'Two unavailable categories are visible');
              await snapshot(page,`${label}-pricing-categories`);
              await page.getByRole('button',{name:/^Caixa envoltória/}).click();
              await snapshot(page,`${label}-pricing-envoltoria-selected`);
              await page.getByRole('button',{name:/^Caixa envoltória aba transpassada/}).waitFor();
              await snapshot(page,`${label}-pricing-envoltoria`);
            }
            if(step==='CONFIGURAR DIMENSOES') {
              const fields=page.locator('.xb-workspace input[type="number"]:enabled');
              for(let i=0;i<Math.min(await fields.count(),3);i++) await fields.nth(i).fill(['450','400','300'][i]);
            }
            await page.waitForTimeout(120);
            await snapshot(page,`${label}-pricing-${step.replaceAll(' ','-')}`);
          }
        }
        if(key==='products') {
          await page.getByRole('button',{name:'+ NOVA FICHA TECNICA',exact:true}).click();
          await page.getByRole('button',{name:'+ ADICIONAR ACESSORIO',exact:true}).click();
          await snapshot(page,`${label}-product-accessory`);
        }
        if(key==='reports') {
          await page.getByRole('button',{name:'COMERCIAL',exact:true}).click();
          await page.getByRole('button',{name:'GESTAO',exact:true}).click();
          const color=await page.locator('.xb-section-navigation .is-active').evaluate(e=>getComputedStyle(e).backgroundColor);
          assert.equal(color,'rgb(192, 38, 211)','Current reports navigation color');
          await snapshot(page,`${label}-reports-management`);
        }
      }
      await page.goto(`${origin}/usuarios`);
      await page.getByRole('button',{name:'NOVO USUARIO'}).waitFor();
      await snapshot(page,`${label}-users`);
      await page.getByRole('button',{name:'NOVO USUARIO'}).click();
      await snapshot(page,`${label}-user-form`);
      await page.getByRole('button',{name:'CRIAR USUARIO',exact:true}).scrollIntoViewIfNeeded();
      const saveBounds=await page.getByRole('button',{name:'CRIAR USUARIO',exact:true}).boundingBox();
      assert.ok(saveBounds.y>=0 && saveBounds.y+saveBounds.height<=viewport.height,'Modal footer can be reached');
      await page.goto(origin);
      await page.locator('.xb-central-topbar .xb-brand-logo').waitFor();
      await snapshot(page,`${label}-central`);
      assert.deepEqual(errors,[],`${label} client errors`);
      assert.deepEqual(writes,[],`${label} unexpected writes`);
      await context.close();
      const login=await setup(browser,viewport,null);
      await login.page.goto(`${origin}/login`);
      await login.page.locator('.xb-login-form').waitFor();
      await snapshot(login.page,`${label}-login`);
      await login.context.close();
    }
    const {context,page}=await setup(browser,{width:1440,height:1000},'company_user');
    await page.goto(`${origin}/empresa/dawos`);
    await page.waitForFunction(()=>document.querySelectorAll('.xb-module-chip').length===5);
    const centers=await page.locator('.xb-module-list').evaluate(e=>{
      const buttons=[...e.children].map(x=>x.getBoundingClientRect());
      const list=e.getBoundingClientRect();
      return {buttons:(buttons[0].left+buttons.at(-1).right)/2,list:(list.left+list.right)/2};
    });
    assert.ok(Math.abs(centers.buttons-centers.list)<1,'Restricted navigation remains centered');
    await snapshot(page,'restricted-home');
    await context.close();
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

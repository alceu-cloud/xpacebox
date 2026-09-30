// Local-only browser fixtures. All API/Supabase calls are intercepted.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {chromium}=require('@playwright/test');
const origin=process.env.TEST_ORIGIN||'http://localhost:3007';
assert.ok(['localhost','127.0.0.1'].includes(new URL(origin).hostname));
require('@next/env').loadEnvConfig(process.cwd());
const project=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
const out=path.join(os.tmpdir(),'dawos-samples-history');fs.mkdirSync(out,{recursive:true});
const user={id:'00000000-0000-4000-8000-000000000001',email:'test@example.test',aud:'authenticated',role:'authenticated',created_at:'2026-01-01',app_metadata:{provider:'email'},user_metadata:{}};
const company={id:'company-test',name:'DAWOS',slug:'dawos'},rep={id:user.id,name:'CONSULTOR TESTE',email:user.email};
const client={id:'client-test',clientCode:'CLI-TESTE',legalName:'CLIENTE TESTE',tradeName:'CLIENTE TESTE',cnpj:'00000000000000',representativeUserId:user.id,active:true,sellerCompanyId:company.id};
const now=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
(async()=>{
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  try{for(const [label,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
    let sample={id:'sample-test',sampleCode:'AM-TESTE',clientId:client.id,clientName:client.tradeName,responsibleProfileId:user.id,responsibleName:rep.name,requestedAt:'2026-09-17',status:'IN_PRODUCTION',productionDueDate:'2026-09-23',originalProductionDueDate:'2026-09-23',controlDueDate:'2026-09-23',controlStage:'PRODUCAO',deadlineBaselineAt:'2026-09-30T13:00:00Z',customerDeliveryDate:'',approvalDueDate:'',readyAt:'',deliveredAt:'',approvedAt:'',closedAt:'',productDescription:'CAIXA TESTE',quantity:1,notes:''};
    const events=[],writes=[],errors=[];
    const context=await browser.newContext({viewport});
    await context.addInitScript(({project,user})=>localStorage.setItem(`sb-${project}-auth-token`,JSON.stringify({access_token:'fixture',refresh_token:'fixture',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user})),{project,user});
    await context.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url()),send=value=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(value)});
      if(url.hostname.endsWith('supabase.co')){
        if(url.pathname.startsWith('/auth/'))return send(user);
        if(url.pathname.endsWith('/profiles')){const p={...user,full_name:rep.name,platform_role:'platform_owner',active:true,company_members:[{company_id:company.id,company_role:'company_manager',companies:[company]}]};return send(url.searchParams.has('id')?p:[p]);}
        if(url.pathname.endsWith('/companies'))return send([company]);return send([]);
      }
      if(url.pathname.startsWith('/api/')){
        if(request.method()!=='GET'){
          assert.ok(url.pathname.endsWith('/transicao'),'Unexpected fixture write');const body=request.postDataJSON();writes.push(body);
          events.push({id:'e'+writes.length,stage:sample.controlStage,action:body.action,oldDueDate:sample.controlCurrentDueDate || sample.controlDueDate,newDueDate:body.action==='REPROGRAM'?body.nextDueDate:'',actualDate:body.actualDate,reason:body.reason,changedByName:rep.name,createdAt:new Date().toISOString()});
          if(body.action==='REPROGRAM')sample={...sample,productionDueDate:body.nextDueDate,controlCurrentDueDate:body.nextDueDate};
          else if(body.action==='MARK_READY')sample={...sample,status:'READY',readyAt:body.actualDate,customerDeliveryDate:body.nextDueDate,originalCustomerDeliveryDate:body.nextDueDate,controlDueDate:body.nextDueDate,controlCurrentDueDate:body.nextDueDate,controlStage:'ENTREGA'};
          return send({success:true});
        }
        if(url.pathname.endsWith('/historico'))return send({success:true,events});
        if(url.pathname==='/api/clientes/amostras')return send({success:true,samples:[sample]});
        if(url.pathname==='/api/clientes')return send({success:true,clients:[client]});
        if(url.pathname==='/api/clientes/opcoes')return send({success:true,options:{sellerCompanies:[company],representatives:[rep]}});
        if(url.pathname==='/api/gerenciador')return send({success:true,settings:{},representatives:[rep]});
        if(url.pathname==='/api/crm/unplanned-clients')return send({success:true,profileId:user.id,scheduledClientIds:[client.id],blockedClientIds:[]});
        if(url.pathname==='/api/crm')return send({success:true,overview:{currentProfileId:user.id,isManager:true,profiles:[],activities:[],telephonyCalls:[],opportunities:[],quotes:[],expiredQuotes:[],samples:[],whatsappConnections:[]}});
        return send({success:true,lock:null,quotes:[],samples:[],emails:[],connections:[]});
      }
      if(url.origin!==origin)return route.abort();return route.continue();
    });
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
    await page.goto(origin+'/empresa/dawos');await page.locator('.xb-module-list').getByRole('button',{name:'CLIENTES',exact:true}).click();await page.getByRole('button',{name:'AMOSTRAS',exact:true}).click();
    const card=page.locator('.samples-card');await card.waitFor();
    await card.getByRole('button',{name:'REPROGRAMAR PRAZO'}).click();let dialog=page.getByRole('dialog',{name:'REPROGRAMAR PRAZO'});
    await dialog.getByRole('button',{name:'CONFIRMAR'}).click();await dialog.getByRole('alert').waitFor();assert.equal(writes.length,0);
    await dialog.getByLabel('NOVO PRAZO').fill('2026-10-02');await dialog.getByLabel('MOTIVO DA REPROGRAMACAO').fill('FALTA DE MATERIAL');
    await dialog.getByRole('button',{name:'CONFIRMAR'}).click();await dialog.waitFor({state:'hidden'});assert.equal(writes[0].expectedDueDate,'2026-09-23');
    await card.getByRole('button',{name:'MARCAR PRONTA'}).click();dialog=page.getByRole('dialog',{name:'AMOSTRA PRONTA'});
    await dialog.getByLabel('DATA REAL EM QUE FICOU PRONTA').fill(now());await dialog.getByLabel('DATA PREVISTA PARA ENTREGAR AO CLIENTE').fill('2026-10-03');
    await dialog.getByRole('button',{name:'CONFIRMAR'}).click();await dialog.waitFor({state:'hidden'});assert.equal(writes[1].actualDate,now());assert.equal(writes[1].expectedDueDate,'2026-10-02');
    await card.getByRole('button',{name:'HISTORICO'}).click();dialog=page.getByRole('dialog',{name:'HISTORICO DA AMOSTRA'});await dialog.locator('.samples-history-events li').first().waitFor();
    assert.equal(await dialog.locator('.samples-history-events li').count(),2);assert.match(await dialog.innerText(),/23\/09\/2026/);assert.match(await dialog.innerText(),/02\/10\/2026/);assert.match(await dialog.innerText(),/FALTA DE MATERIAL/);
    await page.screenshot({path:path.join(out,label+'-history.png'),fullPage:true});
    assert.ok(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth+1),'Dialog overflows');
    await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.equal(await card.getByRole('button',{name:'HISTORICO'}).evaluate(e=>e===document.activeElement),true,'Focus not restored');
    await card.getByRole('button',{name:'EDITAR'}).click();assert.equal(await page.getByLabel('PRAZO PARA FICAR PRONTA',{exact:true}).isDisabled(),true);
    assert.deepEqual(errors,[]);await context.close();
  }}finally{await browser.close();}
  console.log('PASS: desktop/mobile history, original/current dates, required reason, actual date, keyboard focus/Escape, read-only editing and intercepted writes. Screenshots: '+out);
})().catch(e=>{console.error(e);process.exitCode=1});

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
const clients=[client,...Array.from({length:10},(_,i)=>({...client,id:'client-extra-'+i,clientCode:'CLI-EXTRA-'+i,legalName:'CLIENTE EXTRA '+i,tradeName:'CLIENTE EXTRA '+i}))];
const productFicha={id:'ficha-test',clientId:client.id,status:'ATIVO',ftNumber:'FT-TESTE',reference:'CAIXA TESTE'};
const now=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
(async()=>{
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  try{for(const [label,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
    let sample={id:'sample-test',sampleCode:'AM-TESTE',clientId:client.id,clientName:client.tradeName,responsibleProfileId:user.id,responsibleName:rep.name,requestedAt:'2026-09-17',status:'IN_PRODUCTION',deliveryDate:'',productionDueDate:'2026-09-23',originalProductionDueDate:'2026-09-23',controlDueDate:'2026-09-23',controlStage:'PRODUCAO',deadlineBaselineAt:'2026-09-30T13:00:00Z',customerDeliveryDate:'',approvalDueDate:'',readyAt:'',deliveredAt:'',approvedAt:'',closedAt:'',productFichaId:productFicha.id,productDescription:'CAIXA TESTE',dimensions:'',shippingMethod:'',trackingCode:'',quantity:1,notes:''};
    const events=[],writes=[],saveWrites=[],errors=[];
    let createdSamples=[],failNextSave=true;
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
          if(url.pathname==='/api/clientes/amostras'){
            assert.ok(['POST','PATCH'].includes(request.method()),'Unexpected sample fixture write');
            const body=request.postDataJSON();saveWrites.push({method:request.method(),body});
            if(failNextSave){failNextSave=false;return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({success:false,message:'FALHA SIMULADA AO SALVAR AMOSTRA.'})});}
            const previous=createdSamples.find(item=>item.id===body.sample.id);
            if(request.method()==='PATCH')assert.ok(previous,'Unknown sample fixture edit');
            const saved={...(previous||sample),...body.sample,id:previous?.id||'sample-created',sampleCode:previous?.sampleCode||'AM-NOVA',clientName:client.tradeName,responsibleName:rep.name,quantity:Number(body.sample.quantity),controlStage:'PRODUCAO',controlDueDate:body.sample.productionDueDate,controlCurrentDueDate:body.sample.productionDueDate,originalProductionDueDate:previous?.originalProductionDueDate||body.sample.productionDueDate,deadlineBaselineAt:''};
            createdSamples=previous?createdSamples.map(item=>item.id===saved.id?saved:item):[saved,...createdSamples];
            return send({success:true,sample:saved,notificationSent:false,notificationError:''});
          }
          assert.ok(url.pathname.endsWith('/transicao'),'Unexpected fixture write');const body=request.postDataJSON();writes.push(body);
          events.push({id:'e'+writes.length,stage:sample.controlStage,action:body.action,oldDueDate:sample.controlCurrentDueDate || sample.controlDueDate,newDueDate:body.action==='REPROGRAM'?body.nextDueDate:'',actualDate:body.actualDate,reason:body.reason,changedByName:rep.name,createdAt:new Date().toISOString()});
          if(body.action==='REPROGRAM')sample={...sample,productionDueDate:body.nextDueDate,controlCurrentDueDate:body.nextDueDate};
          else if(body.action==='MARK_READY')sample={...sample,status:'READY',readyAt:body.actualDate,customerDeliveryDate:body.nextDueDate,originalCustomerDeliveryDate:body.nextDueDate,controlDueDate:body.nextDueDate,controlCurrentDueDate:body.nextDueDate,controlStage:'ENTREGA'};
          return send({success:true});
        }
        if(url.pathname.endsWith('/historico'))return send({success:true,events});
        if(url.pathname==='/api/clientes/amostras')return send({success:true,samples:[...createdSamples,sample]});
        if(url.pathname==='/api/clientes')return send({success:true,clients});
        if(url.pathname==='/api/clientes/opcoes')return send({success:true,options:{sellerCompanies:[company],representatives:[rep]}});
        if(url.pathname==='/api/gerenciador')return send({success:true,settings:{productFichas:[productFicha]},representatives:[rep]});
        if(url.pathname==='/api/crm/unplanned-clients')return send({success:true,profileId:user.id,scheduledClientIds:clients.map(item=>item.id),blockedClientIds:[]});
        if(url.pathname==='/api/crm')return send({success:true,overview:{currentProfileId:user.id,isManager:true,profiles:[],activities:[],telephonyCalls:[],opportunities:[],quotes:[],expiredQuotes:[],samples:[],whatsappConnections:[]}});
        return send({success:true,lock:null,quotes:[],samples:[],emails:[],connections:[]});
      }
      if(url.origin!==origin)return route.abort();return route.continue();
    });
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
    await page.goto(origin+'/empresa/dawos');await page.locator('.xb-module-list').getByRole('button',{name:'CLIENTES',exact:true}).click();await page.getByRole('button',{name:'AMOSTRAS',exact:true}).click();
    const card=page.locator('.samples-card');await card.waitFor();
    assert.equal(await page.locator('.samples-form').count(),0,'Creation form is visible on entry');
    assert.equal(await page.getByRole('dialog').count(),0,'A dialog is open on entry');
    assert.equal(await page.locator('.samples-summary > div').count(),3,'Summary boxes are missing');
    const createButton=page.locator('.samples-header').getByRole('button',{name:'CADASTRAR AMOSTRA',exact:true});
    assert.equal(await createButton.isVisible(),true);assert.equal(await page.getByRole('heading',{name:'AMOSTRAS EM ABERTO',exact:true}).isVisible(),true);
    await page.screenshot({path:path.join(out,label+'-initial.png'),fullPage:true});
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
    await card.getByRole('button',{name:'EDITAR'}).click();dialog=page.getByRole('dialog',{name:'EDITAR AMOSTRA',exact:true});await dialog.waitFor();
    assert.equal(await dialog.getByLabel('PRAZO PARA FICAR PRONTA',{exact:true}).isDisabled(),true);
    assert.equal(await dialog.getByLabel('QUANTIDADE',{exact:true}).inputValue(),'1');
    await dialog.getByRole('button',{name:'CANCELAR EDICAO',exact:true}).click();await dialog.waitFor({state:'hidden'});
    assert.equal(await card.getByRole('button',{name:'EDITAR',exact:true}).evaluate(e=>e===document.activeElement),true,'Edit cancel did not restore focus');
    await createButton.click();dialog=page.getByRole('dialog',{name:'CADASTRAR AMOSTRA',exact:true});await dialog.waitFor();
    const clientInput=dialog.getByRole('combobox',{name:'CLIENTE',exact:true});
    await clientInput.fill('CLIENTE TESTE');const clientMenu=dialog.getByRole('listbox',{name:'CLIENTE',exact:true});await clientMenu.waitFor();
    assert.ok(await clientMenu.evaluate(e=>{const modal=e.closest('dialog').getBoundingClientRect(),menu=e.getBoundingClientRect();return menu.left>=modal.left&&menu.right<=modal.right+1;}),'Searchable client menu overflows dialog');
    await clientMenu.getByRole('option',{name:/^CLIENTE TESTE - /}).click();
    await dialog.getByLabel('OBSERVACOES').fill('RASCUNHO DESCARTADO');
    await dialog.getByRole('button',{name:'FECHAR FORMULARIO DE AMOSTRA',exact:true}).click();await dialog.waitFor({state:'hidden'});
    assert.equal(await createButton.evaluate(e=>e===document.activeElement),true,'Creation close did not restore focus');
    await createButton.click();dialog=page.getByRole('dialog',{name:'CADASTRAR AMOSTRA',exact:true});await dialog.waitFor();
    assert.equal(await dialog.getByLabel('OBSERVACOES').inputValue(),'','Reopening creation retained discarded values');
    await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
    assert.equal(await createButton.evaluate(e=>e===document.activeElement),true,'Creation Escape did not restore focus');
    await createButton.click();dialog=page.getByRole('dialog',{name:'CADASTRAR AMOSTRA',exact:true});await dialog.waitFor();
    await dialog.getByRole('combobox',{name:'CLIENTE',exact:true}).fill('CLIENTE TESTE');
    await dialog.getByRole('listbox',{name:'CLIENTE',exact:true}).getByRole('option',{name:/^CLIENTE TESTE - /}).click();
    await dialog.getByLabel('ITEM CADASTRADO',{exact:true}).selectOption(productFicha.id);
    await dialog.getByLabel('PRAZO PARA FICAR PRONTA',{exact:true}).fill('2026-10-05');
    await dialog.getByLabel('QUANTIDADE',{exact:true}).fill('3');await dialog.getByLabel('OBSERVACOES').fill('AMOSTRA NOVA');
    await dialog.getByRole('button',{name:'CADASTRAR AMOSTRA',exact:true}).click();await dialog.getByRole('alert').waitFor();
    assert.match(await dialog.getByRole('alert').innerText(),/FALHA SIMULADA/);assert.equal(await dialog.isVisible(),true,'Save error closed creation dialog');
    assert.equal(await dialog.getByLabel('QUANTIDADE',{exact:true}).inputValue(),'3');assert.equal(await dialog.getByLabel('OBSERVACOES').inputValue(),'AMOSTRA NOVA');
    assert.equal(await dialog.getByLabel('PRAZO PARA FICAR PRONTA',{exact:true}).inputValue(),'2026-10-05');
    assert.equal(await page.locator('.samples-shell > .clients-feedback-error').count(),0,'Save error escaped the form dialog');
    await page.screenshot({path:path.join(out,label+'-create-error.png'),fullPage:true});
    assert.ok(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth+1),'Creation dialog overflows');
    await dialog.getByRole('button',{name:'CADASTRAR AMOSTRA',exact:true}).click();await dialog.waitFor({state:'hidden'});
    const createdCard=page.locator('.samples-card').filter({hasText:'AM-NOVA'});await createdCard.waitFor();
    assert.equal(await createdCard.locator('dl > div').first().locator('dd').innerText(),'3');assert.equal(await page.locator('.samples-card').count(),2);
    assert.equal(saveWrites.length,2);assert.equal(saveWrites[1].method,'POST');assert.equal(saveWrites[1].body.sample.clientId,client.id);
    assert.equal(await createButton.evaluate(e=>e===document.activeElement),true,'Successful creation did not restore focus');
    await createdCard.getByRole('button',{name:'EDITAR',exact:true}).click();dialog=page.getByRole('dialog',{name:'EDITAR AMOSTRA',exact:true});await dialog.waitFor();
    assert.equal(await dialog.getByLabel('QUANTIDADE',{exact:true}).inputValue(),'3');assert.equal(await dialog.getByLabel('OBSERVACOES').inputValue(),'AMOSTRA NOVA');
    assert.equal(await dialog.getByLabel('PRAZO PARA FICAR PRONTA',{exact:true}).isDisabled(),true);
    await dialog.getByLabel('QUANTIDADE',{exact:true}).fill('5');await dialog.getByLabel('OBSERVACOES').fill('AMOSTRA EDITADA');
    await page.screenshot({path:path.join(out,label+'-edit.png'),fullPage:true});
    assert.ok(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth+1),'Edit dialog overflows');
    await dialog.getByRole('button',{name:'SALVAR ALTERACOES',exact:true}).click();await dialog.waitFor({state:'hidden'});
    assert.equal(saveWrites.length,3);assert.equal(saveWrites[2].method,'PATCH');assert.equal(saveWrites[2].body.sample.id,'sample-created');
    assert.equal(await createdCard.locator('dl > div').first().locator('dd').innerText(),'5');assert.equal(await page.locator('.samples-card').count(),2);
    assert.equal(await createdCard.getByRole('button',{name:'EDITAR',exact:true}).evaluate(e=>e===document.activeElement),true,'Successful edit did not restore focus');
    assert.equal(await page.locator('.samples-form').count(),0,'Form remained mounted after successful save');
    assert.deepEqual(errors,[]);await context.close();
  }}finally{await browser.close();}
  console.log('PASS: desktop/mobile initial summary/list, create/edit dialogs, searchable clients, error retention, mocked POST/PATCH updates, close/Escape/focus, history and deadline transitions. All API writes intercepted. Screenshots: '+out);
})().catch(e=>{console.error(e);process.exitCode=1});

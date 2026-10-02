// All API/provider calls intercepted; fixture-only writes. Never send real mail.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {chromium}=require('@playwright/test');
require('@next/env').loadEnvConfig(process.cwd());
const origin=process.env.TEST_ORIGIN||'http://localhost:3007';assert.ok(['localhost','127.0.0.1'].includes(new URL(origin).hostname));
const project=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
const out=path.join(os.tmpdir(),'xpacebox-notifications');fs.mkdirSync(out,{recursive:true});
const user={id:'00000000-0000-4000-8000-000000000001',email:'test@example.test',aud:'authenticated',role:'authenticated',created_at:'2026-01-01',app_metadata:{provider:'email'},user_metadata:{}};
(async()=>{const browser=await chromium.launch({headless:true,channel:'chrome'});try{
  for(const slug of ['dawos','xpace'])for(const [label,viewport]of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
    let read=false,categories=['EXPERIMENTAL','FINANCEIRO','CONTRATO','EMAIL','WHATSAPP','CRM'];const writes=[],errors=[];
    const company={id:'company-test',name:slug.toUpperCase(),slug};const context=await browser.newContext({viewport});
    await context.addInitScript(({project,user})=>localStorage.setItem(`sb-${project}-auth-token`,JSON.stringify({access_token:'fixture',refresh_token:'fixture',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user})),{project,user});
    await context.addInitScript(()=>{
      window.__issueAlarmNotes=0;
      window.AudioContext=class {
        state='suspended';currentTime=0;destination={};
        async resume(){this.state='running';}async suspend(){this.state='suspended';}async close(){this.state='closed';}
        createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}};}
        createOscillator(){return {frequency:{setValueAtTime(){}},connect(){},start(){window.__issueAlarmNotes++;},stop(){}};}
      };
    });
    await context.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url()),send=value=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(value)});
      if(url.hostname.endsWith('supabase.co')){
        if(url.pathname.startsWith('/auth/'))return send(user);
        if(url.pathname.endsWith('/profiles')){const p={...user,full_name:'USUÁRIO TESTE',platform_role:'platform_owner',active:true,company_members:[{company_id:company.id,company_role:'company_manager',companies:[company]}]};return send(url.searchParams.has('id')?p:[p]);}
        if(url.pathname.endsWith('/companies'))return send([company]);return send([]);
      }
      if(url.pathname.startsWith('/api/')){
        if(url.pathname==='/api/notifications'){
          if(request.method()==='PATCH'){const b=request.postDataJSON();writes.push(b);if(b.action==='MARK_READ')read=true;if(b.action==='PREFERENCES')categories=b.categories;return send({success:true});}
          if(url.searchParams.get('preferencesOnly'))return send({success:true,userName:'USUÁRIO TESTE',preferences:{categories,readBefore:{}}});
          const issues=slug==='dawos'?[
            {id:'sample',category:'EMAIL',title:'E-mail da amostra AM-000002 não enviado',detail:'PAES BUENO · Aviso de atraso na produção. O problema foi no e-mail de cobrança.',createdAt:new Date().toISOString(),target:'EMAIL',diagnosis:{cause:'Naquela tentativa, o servidor não conseguiu ler a chave de e-mail salva.',steps:['Abra a configuração e use Enviar teste. O teste não reenvia a amostra.','Se o teste atual funcionar, não troque a chave.'],actionLabel:'Configurar e-mail',secondaryTarget:'SAMPLES',secondaryLabel:'Ver controle de amostras'}},
            {id:'agenda',category:'EMAIL',title:'Resumo diário do CRM não enviado',detail:'USUÁRIO TESTE · E-mail com 12 ações do dia e 2 atrasadas. Suas tarefas continuam no CRM.',createdAt:new Date().toISOString(),target:'EMAIL',diagnosis:{cause:'Naquela tentativa, o servidor não conseguiu ler a chave de e-mail salva.',steps:['O teste não apaga a tentativa com erro.'],actionLabel:'Configurar e-mail',secondaryTarget:'CRM',secondaryLabel:'Ver agenda do CRM'}}
          ]:[{id:'issue',category:'CRM',title:'ALUNO TESTE · ganho com dados pendentes',detail:'Preencher: confirmação; presença; resultado da matrícula.',createdAt:new Date().toISOString(),target:'CRM',leadId:'lead-test'}];
          const notices=[{id:'trial',category:'EXPERIMENTAL',title:'ALUNO TESTE',detail:'Aula experimental · 05/10/2026',createdAt:new Date().toISOString(),target:'CRM',leadId:'lead-test'},{id:'paid',category:'FINANCEIRO',title:'Pagamento recebido',detail:'R$ 100,00 · confira em Financeiro.',createdAt:new Date().toISOString(),target:'FINANCE'}];
          const bucket=url.searchParams.get('bucket'),list=bucket==='ISSUES'?issues:bucket==='READ'?(read?notices:[]):(read?[]:notices);
          return send({success:true,items:list,total:list.length,unread:read?0:2,issueCount:issues.length,issueSignals:issues.map(i=>({id:i.id})),todayErrors:slug==='dawos'?2:0,page:0,pageSize:2,snapshotAt:new Date().toISOString(),preferences:{categories,readBefore:{}}});
        }
        if(request.method()!=='GET')throw Error('Unexpected write '+url.pathname);
        if(url.pathname==='/api/xpace/home')return send({success:true,metrics:{activeClients:48,newClientsThisMonth:7}});
        if(url.pathname==='/api/xpace/message-connector/status')return send({success:true,configured:false});
        if(url.pathname==='/api/gerenciador')return send({success:true,settings:{},representatives:[]});
        if(url.pathname==='/api/integracoes/email')return send({success:true,integration:{configured:true,enabled:true,sender:'test@example.test',replyTo:'',scheduleLabel:'DIAS UTEIS, 07:30',credentialHealth:'READABLE'},recipients:[]});
        if(url.pathname==='/api/clientes')return send({success:true,clients:[]});
        if(url.pathname.startsWith('/api/empresas/'))return send({success:true,canAccessCentral:true,company});
        return send({success:true,lock:null,latest:null,quotes:[],samples:[],connections:[]});
      }
      if(url.origin!==origin)return route.abort();return route.continue();
    });
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
    await page.goto(origin+(slug==='dawos'?'/empresa/dawos':'/xpace'));
    if(slug==='dawos'){await page.getByRole('navigation',{name:'Módulos da empresa'}).getByRole('button',{name:'GERENCIADOR',exact:true}).waitFor();assert.equal(await page.locator('.cn-panel').count(),0,'Company landing must not contain the DAWOS panel');await page.getByRole('navigation',{name:'Módulos da empresa'}).getByRole('button',{name:'GERENCIADOR',exact:true}).click();}
    const panel=page.locator('.cn-panel');await panel.waitFor();await panel.locator('.cn-notice').first().waitFor();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Page overflow');
    await panel.getByRole('button',{name:/^PROVIDÊNCIAS/}).click();await panel.getByText(slug==='dawos'?'E-mail da amostra AM-000002 não enviado':'ALUNO TESTE · ganho com dados pendentes',{exact:true}).waitFor();
    await panel.getByRole('button',{name:'Silenciar som de providências',exact:true}).waitFor();
    await page.waitForFunction(()=>window.__issueAlarmNotes===3);
    assert.equal(await panel.locator('.cn-issues-tab').evaluate(el=>getComputedStyle(el).color),'rgb(180, 35, 24)');
    await panel.locator('.cn-sound-button').focus();assert.equal(await panel.locator('.cn-sound-button').evaluate(el=>el===document.activeElement),true);
    assert.equal(await panel.getByRole('button',{name:'Marcar todas como lidas'}).count(),0,'Issues cannot be acknowledged');
    await page.screenshot({path:path.join(out,`${slug}-${label}-issues.png`),fullPage:true});
    if(slug==='dawos'){
      await panel.getByText('Como resolver',{exact:true}).first().click();await panel.getByText('Se o teste atual funcionar, não troque a chave.',{exact:true}).waitFor();
      await panel.getByRole('button',{name:'Configurar e-mail',exact:true}).first().click();await page.getByRole('heading',{name:'E-MAIL · RESEND',exact:true}).waitFor();await page.getByText('CREDENCIAL LEGÍVEL',{exact:true}).waitFor();
      await page.getByRole('navigation',{name:'Módulos da empresa'}).getByRole('button',{name:'GERENCIADOR',exact:true}).click();await panel.waitFor();
      await panel.getByRole('button',{name:'Ver controle de amostras'}).click();await page.getByRole('button',{name:'AMOSTRAS',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'AMOSTRAS',exact:true}).getAttribute('aria-current'),'page');
      await page.getByRole('navigation',{name:'Módulos da empresa'}).getByRole('button',{name:'GERENCIADOR',exact:true}).click();await panel.waitFor();
    }
    await panel.getByRole('button',{name:/^NÃO LIDAS/}).click();await panel.getByRole('button',{name:'Marcar todas como lidas'}).click();await panel.getByRole('button',{name:'LIDAS',exact:true}).waitFor();await panel.getByText('Pagamento recebido',{exact:true}).waitFor();
    await panel.getByRole('button',{name:/^NÃO LIDAS/}).click();await panel.getByText('Nenhuma notificação não lida.',{exact:true}).waitFor();
    await page.reload();if(slug==='dawos')await page.getByRole('navigation',{name:'Módulos da empresa'}).getByRole('button',{name:'GERENCIADOR',exact:true}).click();await page.locator('.cn-panel').waitFor();if(slug==='xpace')await page.getByText('Nenhuma notificação não lida.',{exact:true}).waitFor();
    const sound=page.locator('.cn-sound-button');await sound.waitFor();await sound.click();
    await page.locator('.cn-panel').getByRole('button',{name:'Silenciar som de providências',exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>window.__issueAlarmNotes),0,'Reload must not sound the same issue again');
    await sound.click();await page.locator('.cn-panel').getByRole('button',{name:'Ativar som de providências',exact:true}).waitFor();
    await page.locator('.cn-panel').getByRole('button',{name:'Usuário e notificações',exact:true}).click();
    const preferences=page.locator('.cn-preferences');await preferences.waitFor();await preferences.getByRole('button',{name:'SALVAR PREFERÊNCIAS'}).click();await preferences.getByRole('status').waitFor();
    await page.screenshot({path:path.join(out,`${slug}-${label}-preferences.png`),fullPage:true});
    if(slug==='dawos'){
      const modules=page.getByRole('navigation',{name:'Módulos da empresa'});
      await modules.getByRole('button',{name:'CLIENTES',exact:true}).click();
      await modules.getByRole('button',{name:'Voltar à tela anterior',exact:true}).click();
      assert.equal(await modules.getByRole('button',{name:'GERENCIADOR',exact:true}).getAttribute('aria-current'),'page');
      await page.getByRole('button',{name:'DAWOS · ir para o início',exact:true}).click();
      assert.equal(await modules.locator('button[aria-current="page"]').count(),0);
      assert.equal(await modules.getByRole('button',{name:'Voltar à tela anterior',exact:true}).count(),0);
    }
    assert.ok(writes.some(w=>w.action==='MARK_READ'));assert.ok(writes.some(w=>w.action==='PREFERENCES'));assert.deepEqual(errors,[]);
    await context.close();console.log(`PASS ${slug} ${label}: panel, read/issue separation, persistence, preferences and no overflow.`);
  }
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1});

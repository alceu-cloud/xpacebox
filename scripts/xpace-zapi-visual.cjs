// Local-only UI fixtures: no production requests or real WhatsApp sends.
const fs=require('node:fs'), path=require('node:path'), os=require('node:os'), assert=require('node:assert/strict');
const {chromium}=require('@playwright/test');
const origin=process.env.TEST_ORIGIN||'http://localhost:3007';
assert.ok(['localhost','127.0.0.1'].includes(new URL(origin).hostname));
const publicUrl=fs.readFileSync('.env.local','utf8').match(/^NEXT_PUBLIC_SUPABASE_URL\s*=\s*["']?([^\s"']+)/m)?.[1];
const project=new URL(publicUrl).hostname.split('.')[0];
const user={id:'00000000-0000-4000-8000-000000000001',email:'visual@example.test',aud:'authenticated',role:'authenticated',created_at:'2026-01-01T00:00:00Z',app_metadata:{provider:'email'},user_metadata:{}};
const out=path.join(os.tmpdir(),'xpace-zapi-visual');fs.mkdirSync(out,{recursive:true});
(async()=>{
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  try{
    for(const [label,viewport]of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
      const context=await browser.newContext({viewport,timezoneId:'America/Sao_Paulo'});
      await context.addInitScript(({key,user})=>localStorage.setItem(key,JSON.stringify({access_token:'fixture-token',refresh_token:'fixture-refresh',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,user})),{key:`sb-${project}-auth-token`,user});
      let settings={success:true,configured:false};const writes=[],errors=[];let connectorReads=0;
      const messages=Array.from({length:6},(_,n)=>({id:'message-'+n,kind:'VIDEO_BOAS_VINDAS',appointment_id:'lesson-'+n,appointment_scheduled_on:'2026-10-02',appointment_starts_at:'19:00:00',contact_name:'Aluno '+n,student_name:'Aluno '+n,student_phone:'5547999999999',destination_phone:'5547999999999',instructor_name:'Professor exemplo',status:'SENT',created_at:'2026-10-01T02:00:00Z',scheduled_at:'2026-10-01T02:00:00Z',sent_at:'2026-10-01T02:00:00Z',delivered_at:'2026-10-01T02:01:00Z',read_at:null}));
      await context.route('**/*',async route=>{
        const req=route.request(),url=new URL(req.url());const send=body=>route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
        if(url.hostname.endsWith('.supabase.co'))return send(url.pathname.includes('/auth/')?user:[]);
        if(url.pathname==='/api/xpace/message-connector/zapi'){
          if(req.method()==='GET')return send(settings);
          const payload=req.postDataJSON();writes.push(payload);
          if(payload.action==='SAVE')settings={success:true,configured:true,instanceId:payload.instanceId,configVersion:'fixture-v1',enabled:false,paused:true,connected:true,schedulerReady:false,test:null,webhookUrl:origin+'/fixture-private-receipt'};
          if(payload.action==='TEST')settings.test={id:payload.requestId,status:'SENT',delivered:false,recent:true};
          if(payload.action==='SCHEDULER')settings.schedulerReady=true;
          if(payload.action==='ACTIVATE')settings={...settings,enabled:true,paused:false};
          return send({success:true});
        }
        if(url.pathname.startsWith('/api/')){
          if(req.method()!=='GET')throw new Error('Unexpected fixture write '+url.pathname);
          if(url.pathname==='/api/empresas/xpace')return send({success:true,canAccessCentral:true});
          if(url.pathname==='/api/xpace/home')return send({success:true,metrics:{activeClients:0,newClientsThisMonth:0},notifications:{items:[],total:0,unread:0,page:0,pageSize:2,latestCreatedAt:null}});
          if(url.pathname.includes('/notifications'))return send({success:true,items:[],total:0,unread:0,page:0,pageSize:2,latestCreatedAt:null});
          if(url.pathname==='/api/xpace/message-connector'){
            connectorReads++;const search=(url.searchParams.get('search')||'').toLowerCase(),status=url.searchParams.get('status')||'TODOS';
            const found=messages.filter(m=>m.student_name.toLowerCase().includes(search)&&(status==='TODOS'||status===m.status));
            const current=Math.min(Number(url.searchParams.get('page')||0),Math.max(0,Math.ceil(found.length/5)-1));
            return send({success:true,connector:{configured:true,status:'CONNECTED'},schedulerReady:true,pagination:{page:current,pageSize:5,total:found.length},summary:{registered:6,sent:6,confirmed:6,queued:0,failures:0,receiptPending:0,lateQueue:0,monitoringSince:'2026-10-01T02:00:00Z'},messages:found.slice(current*5,current*5+5)});
          }
          if(url.pathname==='/api/xpace/xpay')return send({success:true,providerConfigured:false,accounts:[]});
          return send({success:true,configured:false});
        }
        if(url.origin!==origin)return route.abort();return route.continue();
      });
      const page=await context.newPage();page.on('pageerror',error=>{errors.push(error.message);console.log('Fixture UI error',error.message);});page.setDefaultTimeout(15000);
      page.on('framenavigated',frame=>{if(frame===page.mainFrame())console.log('Fixture navigation',new URL(frame.url()).pathname);});
      await page.goto(origin+'/xpace');
      await page.screenshot({path:path.join(out,label+'-initial.png')});
      await page.getByRole('button',{name:/LOJA Produtos/}).click();
      await page.getByRole('button',{name:/WHATSAPP E ENVIOS/}).click();
      await page.locator('.xd-msg-bundle').first().waitFor();
      assert.equal(await page.locator('.xd-msg-bundle').count(),5);
      assert.equal(await page.getByRole('button',{name:'Atualizar lista',exact:true}).count(),0);
      assert.equal(await page.getByRole('button',{name:/GERAR NOVA CHAVE|PREPARAR CONEXÃO|DESCONECTAR DISPOSITIVO/}).count(),0);
      assert.equal(await page.getByText('QR CODE',{exact:true}).count(),0);
      await page.getByRole('button',{name:'Envios mais antigos'}).click();
      await page.getByText('6–6 de 6',{exact:true}).waitFor();assert.equal(await page.locator('.xd-msg-bundle').count(),1);
      await page.getByRole('searchbox',{name:'Buscar envios pelo nome'}).fill('Aluno 0');
      await page.getByText('1–1 de 1',{exact:true}).waitFor();assert.equal(await page.locator('.xd-msg-bundle').count(),1);
      const beforePull=connectorReads;
      await page.evaluate(()=>{
        window.scrollTo(0,0);const el=document.querySelector('.xd-msg-header h1');
        for(const [type,y]of [['touchstart',30],['touchmove',220],['touchend',220]]){
          const touch=new Touch({identifier:1,target:el,clientX:150,clientY:y});
          el.dispatchEvent(new TouchEvent(type,{bubbles:true,touches:type==='touchend'?[]:[touch],changedTouches:[touch]}));
        }
      });
      await page.waitForFunction(()=>!document.querySelector('.xd-pull-feedback.is-visible'));
      assert.ok(connectorReads>beforePull,'pull refresh must request new data');
      assert.equal(await page.getByRole('searchbox',{name:'Buscar envios pelo nome'}).inputValue(),'Aluno 0','gesture preserves search');
      await page.getByRole('searchbox',{name:'Buscar envios pelo nome'}).fill('');
      await page.getByText('1–5 de 6',{exact:true}).waitFor();
      await page.screenshot({path:path.join(out,label+'-control.png'),fullPage:true});
      await page.getByRole('button',{name:'CONFIGURAR Z-API',exact:true}).click();
      await page.getByLabel('ID DA INSTÂNCIA',{exact:true}).fill('fixture-instance-id');
      await page.getByLabel('TOKEN DA INSTÂNCIA',{exact:true}).fill('fixture-instance-token');
      await page.getByLabel('CLIENT-TOKEN DA CONTA',{exact:true}).fill('fixture-account-token');
      let warned=false;page.once('dialog',async dialog=>{warned=true;await dialog.dismiss();});
      await page.evaluate(()=>{
        window.scrollTo(0,0);const el=document.querySelector('.xd-msg-header h1');
        for(const [type,y]of [['touchstart',30],['touchmove',220],['touchend',220]]){const touch=new Touch({identifier:1,target:el,clientX:150,clientY:y});el.dispatchEvent(new TouchEvent(type,{bubbles:true,touches:type==='touchend'?[]:[touch],changedTouches:[touch]}));}
      });
      assert.equal(warned,true,'editing a form requires confirmation before pull refresh');
      assert.equal(await page.getByLabel('CLIENT-TOKEN DA CONTA',{exact:true}).inputValue(),'fixture-account-token','cancelled refresh preserves typed credentials');
      await page.getByRole('button',{name:'SALVAR COM A FILA PAUSADA',exact:true}).click();
      const panel=page.locator('.xd-zapi-settings');
      await panel.getByText('FILA PAUSADA PARA A TROCA.',{exact:false}).waitFor();
      assert.equal(await panel.getByLabel('TOKEN DA INSTÂNCIA',{exact:true}).inputValue(),'');
      const activation=panel.getByRole('button',{name:'ATIVAR Z-API E LIBERAR FILA',exact:true});
      assert.equal(await activation.isDisabled(),true);
      await panel.getByLabel(/^WHATSAPP DO ALCEU/).fill('5547999999999');
      await panel.getByRole('button',{name:'ENVIAR UM TESTE SOMENTE AO ALCEU',exact:true}).click();
      await panel.getByText('TESTE REGISTRADO: AGUARDANDO RECIBO DE ENTREGA. NÃO CLIQUE VÁRIAS VEZES.').waitFor();
      await panel.getByRole('button',{name:'ENVIAR UM TESTE SOMENTE AO ALCEU',exact:true}).click();
      assert.equal(writes.filter(x=>x.action==='TEST')[0].requestId,writes.filter(x=>x.action==='TEST')[1].requestId);
      await panel.getByRole('button',{name:'PREPARAR AGENDAMENTO NA NUVEM',exact:true}).click();
      await panel.getByRole('checkbox',{name:/RECEBI O TESTE/}).check();await panel.getByRole('checkbox',{name:/PAREI E DESATIVEI/}).check();
      assert.equal(await activation.isDisabled(),true,'Accepted test must not release clients');
      settings.test.delivered=true;
      await panel.getByRole('button',{name:'CONFERIR CONEXÃO',exact:true}).click();
      await panel.getByText('TESTE ENTREGUE: RECIBO REAL REGISTRADO PARA ESTA CONFIGURAÇÃO.').waitFor();
      assert.equal(await activation.isEnabled(),true);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal page overflow');
      await panel.screenshot({path:path.join(out,label+'.png')});
      await activation.click();await panel.getByText('Z-API ATIVA. A FILA NÃO DEPENDE DO COMPUTADOR DA ESCOLA.').waitFor();
      assert.deepEqual(errors,[]);await context.close();
    }
    console.log('PASS: desktop/mobile, five bundles + name search, no legacy controls, no reload button, pull refresh preserving search, Z-API token clearing/idempotency/activation gates; screenshots '+out);
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

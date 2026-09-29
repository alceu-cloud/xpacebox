// Local UI fixtures. All API and Supabase requests are intercepted; no real sends/data edits.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { chromium } = require('@playwright/test');
const origin = process.env.TEST_ORIGIN || 'http://localhost:3007';
assert.ok(['localhost','127.0.0.1'].includes(new URL(origin).hostname));
const out = path.join(os.tmpdir(),'xpace-trial-visual');
fs.mkdirSync(out,{recursive:true});
const publicUrl = fs.readFileSync('.env.local','utf8').match(/^NEXT_PUBLIC_SUPABASE_URL\s*=\s*["']?([^\s"']+)/m)?.[1];
const project = new URL(publicUrl).hostname.split('.')[0];
const user={id:'00000000-0000-4000-8000-000000000001',email:'visual@example.test',aud:'authenticated',role:'authenticated',created_at:'2026-01-01T00:00:00Z',app_metadata:{provider:'email'},user_metadata:{}};
const today = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
const weekday=new Date(today+'T12:00:00Z').getUTCDay();
const schedule={id:'schedule',weekday,startsAt:'19:00',endsAt:'20:00',roomName:'SALA 1',roomId:'room',instructorName:'PROFESSORA TESTE',instructorId:'teacher',level:'INICIANTE',ageGroup:'ADULTO',ageGroups:['ADULTO'],color:'#7435D9',capacity:20,settings:{allowLeads:true},allowsLeads:true};
const group={id:'group',name:'JAZZ TESTE',modality:'JAZZ',modalityId:'modality',level:'INICIANTE',instructorName:'PROFESSORA TESTE',color:'#7435D9',capacity:20,sourceType:'CONTRATO',settings:{allowLeads:true},active:true,schedules:[schedule],students:[]};
const lead={id:'lead',lead_number:1,full_name:'ALUNO TESTE VISUAL',mobile:'47999999999',linked_student_id:'student',pipeline_stage:'AULA_EXPERIMENTAL',created_at:today+'T12:00:00Z',updated_at:today+'T12:00:00Z'};
const appointment={id:'appointment',lead_id:'lead',class_group_id:'group',class_schedule_id:'schedule',scheduled_on:today,starts_at:'19:00:00',ends_at:'20:00:00',booking_kind:'NOVO',confirmation_status:'PENDENTE',attendance_status:'AGENDADO',enrollment_outcome:'PENDENTE',survey_status:'PENDENTE',survey_opt_in:true,welcome_video_url:'https://res.cloudinary.com/test/video/upload/video.mp4',welcome_delivery_status:'ENVIADO',whatsapp_opt_in:false,whatsapp_legacy_allowed_at:null};
async function snapshot(page,name) {
  await page.screenshot({path:path.join(out,name+'.png'),fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),name+' overflow');
}
(async()=>{
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  try {
    for(const [label,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]) {
      const context=await browser.newContext({viewport,timezoneId:'America/Sao_Paulo'});
      await context.addInitScript(({key,user})=>localStorage.setItem(key,JSON.stringify({access_token:'test-only-token',refresh_token:'test-only-refresh',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,user})),{key:`sb-${project}-auth-token`,user});
      const soundKey=`xpace_lead_sound_enabled_${user.id}`;
      await context.addInitScript(({soundKey})=>{
        if(!localStorage.getItem('fixture_sound_initialized')){
          localStorage.setItem(soundKey,'1');localStorage.setItem('fixture_sound_initialized','1');
        }
        // Model a browser that requires a fresh trusted gesture after a new document.
        let gesture=false;
        document.addEventListener('pointerdown',event=>{if(event.isTrusted)gesture=true;},true);
        document.addEventListener('keydown',event=>{if(event.isTrusted)gesture=true;},true);
        window.AudioContext=class {
          state='suspended';
          resume(){if(gesture)this.state='running';return Promise.resolve();}
          suspend(){this.state='suspended';return Promise.resolve();}
        };
      },{soundKey});
      const errors=[],writes=[];
      appointment.whatsapp_legacy_allowed_at=null;appointment.survey_status='PENDENTE';
      let deleted=false;
      let deleteAttempts=0;
      let failAttendance=false;
      const pocketTrials=[
        {id:'pending',leadName:'ALUNO PENDENTE',attendanceStatus:'AGENDADO'},
        {id:'present',leadName:'ALUNO PRESENTE',attendanceStatus:'COMPARECEU'},
        {id:'absent',leadName:'ALUNO AUSENTE',attendanceStatus:'FALTOU'},
        {id:'second-trial',leadName:'ALUNO PRESENTE',attendanceStatus:'AGENDADO'},
      ].map((trial,index)=>({...trial,classScheduleId:index===0||index===3?'archived-schedule-'+index:'schedule',scheduledOn:today,...(index===0||index===3?{className:index===0?'K-POP HISTÓRICO':'STREET DANCE HISTÓRICO',startsAt:'19:00',roomName:'SALA HISTÓRICA',instructorName:index===0?'PROFESSORA LIZBETH':'PROFESSOR JHONNEY'}:{})}));
      await context.route('**/*',async route=>{
        const req=route.request(),url=new URL(req.url());
        const send=body=>route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
        if(url.hostname.endsWith('.supabase.co'))return send(url.pathname.includes('/auth/')?user:[]);
        if(url.pathname.startsWith('/api/')) {
          if(req.method()!=='GET'){
            const payload=req.postDataJSON(); writes.push(payload);
            if(payload.action==='DELETE_LEAD'){
              if(++deleteAttempts===1)return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({success:false,message:'HÁ UMA MENSAGEM DESTE LEAD SENDO PROCESSADA.'})});
              deleted=true;return send({success:true});
            }
            if(payload.action==='CREATE_TRIAL_IN_CLASS')return send({success:true,leadId:'lead',appointmentId:'appointment'});
            if(payload.action==='UPDATE_TRIAL_ATTENDANCE'){
              if(failAttendance)return route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({success:false,message:'Fixture: presença não salva'})});
              pocketTrials.find(trial=>trial.id===payload.trialAttendance.appointmentId).attendanceStatus=payload.trialAttendance.attendanceStatus;
              return send({success:true});
            }
            return send({success:false,message:'Fixture blocks this action'});
          }
          if(url.pathname==='/api/empresas/xpace')return send({success:true,canAccessCentral:true});
          if(url.pathname==='/api/xpace/home')return send({success:true,metrics:{activeClients:1,newClientsThisMonth:1},notifications:{items:[],total:0,unread:0,page:0,pageSize:2,latestCreatedAt:null}});
          if(url.pathname==='/api/xpace/agenda')return send({success:true,groups:[group],trialAppointments:url.searchParams.has('to')?pocketTrials:[{id:'appointment',leadId:'lead',leadName:lead.full_name,leadMobile:lead.mobile,existingClient:true,classScheduleId:'schedule',scheduledOn:today,attendanceStatus:'AGENDADO'}],students:[{id:'student',name:lead.full_name,mobile:lead.mobile}],modalities:[],instructors:[],rooms:[],rentals:[]});
          if(url.pathname==='/api/xpace/mobile/overview')return send({success:true,profileName:'EQUIPE TESTE',metrics:{trialsThisWeek:4,activeClients:1,newClientsThisMonth:1,newLeadsThisMonth:3},notifications:[]});
          if(url.pathname==='/api/xpace/xpay')return send({success:true,providerConfigured:false,environment:'SANDBOX',accounts:[]});
          if(url.pathname==='/api/xpace/message-connector') {
            const base={lead_id:'lead',appointment_id:'appointment',appointment_scheduled_on:today,appointment_starts_at:'19:00',contact_name:lead.full_name,destination_phone:'5547999999999',student_name:lead.full_name,student_phone:'5547999999999',status:'SENT',created_at:today+'T12:00:00Z',scheduled_at:today+'T12:00:00Z',sent_at:today+'T12:00:00Z',delivered_at:today+'T12:01:00Z'};
            return send({success:true,connector:{configured:true,status:'CONNECTED',phone:'5547888888888'},score:100,scoreDetails:{failures:0,oldQueue:0,windowDays:7},messages:[
              ...['VIDEO_BOAS_VINDAS','AVISO_PROFESSOR','LEMBRETE_VESPERA','CONFIRMACAO_DIA','PESQUISA_SATISFACAO'].map((kind,i)=>({...base,id:'grouped-'+i,kind})),
              {...base,id:'legacy-video',appointment_id:null,contact_name:'VÍDEO HISTÓRICO EXCLUÍDO',kind:'VIDEO_BOAS_VINDAS'},
              {...base,id:'legacy-teacher',appointment_id:null,contact_name:'PROFESSOR HISTÓRICO EXCLUÍDO',kind:'AVISO_PROFESSOR'},
              {...base,id:'manual-payment',appointment_id:null,contact_name:'CLIENTE PAGAMENTO AVULSO',kind:'COBRANCA'}
            ]});
          }
          if(url.pathname==='/api/xpace/leads/signal')return send({success:true,latest:null});
          if(url.pathname==='/api/xpace/leads')return send({success:true,leads:deleted?[]:[lead],appointments:deleted?[]:[appointment],activities:[],sources:[],lossReasons:[],winReasons:[],attendants:[],instructors:[],groups:[{...group,allowsLeads:true}],canDeleteLeads:true,canOverrideTrialLimit:true});
          if(url.pathname==='/api/xpace/dashboard')return send({success:true,section:'CRM',from:url.searchParams.get('from'),to:url.searchParams.get('to'),metrics:{leads:1,open:1,won:0,lost:0,conversion:0},trend:[],birthdays:[],sources:[],losses:[],sourceMissing:0,lossMissing:0,imported:0});
          return send({success:true,configured:false});
        }
        if(url.origin!==origin)return route.abort();
        return route.continue();
      });
      const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
      await page.goto(origin+'/xpace');
      const sound=page.locator('.xd-lead-sound-toggle');
      await sound.filter({hasText:'SOM LIGADO · CLIQUE NA TELA'}).waitFor();
      assert.equal(await sound.getAttribute('aria-pressed'),'true');
      await snapshot(page,label+'-sound-waiting');
      await sound.click();
      await sound.filter({hasText:'SOM DE LEADS ATIVO'}).waitFor();
      assert.equal(await page.evaluate(key=>localStorage.getItem(key),soundKey),'1','Reactivation must not toggle preference off');
      await page.reload();
      await sound.filter({hasText:'SOM LIGADO · CLIQUE NA TELA'}).waitFor();
      await page.getByRole('heading',{level:1}).click();
      await sound.filter({hasText:'SOM DE LEADS ATIVO'}).waitFor();
      const reopened=await context.newPage();
      await reopened.goto(origin+'/xpace');
      await reopened.locator('.xd-lead-sound-toggle').filter({hasText:'SOM LIGADO · CLIQUE NA TELA'}).waitFor();
      await reopened.close();
      await sound.click();
      await sound.filter({hasText:'ATIVAR SOM DE LEADS'}).waitFor();
      await page.reload();
      await sound.filter({hasText:'ATIVAR SOM DE LEADS'}).waitFor();
      assert.equal(await page.evaluate(key=>localStorage.getItem(key),soundKey),null);
      await page.getByRole('button',{name:/AGENDA Turmas/}).click();
      const currentDate=page.locator('.xd-calendar-date[aria-current="date"]');
      await currentDate.waitFor();
      assert.equal(await currentDate.count(),1);
      assert.equal(await currentDate.locator('..').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(232, 246, 238)');
      await currentDate.click();
      assert.equal(await currentDate.locator('..').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(221, 241, 230)');
      await snapshot(page,label+'-agenda-today');
      await page.locator('.xd-day-class-list button').first().click();
      await page.getByRole('button',{name:'ADICIONAR EXPERIMENTAL',exact:true}).click();
      const dialog=page.getByRole('dialog',{name:'Adicionar aula experimental'});
      await dialog.getByLabel(/^CLIENTE JÁ CADASTRADO/).selectOption('student');
      await snapshot(page,label+'-direct-trial');
      await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
      await page.getByRole('button',{name:'ADICIONAR EXPERIMENTAL',exact:true}).click();
      await dialog.getByLabel(/^CLIENTE JÁ CADASTRADO/).selectOption('student');
      await dialog.getByRole('button',{name:/SALVAR|ADICIONAR/,exact:false}).last().click();
      await dialog.waitFor({state:'hidden'});
      assert.equal(writes.at(-1).trial.studentId,'student');
      assert.equal(writes.at(-1).trial.whatsappOptIn,false,'Consent must be explicit');
      await page.locator('.xd-active-module--return').click();
      await page.getByRole('button',{name:/DASHBOARD Visão/}).click();
      const dates=await page.locator('input[type="date"]').evaluateAll(elements=>elements.map(e=>e.value));
      assert.equal(dates[0],today.slice(0,7)+'-01');
      assert.equal(dates[1],new Date(Date.UTC(Number(today.slice(0,4)),Number(today.slice(5,7)),0)).toISOString().slice(0,10));
      await snapshot(page,label+'-dashboard-month');
      await page.locator('.xd-active-module--return').click();
      await page.getByRole('button',{name:/CRM Relacionamento/}).click();
      await page.getByRole('button',{name:'FILTROS',exact:true}).click();
      if(label==='desktop') {
        const panel=page.locator('.xd-lead-date-filters');
        const box=await panel.boundingBox(),clear=await panel.getByRole('button',{name:'LIMPAR DATAS'}).boundingBox();
        assert.ok(Math.abs((box.y+box.height/2)-(clear.y+clear.height/2))<2,'Clear dates button vertically centered');
      }
      await snapshot(page,label+'-crm-filters');
      await page.getByRole('button',{name:/ALUNO TESTE VISUAL/}).click();
      const detail=page.getByRole('dialog',{name:'Lead '+lead.full_name});
      await snapshot(page,label+'-crm-detail');
      assert.equal(await detail.getByLabel('A pessoa autorizou esta pesquisa pelo WhatsApp').count(),0);
      await detail.getByText('WHATSAPP NÃO AUTORIZADO',{exact:true}).waitFor();
      await detail.locator('.xd-lead-survey-state strong').getByText('NÃO',{exact:true}).waitFor();
      await detail.getByRole('button',{name:'Fechar',exact:true}).click();
      appointment.whatsapp_legacy_allowed_at='2026-09-29T22:25:22.138042Z';appointment.survey_status='ENVIADA';
      await page.getByRole('button',{name:'ATUALIZAR',exact:true}).click();
      await page.getByRole('button',{name:/ALUNO TESTE VISUAL/}).click();
      await detail.getByText(/WHATSAPP LIBERADO PELA ESCOLA/).waitFor();
      await detail.locator('.xd-lead-survey-state strong').getByText('SIM',{exact:true}).waitFor();
      assert.equal(await detail.getByText('WHATSAPP NÃO AUTORIZADO',{exact:true}).count(),0);
      page.once('dialog',dialog=>dialog.accept());
      await detail.getByRole('button',{name:/excluir/i}).click();
      await detail.getByRole('alert').getByText('HÁ UMA MENSAGEM DESTE LEAD SENDO PROCESSADA.').waitFor();
      page.once('dialog',dialog=>dialog.accept());
      await detail.getByRole('button',{name:/excluir/i}).click();
      await detail.waitFor({state:'hidden'});
      assert.equal(writes.at(-1).action,'DELETE_LEAD');
      assert.equal(await page.getByRole('button',{name:/ALUNO TESTE VISUAL/}).count(),0);
      await page.locator('.xd-active-module--return').click();
      await page.getByRole('button',{name:/LOJA Produtos/}).click();
      await page.getByRole('button',{name:'CONFIGURAR CONECTOR'}).click();
      await page.getByRole('button',{name:'CONTROLE DE ENVIOS'}).click();
      await page.locator('.xd-msg-bundle').waitFor();
      assert.equal(await page.locator('.xd-msg-bundle').count(),1);
      assert.equal(await page.locator('.xd-msg-bundle-steps > button').count(),5);
      assert.equal(await page.getByText('VÍDEO HISTÓRICO EXCLUÍDO').count(),0);
      assert.equal(await page.getByText('PROFESSOR HISTÓRICO EXCLUÍDO').count(),0);
      await page.getByText('CLIENTE PAGAMENTO AVULSO',{exact:true}).waitFor();
      await snapshot(page,label+'-message-groups');
      await page.goto(origin+'/xpace/app');
      await page.getByRole('button',{name:/AULAS DA SEMANA:/}).click();
      const cards=page.locator('.xp-week-trial-button');
      await cards.nth(3).waitFor();
      assert.equal(await cards.filter({hasText:'Compareceu'}).count(),1);
      assert.equal(await cards.filter({hasText:'Faltou'}).count(),1);
      assert.equal(await cards.filter({hasText:'Presença pendente'}).count(),2);
      assert.equal(await cards.nth(1).evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(232, 247, 237)');
      assert.equal(await cards.nth(2).evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 240, 240)');
      assert.ok((await cards.nth(0).innerText()).includes('K-POP HISTÓRICO'));
      assert.ok((await cards.nth(0).innerText()).includes('PROFESSORA LIZBETH'));
      assert.ok((await cards.nth(3).innerText()).includes('PROFESSOR JHONNEY'));
      await snapshot(page,label+'-pocket-attendance');
      await cards.nth(0).click();
      await page.locator('.xp-detail-hero').getByText('K-POP HISTÓRICO',{exact:true}).waitFor();
      assert.ok((await page.locator('.xp-detail-hero').innerText()).includes('SALA HISTÓRICA · PROFESSORA LIZBETH'));
      await page.getByRole('button',{name:'Marcar ALUNO PENDENTE como compareceu'}).click();
      await page.locator('.xp-attendance .is-present').waitFor();
      await page.getByRole('button',{name:'Voltar para os leads'}).click();
      assert.ok((await cards.nth(0).getAttribute('class')).includes('is-present'));
      assert.ok(!(await cards.nth(3).getAttribute('class')).includes('is-present'),'Second appointment of same lead stays pending');
      await cards.nth(0).click();
      failAttendance=true;
      await page.getByRole('button',{name:'Marcar ALUNO PENDENTE como faltou'}).click();
      await page.getByRole('alert').getByText('Fixture: presença não salva').waitFor();
      await page.getByRole('button',{name:'Voltar para os leads'}).click();
      assert.ok((await cards.nth(0).getAttribute('class')).includes('is-present'),'Failed save must not change color');
      failAttendance=false;
      await cards.nth(0).click();
      await page.getByRole('button',{name:'Marcar ALUNO PENDENTE como faltou'}).click();
      await page.locator('.xp-attendance .is-absent').waitFor();
      await page.getByRole('button',{name:'Voltar para os leads'}).click();
      assert.ok((await cards.nth(0).getAttribute('class')).includes('is-absent'));
      await page.reload();
      await page.getByRole('button',{name:/AULAS DA SEMANA:/}).click();
      await cards.nth(3).waitFor();
      assert.ok((await cards.nth(0).getAttribute('class')).includes('is-absent'),'Saved attendance survives refresh');
      assert.deepEqual(errors,[]);
      await context.close();
    }
    console.log('PASS: desktop/mobile trial modal, consent, current month/day, CRM delete, sound reload/reopen, per-appointment attendance colors, saved/failed updates. Screenshots: '+out);
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

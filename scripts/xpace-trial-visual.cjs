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
const schedule={id:'schedule',weekday,startsAt:'19:00',endsAt:'20:00',roomName:'SALA 1',roomId:'room',instructorName:'PROFESSORA TESTE',instructorId:'teacher',level:'INICIANTE',ageGroup:'ADULTO',ageGroups:['ADULTO'],color:'#7435D9',capacity:20,settings:{allowLeads:true}};
const group={id:'group',name:'JAZZ TESTE',modality:'JAZZ',modalityId:'modality',level:'INICIANTE',instructorName:'PROFESSORA TESTE',color:'#7435D9',capacity:20,sourceType:'CONTRATO',settings:{allowLeads:true},active:true,schedules:[schedule],students:[]};
const lead={id:'lead',lead_number:1,full_name:'ALUNO TESTE VISUAL',mobile:'47999999999',linked_student_id:'student',pipeline_stage:'AULA_EXPERIMENTAL',created_at:today+'T12:00:00Z',updated_at:today+'T12:00:00Z'};
const appointment={id:'appointment',lead_id:'lead',class_group_id:'group',class_schedule_id:'schedule',scheduled_on:today,starts_at:'19:00:00',ends_at:'20:00:00',booking_kind:'NOVO',confirmation_status:'PENDENTE',attendance_status:'AGENDADO',enrollment_outcome:'PENDENTE',survey_status:'PENDENTE',survey_opt_in:true,welcome_video_url:'https://res.cloudinary.com/test/video/upload/video.mp4',welcome_delivery_status:'ENVIADO',whatsapp_opt_in:true};
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
      const errors=[],writes=[];
      let deleted=false;
      let deleteAttempts=0;
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
            return send({success:false,message:'Fixture blocks this action'});
          }
          if(url.pathname==='/api/empresas/xpace')return send({success:true,canAccessCentral:true});
          if(url.pathname==='/api/xpace/home')return send({success:true,metrics:{activeClients:1,newClientsThisMonth:1},notifications:{items:[],total:0,unread:0,page:0,pageSize:2,latestCreatedAt:null}});
          if(url.pathname==='/api/xpace/agenda')return send({success:true,groups:[group],trialAppointments:[{id:'appointment',leadId:'lead',leadName:lead.full_name,leadMobile:lead.mobile,existingClient:true,classScheduleId:'schedule',scheduledOn:today,attendanceStatus:'AGENDADO'}],students:[{id:'student',name:lead.full_name,mobile:lead.mobile}],modalities:[],instructors:[],rooms:[],rentals:[]});
          if(url.pathname==='/api/xpace/leads')return send({success:true,leads:deleted?[]:[lead],appointments:deleted?[]:[appointment],activities:[],sources:[],lossReasons:[],winReasons:[],attendants:[],instructors:[],groups:[{...group,allowsLeads:true}],canDeleteLeads:true,canOverrideTrialLimit:true});
          if(url.pathname==='/api/xpace/dashboard')return send({success:true,section:'CRM',from:url.searchParams.get('from'),to:url.searchParams.get('to'),metrics:{leads:1,open:1,won:0,lost:0,conversion:0},trend:[],birthdays:[],sources:[],losses:[],sourceMissing:0,lossMissing:0,imported:0});
          return send({success:true,configured:false});
        }
        if(url.origin!==origin)return route.abort();
        return route.continue();
      });
      const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
      await page.goto(origin+'/xpace');
      await page.getByRole('button',{name:/AGENDA Turmas/}).click();
      await page.locator('.xd-calendar-date').getByText(String(Number(today.slice(-2))),{exact:true}).click();
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
      await page.getByRole('button',{name:/ALUNO TESTE VISUAL/}).click();
      const detail=page.getByRole('dialog',{name:'Lead '+lead.full_name});
      await snapshot(page,label+'-crm-detail');
      await detail.getByLabel('A pessoa autorizou esta pesquisa pelo WhatsApp').waitFor();
      page.once('dialog',dialog=>dialog.accept());
      await detail.getByRole('button',{name:/excluir/i}).click();
      await detail.getByRole('alert').getByText('HÁ UMA MENSAGEM DESTE LEAD SENDO PROCESSADA.').waitFor();
      page.once('dialog',dialog=>dialog.accept());
      await detail.getByRole('button',{name:/excluir/i}).click();
      await detail.waitFor({state:'hidden'});
      assert.equal(writes.at(-1).action,'DELETE_LEAD');
      assert.equal(await page.getByRole('button',{name:/ALUNO TESTE VISUAL/}).count(),0);
      assert.deepEqual(errors,[]);
      await context.close();
    }
    console.log('PASS: desktop/mobile trial modal, explicit consent, Escape/focus, current month, CRM delete fixture. Screenshots: '+out);
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

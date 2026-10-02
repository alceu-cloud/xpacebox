// Local UI fixtures: all API/Supabase calls intercepted; no messages or production writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium, expect } = require('@playwright/test');
const origin = process.env.TEST_ORIGIN || 'http://localhost:3007';
assert.ok(['localhost','127.0.0.1'].includes(new URL(origin).hostname));
const out = path.join(os.tmpdir(),'xpace-pocket-weeks');
fs.mkdirSync(out,{recursive:true});
const publicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || fs.readFileSync('.env.local','utf8').match(/^NEXT_PUBLIC_SUPABASE_URL\s*=\s*["']?([^\s"']+)/m)?.[1];
const project = new URL(publicUrl).hostname.split('.')[0];
const user={id:'00000000-0000-4000-8000-000000000001',email:'fixture@example.test',aud:'authenticated',role:'authenticated',created_at:'2026-01-01T00:00:00Z',app_metadata:{provider:'email'},user_metadata:{}};
const today='2026-09-30';
const group={id:'group',name:'1.0 - STREET DANCE',schedules:[{id:'schedule',weekday:3,startsAt:'19:00',endsAt:'20:00',roomName:'SALA 2',instructorName:'PROFESSOR JHONNEY',level:'INICIANTE',ageGroups:['TEENS','ADULTO'],color:'#7435D9'}],students:[]};
async function snapshot(page,name) {
  await page.screenshot({path:path.join(out,name+'.png'),fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),name+' overflows');
}
(async()=>{
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  try {
    for(const [label,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}],['small-mobile',{width:320,height:740}]]) {
      const context=await browser.newContext({viewport,timezoneId:'America/Sao_Paulo'});
      await context.addInitScript(({key,user})=>localStorage.setItem(key,JSON.stringify({access_token:'fixture-token',refresh_token:'fixture-refresh',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,user})),{key:`sb-${project}-auth-token`,user});
      const trials=[
        {id:'current',leadName:'ALUNO SEMANA ATUAL',scheduledOn:today,attendanceStatus:'AGENDADO'},
        {id:'next',leadName:'ALUNO PRÓXIMA SEMANA',scheduledOn:'2026-10-07',attendanceStatus:'AGENDADO'},
        {id:'archived',leadName:'ALUNO HORÁRIO ARQUIVADO',scheduledOn:'2026-10-08',attendanceStatus:'AGENDADO',classScheduleId:'archived',className:'JAZZ',roomName:'SALA HISTÓRICA',instructorName:'PROFESSORA LIZBETH',level:'AVANCADO',ageGroups:['KIDS','TEENS']},
        {id:'cancelled',leadName:'NÃO EXIBIR CANCELADO',scheduledOn:'2026-10-07',attendanceStatus:'CANCELADO'},
      ].map(t=>({classScheduleId:'schedule',startsAt:'19:00',...t}));
      const errors=[],writes=[],ranges=[];
      let failNext=true,failAttendance=false;
      await context.route('**/*',async route=>{
        const req=route.request(),url=new URL(req.url());
        const send=body=>route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
        if(url.hostname.endsWith('.supabase.co'))return send(url.pathname.includes('/auth/')?user:[]);
        if(url.pathname.startsWith('/api/')) {
          if(req.method()!=='GET') {
            const body=req.postDataJSON();writes.push(body);
            if(body.action==='UPDATE_TRIAL_ATTENDANCE') {
              if(failAttendance)return route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({success:false,message:'Fixture: presença não salva'})});
              trials.find(t=>t.id===body.trialAttendance.appointmentId).attendanceStatus=body.trialAttendance.attendanceStatus;
              return send({success:true});
            }
            return route.abort();
          }
          if(url.pathname==='/api/empresas/xpace')return send({success:true,canAccessCentral:true});
          if(url.pathname==='/api/notifications')return send({success:true,items:[],total:0,unread:0,issueCount:0,issueSignals:[],todayErrors:0,page:0,pageSize:2,snapshotAt:new Date().toISOString()});
          if(url.pathname==='/api/xpace/home')return send({success:true,metrics:{activeClients:1,newClientsThisMonth:1},notifications:{items:[],total:0,unread:0,page:0,pageSize:2,latestCreatedAt:null}});
          if(url.pathname==='/api/xpace/leads/signal')return send({success:true,latest:null});
          if(url.pathname==='/api/xpace/mobile/overview')return send({success:true,profileName:'EQUIPE',metrics:{trialsThisWeek:1,trialsNextWeek:2,activeClients:1,newClientsThisMonth:1,newLeadsThisMonth:1},notifications:[]});
          if(url.pathname==='/api/xpace/agenda') {
            const from=url.searchParams.get('from'),to=url.searchParams.get('to');ranges.push([from,to]);
            if(from==='2026-10-05' && failNext){failNext=false;return route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({success:false,message:'Fixture: semana indisponível'})});}
            return send({success:true,groups:[group],trialAppointments:trials.filter(t=>t.scheduledOn>=from&&t.scheduledOn<=to)});
          }
          if(url.pathname==='/api/xpace/leads')return send({success:true,leads:[{id:'lead',lead_number:1,full_name:'ALUNO CRM',mobile:'47999999999',pipeline_stage:'AULA_EXPERIMENTAL',created_at:today+'T12:00:00Z',updated_at:today+'T12:00:00Z'}],appointments:[{id:'a',lead_id:'lead',class_group_id:'group',class_schedule_id:'schedule',class_name_snapshot:group.name,instructor_name_snapshot:'PROFESSOR JHONNEY',scheduled_on:today,starts_at:'19:00:00',booking_kind:'NOVO',attendance_status:'AGENDADO',confirmation_status:'PENDENTE',enrollment_outcome:'PENDENTE',survey_status:'PENDENTE',welcome_delivery_status:'NAO_CONFIGURADO',whatsapp_opt_in:true,whatsapp_opt_in_at:today+'T12:00:00Z',schedule_level:'INICIANTE',schedule_age_groups:['TEENS','ADULTO']}],groups:[{...group,allowsLeads:true}],activities:[],sources:[],lossReasons:[],winReasons:[],instructors:[],attendants:[],canDeleteLeads:true});
          return send({success:true,configured:false});
        }
        if(url.origin!==origin)return route.abort();
        return route.continue();
      });
      const page=await context.newPage();
      await page.clock.install({time:new Date('2026-09-30T12:00:00Z')});
      page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
      await page.goto(origin+'/xpace/app');
      const currentCard=page.getByRole('button',{name:/AULAS DA SEMANA:/}),nextCard=page.getByRole('button',{name:/AULAS DA PRÓXIMA SEMANA:/});
      await expect(nextCard.locator('strong')).toHaveText('2');
      assert.ok((await nextCard.boundingBox()).y>(await currentCard.boundingBox()).y);
      assert.equal((await nextCard.boundingBox()).height,(await currentCard.boundingBox()).height);
      await snapshot(page,label+'-dashboard');
      await nextCard.click();
      await page.getByRole('alert').getByText('Fixture: semana indisponível').waitFor();
      assert.equal(await page.locator('.xp-week-trial-button').count(),0,'No stale current-week rows after failure');
      await page.getByRole('button',{name:'Tentar novamente',exact:true}).click();
      const cards=page.locator('.xp-week-trial-button');await cards.nth(1).waitFor();assert.equal(await cards.count(),2);
      await cards.filter({hasText:'Nível: Avançado · Público: Kids (7 a 11) / Teens (12 a 17)'}).waitFor();
      assert.equal(await page.getByText('NÃO EXIBIR CANCELADO').count(),0);
      await snapshot(page,label+'-next-week');
      await cards.filter({hasText:'ALUNO HORÁRIO ARQUIVADO'}).click();
      assert.ok((await page.locator('.xp-detail-hero').innerText()).includes('SALA HISTÓRICA · PROFESSORA LIZBETH'));
      await page.getByRole('button',{name:'Marcar ALUNO HORÁRIO ARQUIVADO como compareceu'}).click();
      await page.locator('.xp-attendance .is-present').waitFor();
      await page.locator('button.xb-back-title').click();
      assert.ok((await cards.filter({hasText:'ALUNO HORÁRIO ARQUIVADO'}).getAttribute('class')).includes('is-present'));
      await cards.filter({hasText:'ALUNO HORÁRIO ARQUIVADO'}).click();failAttendance=true;
      await page.getByRole('button',{name:'Marcar ALUNO HORÁRIO ARQUIVADO como faltou'}).click();
      await page.getByRole('alert').getByText('Fixture: presença não salva').waitFor();
      await page.locator('button.xb-back-title').click();
      assert.ok((await cards.filter({hasText:'ALUNO HORÁRIO ARQUIVADO'}).getAttribute('class')).includes('is-present'));
      failAttendance=false;
      await page.locator('button.xb-back-title').click();
      await page.getByRole('button',{name:'Agenda',exact:true}).click();
      await page.getByRole('button',{name:'Próxima semana',exact:true}).click();
      await page.getByRole('button',{name:'Dashboard',exact:true}).click();
      await currentCard.click();
      await cards.filter({hasText:'ALUNO SEMANA ATUAL'}).waitFor();assert.equal(await cards.count(),1);
      assert.ok((await cards.innerText()).toLocaleUpperCase('pt-BR').includes('NÍVEL: INICIANTE · PÚBLICO: TEENS (12 A 17) / ADULT (18+)'), await cards.innerText());
      assert.deepEqual(ranges.at(-1),['2026-09-28','2026-10-04'],'Selected agenda week must not shift current card');
      await page.reload();await nextCard.click();await cards.filter({hasText:'ALUNO HORÁRIO ARQUIVADO'}).waitFor();
      assert.ok((await cards.filter({hasText:'ALUNO HORÁRIO ARQUIVADO'}).getAttribute('class')).includes('is-present'));
      assert.equal(writes[0].trialAttendance.appointmentId,'archived');assert.equal(writes[0].trialAttendance.classScheduleId,'archived');assert.equal(writes[0].trialAttendance.scheduledOn,'2026-10-08');
      await page.goto(origin+'/xpace');await page.getByRole('button',{name:/CRM Relacionamento/}).click();
      const leadCard=page.locator('.xd-lead-card');await leadCard.waitFor();
      assert.ok((await leadCard.innerText()).toLocaleUpperCase('pt-BR').includes('NÍVEL: INICIANTE · PÚBLICO: TEENS (12 A 17) / ADULT (18+)'));
      await snapshot(page,label+'-crm-card');
      await leadCard.click();await page.locator('.xd-lead-appointments').waitFor();
      assert.ok((await page.locator('.xd-lead-appointments header').innerText()).toLocaleUpperCase('pt-BR').includes('NÍVEL: INICIANTE · PÚBLICO: TEENS (12 A 17) / ADULT (18+)'));
      await page.locator('.xd-lead-appointments header').scrollIntoViewIfNeeded();
      await snapshot(page,label+'-crm-detail');
      assert.deepEqual(errors,[]);
      await context.close();
    }
    console.log('PASS: current/next cards, independent periods, retry/empty handling, archived details, attendance save/failure/reload and CRM metadata. Screenshots: '+out);
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

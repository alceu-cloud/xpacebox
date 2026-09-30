// Local browser fixtures. All APIs are intercepted; no real leads or WhatsApp sends.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {chromium}=require('@playwright/test');
const metrics=require('../lib/xpace/report-metrics.ts');
const history=require('../lib/server/xpace-report-history.ts');
const origin=process.env.TEST_ORIGIN||'http://localhost:3007';
assert.ok(['localhost','127.0.0.1'].includes(new URL(origin).hostname));
const out=path.join(os.tmpdir(),'xpace-reports-visual');fs.mkdirSync(out,{recursive:true});
const publicUrl=fs.readFileSync('.env.local','utf8').match(/^NEXT_PUBLIC_SUPABASE_URL\s*=\s*["']?([^\s"']+)/m)?.[1];
const project=new URL(publicUrl).hostname.split('.')[0];
const user={id:'00000000-0000-4000-8000-000000000001',email:'visual@example.test',aud:'authenticated',role:'authenticated',created_at:'2026-01-01T00:00:00Z',app_metadata:{provider:'email'},user_metadata:{}};
const rows=Array.from({length:70},(_,i)=>({id:String(i),leadId:'lead-'+i,personId:null,on:`2026-${i<40?'08':'09'}-${String(i%27+1).padStart(2,'0')}`,startsAt:'19:00',kind:i%3?'NOVO':'REAGENDAMENTO',modality:i%2?'JAZZ ADULTO':'K-POP INICIANTE',instructor:i%2?'PROFESSORA TESTE':'PROFESSOR TESTE',attendance:i%4===0?'FALTOU':i%7===0?'AGENDADO':'COMPARECEU',enrollment:i%5===0?'PENDENTE':i%3===0?'MATRICULOU':'NAO_MATRICULOU',legacy:i<40,legacyMonth:i<40?'ago':null}));
const schedule={id:'enabled',weekday:2,startsAt:'19:00',endsAt:'20:00',roomName:'SALA 2',instructorId:'teacher',instructorName:'PROFESSORA DO HORÁRIO',level:'INICIANTE',allowsLeads:true};
async function snapshot(page,name){
  await page.evaluate(()=>document.fonts.ready);
  const layout=await page.evaluate(()=>({
    uncentered:[...document.querySelectorAll('.xpr-table th,.xpr-table td')].filter(cell=>getComputedStyle(cell).textAlign!=='center').length,
    badLabels:[...document.querySelectorAll('.xpr-bar')].flatMap(bar=>{
      const rect=bar.querySelector('rect'),text=bar.querySelector('.xpr-bar-value');
      if(!text||!text.textContent.trim())return ['missing value'];
      const r=rect.getBBox(),t=text.getBBox();
      if(Math.abs((r.x+r.width/2)-(t.x+t.width/2))>1)return ['not centered'];
      if(text.dataset.placement==='inside'&&(t.x<r.x-1||t.x+t.width>r.x+r.width+1||t.y<r.y-1||t.y+t.height>r.y+r.height+1))return ['inside label clipped'];
      if(text.dataset.placement==='above'&&t.y+t.height>=r.y)return ['small bar label overlaps bar'];
      return [];
    }),
  }));
  assert.equal(layout.uncentered,0,name+' table labels and values must be centered');
  assert.deepEqual(layout.badLabels,[],name+' chart values must fit and align with bars');
  await page.screenshot({path:path.join(out,name+'.png'),fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),name+' overflow');
}
(async()=>{
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  try{
    for(const [label,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}],['small-mobile',{width:320,height:740}]]){
      const context=await browser.newContext({viewport,timezoneId:'America/Sao_Paulo',reducedMotion:'reduce'});
      await context.addInitScript(({key,user})=>localStorage.setItem(key,JSON.stringify({access_token:'test-only-token',refresh_token:'test-only-refresh',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,user})),{key:`sb-${project}-auth-token`,user});
      const writes=[],calls=[],errors=[];let lead=null,booked=[],failReports=false,emptyReports=false,emptyGroups=false;
      await context.route('**/*',async route=>{
        const req=route.request(),url=new URL(req.url());
        const send=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
        if(url.hostname.endsWith('.supabase.co'))return send(url.pathname.includes('/auth/')?user:[]);
        if(url.pathname.startsWith('/api/')){
          if(req.method()!=='GET'){
            const data=req.postDataJSON();writes.push(data);
            if(url.pathname==='/api/xpace/leads'&&data.action==='CREATE_LEAD'){
              lead={id:'manual',lead_number:1,full_name:data.lead.fullName,mobile:data.lead.mobile,pipeline_stage:'NOVO',created_at:'2026-09-29T12:00:00Z',updated_at:'2026-09-29T12:00:00Z'};return send({success:true});
            }
            if(url.pathname==='/api/xpace/leads'&&data.action==='CREATE_APPOINTMENT'){
              assert.equal(data.appointment.classScheduleId,'enabled');
              booked=[{id:'booked',lead_id:lead.id,class_group_id:'group',class_schedule_id:'enabled',scheduled_on:data.appointment.scheduledOn,starts_at:'19:00',ends_at:'20:00',booking_kind:'NOVO',confirmation_status:'PENDENTE',attendance_status:'AGENDADO',enrollment_outcome:'PENDENTE',survey_status:'PENDENTE',welcome_delivery_status:'DISPENSADO',whatsapp_opt_in:false,class_name_snapshot:'JAZZ TESTE',modality_name_snapshot:'JAZZ',instructor_name_snapshot:'PROFESSORA DO HORÁRIO'}];return send({success:true});
            }
            return send({success:false,message:'Fixture blocks action'},400);
          }
          if(url.pathname==='/api/empresas/xpace')return send({success:true,canAccessCentral:false});
          if(url.pathname==='/api/xpace/home')return send({success:true,metrics:{activeClients:0,newClientsThisMonth:0},notifications:{items:[],total:0,unread:0,page:0,pageSize:2,latestCreatedAt:null}});
          if(url.pathname==='/api/xpace/leads')return send({success:true,leads:lead?[lead]:[],appointments:booked,activities:[],sources:[],lossReasons:[],winReasons:[],attendants:[],instructors:[],canOverrideTrialLimit:true,canDeleteLeads:true,groups:emptyGroups?[]:[{id:'group',name:'JAZZ TESTE',modality:'JAZZ',allowsLeads:true,schedules:[schedule,{...schedule,id:'disabled',startsAt:'15:00',allowsLeads:false}]}]});
          if(url.pathname==='/api/xpace/reports'){
            calls.push(url.searchParams.toString());
            if(failReports)return send({success:false,message:'Fixture: relatórios indisponíveis'},503);
            const from=url.searchParams.get('from'),to=url.searchParams.get('to');
            const report=metrics.buildTrialReport(emptyReports?[]:rows,from,to);
            if(url.searchParams.get('detail')==='1'){
              const group=url.searchParams.get('group'),key=url.searchParams.get('key'),page=Number(url.searchParams.get('page'));
              const detail=report.records.filter(r=>group==='all'||(group==='month'?r.on.startsWith(key):group==='modality'?r.modality===key:r.instructor===key));
              return send({success:true,total:detail.length,page,pages:Math.max(1,Math.ceil(detail.length/30)),items:detail.slice((page-1)*30,page*30).map(r=>({...r,name:'ALUNO TESTE '+r.id}))});
            }
            const {records,...summary}=report;
            return send({success:true,from,to,today:'2026-09-29',report:summary,history:history.reportHistory2026.filter(h=>h.month+'-01'<=to&&h.month+'-31'>=from).map(h=>({...h,fullMonth:true})),historySource:history.historySource,historySources:history.historySources,historyDestinations:history.historyDestinations,transition:from<='2026-09-30'&&to>='2026-09-01',systemMonths:[{month:'2026-09',partial:true,future:false,active:0,newClients:0,churn:null,salesCents:0,ticketCents:null,revenueCents:null},{month:'2026-10',future:true,partial:false,active:null,newClients:null,churn:null,salesCents:null,ticketCents:null,revenueCents:null}]});
          }
          return send({success:true,configured:false,latest:null});
        }
        if(url.origin!==origin)return route.abort();return route.continue();
      });
      const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
      await page.goto(origin+'/xpace');
      await page.locator('.xd-modules').getByRole('button',{name:/RELATÓRIOS/}).click();
      await page.locator('.xpr-context').waitFor();
      for(const tab of ['COMPARECIMENTO','CONVERSÃO','PROFESSORES','EXPERIMENTAIS','METAS E RETENÇÃO','FINANCEIRO GERENCIAL','ORIGEM E DESTINO']){
        await page.locator('.xpr-tabs').getByRole('button',{name:tab,exact:true}).click();
        assert.equal(await page.locator('.xpr-tabs').getByRole('button',{name:tab,exact:true}).getAttribute('aria-pressed'),'true');
        await snapshot(page,label+'-'+tab.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replaceAll(' ','-'));
      }
      await page.locator('.xpr-tabs').getByRole('button',{name:'COMPARECIMENTO',exact:true}).click();
      const view=page.locator('.xpr-table button:enabled').filter({hasText:'Ver registros'});
      await view.first().click();
      const detail=page.getByRole('dialog');await detail.getByText('ALUNO TESTE 0',{exact:true}).waitFor();
      assert.equal(await detail.locator('tbody tr').count(),30);
      await detail.getByRole('button',{name:'Próxima',exact:true}).click();await detail.getByText('Página 2 de 2').waitFor();
      await snapshot(page,label+'-records');
      await page.keyboard.press('Escape');await detail.waitFor({state:'hidden'});
      assert.equal(await page.evaluate(()=>document.activeElement?.textContent),'Ver registros');
      await page.getByLabel('DE',{exact:true}).fill('2026-09-01');await page.getByLabel('ATÉ',{exact:true}).fill('2026-09-30');
      await page.getByRole('button',{name:'APLICAR',exact:true}).click();await page.locator('.xpr-context').waitFor();
      assert.ok(calls.some(c=>c.includes('from=2026-09-01')&&c.includes('to=2026-09-30')));
      await snapshot(page,label+'-month-values');
      failReports=true;await page.getByRole('button',{name:'Atualizar relatórios'}).click();await page.getByRole('alert').getByText('Fixture: relatórios indisponíveis',{exact:false}).waitFor();
      failReports=false;emptyReports=true;await page.getByRole('button',{name:'Tentar novamente'}).click();await page.locator('.xpr-context').waitFor();await snapshot(page,label+'-empty');
      await page.locator('.xd-active-module--return').click();await page.locator('.xd-modules').getByRole('button',{name:/CRM Relacionamento/}).click();
      await page.getByRole('button',{name:'NOVO LEAD',exact:true}).click();await page.getByLabel('NOME COMPLETO',{exact:true}).fill('LEAD MANUAL TESTE');await page.getByLabel('TELEFONE',{exact:true}).fill('47999999999');await page.getByRole('button',{name:'CADASTRAR',exact:true}).click();
      await page.getByRole('button',{name:/LEAD MANUAL TESTE/}).click();const crm=page.getByRole('dialog',{name:'Lead LEAD MANUAL TESTE'});
      await crm.getByLabel(/^TURMA/).selectOption('group');
      assert.equal(await crm.getByLabel(/^HORÁRIO/).locator('option').count(),2,'Explicitly disabled trial schedule must stay out');
      assert.ok((await crm.getByLabel(/^HORÁRIO/).innerText()).includes('Prof. PROFESSORA DO HORÁRIO'));
      assert.ok((await crm.getByLabel(/^HORÁRIO/).innerText()).includes('SALA 2'));
      await crm.getByLabel(/^HORÁRIO/).selectOption('enabled');await crm.getByLabel('DATA',{exact:true}).fill('2026-09-29');await snapshot(page,label+'-manual-trial');
      await crm.getByRole('button',{name:'AGENDAR',exact:true}).click();await crm.getByText('JAZZ TESTE',{exact:false}).last().waitFor();
      assert.equal(writes.at(-1).action,'CREATE_APPOINTMENT');
      await crm.getByRole('button',{name:'Fechar',exact:true}).click();emptyGroups=true;
      await page.getByRole('button',{name:'ATUALIZAR',exact:true}).click();await page.getByRole('button',{name:/LEAD MANUAL TESTE/}).click();
      await crm.getByRole('status').getByText(/NENHUM HORÁRIO ATIVO/).waitFor();assert.ok(await crm.getByLabel(/^TURMA/).isDisabled());
      assert.deepEqual(errors,[]);await context.close();
    }
    console.log('PASS: reports tabs, charts, filters, detail pagination/keyboard focus, empty/error states and manual trial selection on desktop/mobile. '+out);
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

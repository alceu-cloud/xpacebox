// Isolated API regression fixtures. No network or production writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const metrics = require('../lib/xpace/report-metrics.ts');
const trial = require('../lib/xpace/trial-schedule.ts');
const dashboard = require('../lib/xpace/dashboard-metrics.ts');
const history = require('../lib/server/xpace-report-history.ts');
class AccessError extends Error { constructor(message,status){super(message);this.status=status;} }
function moduleFrom(file,imports){
  const exports={};
  const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(source,{exports,require:name=>{if(name in imports)return imports[name];throw new Error('Unexpected import: '+name);},Date,Intl,URL,console});
  return exports;
}
function fakeAdmin(tables){
  const calls=[];
  return {calls,from(table){
    const call={table,filters:[],operation:'select'},chain={};
    for(const method of ['select','eq','in','gte','lte','order','limit','range','single','maybeSingle','insert','update'])chain[method]=(...args)=>{
      if(['insert','update'].includes(method)){call.operation=method;call.value=args[0];}
      else if(['eq','in','gte','lte'].includes(method))call.filters.push([method,...args]);
      else if(['range','single','maybeSingle','limit'].includes(method))call[method]=args;
      return chain;
    };
    chain.then=(yes,no)=>{
      calls.push(call);
      let rows=(tables[table]??[]).filter(row=>call.filters.every(([m,k,v])=>m==='eq'?row[k]===v:m==='in'?v.includes(row[k]):m==='gte'?row[k]>=v:row[k]<=v));
      if(call.range)rows=rows.slice(call.range[0],call.range[1]+1);
      if(call.limit)rows=rows.slice(0,call.limit[0]);
      const data=call.operation==='insert'?{id:'new'}:call.single||call.maybeSingle?rows[0]??null:rows;
      return Promise.resolve({data,error:null}).then(yes,no);
    };
    return chain;
  }};
}
const json=(body,options)=>({body,status:options?.status??200,headers:options?.headers});
const access=admin=>({admin,company:{id:'xpace'},profile:{id:'user',full_name:'Equipe teste',platform_role:'company_manager'}});
const imports=admin=>({'next/server':{after:()=>{},NextResponse:{json}},'@/lib/server/company-access':{AccessError,requireCompanyAccess:async(req,slug)=>{assert.equal(slug,'xpace');return access(admin);}},'@/lib/xpace/report-metrics':metrics,'@/lib/xpace/dashboard-metrics':dashboard,'@/lib/server/xpace-report-history':history,'@/lib/xpace/trial-schedule':trial,'@/lib/server/xpace-automatic-messages':{queueSatisfactionAfterAttendance:()=>{}},'@/lib/server/xpace-web-push':{sendNewAppointmentPush:()=>{}},'@/lib/xpace/natural-sort':{sortNaturally:items=>items}});
const a={lead_id:'lead',tenant_company_id:'xpace',scheduled_on:'2026-08-31',starts_at:'19:00',booking_kind:'NOVO',modality_name_snapshot:'JAZZ',actual_instructor_name_snapshot:'PROFESSOR REAL',instructor_name_snapshot:'PREVISTO',attendance_status:'COMPARECEU',enrollment_outcome:'MATRICULOU'};
(async()=>{
  const tables={xpace_lead_appointments:[...Array.from({length:1005},(_,i)=>({...a,id:String(i)})),{...a,id:'other',tenant_company_id:'dawos',lead_id:'secret'}],xpace_leads:[{id:'lead',full_name:'LEAD TESTE',tenant_company_id:'xpace',legacy_import_batch_id:'import',legacy_payload:{'Mês':'q'}},{id:'secret',full_name:'DO NOT EXPOSE',tenant_company_id:'dawos'}]};
  const admin=fakeAdmin(tables),api=moduleFrom('app/api/xpace/reports/route.ts',imports(admin));
  const request=query=>({url:'http://localhost/api/xpace/reports?from=2026-08-01&to=2026-08-31&'+query});
  const result=await api.GET(request(''));
  assert.equal(result.status,200);assert.equal(result.body.report.stats.appointments,1005,'No silent 1000-row truncation');
  assert.equal(result.body.report.instructors[0].key,'PROFESSOR REAL');
  assert.equal(result.body.report.monthDifferences.length,1005);
  assert.ok(!('records' in result.body.report),'Summary does not return student records');
  assert.ok(!JSON.stringify(result.body).includes('DO NOT EXPOSE'));
  assert.equal(result.headers['Cache-Control'],'private, no-store');
  for(const call of admin.calls)assert.ok(call.filters.some(([m,k,v])=>m==='eq'&&k==='tenant_company_id'&&v==='xpace'),call.table+' must remain company-scoped');
  const detail=await api.GET(request('detail=1&group=all&page=2'));
  assert.equal(detail.body.total,1005);assert.equal(detail.body.items.length,30);assert.equal(detail.body.page,2);
  assert.ok(detail.body.items.every(r=>r.name==='LEAD TESTE'));
  assert.equal((await api.GET(request('detail=1&group=instructor&key=DO%20NOT%20EXPOSE'))).body.total,0);
  assert.equal((await api.GET(request('detail=1&group=bad'))).status,400);
  assert.equal((await api.GET(request('detail=1&page=1.5'))).status,400);
  for(const query of ['from=2026-02-30&to=2026-03-01','from=2026-09-01&to=2026-08-01','from=2026-01-01&to=2028-01-01'])assert.equal((await api.GET({url:'http://localhost/api/xpace/reports?'+query})).status,400);
  for(const status of [401,403]){
    const denied=imports(admin);denied['@/lib/server/company-access'].requireCompanyAccess=async()=>{throw new AccessError('DENIED',status);};
    assert.equal((await moduleFrom('app/api/xpace/reports/route.ts',denied).GET(request(''))).status,status);
  }
  const group={id:'group',name:'JAZZ TESTE',modality:'JAZZ',instructor_id:'old',tenant_company_id:'xpace',active:true,settings:{allowLeads:false,leadWelcomeVideoUrl:'https://old.test/video'}};
  const schedule={id:'schedule',class_group_id:'group',tenant_company_id:'xpace',active:true,weekday:2,starts_at:'19:00:00',ends_at:'20:00:00',room_name:'SALA 2',instructor_id:'teacher',class_level:'INICIANTE',settings:{allowLeads:true,leadWelcomeVideoUrl:'https://schedule.test/video'}};
  const crmTables={xpace_class_groups:[group],xpace_class_schedules:[schedule],xpace_instructors:[{id:'teacher',full_name:'PROFESSORA DO HORÁRIO',tenant_company_id:'xpace'}],xpace_leads:[{id:'lead',pipeline_stage:'AULA_EXPERIMENTAL',mobile:'47999999999',tenant_company_id:'xpace'}]};
  const crmAdmin=fakeAdmin(crmTables),crm=moduleFrom('app/api/xpace/leads/route.ts',imports(crmAdmin));
  const options=await crm.GET({});
  assert.equal(options.body.groups[0].allowsLeads,true);assert.equal(options.body.groups[0].schedules[0].allowsLeads,true);
  assert.equal(options.body.groups[0].schedules[0].roomName,'SALA 2');assert.equal(options.body.groups[0].schedules[0].instructorName,'PROFESSORA DO HORÁRIO');
  const booking=()=>({json:async()=>({action:'CREATE_APPOINTMENT',appointment:{leadId:'lead',classGroupId:'group',classScheduleId:'schedule',scheduledOn:'2026-09-29',bookingKind:'NOVO'}})});
  const created=await crm.POST(booking());assert.equal(created.status,201);
  const saved=crmAdmin.calls.find(c=>c.table==='xpace_lead_appointments'&&c.operation==='insert').value;
  assert.equal(saved.instructor_name_snapshot,'PROFESSORA DO HORÁRIO');assert.equal(saved.welcome_video_url,'https://schedule.test/video');
  assert.equal(saved.whatsapp_opt_in,false,'Fixing schedule options must not grant consent');
  schedule.settings.allowLeads=false;assert.equal((await crm.POST(booking())).status,409);
  schedule.settings.allowLeads=true;schedule.tenant_company_id='dawos';assert.equal((await crm.POST(booking())).status,409,'Other company schedule cannot be booked');
  console.log('PASS: authenticated report API, company isolation, pagination, date validation, manual-lead options and schedule-level booking validation.');
})().catch(error=>{console.error(error);process.exitCode=1;});

// Fixture-only tests: no real database, e-mail, WhatsApp or provider requests.
const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript'), vm = require('node:vm');
function load(file, imports) { const exports={}; vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>{if(name in imports)return imports[name];throw Error(name)},Date,Intl,console,Set,Map,URL}); return exports; }
const rules=load('lib/notifications.ts',{});
const emailDiagnostics=load('lib/email-diagnostics.ts',{});
assert.match(emailDiagnostics.emailFailureDiagnosis('Unsupported state or unable to authenticate data').cause,/chave/);
assert.match(emailDiagnostics.emailFailureDiagnosis('private-token@example.test').cause,/segurança/);
assert.ok(!JSON.stringify(emailDiagnostics.emailFailureDiagnosis('private-token@example.test')).includes('private-token'));
assert.match(emailDiagnostics.emailFailureDiagnosis('',true).cause,/30 minutos/);
const base={id:'l',full_name:'LEAD TESTE',pipeline_stage:'GANHO',mobile:'47999999999',source_id:'source',assigned_to:'p',win_reason_id:'win',converted_contract_id:'contract',legacy_import_batch_id:null,updated_at:new Date().toISOString()};
const a={id:'a',lead_id:'l',scheduled_on:'2020-01-01',created_at:new Date().toISOString(),confirmation_status:'NAO_CONFIRMADO',attendance_status:'FALTOU',enrollment_outcome:'NAO_MATRICULOU',class_group_id:'g',class_schedule_id:'s'};
assert.equal(rules.wonLeadMissingFields(base,[a],'2026-09-30').length,0,'Negative answers are filled answers');
assert.equal(rules.wonLeadMissingFields(base,[],'2026-09-30').length,0,'Direct sale needs no trial');
assert.equal(rules.wonLeadMissingFields({...base,legacy_import_batch_id:'import',mobile:null,source_id:null},[],'2026-09-30').length,0,'Spreadsheet leads excluded');
assert.equal(rules.wonLeadMissingFields({...base,legacy_row_number:0,mobile:null},[],'2026-09-30').length,0);
assert.ok(rules.wonLeadMissingFields(base,[{...a,confirmation_status:'PENDENTE'}],'2026-09-30').some(x=>x.includes('confirmação')));
assert.equal(rules.wonLeadMissingFields(base,[{...a,scheduled_on:'2099-01-01',attendance_status:'AGENDADO',enrollment_outcome:'PENDENTE'}],'2026-09-30').length,0,'Future outcomes not prematurely due');
function fakeAdmin(fixtures) { const calls=[]; return {calls,from(table){const filters=[],q={}; for(const method of ['select','eq','neq','lt','not','is','or','in','order','range','maybeSingle'])q[method]=(...args)=>{filters.push([method,...args]);return q};q.then=resolve=>{calls.push({table,filters});return resolve({data:fixtures[table]??[],error:null})};return q}}; }
(async()=>{
  const stamp=new Date().toISOString();
  const f={company_notification_preferences:null,daily_agenda_email_deliveries:[],company_automation_issues:[],xpace_leads:[base,{...base,id:'old',legacy_import_batch_id:'import',source_id:null}],xpace_lead_appointments:[{...a,confirmation_status:'PENDENTE'}],xpace_contract_charges:[{id:'charge',student_id:'student',paid_at:stamp,status:'PAGA',paid_amount_cents:10000,provider_error:'old error',updated_at:stamp}],xpace_contract_sales:[{id:'sale',sale_number:1,student_id:'student',status:'CONCLUIDA',signature_status:'ASSINADA',signed_at:stamp,updated_at:stamp}],xpace_message_outbox:[],xpace_message_connectors:[],xpace_payment_cancellations:[]};
  const lib=load('lib/server/company-notifications.ts',{'@/lib/notifications':rules,'@/lib/email-diagnostics':emailDiagnostics});
  let admin=fakeAdmin(f),feed=await lib.companyNoticeFeed(admin,'company','xpace','profile',true);
  assert.equal(feed.issues.length,1);assert.equal(feed.issues[0].leadId,'l');assert.equal(feed.notices.length,3);
  assert.ok(admin.calls.every(c=>c.filters.some(x=>x[0]==='eq'&&x[1]==='tenant_company_id'&&x[2]==='company')),'Every query tenant scoped');
  f.company_notification_preferences={categories:['EXPERIMENTAL','CRM'],read_before:{EXPERIMENTAL:'2099-01-01T00:00:00Z'}};
  feed=await lib.companyNoticeFeed(fakeAdmin(f),'company','xpace','profile',true);assert.equal(feed.unread,0);assert.equal(feed.issues.length,1,'Reading never dismisses issues');
  f.xpace_lead_appointments=[a];feed=await lib.companyNoticeFeed(fakeAdmin(f),'company','xpace','profile',true);assert.equal(feed.issues.length,0,'Correcting source clears the issue');
  const cloudFixtures={...f,company_notification_preferences:null,xpace_message_connectors:[{id:'connector',status:'OFFLINE',last_seen_at:null,updated_at:stamp}],xpace_zapi_connections:[{connector_id:'connector',enabled:true,paused:false,connected:true,last_checked_at:stamp,updated_at:stamp}]};
  const cloudAdmin=ready=>({...fakeAdmin(cloudFixtures),rpc:async name=>{assert.equal(name,'xpace_zapi_scheduler_ready');return{data:ready,error:null}}});
  feed=await lib.companyNoticeFeed(cloudAdmin(true),'company','xpace','profile',true);assert.equal(feed.issues.length,0,'Healthy cloud must not depend on local heartbeat');
  feed=await lib.companyNoticeFeed(cloudAdmin(false),'company','xpace','profile',true);assert.equal(feed.issues.length,1,'Failed scheduler stays actionable');
  cloudFixtures.xpace_zapi_connections[0].paused=true;
  feed=await lib.companyNoticeFeed(cloudAdmin(true),'company','xpace','profile',true);assert.match(feed.issues[0].title,/pausada/);
  cloudFixtures.xpace_zapi_connections[0].enabled=false;
  feed=await lib.companyNoticeFeed(cloudAdmin(true),'company','xpace','profile',true);assert.match(feed.issues[0].title,/aguarda conclusão/);
  f.company_notification_preferences=null;admin=fakeAdmin(f);await lib.companyNoticeFeed(admin,'company','xpace','profile',false);
  assert.ok(!admin.calls.some(c=>['xpace_contract_charges','xpace_contract_sales','xpace_message_outbox','company_automation_issues'].includes(c.table)),'Common users never query restricted finance/integration data');
  const sample={id:'sample',sample_number:2,status:'IN_PRODUCTION',client:{tenant_company_id:'company',trade_name:'PAES BUENO'}};
  const d={id:'error',sample_id:'sample',control_stage:'PRODUCAO',scheduled_for:'2026-09-30',status:'FAILED',created_at:stamp,updated_at:stamp,error_message:'Unsupported state or unable to authenticate data'};
  f.client_samples=[sample];f.sample_overdue_email_deliveries=[d];feed=await lib.companyNoticeFeed(fakeAdmin(f),'company','dawos','profile',true);assert.equal(feed.issues.length,1);assert.match(feed.issues[0].detail,/PAES BUENO/);assert.equal(feed.issues[0].target,'EMAIL');assert.match(feed.issues[0].diagnosis.cause,/chave/);assert.equal(feed.issues[0].diagnosis.secondaryTarget,'SAMPLES');
  f.client_samples=[{...sample,client:{tenant_company_id:'other',trade_name:'PRIVATE'}}];feed=await lib.companyNoticeFeed(fakeAdmin(f),'company','dawos','profile',true);assert.ok(!JSON.stringify(feed).includes('PRIVATE'));f.client_samples=[sample];
  f.sample_overdue_email_deliveries=[{...d,id:'success',status:'SENT'},d];feed=await lib.companyNoticeFeed(fakeAdmin(f),'company','dawos','profile',true);assert.equal(feed.issues.length,0,'New success resolves old failures without erasing history');
  f.sample_overdue_email_deliveries=[d];f.client_samples=[{...sample,status:'READY'}];feed=await lib.companyNoticeFeed(fakeAdmin(f),'company','dawos','profile',true);assert.equal(feed.issues.length,0,'Old phase not still actionable');
  class AccessError extends Error{constructor(message,status){super(message);this.status=status}}
  const writeAdmin={...fakeAdmin({}),rpc:async(name,args)=>{assert.equal(name,'mark_company_notifications_read');assert.equal(args.p_company,'company');assert.equal(args.p_profile,'session-profile');return{error:null}}};
  const endpoint=load('app/api/notifications/route.ts',{'next/server':{NextResponse:{json:(value,options)=>({value,status:options?.status??200})}},'@/lib/server/company-access':{AccessError,requireCompanyAccess:async(request,slug)=>{if(request.headers==='denied')throw new AccessError('Forbidden',403);assert.equal(slug,'xpace');return{admin:writeAdmin,company:{id:'company',slug},profile:{id:'session-profile',platform_role:'platform_owner'}}}},'@/lib/server/company-notifications':{notificationPreferences:async()=>({categories:['EXPERIMENTAL'],readBefore:{}}),companyNoticeFeed:async()=>({notices:[{id:'notice',category:'EXPERIMENTAL',createdAt:stamp}],issues:[{id:'issue'}],preferences:{categories:['EXPERIMENTAL'],readBefore:{}},unread:1,todayErrors:0})},'@/lib/notifications':rules});
  const request=(body,url='https://example.test/api/notifications?slug=xpace')=>({url,json:async()=>body});
  assert.equal((await endpoint.PATCH(request({action:'MARK_READ',snapshotAt:stamp,profileId:'spoof',tenantCompanyId:'spoof'}))).status,200,'Identifiers come only from session');
  assert.equal((await endpoint.PATCH(request({action:'MARK_READ',snapshotAt:'2099-01-01'}))).status,400,'Future cursor forbidden');
  assert.equal((await endpoint.PATCH(request({action:'DISMISS_ISSUE'}))).status,400,'No API dismiss operation');
  assert.equal((await endpoint.PATCH(request({action:'PREFERENCES',categories:['INVALID']}))).status,400);
  assert.equal((await endpoint.PATCH(request({action:'PREFERENCES',categories:['constructor']}))).status,400);
  assert.equal((await endpoint.GET({...request({}),headers:'denied'})).status,403);
  assert.equal((await endpoint.GET(request({},'https://example.test/api/notifications?slug=other'))).status,400);
  console.log('PASS: spreadsheet exclusion, negative/future answers, live correction, preferences, reading persistence semantics, tenant scoping, common-user restrictions and e-mail recovery.');
})().catch(error=>{console.error(error);process.exitCode=1});

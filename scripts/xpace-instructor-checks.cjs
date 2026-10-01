// Isolated fixtures: never connects to production or WhatsApp.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function moduleFrom(file, imports = {}, clock = Date) {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(source, {exports,require(name){if(name==='server-only')return {};if(name in imports)return imports[name];if(name==='@/lib/server/xpace-message-worker')return moduleFrom('lib/server/xpace-message-worker.ts',imports,clock);if(name==='node:crypto')return require(name);throw new Error('Unexpected import '+name);},Date:clock,Intl,console});
  return exports;
}
function fakeAdmin(resolve) {
  const calls=[];
  return {calls,from(table){
    const call={table,operation:'select',filters:[]};const chain={};
    for(const method of ['select','insert','update','eq','neq','in','gte','lte','lt','order','limit','maybeSingle'])chain[method]=(...args)=>{
      if(['insert','update'].includes(method)){call.operation=method;call.value=args[0];}
      if(['eq','neq','in','gte','lte','lt'].includes(method))call.filters.push([method,...args]);
      return chain;
    };
    chain.then=(yes,no)=>{calls.push(call);return Promise.resolve(table==='xpace_zapi_connections'?{data:null,error:null}:resolve(call)).then(yes,no);};return chain;
  }};
}
const automatic=moduleFrom('lib/server/xpace-automatic-messages.ts');
const instructors=moduleFrom('lib/server/xpace-trial-instructors.ts',{'@/lib/server/xpace-automatic-messages':automatic});
const future={id:'a1',lead_id:'l1',class_schedule_id:'s1',scheduled_on:'2099-10-01',starts_at:'19:00:00',class_name_snapshot:'Street Dance',instructor_name_snapshot:'PROFESSOR Jhonney',attendance_status:'AGENDADO',confirmation_status:'PENDENTE',legacy_week_label:null};
const teacher={id:'teacher',full_name:'PROFESSOR Jhonney',active:true,mobile:'47999999999'};
function scoped(admin){for(const c of admin.calls)assert.ok(c.filters.some(f=>f[1]==='tenant_company_id'&&f[2]==='company')||c.value?.tenant_company_id==='company','Unscoped '+c.table);}
(async()=>{
  for(const [changes,label] of [[{mobile:''},'CADASTRE O CELULAR DO PROFESSOR'],[{active:false},'PROFESSOR INATIVO'],[{},'AVISO NÃO PROGRAMADO']]){
    const admin=fakeAdmin(c=>({data:c.table==='xpace_lead_appointments'?[future]:c.table==='xpace_class_schedules'?[{id:'s1',instructor_id:'teacher'}]:[{...teacher,...changes}],error:null}));
    const contexts=await instructors.trialInstructorContexts(admin,'company',['a1']);
    assert.equal(contexts.get('a1').name,'PROFESSOR Jhonney');
    assert.equal(contexts.get('a1').missingReason,label);
    assert.ok(!admin.calls.some(c=>c.operation!=='select'),'GET context must not create sends');scoped(admin);
  }
  const historical=fakeAdmin(c=>({data:c.table==='xpace_lead_appointments'?[{...future,class_schedule_id:null}]:[],error:null}));
  assert.equal((await instructors.trialInstructorContexts(historical,'company',['a1'])).get('a1').name,'PROFESSOR Jhonney');
  const noPhone=fakeAdmin(()=>({data:{...teacher,mobile:''},error:null}));
  assert.equal(await instructors.queueMissingInstructorNotices(noPhone,'company','teacher'),0);
  assert.equal(noPhone.calls.length,1);
  const candidates=[future,{...future,id:'sent'},{...future,id:'unknown'},{...future,id:'cancelled'},{...future,id:'past',scheduled_on:'2000-01-01'},{...future,id:'legacy',legacy_week_label:'SEMANA 1'}, {...future,id:'imported',lead_id:'imported'}, {...future,id:'cancelled-class',attendance_status:'CANCELADO'}];
  const admin=fakeAdmin(c=>({data:c.operation==='insert'?null:c.table==='xpace_instructors'?teacher:c.table==='xpace_class_schedules'?[{id:'s1'}]:c.table==='xpace_lead_appointments'?candidates:c.table==='xpace_leads'?[{id:'l1',full_name:'ARIEL BECKER',legacy_import_batch_id:null},{id:'imported',full_name:'IMPORTED',legacy_import_batch_id:'batch'}]:c.table==='xpace_message_outbox'?[{appointment_id:'sent'},{appointment_id:'unknown'},{appointment_id:'cancelled'}]:{id:'connector'},error:null}));
  assert.equal(await instructors.queueMissingInstructorNotices(admin,'company','teacher'),1);
  const rows=admin.calls.filter(c=>c.operation==='insert').map(c=>c.value);
  assert.equal(rows.length,1);assert.equal(rows[0].appointment_id,'a1');assert.equal(rows[0].kind,'AVISO_PROFESSOR');
  assert.ok(rows[0].body.includes('*Jhonney*'));assert.ok(!rows[0].body.includes('prof. *Professor'));
  assert.ok(rows[0].body.includes('Ariel Becker'));assert.equal(rows[0].expires_at,'2099-10-01T22:00:00.000Z');scoped(admin);
  assert.equal(rows[0].scheduled_at,'2099-10-01T19:00:00.000Z');
  assert.ok(rows[0].body.includes('Hoje você tem uma aula experimental'));
  assert.equal(new Date(automatic.trialInstructorNoticeAt('2099-10-01','01:00:00')).toISOString(),'2099-10-01T03:00:00.000Z','Early classes must not notify on the previous day');
  const current=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
  assert.ok(automatic.trialInstructorNoticeAt(current,'23:59')>=Date.parse(current+'T00:00:00-03:00'));
  // A legacy immediate-send row for next week is deferred at dispatch, not sent.
  const workerAdmin=fakeAdmin(c=>({data:c.table==='xpace_message_connectors'?{id:'connector',tenant_company_id:'company'}:c.table==='xpace_lead_appointments'?future:c.table==='xpace_instructors'?teacher:c.table==='xpace_class_schedules'?{instructor_id:'teacher'}:c.operation==='update'?null:{id:'message',kind:'AVISO_PROFESSOR',appointment_id:'a1',instructor_id:'teacher',appointment_scheduled_on:future.scheduled_on,appointment_starts_at:'19:00',destination_phone:automatic.whatsappPhone(teacher.mobile),expires_at:'2099-10-01T22:00:00Z'},error:null}));
  const worker=moduleFrom('app/api/xpace/message-connector/worker/route.ts',{'next/server':{NextResponse:{json:(body)=>({body})}},'@/lib/server/supabase-admin':{createSupabaseAdmin:()=>workerAdmin},'@/lib/server/xpace-automatic-messages':automatic});
  const claim=await worker.POST({headers:{get:()=> 'Bearer '+'x'.repeat(45)},json:async()=>({action:'CLAIM'})});
  assert.equal(claim.body.message,null);
  const deferred=workerAdmin.calls.find(c=>c.value?.scheduled_at);
  assert.equal(deferred.value.scheduled_at,'2099-10-01T19:00:00.000Z');
  assert.ok(deferred.filters.some(f=>f[1]==='status'&&f[2]==='QUEUED'));
  assert.ok(!workerAdmin.calls.some(c=>c.value?.status==='SENDING'),'Future teacher notice must never be claimed');
  const authLookup=workerAdmin.calls.find(c=>c.table==='xpace_message_connectors');
  assert.ok(authLookup.filters.some(f=>f[1]==='token_hash'&&f[2].length===64));
  scoped({calls:workerAdmin.calls.filter(c=>c!==authLookup)});
  class LateClock extends Date {static now(){return Date.parse('2099-10-01T20:00:00Z');}}
  const lateAutomatic=moduleFrom('lib/server/xpace-automatic-messages.ts',{},LateClock);
  const lateAdmin=fakeAdmin(c=>({data:c.table==='xpace_instructors'?teacher:{id:'connector'},error:null}));
  await lateAutomatic.queueTrialInstructorMessage(lateAdmin,{companyId:'company',instructorId:'teacher',leadId:'l1',appointmentId:'late',studentName:'ARIEL',scheduledOn:'2099-10-01',startsAt:'19:00',className:'Dance'});
  assert.equal(lateAdmin.calls.find(c=>c.operation==='insert').value.scheduled_at,'2099-10-01T20:00:00.000Z','Booking after reminder time queues immediately');
  const duplicate=fakeAdmin(c=>({data:c.table==='xpace_instructors'?teacher:{id:'connector'},error:c.operation==='insert'?{code:'23505'}:null}));
  assert.equal(await automatic.queueTrialInstructorMessage(duplicate,{companyId:'company',instructorId:'teacher',leadId:'l1',appointmentId:'a1',studentName:'ARIEL',scheduledOn:'2099-10-01',startsAt:'19:00',className:'Dance'}),'QUEUED');
  const expired=fakeAdmin(()=>{throw new Error('Expired notice must not query or send');});
  assert.equal(await automatic.queueTrialInstructorMessage(expired,{instructorId:'teacher',scheduledOn:'2000-01-01',startsAt:'19:00'}),'EXPIRED');
  // Teacher update saves first, then recovers missing operational notices only.
  let repair=0;
  const patchAdmin=fakeAdmin(()=>({data:{id:'teacher'},error:null}));
  const api=moduleFrom('app/api/xpace/professores/route.ts',{'next/server':{NextResponse:{json:(body)=>({body})}},'@/lib/server/company-access':{AccessError:class extends Error{},requireCompanyAccess:async()=>({admin:patchAdmin,company:{id:'company'},user:{id:'manager'},profile:{platform_role:'company_manager'}})},'@/lib/xpace/natural-sort':{sortNaturally:a=>a},'@/lib/server/xpace-trial-instructors':{queueMissingInstructorNotices:async(...args)=>{assert.equal(args[1],'company');assert.equal(args[2],'teacher');repair++;return 2;}}});
  const result=await api.PATCH({json:async()=>({action:'UPDATE_INSTRUCTOR',instructor:{id:'teacher',fullName:'Professor',mobile:'47999999999'}})});
  assert.equal(result.body.success,true);assert.equal(result.body.queuedNotices,2);assert.equal(repair,1);scoped(patchAdmin);
  console.log('PASS: real teacher identity without notice, missing-phone explanation, teacher-save recovery, future-only, legacy exclusion, no resend and tenant isolation');
})().catch(error=>{console.error(error);process.exitCode=1;});

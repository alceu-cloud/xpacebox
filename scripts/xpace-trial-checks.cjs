// Isolated regression checks: no network, real database or WhatsApp sends.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function moduleFrom(file, imports = {}) {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(source, { exports, require: name => {
    if (name === 'server-only') return {};
    if (name in imports) return imports[name];
    if (name === 'node:crypto') return require(name);
    throw new Error('Unexpected import: ' + name);
  }, Date, Intl, URL, console });
  return exports;
}
function fakeAdmin(resolve) {
  const calls = [];
  return { calls, from(table) {
    const call = { table, operation: 'select', filters: [] };
    const chain = {};
    for (const method of ['select','insert','update','delete','eq','neq','in','lt','lte','order','limit','single','maybeSingle']) chain[method] = (...args) => {
      if (['insert','update','delete'].includes(method)) {call.operation=method;call.value=args[0];}
      if (['eq','neq','in','lt','lte'].includes(method)) call.filters.push([method,...args]);
      return chain;
    };
    chain.then = (yes, no) => { calls.push(call); return Promise.resolve(resolve(call)).then(yes,no); };
    return chain;
  }};
}
const automatic = moduleFrom('lib/server/xpace-automatic-messages.ts');
const input = {companyId:'company',leadId:'lead',appointmentId:'appointment',name:'ALCEU DE MIRANDA',mobile:'(47) 99999-9999',scheduledOn:'2099-10-20',startsAt:'19:00',className:'Jazz',instructor:'PROFESSOR TESTE',videoUrl:'https://res.cloudinary.com/test/video/upload/video.mp4'};
(async () => {
  assert.equal(automatic.whatsappPhone(input.mobile),'5547999999999');
  const admin = fakeAdmin(call => ({data:call.table==='xpace_message_connectors'?{id:'connector'}:null,error:null}));
  await automatic.queueTrialMessages(admin,input);
  const rows = admin.calls.find(call=>call.operation==='insert').value;
  assert.equal(rows.length,3);
  assert.ok(rows[0].body.includes('*Alceu*'));
  assert.ok(!rows[0].body.includes('https://'),'Video caption must not contain URL');
  assert.equal(rows[1].scheduled_at,'2099-10-19T21:30:00.000Z');
  assert.equal(rows[2].scheduled_at,'2099-10-20T19:00:00.000Z');
  const appointment={id:'appointment',lead_id:'lead',scheduled_on:input.scheduledOn,starts_at:'19:00:00',ends_at:'20:00:00',class_name_snapshot:'Jazz',attendance_status:'COMPARECEU',survey_status:'PENDENTE',whatsapp_opt_in:true,survey_opt_in:true};
  // Survey-specific permission is sufficient; it must not retroactively enable reminders.
  for (const [changes, shouldQueue] of [[{},true],[{survey_opt_in:false},false],[{whatsapp_opt_in:false},true],[{attendance_status:'FALTOU'},false],[{survey_status:'ENVIADA'},false]]) {
    const surveyAdmin=fakeAdmin(call=>({data:call.table==='xpace_lead_appointments'?{...appointment,...changes}:call.table==='xpace_leads'?{full_name:input.name,mobile:input.mobile}:{id:'connector'},error:null}));
    await automatic.queueSatisfactionAfterAttendance(surveyAdmin,'company','appointment');
    const sent=surveyAdmin.calls.find(call=>call.operation==='insert');
    assert.equal(Boolean(sent),shouldQueue);
    if(sent){
      assert.equal(sent.value.kind,'PESQUISA_SATISFACAO');
      assert.equal(sent.value.scheduled_at,'2099-10-20T23:00:00.000Z');
      assert.ok(sent.value.body.includes('https://docs.google.com/forms/d/e/1FAIpQLSckZd92-4fACszd3ONn2VIcVyUpfSf5QyTp1jasYJh13-yGmA/viewform?usp=dialog'));
      assert.ok(!sent.value.body.includes('É só responder por aqui'));
    }
    for(const call of surveyAdmin.calls) assert.ok(call.filters.some(f=>f[1]==='tenant_company_id'&&f[2]==='company')||call.value?.tenant_company_id==='company','Every operation scoped to company');
  }
  for (const video of [input.videoUrl,'https://example.test/video.mp4']) {
    const workerAdmin=fakeAdmin(call=>{
      if(call.table==='xpace_message_connectors')return {data:{id:'connector',tenant_company_id:'company',disconnect_requested:false},error:null};
      if(call.table==='xpace_lead_appointments')return {data:{...appointment,confirmation_status:'PENDENTE',class_schedule_id:'schedule',welcome_video_url:video},error:null};
      if(call.operation==='update')return {data:call.value.status==='SENDING'?{id:'message',destination_phone:'5547999999999',body:'🎬 *Seu vídeo de boas-vindas:* '+input.videoUrl+'\nAssista antes da aula.'}:null,error:null};
      return {data:{id:'message',kind:'VIDEO_BOAS_VINDAS',appointment_id:'appointment',appointment_scheduled_on:input.scheduledOn,appointment_starts_at:input.startsAt,expires_at:'2099-12-31'},error:null};
    });
    const worker=moduleFrom('app/api/xpace/message-connector/worker/route.ts',{'next/server':{NextResponse:{json:(body,options)=>({body,options})}},'@/lib/server/supabase-admin':{createSupabaseAdmin:()=>workerAdmin},'@/lib/server/xpace-automatic-messages':automatic});
    const result=await worker.POST({headers:{get:()=> 'Bearer '+ 'x'.repeat(45)},json:async()=>({action:'CLAIM'})});
    if(video===input.videoUrl){assert.equal(result.body.message.mediaUrl,video);assert.ok(!result.body.message.body.includes('https://'));}
    else {assert.equal(result.body.message,null);assert.ok(workerAdmin.calls.some(call=>call.value?.status==='CANCELLED'));}
  }
  const AccessError=class extends Error {constructor(message,status){super(message);this.status=status;}};
  for(const [role,sending,expected]of [['company_manager',0,200],['company_manager',1,409],['company_user',0,403]]) {
    const apiAdmin=fakeAdmin(call=>({data:call.table==='xpace_leads'?{id:'lead',lead_number:1}:null,count:sending,error:null}));
    const api=moduleFrom('app/api/xpace/leads/route.ts',{'next/server':{after:()=>{},NextResponse:{json:(body,options)=>({body,status:options?.status??200})}},'@/lib/server/company-access':{AccessError,requireCompanyAccess:async()=>({admin:apiAdmin,company:{id:'company'},profile:{id:'user',platform_role:role}})},'@/lib/server/xpace-automatic-messages':automatic,'@/lib/server/xpace-web-push':{sendNewAppointmentPush:()=>{}},'@/lib/xpace/natural-sort':{sortNaturally:()=>[]}});
    const result=await api.POST({json:async()=>({action:'DELETE_LEAD',lead:{id:'lead'}})});
    assert.equal(result.status,expected);
    assert.equal(apiAdmin.calls.some(call=>call.operation==='delete'),expected===200);
    for(const call of apiAdmin.calls)assert.ok(call.filters.some(f=>f[1]==='tenant_company_id'&&f[2]==='company'));
    assert.ok(!apiAdmin.calls.some(call=>call.table==='xpace_message_outbox'&&call.operation==='update'),'API must not cancel queue before atomic database delete');
  }
  const racedAdmin=fakeAdmin(call=>call.operation==='delete'?{error:{message:'XPACE_LEAD_MESSAGE_SENDING'}}:{data:call.table==='xpace_leads'?{id:'lead',lead_number:1}:null,count:0,error:null});
  const racedApi=moduleFrom('app/api/xpace/leads/route.ts',{'next/server':{after:()=>{},NextResponse:{json:(body,options)=>({body,status:options?.status??200})}},'@/lib/server/company-access':{AccessError,requireCompanyAccess:async()=>({admin:racedAdmin,company:{id:'company'},profile:{id:'user',platform_role:'company_manager'}})},'@/lib/server/xpace-automatic-messages':automatic,'@/lib/server/xpace-web-push':{sendNewAppointmentPush:()=>{}},'@/lib/xpace/natural-sort':{sortNaturally:()=>[]}});
  const racedResult=await racedApi.POST({json:async()=>({action:'DELETE_LEAD',lead:{id:'lead'}})});
  assert.equal(racedResult.status,409);
  assert.ok(racedResult.body.message.includes('AGUARDE O RESULTADO'));
  console.log('PASS: captions, reminder times, consent, attendance, company isolation, media validation, legacy captions, lead delete roles and active-send guard');
})().catch(error=>{console.error(error);process.exitCode=1;});

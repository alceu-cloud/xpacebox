// Isolated fixtures: no real database writes, videos or WhatsApp sends.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const trial = require('../lib/xpace/trial-schedule.ts');
class AccessError extends Error { constructor(message, status) { super(message); this.status = status; } }
const json = (body, options) => ({ body, status: options?.status ?? 200 });
function moduleFrom(file, imports, now = '2026-09-30T12:00:00Z') {
  const exports = {};
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return Date.parse(now); } }
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(source, { exports, require: name => { if (name in imports) return imports[name]; throw Error('Unexpected import: ' + name); }, Date: Clock, Intl, URL, console });
  return exports;
}
function fakeAdmin(tables) {
  const calls = [];
  return { calls, from(table) {
    const call = { table, filters: [], operation: 'select' }, chain = {};
    for (const method of ['select','eq','neq','in','gte','lte','lt','not','order','limit','range','single','maybeSingle','insert','update']) chain[method] = (...args) => {
      if (['insert','update'].includes(method)) { call.operation = method; call.value = args[0]; }
      else if (['eq','neq','in','gte','lte','lt','not'].includes(method)) call.filters.push([method,...args]);
      else call[method] = args;
      return chain;
    };
    chain.then = (yes,no) => {
      calls.push(call);
      let rows = (tables[table] ?? []).filter(row => call.filters.every(([m,k,v,extra]) => {
        if (m === 'eq') return row[k] === v;
        if (m === 'neq') return row[k] !== v;
        if (m === 'in') return v.includes(row[k]);
        if (m === 'gte') return row[k] >= v;
        if (m === 'lte') return row[k] <= v;
        if (m === 'lt') return row[k] < v;
        return v === 'is' && extra === null ? row[k] != null : !extra.includes(row[k]);
      }));
      const count = rows.length;
      if (call.range) rows = rows.slice(call.range[0], call.range[1]+1);
      if (call.limit) rows = rows.slice(0, call.limit[0]);
      const data = call.operation === 'insert' ? { id: 'inserted' } : call.single || call.maybeSingle ? rows[0] ?? null : rows;
      return Promise.resolve({ data, count, error: null }).then(yes,no);
    };
    return chain;
  } };
}
const imports = admin => ({
  'next/server': { after: () => {}, NextResponse: { json } },
  '@/lib/server/company-access': { AccessError, requireCompanyAccess: async (_request, slug) => { assert.equal(slug,'xpace'); return { admin, company:{id:'xpace'}, profile:{id:'user',full_name:'Fixture'} }; } },
  '@/lib/xpace/trial-schedule': trial,
  '@/lib/xpace/natural-sort': { sortNaturally: items => items },
  '@/lib/server/xpace-automatic-messages': { queueSatisfactionAfterAttendance: () => {} },
  '@/lib/server/xpace-web-push': { sendNewAppointmentPush: () => {} },
});
(async () => {
  assert.deepEqual(trial.trialScheduleDetails(null),{level:'',ageGroups:[]});
  assert.deepEqual(trial.trialScheduleDetails({class_level:'AVANCADO',age_groups:['TEENS','KIDS','TEENS']}),{level:'AVANCADO',ageGroups:['KIDS','TEENS']});
  assert.equal(trial.trialClassLabel('AVANCADO',['KIDS','TEENS']),'Nível: Avançado · Público: Kids (7 a 11) / Teens (12 a 17)');
  assert.equal(trial.trialClassLabel('',[]),'');
  for (const [now,from,to,end] of [
    ['2026-09-30T12:00:00Z','2026-09-28','2026-10-05','2026-10-12'],
    ['2026-10-05T01:00:00Z','2026-09-28','2026-10-05','2026-10-12'], // Sunday locally
    ['2026-10-05T03:00:00Z','2026-10-05','2026-10-12','2026-10-19'], // Monday locally
    ['2026-12-31T12:00:00Z','2026-12-28','2027-01-04','2027-01-11'],
  ]) {
    const row = (id,scheduled_on,changes={}) => ({id,lead_id:id,scheduled_on,class_schedule_id:'schedule',attendance_status:'AGENDADO',tenant_company_id:'xpace',...changes});
    const admin = fakeAdmin({ xpace_lead_appointments:[row('this',from),row('next',to),row('boundary',end),row('cancelled',to,{attendance_status:'CANCELADO'}),row('unlinked',to,{class_schedule_id:null}),row('foreign',to,{tenant_company_id:'dawos'})] });
    const api = moduleFrom('app/api/xpace/mobile/overview/route.ts',imports(admin),now);
    const response = await api.GET({});
    assert.equal(response.status,200);
    assert.equal(response.body.metrics.trialsThisWeek,1);
    assert.equal(response.body.metrics.trialsNextWeek,1);
    const counts = admin.calls.filter(c => c.select?.[1]?.head);
    assert.ok(counts[0].filters.some(f => f[0]==='gte' && f[2]===from));
    assert.ok(counts[1].filters.some(f => f[0]==='gte' && f[2]===to));
    assert.ok(counts[1].filters.some(f => f[0]==='lt' && f[2]===end));
    for (const call of admin.calls) assert.ok(call.filters.some(f=>f[0]==='eq' && f[1]==='tenant_company_id' && f[2]==='xpace'));
    for (const status of [401,403]) {
      const denied=imports(admin); denied['@/lib/server/company-access'].requireCompanyAccess=async()=>{throw new AccessError('DENIED',status);};
      assert.equal((await moduleFrom('app/api/xpace/mobile/overview/route.ts',denied,now).GET({})).status,status);
    }
  }
  const schedule = {id:'schedule',class_group_id:'group',tenant_company_id:'xpace',active:true,weekday:3,starts_at:'19:00:00',ends_at:'20:00:00',instructor_id:'teacher',room_name:'SALA DO HORÁRIO',class_level:'INTERMEDIARIO',age_groups:['KIDS','TEENS'],settings:{allowLeads:true,leadWelcomeVideoUrl:'https://res.cloudinary.com/test/video/upload/welcome.mp4'}};
  const group = {id:'group',tenant_company_id:'xpace',active:true,name:'JAZZ',modality:'JAZZ',settings:{allowLeads:true}};
  const archived = {...schedule,id:'archived',active:false,class_level:'AVANCADO',age_groups:['ADULTO']};
  const admin = fakeAdmin({xpace_class_groups:[group],xpace_class_schedules:[schedule,archived,{...schedule,id:'foreign',tenant_company_id:'dawos'}],xpace_lead_appointments:[{id:'a',lead_id:'lead',tenant_company_id:'xpace',class_schedule_id:'schedule'}, {id:'b',lead_id:'lead',tenant_company_id:'xpace',class_schedule_id:'archived'}, {id:'c',lead_id:'lead',tenant_company_id:'xpace',class_schedule_id:'foreign'}, {id:'legacy',tenant_company_id:'xpace',class_schedule_id:null}]});
  const crm = await moduleFrom('app/api/xpace/leads/route.ts',imports(admin)).GET({url:'http://localhost/api/xpace/leads'});
  assert.equal(crm.status,200);
  assert.equal(crm.body.appointments[0].schedule_level,'INTERMEDIARIO');
  assert.deepEqual(Array.from(crm.body.appointments[0].schedule_age_groups),['KIDS','TEENS']);
  assert.equal(crm.body.appointments[1].schedule_level,'AVANCADO');
  assert.equal(crm.body.groups[0].schedules.length,1,'Archived schedule must stay out of booking options');
  assert.equal(crm.body.appointments[2].schedule_level,'','Never expose foreign schedule details');
  assert.equal(crm.body.appointments[3].schedule_level,'','Do not invent historical level');
  for (const call of admin.calls.filter(c=>c.table==='xpace_class_schedules')) assert.ok(call.filters.some(f=>f[1]==='tenant_company_id' && f[2]==='xpace'));
  // Public and staff bookings must take the room from the selected slot.
  for (const publicBooking of [true,false]) {
    let queued;
    const bookingAdmin=fakeAdmin({companies:[{id:'xpace',slug:'xpace',active:true}],xpace_class_groups:[group],xpace_class_schedules:[schedule],xpace_lead_sources:[{id:'source',tenant_company_id:'xpace',active:true}],xpace_instructors:[{id:'teacher',full_name:'PROFESSOR',tenant_company_id:'xpace',active:true}]});
    const mockImports=imports(bookingAdmin);
    mockImports['@/lib/server/supabase-admin']={createSupabaseAdmin:()=>bookingAdmin};
    mockImports['@/lib/server/xpace-automatic-messages']={queueTrialMessages:async(_admin,input)=>{queued=input;},queueTrialInstructorMessage:async()=> 'QUEUED'};
    const file=publicBooking?'app/api/public/xpace/aula-experimental/route.ts':'app/api/xpace/agenda/route.ts';
    const data={fullName:'ALUNO TESTE',mobile:'47999999999',email:'fixture@example.test',sourceId:'source',classGroupId:'group',classScheduleId:'schedule',scheduledOn:'2026-09-30',whatsappOptIn:true};
    const response=await moduleFrom(file,mockImports).POST({json:async()=>publicBooking?data:{action:'CREATE_TRIAL_IN_CLASS',trial:data}});
    assert.equal(response.status,201); assert.equal(queued.roomName,'SALA DO HORÁRIO');
    assert.equal(queued.instructor,'PROFESSOR'); assert.equal(queued.companyId,'xpace');
  }
  console.log('PASS: current/next weeks, São Paulo midnight and year boundaries, tenant isolation, archived level/audience, booking room and access denial.');
})().catch(error=>{console.error(error);process.exitCode=1;});

// Isolated fixtures: no real database, e-mails, credentials or production calls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const crypto = require('node:crypto');
const deadlines = require('../lib/sample-deadlines.ts');
function moduleFrom(file, imports, globals = {}) {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(source,{exports,require:name=>{if(name in imports)return imports[name];throw Error('Unexpected import '+name)},Date,Intl,URL,console,Buffer,...globals});
  return exports;
}
class AccessError extends Error {constructor(message,status){super(message);this.status=status}}
const connection = {id:'conn',enabled:true,sender_email:'test@example.test',api_key_ciphertext:'fixture',api_key_iv:'fixture',api_key_auth_tag:'fixture'};
function fakeAdmin(stage='PRODUCAO') {
  const calls=[];
  return {calls,from(table){const c={table,filters:[]}, q={};
    for(const m of ['select','eq','is','in','order','maybeSingle','upsert','update'])q[m]=(...args)=>{if(['eq','is','in'].includes(m))c.filters.push([m,...args]);else c[m]=args;return q};
    q.then=resolve=>{calls.push(c);let data=[];
      if(table==='companies')data={id:'dawos',slug:'dawos'};
      if(table==='email_integration_connections')data=connection;
      if(table==='client_samples')data=[{id:'s',sample_number:2,client_id:'c',responsible_profile_id:'p',status:stage==='PRODUCAO'?'IN_PRODUCTION':stage==='ENTREGA'?'READY':'SENT',production_due_date:'2099-01-01',customer_delivery_date:'2099-01-02',approval_due_date:'2099-01-03',original_production_due_date:'2020-01-01',original_customer_delivery_date:'2020-01-02',original_approval_due_date:'2020-01-03',quantity:1}];
      if(table==='clients')data=[{id:'c',trade_name:'CLIENTE'}];
      if(table==='profiles')data=[{id:'p',email:'consultor@example.test'}];
      if(table==='sample_overdue_email_deliveries')data=c.upsert?{id:'delivery'}:[];
      return resolve({data,error:null})};return q},
    rpc:async(name,value)=>{calls.push({name,value});return{error:null}}};
}
(async()=>{
  for(const stage of ['PRODUCAO','ENTREGA','APROVACAO']){
    const admin=fakeAdmin(stage), sent=[];
    const emails=moduleFrom('lib/server/daily-agenda-email.ts',{'@/lib/sample-deadlines':deadlines,'@/lib/server/supabase-admin':{createSupabaseAdmin:()=>admin},'@/lib/server/telephony-credentials':{decryptIntegrationCredential:()=> 'test-only',encryptIntegrationCredential:()=>{}}},{process:{env:{}},fetch:async(url,init)=>{assert.equal(url,'https://api.resend.com/emails');sent.push(JSON.parse(init.body));return{ok:true,json:async()=>({id:'provider'})}}});
    const result=await emails.sendScheduledSampleOverdueEmails();assert.equal(result.sent,1);
    assert.equal(emails.emailCredentialHealth(connection),'READABLE');
    assert.equal(emails.emailCredentialHealth({...connection,enabled:false}),'DISABLED');
    assert.equal(emails.emailCredentialHealth({...connection,api_key_ciphertext:null}),'INCOMPLETE');
    assert.deepEqual(sent[0].to,stage==='PRODUCAO'?['ppcp@dawos.com.br','suporte@dawos.com.br']:['consultor@example.test']);
    assert.deepEqual(sent[0].cc,stage==='PRODUCAO'?['consultor@example.test']:undefined);
    assert.match(sent[0].text,/2020/); assert.match(sent[0].text,/2099/);
    assert.match(sent[0].html,/PREVISAO REPROGRAMADA/);
    assert.ok(admin.calls.some(c=>c.table==='client_samples'&&c.filters.some(f=>f[1]==='tenant_company_id'&&f[2]==='dawos')));
    assert.equal((await emails.inspectSampleEmailCredentials()).credentialReadable,true);
  }
  const primary=crypto.randomBytes(32), legacy=crypto.randomBytes(32), iv=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv('aes-256-gcm',legacy,iv);
  const value={ciphertext:Buffer.concat([cipher.update('legacy-fixture','utf8'),cipher.final()]).toString('base64'),iv:iv.toString('base64'),authTag:cipher.getAuthTag().toString('base64')};
  const env={INTEGRATION_CREDENTIAL_ENCRYPTION_KEY:primary.toString('base64'),BALDUSSI_CREDENTIAL_ENCRYPTION_KEY:legacy.toString('base64')};
  const credentials=moduleFrom('lib/server/telephony-credentials.ts',{'server-only':{},crypto},{process:{env}});
  assert.equal(credentials.decryptIntegrationCredential(value),'legacy-fixture');
  assert.throws(()=>credentials.decryptIntegrationCredential({...value,authTag:crypto.randomBytes(16).toString('base64')}),/SALVE NOVAMENTE/);
  const newValue=credentials.encryptIntegrationCredential('current-fixture');assert.equal(credentials.decryptIntegrationCredential(newValue),'current-fixture');
  const admin=fakeAdmin();
  const route=moduleFrom('app/api/clientes/amostras/[sampleId]/transicao/route.ts',{'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status||200})}},'@/lib/server/company-access':{AccessError,requireCompanyAccess:async()=>({admin,company:{id:'dawos'},profile:{id:'actor'}})}});
  const base={slug:'dawos',action:'REPROGRAM',expectedStatus:'IN_PRODUCTION',expectedDueDate:'2026-09-23',nextDueDate:'2026-10-03',reason:'Falta de material'};
  const call=body=>route.POST({json:async()=>body},{params:Promise.resolve({sampleId:'sample'})});
  assert.equal((await call(base)).status,200);
  assert.equal(admin.calls.at(-1).value.p_company_id,'dawos');assert.equal(admin.calls.at(-1).value.p_actor_id,'actor');
  assert.equal((await call({...base,reason:''})).status,400);
  assert.equal((await call({...base,nextDueDate:'2026-02-30'})).status,400);
  assert.equal((await call({...base,action:'MARK_READY'})).status,400);
  admin.rpc=async()=>({error:{code:'40001',message:'Stale dialog'}});assert.equal((await call(base)).status,409);
  console.log('PASS: recipients by stage, legacy/current credential keys, tamper rejection, read-only diagnostics, company/actor scope, date validation and stale conflicts.');
})().catch(e=>{console.error(e);process.exitCode=1});

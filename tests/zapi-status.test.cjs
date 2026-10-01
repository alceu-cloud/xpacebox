// Pure fixtures: the dashboard must use cloud health after provider migration.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),{test}=require('node:test');
test('LID binding uses only a verified expected recipient and stores a hash, with one provider lookup',async()=>{
  const crypto=require('node:crypto'),phone='5547999110328',lid='123456789012345@lid';
  for(const verifiedLid of [lid,null]){
    let saved=0,lookups=0,reconciles=0;
    const admin={from(table){let operation='';const q={};q.select=()=>{operation='select';return q};q.update=value=>{operation='update';if(table==='xpace_zapi_attempts'){saved++;assert.equal(value.recipient_lid_hash,crypto.createHash('sha256').update('LID:'+lid).digest('hex'));assert.equal(JSON.stringify(value).includes(lid),false)}return q};
      for(const method of ['eq','is','lt','gte','neq','in','order'])q[method]=()=>q;
      q.limit=async()=>({data:table==='xpace_zapi_attempts'?[{message_id:'test',aliases:['known-id'],started_at:new Date().toISOString(),xpace_message_outbox:{destination_phone:phone,tenant_company_id:'company'}}]:[{recipient_hash:'pending-lid-hash'}],error:null});
      q.then=(yes,no)=>Promise.resolve({error:null}).then(yes,no);return q},rpc:async name=>{assert.equal(name,'xpace_reconcile_zapi_events');reconciles++;return {error:null}}};
    const exports={},imports={'node:crypto':crypto,'@/lib/server/zapi-client':{canonicalZapiPhone:value=>value,isZapiLid:value=>typeof value==='string'&&value.endsWith('@lid'),createZapiClient:()=>({recipientLid:async value=>{assert.equal(value,phone);lookups++;return verifiedLid}})},'@/lib/server/telephony-credentials':{decryptIntegrationCredential:()=>JSON.stringify({instanceId:'fixture',instanceToken:'fixture',clientToken:'fixture'})}};
    const source=ts.transpileModule(fs.readFileSync('lib/server/xpace-zapi.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    vm.runInNewContext(source,{exports,require:name=>imports[name]||{},Date,console});
    await exports.reconcileCloudEvents(admin,{connector_id:'connector',tenant_company_id:'company',credential_ciphertext:'fixture',credential_iv:'fixture',credential_auth_tag:'fixture'});
    assert.equal(lookups,1);assert.equal(saved,verifiedLid?1:0);assert.equal(reconciles,1);
    assert.notEqual(exports.recipientHash(phone),exports.recipientHash(phone+'@lid'));
  }
});
test('Callback diagnostics scope rejected events by known aliases without marking them delivered',async()=>{
  const clientExports={},sourceClient=ts.transpileModule(fs.readFileSync('lib/server/zapi-client.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(sourceClient,{exports:clientExports,URL,AbortSignal,fetch,Date,Set,Buffer});
  for(const [phone,isGroup,expected]of [['opaque@lid',false,'PHONE_FORMAT'],['5511999999999',true,'GROUP'],['5511999999999',false,'PARSED']]){
    let diagnostic,eventCount=0;
    const connection={connector_id:'connector',tenant_company_id:'company',instance_id:'instance'};
    const admin={from(table){const q={};q.select=()=>q;q.eq=()=>q;q.maybeSingle=async()=>({data:connection,error:null});
      q.overlaps=(key,ids)=>{assert.equal(key,'aliases');assert.equal(ids[0],'test-id');return q};q.limit=async()=>({data:[{message_id:'test'}],error:null});
      q.upsert=async(value,options)=>{if(table==='xpace_zapi_receipt_diagnostics'){diagnostic=value;assert.match(options.onConflict,/message_scope/)}else if(table==='xpace_zapi_events')eventCount++;else assert.fail(table);return{error:null}};
      return q}};
    const exports={},imports={'node:crypto':require('node:crypto'),'next/server':{NextResponse:{json:(value,options)=>({value,...options})}},'@/lib/server/supabase-admin':{createSupabaseAdmin:()=>admin},'@/lib/server/zapi-client':clientExports,'@/lib/server/xpace-zapi':{recipientHash:()=> 'private-hash',reconcileCloudEvents:async()=>{}}};
    const source=ts.transpileModule(fs.readFileSync('app/api/xpace/message-connector/zapi/webhook/[secret]/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    vm.runInNewContext(source,{exports,require:name=>imports[name],Date,console});
    const response=await exports.POST({text:async()=>JSON.stringify({instanceId:'instance',type:'MessageStatusCallback',status:'RECEIVED',ids:['test-id'],momment:Date.now(),phone,isGroup})},{params:Promise.resolve({secret:'s'.repeat(43)})});
    assert.equal(response.status,200);assert.equal(diagnostic.message_scope,'MATCHED');assert.equal(diagnostic.parser_result,expected);assert.equal(eventCount,expected==='PARSED'?1:0);
    assert.equal(JSON.stringify(diagnostic).includes(phone),false);assert.equal(JSON.stringify(diagnostic).includes('test-id'),false);
  }
});
test('Preparation cron reads receipt settings without claiming or sending the customer queue',async()=>{
  let checks=0,diagnostics=0,ticks=0;
  const connection={connector_id:'connector',tenant_company_id:'company',enabled:false,paused:true};
  const receipts={sendingConfigured:true,statusConfigured:true,sendingIgnored:false,statusIgnored:false,botPreserved:true};
  const admin={from(table){assert.equal(table,'xpace_zapi_connections');const q={select:()=>q,order:()=>q,limit:async()=>({data:[connection],error:null})};return q},rpc:async(name,args)=>{assert.equal(name,'xpace_record_zapi_scheduler_tick');assert.equal(args.p_success,true);ticks++;return {error:null}}};
  const imports={
    'node:crypto':require('node:crypto'),
    'next/server':{NextResponse:{json:value=>value}},
    '@/lib/server/supabase-admin':{createSupabaseAdmin:()=>admin},
    '@/lib/server/xpace-zapi':{reconcileCloudEvents:async()=>{},checkCloudConnection:async()=>{checks++;return true},cloudCredentials:()=>({webhookSecret:'private-secret'}),dispatchCloudQueue:()=>assert.fail('paused preparation must never dispatch')},
    '@/lib/server/zapi-client':{createZapiClient:()=>({receiptConfiguration:async secret=>{assert.equal(secret,'private-secret');diagnostics++;return receipts}})}
  };
  const exports={},source=ts.transpileModule(fs.readFileSync('app/api/cron/xpace-zapi/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(source,{exports,require:name=>imports[name],process:{env:{CRON_SECRET:'scheduler-secret'}},Buffer,console});
  const result=await exports.GET({headers:{get:()=> 'Bearer scheduler-secret'}});
  assert.equal(result.success,true);assert.equal(checks,1);assert.equal(diagnostics,1);assert.equal(ticks,1);
  assert.equal(result.states[0].paused,true);assert.equal(result.states[0].receipts.statusConfigured,true);
  assert.equal(JSON.stringify(result).includes('private-secret'),false);
});
test('Stale isolated sends become UNKNOWN, never QUEUED; fresh/confirmed/other-tenant rows stay intact',async()=>{
  const old=new Date(Date.now()-360_000).toISOString(),fresh=new Date().toISOString();
  const rows=[
    {id:'old',tenant_company_id:'company',connector_id:'connector',status:'SENDING',claimed_at:old,delivered_at:null,read_at:null},
    {id:'fresh',tenant_company_id:'company',connector_id:'connector',status:'SENDING',claimed_at:fresh,delivered_at:null,read_at:null},
    {id:'other',tenant_company_id:'other-company',connector_id:'connector',status:'SENDING',claimed_at:old,delivered_at:null,read_at:null},
    {id:'delivered',tenant_company_id:'company',connector_id:'connector',status:'SENDING',claimed_at:old,delivered_at:fresh,read_at:null}
  ];
  let updates=0,reconciles=0;
  const admin={from(table){assert.equal(table,'xpace_message_outbox');const filters=[],q={};let values;
    q.update=value=>{values=value;assert.equal(value.status,'UNKNOWN');return q};
    for(const method of ['eq','is','lt'])q[method]=(key,value)=>{filters.push([method,key,value]);return q};
    q.then=(yes,no)=>{updates++;for(const row of rows)if(filters.every(([method,key,value])=>method==='lt'?row[key]<value:row[key]===value))Object.assign(row,values);return Promise.resolve({error:null}).then(yes,no)};return q},
    rpc:async name=>{assert.equal(name,'xpace_reconcile_zapi_events');assert.equal(updates,1);reconciles++;return{error:null}}};
  const exports={};const source=ts.transpileModule(fs.readFileSync('lib/server/xpace-zapi.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(source,{exports,require:name=>name==='node:crypto'?require(name):{},Date,console});
  await exports.reconcileCloudEvents(admin,{connector_id:'connector',tenant_company_id:'company'});
  assert.equal(rows[0].status,'UNKNOWN');assert.ok(rows.slice(1).every(row=>row.status==='SENDING'));assert.equal(reconciles,1);
});
test('Cloud status, pause and scheduler are independent from the school PC',async()=>{
  for(const [cloud,schedulerReady,expected]of [
    [null,false,'OFFLINE'],
    [{enabled:false,paused:true},false,'PREPARING'],
    [{enabled:true,paused:true},false,'PAUSED'],
    [{enabled:true,paused:false,connected:true,last_checked_at:new Date().toISOString()},true,'CONNECTED'],
    [{enabled:true,paused:false,connected:true,last_checked_at:new Date().toISOString()},false,'SCHEDULER_ERROR'],
    [{enabled:true,paused:false,connected:false,last_checked_at:new Date().toISOString()},true,'OFFLINE'],
    [{enabled:true,paused:false,connected:true,last_checked_at:'2000-01-01T00:00:00Z'},true,'OFFLINE']
  ]){
    const calls=[];
    const admin={from(table){const q={};q.select=()=>q;q.eq=(key,value)=>{calls.push([key,value]);return q};q.maybeSingle=async()=>({data:table==='xpace_zapi_connections'?cloud:{status:'OFFLINE',last_seen_at:null},error:null});return q},rpc:async name=>{assert.equal(name,'xpace_zapi_scheduler_ready');return{data:schedulerReady,error:null}}};
    const exports={},imports={'next/server':{NextResponse:{json:value=>value}},'@/lib/server/company-access':{AccessError:class extends Error{},requireCompanyAccess:async()=>({admin,company:{id:'company'}})}};
    const source=ts.transpileModule(fs.readFileSync('app/api/xpace/message-connector/status/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
    vm.runInNewContext(source,{exports,require:name=>imports[name],Date,console});
    const result=await exports.GET({});assert.equal(result.status,expected);
    assert.ok(calls.every(([key,value])=>key==='tenant_company_id'&&value==='company'));
  }
});

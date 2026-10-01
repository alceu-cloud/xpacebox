// Pure fixtures: the dashboard must use cloud health after provider migration.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),{test}=require('node:test');
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

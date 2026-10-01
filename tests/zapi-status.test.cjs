// Pure fixtures: the dashboard must use cloud health after provider migration.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),{test}=require('node:test');
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

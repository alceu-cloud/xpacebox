// Auth/admin services are fictional in-memory fixtures; no accounts are created remotely.
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
class AccessError extends Error{constructor(message,status){super(message);this.status=status;}}
const company=id(1),instructor=id(2),createdId=id(3),calls=[];
let role='company_manager',binding=null,account=null,createError=false,bindingError=false,active=true;
const admin={auth:{admin:{
 createUser:async input=>{calls.push({action:'create',input});return createError?{error:Error('already exists'),data:{user:null}}:{data:{user:{id:createdId}},error:null};},
 deleteUser:async user=>{calls.push({action:'deleteUser',user});return{error:null};},
 updateUserById:async(user,input)=>{calls.push({action:'password',user,input});return{error:null};}
}},from(table){let operation='read',value=null;const filters=[],q={select(){return q},eq(k,v){filters.push([k,v]);return q},maybeSingle(){return q},upsert(v){operation='upsert';value=v;return q},delete(){operation='delete';return q},insert(v){operation='insert';value=v;return q},update(v){operation='update';value=v;return q},then(yes,no){calls.push({action:operation,table,value,filters});let data=null,error=null;
 if(table==='xpace_instructors'&&operation==='read')data=active&&filters.some(([k,v])=>k==='tenant_company_id'&&v===company)?{id:instructor,full_name:'Ana fixture'}:null;
 if(table==='xpace_teacher_access'){if(operation==='read')data=binding;if(operation==='insert'){if(bindingError)error=Error('fixture write failed');else binding={profile_id:value.profile_id,active:true};}if(operation==='update')binding={...binding,...value};}
 if(table==='profiles'){if(operation==='upsert')account=value;else data=account;}
 return Promise.resolve({data,error}).then(yes,no);
 }};return q;}};
const exportsModule={},stub={AccessError,requireCompanyAccess:async()=>{if(role==='company_teacher')throw new AccessError('restricted',403);return{admin,company:{id:company},profile:{platform_role:role}};}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/xpace/professores/acesso/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:exportsModule,require:n=>n==='next/server'?{NextResponse:{json:(body,opts)=>({body,status:opts?.status||200})}}:n==='@/lib/server/company-access'?stub:n==='@/lib/xpace/link-tree'?{validUuid:v=>typeof v==='string'&&/^[0-9a-f-]{36}$/i.test(v)}:null,URL,console:{error(){}}});
const request=body=>({url:'http://localhost/api/xpace/professores/acesso?id='+instructor,json:async()=>body});
const valid={instructorId:instructor,email:'ANA@EXAMPLE.TEST',password:'Fixture-only-123'};
(async()=>{
 role='company_staff';assert.equal((await exportsModule.POST(request(valid))).status,403);assert.equal(calls.length,0);
 role='company_manager';assert.equal((await exportsModule.POST(request({...valid,password:'short'}))).status,400);
 active=false;assert.equal((await exportsModule.POST(request(valid))).status,404);active=true;
 assert.equal((await exportsModule.POST(request(valid))).status,201);assert.equal(account.platform_role,'company_teacher');assert.equal(account.email,'ana@example.test');assert.equal(binding.profile_id,createdId);
 const deletion=calls.find(c=>c.action==='delete'&&c.table==='company_members');assert.deepEqual(deletion.filters,[['profile_id',createdId]]);
 assert.equal((await exportsModule.GET(request())).body.access.email,'ana@example.test');
 const createCount=calls.filter(c=>c.action==='create').length;assert.equal((await exportsModule.POST(request(valid))).status,409);assert.equal(calls.filter(c=>c.action==='create').length,createCount);
 assert.equal((await exportsModule.PATCH(request({instructorId:instructor,active:false,password:'Another-fixture-123'}))).status,200);assert.equal(binding.active,false);assert.equal(calls.find(c=>c.action==='password').user,createdId);
 account.platform_role='company_manager';assert.equal((await exportsModule.PATCH(request({instructorId:instructor,active:true}))).status,409);assert.equal((await exportsModule.GET(request())).status,409);
 binding=null;account=null;createError=true;const deletes=calls.filter(c=>c.action==='deleteUser').length;assert.equal((await exportsModule.POST(request(valid))).status,409);assert.equal(calls.filter(c=>c.action==='deleteUser').length,deletes);
 createError=false;bindingError=true;assert.equal((await exportsModule.POST(request(valid))).status,500);assert.equal(calls.at(-1).action,'deleteUser');assert.equal(calls.at(-1).user,createdId);
 role='company_teacher';assert.equal((await exportsModule.GET(request())).status,403);
 console.log('Teacher account API: PASS (manager-only, active tenant instructor, validation, restricted profile/binding, membership removal, duplicate protection, active/password management and rollback of new account only).');
})().catch(e=>{console.error(e);process.exitCode=1;});

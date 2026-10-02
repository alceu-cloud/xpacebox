// Real route code with fictional Auth/database services; no remote accounts.
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),company=id(1),actor=id(2),person=id(3),target=id(4);
class AccessError extends Error{constructor(message,status){super(message);this.status=status;}}
let role='platform_owner',binding=null,previousRole='company_user',rpcError=null,createError=false;const calls=[];
const auth={getUser:async()=>({data:{user:{id:actor}},error:null}),admin:{
 createUser:async input=>{calls.push({action:'create',input});return createError?{data:{user:null},error:Error('duplicate')}:{data:{user:{id:target}},error:null};},
 deleteUser:async user=>{calls.push({action:'deleteUser',user});return{error:null};},
 getUserById:async()=>({data:{user:{id:target,email:'fixture@example.test'}},error:null}),
 updateUserById:async(user,input)=>{calls.push({action:'authUpdate',user,input});return{error:null};}
}};
const admin={auth,rpc:async(name,args)=>{calls.push({action:'rpc',name,args});return{data:null,error:rpcError};},from(table){
 const filters=[],q={};let one=false;q.select=q.order=()=>q;q.eq=(k,v)=>{filters.push([k,v]);return q;};q.maybeSingle=q.single=()=>{one=true;return q;};
 for(const method of ['insert','upsert','update'])q[method]=value=>{calls.push({action:method,table,value});return q;};
 q.then=(yes,no)=>{let data=null;if(table==='profiles')data=filters.some(([k,v])=>k==='id'&&v===actor)?{platform_role:role,active:true}:{platform_role:previousRole};
 if(table==='companies')data=filters.some(([k,v])=>k==='id'&&v===company)?{id:company}:null;
 if(table==='xpace_instructors')data=filters.some(([k,v])=>k==='tenant_company_id'&&v===company)&&(!filters.some(([k])=>k==='id')||filters.some(([k,v])=>k==='id'&&v===person))?{id:person,full_name:'Professor fixture',active:true}:null;
 if(table==='xpace_teacher_access')data=binding;
 return Promise.resolve({data:one?data:data?[data]:[],error:null}).then(yes,no);};return q;
}};
function load(file,imports){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>{if(n in imports)return imports[n];throw Error('Unexpected '+n);},URL,process:{env:{NEXT_PUBLIC_SUPABASE_URL:'http://fixture.test',NEXT_PUBLIC_SUPABASE_ANON_KEY:'anon-fixture',SUPABASE_SERVICE_ROLE_KEY:'service-fixture'}},console:{log(){},error(){}}});return exports;}
const json={'next/server':{NextResponse:{json:(body,opts)=>({body,status:opts?.status??200})}}};
const access={AccessError,requireCompanyAccess:async()=>{if(role!=='platform_owner'&&role!=='company_manager')throw new AccessError('restricted',403);return{admin,company:{id:company},profile:{platform_role:role}};}};
const uuid={validUuid:v=>typeof v==='string'&&/^[0-9a-f-]{36}$/i.test(v)};
const helper=load('lib/server/teacher-user-admin.ts',{'./company-access':access,'@/lib/xpace/link-tree':uuid});
const imports={...json,'@supabase/supabase-js':{createClient:()=>admin},'@/lib/server/company-access':access,'@/lib/server/supabase-admin':{createSupabaseAuth:()=>({auth})},'@/lib/server/teacher-user-admin':helper};
const create=load('app/api/usuarios/criar/route.ts',imports),update=load('app/api/usuarios/atualizar/route.ts',imports);
const catalog=load('app/api/usuarios/professores/route.ts',{...json,'@/lib/server/company-access':access,'@/lib/xpace/link-tree':uuid});
const loginReturn=load('lib/xpace/teacher-login-return.ts',{}).teacherLoginReturn;
assert.equal(loginReturn('/xpace/professor?sala='+person),'/xpace/professor?sala='+person);for(const unsafe of['//evil.test/xpace/professor','https://evil.test/xpace/professor','/usuarios','/xpace/professor/other'])assert.equal(loginReturn(unsafe),null);assert.equal(loginReturn('/xpace/professor?sala=invalid'),'/xpace/professor');
const request=body=>({url:'http://localhost/api/usuarios/professores',headers:new Headers({Authorization:'Bearer fixture-only'}),json:async()=>body});
const valid={nome:'Professor fixture',email:'fixture@example.test',senha:'Fixture-only-123',empresa:company,cargo:'company_teacher',instructorId:person,teacherActive:true};
(async()=>{
 role='company_manager';assert.equal((await create.POST(request(valid))).status,403);assert.equal((await catalog.GET(request())).status,403);assert.equal((await update.POST(request({...valid,id:target}))).status,403);assert.equal(calls.length,0);
 role='platform_owner';assert.equal((await create.POST(request({...valid,cargo:'forged'}))).status,400);assert.equal((await create.POST(request({...valid,senha:'short'}))).status,400);
 assert.equal((await create.POST(request({...valid,instructorId:id(90)}))).status,400);assert.equal((await create.POST(request({...valid,empresa:id(91)}))).status,400);
 binding={profile_id:id(92)};assert.equal((await create.POST(request(valid))).status,409);assert.equal(calls.filter(c=>c.action==='create').length,0);binding=null;
 assert.equal((await create.POST(request(valid))).status,201);assert.equal('platform_role'in calls.find(c=>c.action==='create').input.user_metadata,false);
 const saved=calls.at(-1);assert.equal(saved.name,'xpace_save_teacher_user');assert.equal(saved.args.p_actor,actor);assert.equal(saved.args.p_profile,target);assert.equal(saved.args.p_company,company);assert.equal(saved.args.p_instructor,person);assert.equal(saved.args.p_role,'company_teacher');assert.equal(calls.some(c=>c.action==='insert'&&c.table==='company_members'),false);
 assert.equal((await catalog.GET(request())).body.instructors[0].id,person);
 binding={profile_id:target,tenant_company_id:company,instructor_id:person,active:false};previousRole='company_teacher';
 assert.equal((await update.POST(request({...valid,id:target,teacherActive:false,actorId:id(93)}))).status,200);assert.equal(calls.at(-1).args.p_teacher_active,false);assert.equal(calls.at(-1).args.p_actor,actor);
 assert.equal((await update.POST(request({...valid,id:target,cargo:'company_manager',instructorId:null}))).status,200);assert.equal(calls.at(-1).args.p_role,'company_manager');assert.equal(calls.at(-1).args.p_instructor,null);
 binding=null;rpcError={message:'TEACHER_ALREADY_LINKED',code:'P0001'};assert.equal((await create.POST(request(valid))).status,409);assert.equal(calls.at(-1).action,'deleteUser');assert.equal(calls.at(-1).user,target);
 rpcError=null;createError=true;const beforeDeletes=calls.filter(c=>c.action==='deleteUser').length;assert.equal((await create.POST(request(valid))).status,400);assert.equal(calls.filter(c=>c.action==='deleteUser').length,beforeDeletes);
 console.log('Teacher user API: PASS (normal profile, admin-only, validated school/instructor, no general membership, edit/role change, disabled binding and rollback only for a new account).');
})().catch(e=>{console.error(e);process.exitCode=1;});

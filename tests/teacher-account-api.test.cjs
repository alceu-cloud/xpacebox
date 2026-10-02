// The previous instructor-specific account API must no longer create or manage users.
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const exportsModule={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/xpace/professores/acesso/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:exportsModule,require:n=>{if(n!=='next/server')throw Error('Retired route must not access Auth/database');return{NextResponse:{json:(body,opts)=>({body,status:opts.status})}};}});
for(const method of['GET','POST','PATCH'])assert.equal(exportsModule[method]().status,410);
console.log('Retired teacher account API: PASS (410, no Auth/database side effects).');

// Local fixtures only: no real auth, database writes or e-mail deliveries.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),ts=require('typescript'),vm=require('node:vm');
const {chromium}=require('@playwright/test');
function load(file,imports={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>{if(name in imports)return imports[name];throw Error(name)},Date,console,Set,Map,Object,Number,String,process});return exports;}
const brand=load('lib/company-branding.ts'),defaults=load('lib/gerenciador/data.ts');
for(const slug of ['dawos','gta','carcat'])assert.equal(brand.companyLogo(slug),defaults.defaultQuoteParametersByCompany[slug].logo);
assert.equal(brand.companyLogo('constructor'),'');assert.equal(brand.companyLogo('unknown'),'');
assert.equal(brand.resolveCompanyLogo('gta','  '),'/companies/gta-logo.png');
assert.equal(brand.resolveCompanyLogo('carcat',''),'/companies/carcat-logo.png');
assert.equal(brand.resolveCompanyLogo('gta','https://example.test/custom.png'),'https://example.test/custom.png');
assert.equal(brand.resolveCompanyLogo('carcat','data:image/png;base64,fixture'),'data:image/png;base64,fixture');
require('@next/env').loadEnvConfig(process.cwd());
const origin=process.env.TEST_ORIGIN||'http://localhost:3007';assert.ok(['localhost','127.0.0.1'].includes(new URL(origin).hostname));
const project=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
const out=path.join(os.tmpdir(),'xpace-company-branding');fs.mkdirSync(out,{recursive:true});
const user={id:'00000000-0000-4000-8000-000000000001',email:'branding@example.test',aud:'authenticated',role:'authenticated',created_at:'2026-01-01T00:00:00Z',app_metadata:{provider:'email'},user_metadata:{}};
(async()=>{
  // Exercise the actual quote-email route with an intercepted sender.
  class AccessError extends Error{constructor(message,status){super(message);this.status=status;}}
  let seller='gta',custom='',captured;
  const admin={from(table){const filters=[],q={};for(const name of ['select','eq','single','maybeSingle'])q[name]=(...args)=>{filters.push([name,...args]);return q;};q.then=resolve=>{assert.ok(filters.some(f=>f[0]==='eq'&&f[1]==='tenant_company_id'&&f[2]==='company'));return resolve({error:null,data:table==='quotes'?{id:'quote',email:'client@example.test',seller_company_slug:seller,quote_items:[]}: {data:{quoteParameters:{[seller]:{logo:custom}}}}});};return q;}};
  const endpoint=load('app/api/orcamentos/[quoteId]/email/route.ts',{'next/server':{NextResponse:{json:(value,options)=>({value,status:options?.status??200})}},'@/lib/gerenciador/data':defaults,'@/lib/company-branding':brand,'@/lib/server/company-access':{AccessError,requireCompanyAccess:async()=>({admin,company:{id:'company',name:'TEST'}})},'@/lib/server/daily-agenda-email':{sendQuoteEmail:async message=>{captured=message;}}});
  for(seller of ['gta','carcat']){custom='';assert.equal((await endpoint.POST({json:async()=>({slug:seller})},{params:Promise.resolve({quoteId:'quote'})})).status,200);assert.ok(captured.sellerLogoUrl.endsWith(brand.companyLogo(seller)));custom='https://example.test/custom.png';await endpoint.POST({json:async()=>({slug:seller})},{params:Promise.resolve({quoteId:'quote'})});assert.equal(captured.sellerLogoUrl,custom);}
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  try{for(const [label,viewport]of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
    const context=await browser.newContext({viewport});const errors=[];
    await context.addInitScript(({project,user})=>localStorage.setItem(`sb-${project}-auth-token`,JSON.stringify({access_token:'fixture',refresh_token:'fixture',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user})),{project,user});
    await context.route('**/*',async route=>{const req=route.request(),url=new URL(req.url()),send=value=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(value)});
      if(url.hostname.endsWith('.supabase.co')){if(url.pathname.startsWith('/auth/'))return send(user);if(url.pathname.endsWith('/profiles'))return send({...user,platform_role:'platform_owner'});if(url.pathname.endsWith('/companies'))return send(['dawos','gta','carcat'].map(slug=>({id:slug,name:slug.toUpperCase(),slug})));return send([]);}
      if(url.pathname.startsWith('/api/')){assert.equal(req.method(),'GET','No fixture sends');if(url.pathname==='/api/gerenciador')return send({success:true,settings:{},representatives:[]});return send({success:true,lock:null,latest:null,quotes:[],samples:[],connections:[],clients:[]});}
      if(url.origin!==origin)return route.abort();return route.continue();
    });
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
    await page.goto(origin);await page.getByRole('button',{name:/Empresa GTA Abrir painel/}).waitFor();
    assert.equal(await page.locator('.xb-company-card--gta').count(),1);assert.equal(await page.locator('.xb-company-card--carcat').count(),1);
    assert.equal(await page.locator('.xb-company-card--gta').evaluate(e=>getComputedStyle(e).color),'rgb(36, 86, 55)');
    assert.equal(await page.locator('.xb-company-card--carcat').evaluate(e=>getComputedStyle(e).color),'rgb(52, 58, 66)');
    await page.screenshot({path:path.join(out,label+'-central.png'),fullPage:true});
    for(const slug of ['gta','carcat']){await page.goto(origin+'/empresa/'+slug);const logo=page.getByRole('img',{name:slug.toUpperCase(),exact:true});await logo.waitFor();await logo.evaluate(e=>e.decode());assert.ok(await logo.evaluate(e=>e.naturalWidth>0));assert.ok((await logo.getAttribute('src')).includes(encodeURIComponent(brand.companyLogo(slug))));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No page overflow');await page.screenshot({path:path.join(out,label+'-'+slug+'.png'),fullPage:true});await page.goto(origin+'/empresa/'+slug+'/gerenciador');await page.getByRole('img',{name:slug.toUpperCase(),exact:true}).waitFor();}
    assert.deepEqual(errors,[]);await context.close();
  }}finally{await browser.close();}
  console.log('PASS: transparent brand assets, header/manager desktop and mobile, central colors, quote-email default and custom-logo preservation; screenshots '+out);
})().catch(e=>{console.error(e);process.exitCode=1;});

// Isolated observation UI fixtures. All API/auth/provider traffic is intercepted.
const assert = require('node:assert/strict');
const { chromium } = require('@playwright/test');
const { setup, snapshot, origin } = require('./stock-browser-test.cjs');
const bands = [{min:0,max:50,monthlyCents:9900},{min:51,max:200,monthlyCents:14900},{min:201,max:300,monthlyCents:19900},{min:301,max:500,monthlyCents:24900},{min:501,max:800,monthlyCents:29900},{min:801,max:null,monthlyCents:34900}];
(async () => {
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  try {
    for (const width of [1440,390,320]) {
      const f=await setup(browser,width), writes=[], observations=new Map();
      let ambiguous=width===390, failRead=false;
      await f.context.route('**/api/saas/**',async route => {
        const request=route.request(), url=new URL(request.url());
        const send=data => route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,...data})});
        if (request.method()==='POST') {
          const input=request.postDataJSON(); writes.push(input);
          assert.ok(url.pathname.endsWith('/students'));
          if (!observations.has(input.requestId)) observations.set(input.requestId,{id:input.requestId,local_date:'2026-10-01',observed_at:'2026-10-01T21:00:00Z',active_students:51,source:'OBSERVATION'});
          if (ambiguous) { ambiguous=false; return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({success:false,message:'RESULTADO INCERTO. REPITA A MESMA OPERAÇÃO.'})}); }
          const row=observations.get(input.requestId);
          return send({observation:{id:row.id,date:row.local_date,observedAt:row.observed_at,activeStudents:51,source:'OBSERVATION'},message:'OBSERVAÇÃO REGISTRADA. NÃO É FECHAMENTO, MÉDIA DIÁRIA OU COBRANÇA.'});
        }
        if (failRead) { failRead=false; return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({success:false,message:'LEITURA INDISPONÍVEL'})}); }
        return send({company:{name:'Escola fixture'},exempt:false,preferences:{payment_method:null,addons:[]},activeStudents:51,measurement:'PENDING',preview:{monthlyCents:14900},bands,addonMonthlyCents:15000,invoices:[],observations:[...observations.values()].slice(-5).reverse(),page:0,total:0,pageSize:10});
      });
      await f.page.goto(`${origin}/planos/school`);
      await f.page.getByText('Contagem de alunos · preparação',{exact:true}).click();
      const capture=f.page.getByRole('button',{name:'Registrar contagem atual',exact:true});
      await capture.waitFor();
      if (width===320) failRead=true;
      await capture.click();
      if (width===390) {
        await f.page.getByRole('alert').filter({hasText:'RESULTADO INCERTO'}).waitFor();
        await capture.click();
      }
      await f.page.getByRole('status').filter({hasText:'OBSERVAÇÃO REGISTRADA'}).waitFor();
      const list=f.page.getByRole('list',{name:'Últimas cinco observações'});
      await list.waitFor(); assert.equal(await list.getByRole('listitem').count(),1);
      assert.equal(observations.size,1);
      if (width===390) { assert.equal(writes.length,2); assert.equal(writes[0].requestId,writes[1].requestId); }
      if (width===320) await f.page.getByRole('alert').filter({hasText:'A OBSERVAÇÃO JÁ FOI SALVA'}).waitFor();
      for (const input of writes) assert.deepEqual(Object.keys(input),['requestId']);
      assert.match(await list.innerText(),/observação, sem cobrança/i);
      await snapshot(f.page,`saas-observations-${width}`);
      assert.deepEqual(f.errors,[]); await f.context.close();
    }
    console.log('PASS SaaS observations browser: mobile320/390/desktop, same-UUID ambiguous retry, confirmed-write vs read-error, only server count/date, no overflow.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });

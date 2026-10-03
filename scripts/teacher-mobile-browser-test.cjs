// Tests the optimized Next build using browser-intercepted files and fictional API responses.
// No server is started, no real account is used and no production request is sent.
const {chromium}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {setup,noOverflow,id,today}=require('./xpace-links-teaching-browser-test.cjs');
const root=process.cwd(),origin='http://127.0.0.1:3008';
const output=path.join(root,'output','teacher-mobile-review');
const mime={'.js':'application/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2','.svg':'image/svg+xml','.ico':'image/x-icon','.webmanifest':'application/manifest+json'};
async function fixture(browser,width,teacher=false,owner=true,authenticated=true){
 const ctx=await setup(browser,width,teacher,owner,authenticated);
 await ctx.context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname!=='127.0.0.1'||url.port!=='3008'||url.pathname.startsWith('/api/'))return route.fallback();
  const pathname=decodeURIComponent(url.pathname);
  let file,type;
  if(pathname.startsWith('/_next/static/')){file=path.join(root,'.next','static',pathname.slice('/_next/static/'.length));type=mime[path.extname(file)]||'application/octet-stream';}
  else if(path.extname(pathname)){file=path.join(root,'public',pathname);type=mime[path.extname(file)]||'application/octet-stream';}
  else{const rsc=url.searchParams.has('_rsc')||route.request().headers().rsc==='1';file=path.join(root,'.next','server','app',pathname+(rsc?'.rsc':'.html'));type=rsc?'text/x-component':'text/html';}
  if(!path.resolve(file).startsWith(root+path.sep))return route.abort();
  try{return await route.fulfill({contentType:type,body:await fs.readFile(file)});}catch{return route.fulfill({status:404,body:'Missing local test artifact'});}
 });
 return ctx;
}
async function clock(context,time='18:55:00'){await context.addInitScript(fixed=>{const OriginalDate=Date;window.Date=class extends OriginalDate{constructor(...args){if(args.length)super(...args);else super(fixed);}static now(){return fixed;}};},Date.parse(today+'T'+time+'-03:00'));}
async function drag(page,{target='.tw-heading h2',dx=0,dy=200,cancel=false}={}){
 await page.locator(target).evaluate((element,{dx,dy,cancel})=>{
  for(const[type,x,y]of[['touchstart',20,20],['touchmove',20+dx,20+dy],[cancel?'touchcancel':'touchend',20+dx,20+dy]]){
   const touch=new Touch({identifier:1,target:element,clientX:x,clientY:y});
   element.dispatchEvent(new TouchEvent(type,{bubbles:true,touches:type==='touchend'||type==='touchcancel'?[]:[touch],changedTouches:[touch]}));
  }
 },{dx,dy,cancel});
}
(async()=>{await fs.mkdir(output,{recursive:true});const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 for(const width of[390,320]){
  const{context,page,writes,errors}=await fixture(browser,width,true);await clock(context);
  await page.goto(origin+'/xpace/professor');await page.getByRole('heading',{name:'Minhas aulas do mês.',exact:true}).waitFor();
  await page.getByText('Aula do dia 28',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'MONTAR ESCALA',exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'CONFERÊNCIA',exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'PAINEL',exact:true}).count(),0);
  assert.equal(await page.getByText('Beatriz · fixture',{exact:true}).count(),0);
  assert.equal(await page.locator('.tw-day').filter({hasText:'Aula do dia 28'}).getByRole('button',{name:'CHECK-IN',exact:true}).isDisabled(),true);
  await noOverflow(page,'Monthly teacher '+width);
  await page.screenshot({path:path.join(output,'professor-'+width+'.png'),fullPage:true});
  await page.getByRole('button',{name:'CHECK-IN',exact:true}).first().click();
  await page.getByText('AULA CONFIRMADA. OBRIGADO!',{exact:true}).waitFor();assert.equal(writes.at(-1).id,id(10));
  assert.equal(await page.getByRole('button',{name:'CHECK-IN',exact:true}).first().isDisabled(),true);
  await page.getByRole('button',{name:'Próximo mês',exact:true}).click();
  await page.getByText('Nenhuma aula atribuída a você neste mês.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Mês anterior',exact:true}).click();await page.getByText('Teens',{exact:true}).waitFor();
  await page.getByRole('button',{name:'RESERVA DE SALA',exact:true}).click();
  await page.getByLabel(/^SALA/).selectOption(id(6));await page.getByLabel('INÍCIO',{exact:true}).fill('18:00');await page.getByLabel('FIM',{exact:true}).fill('18:30');
  await page.locator('.tw-quote').getByText('R$ 17,50',{exact:true}).waitFor();await noOverflow(page,'Reservation '+width);
  assert.equal(await page.getByLabel(/^PROFESSOR/).count(),0);
  await page.getByRole('button',{name:'RESERVAR SALA',exact:true}).click();await page.getByText('SALA RESERVADA. O VALOR FICOU REGISTRADO PARA CONFERÊNCIA.',{exact:true}).waitFor();
  assert.ok(writes.at(-1).requestId);
  await page.locator('.tw-subnav').getByRole('button',{name:'OCUPAÇÃO',exact:true}).click();await page.locator('.ro-grid').first().waitFor();
  assert.equal(await page.getByRole('button',{name:'IMPRIMIR QR DA SALA',exact:true}).count(),0);
  await noOverflow(page,'Occupation '+width);await page.screenshot({path:path.join(output,'ocupacao-'+width+'.png'),fullPage:true});
  assert.deepEqual(errors,[]);await context.close();
 }
 for(const width of[390,320]){
  const{context,page,writes,errors,data}=await fixture(browser,width,true);await clock(context);
  const reads=[];page.on('request',request=>{if(request.method()==='GET'&&request.url().includes('/api/xpace/aulas'))reads.push(request.url());});
  await page.goto(origin+'/xpace/professor');await page.getByText('Aula do dia 28',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Próximo mês',exact:true}).click();
  await page.getByText('Nenhuma aula atribuída a você neste mês.',{exact:true}).waitFor();
  const selectedMonth=await page.getByLabel('Mês das minhas aulas').inputValue(),before=reads.length;
  data.lessons.push({...data.lessons[0],id:id(13),class_name:'Aula atualizada pelo gesto',scheduled_on:selectedMonth+'-05'});
  await drag(page);await page.getByText('Aula atualizada pelo gesto',{exact:true}).waitFor();
  assert.equal(reads.length,before+1);assert.equal(await page.getByLabel('Mês das minhas aulas').inputValue(),selectedMonth);
  assert.ok(reads.at(-1).includes('month='+selectedMonth));
  let baseline=reads.length;
  for(const gesture of[{dy:30},{dx:220,dy:60},{cancel:true},{target:'.tw-month input'}])await drag(page,gesture);
  assert.equal(reads.length,baseline,'short/horizontal/cancelled/control gestures must not refresh');
  await page.locator('main').evaluate(element=>{const space=document.createElement('div');space.id='scroll-fixture';space.style.height='1800px';element.append(space);window.scrollTo(0,150);});
  await page.waitForFunction(()=>window.scrollY>100);await drag(page);assert.equal(reads.length,baseline,'pull below page top must not refresh');
  await page.evaluate(()=>{document.getElementById('scroll-fixture').remove();window.scrollTo(0,0);});
  await page.getByRole('button',{name:'RESERVA DE SALA',exact:true}).click();await page.getByLabel(/^SALA/).selectOption(id(6));
  await page.getByLabel('DIA',{exact:true}).fill(selectedMonth+'-05');await page.getByLabel('INÍCIO',{exact:true}).fill('18:00');await page.getByLabel('FIM',{exact:true}).fill('18:30');
  baseline=reads.length;page.once('dialog',dialog=>dialog.dismiss());await drag(page);assert.equal(reads.length,baseline,'declined refresh preserves unsaved reservation');
  page.once('dialog',dialog=>dialog.accept());await drag(page);
  await page.waitForFunction(()=>!document.querySelector('.xd-pull-feedback.is-visible'));
  assert.equal(reads.length,baseline+1);
  assert.equal(await page.getByLabel('DIA',{exact:true}).inputValue(),selectedMonth+'-05');
  assert.equal(await page.getByLabel('INÍCIO',{exact:true}).inputValue(),'18:00');
  assert.equal(await page.getByLabel('FIM',{exact:true}).inputValue(),'18:30');
  assert.equal(await page.getByLabel(/^SALA/).inputValue(),id(6));
  await page.locator('.tw-subnav').getByRole('button',{name:'OCUPAÇÃO',exact:true}).click();await page.locator('.ro-grid').first().waitFor();
  await page.getByLabel('Filtrar sala').selectOption(id(6));await page.getByRole('button',{name:'Próxima semana de Sala 1',exact:true}).click();
  await page.locator('.ro-grid').waitFor();const weekLabel=await page.locator('.ro-week-nav strong').innerText();
  baseline=reads.length;const occupationBefore=reads.filter(url=>url.includes('scope=occupation')).length;
  await page.evaluate(()=>window.scrollTo(0,0));await drag(page);
  await page.waitForFunction(()=>!document.querySelector('.xd-pull-feedback.is-visible'));await page.locator('.ro-grid').waitFor();
  assert.equal(reads.length,baseline+2);assert.equal(reads.filter(url=>url.includes('scope=occupation')).length,occupationBefore+1);
  assert.equal(await page.getByLabel('Filtrar sala').inputValue(),id(6));assert.equal(await page.locator('.ro-week-nav strong').innerText(),weekLabel);
  assert.equal(writes.length,0,'refresh must never submit attendance or reserve a room');assert.deepEqual(errors,[]);
  await noOverflow(page,'Teacher pull refresh '+width);await context.close();
 }
 for(const time of['18:44:00','19:16:00']){
  const{context,page,writes}=await fixture(browser,390,true);await clock(context,time);await page.goto(origin+'/xpace/professor');
  await page.getByRole('button',{name:'CHECK-IN',exact:true}).first().waitFor();assert.equal(await page.getByRole('button',{name:'CHECK-IN',exact:true}).first().isDisabled(),true);assert.equal(writes.length,0);await context.close();
 }
 {
  const{context,page,writes,errors}=await fixture(browser,390,true,false,false);await clock(context);
  await page.goto(origin+'/xpace/professor?sala='+id(30));await page.waitForURL('**/login?next=*');
  await page.getByLabel(/^E-mail/).fill('teacher-user@example.test');await page.getByLabel(/^Senha/).fill('Fixture-only-123');
  await page.getByRole('button',{name:/^Entrar$/i}).click();await page.waitForURL('**/xpace/professor?sala=*');
  await page.getByText('PRESENÇA REGISTRADA. SUA AULA FOI CONFIRMADA.',{exact:true}).waitFor();
  assert.equal(writes.filter(w=>w.action==='LESSON').length,1);assert.equal(writes.at(-1).qrToken,id(30));assert.deepEqual(errors,[]);await context.close();
 }
 {
  const{context,page,writes,errors}=await fixture(browser,1440);
  await page.goto(origin+'/xpace');await page.getByTitle('AGENDA: abrir módulo').click();
  await page.getByRole('button',{name:'PROFESSORES DO MÊS',exact:true}).click();
  await page.getByRole('button',{name:'EDITAR / PRESENÇA',exact:true}).first().click();
  await page.getByRole('dialog').getByLabel(/^PRESENÇA/).selectOption('REALIZADA');await page.getByRole('button',{name:'SALVAR AULA',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(writes.filter(w=>w.action==='LESSON').at(-1).status,'REALIZADA');
  await page.getByRole('button',{name:'CONFERÊNCIA',exact:true}).click();
  await page.locator('.tw-report-metrics article').nth(1).getByText('R$ 90,00',{exact:true}).waitFor();
  await page.getByRole('button',{name:'MONTAR ESCALA',exact:true}).click();
  await page.getByRole('button',{name:'EDITAR / PRESENÇA',exact:true}).first().click();
  await page.getByRole('dialog').getByLabel(/^PRESENÇA/).selectOption('FALTOU');await page.getByRole('button',{name:'SALVAR AULA',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(writes.filter(w=>w.action==='LESSON').at(-1).status,'FALTOU');await page.getByText('Faltou',{exact:true}).waitFor();
  await page.screenshot({path:path.join(output,'admin-presenca.png'),fullPage:true});
  await page.getByRole('button',{name:'CONFERÊNCIA',exact:true}).click();await page.locator('.tw-report-metrics article').nth(1).getByText('R$ 40,00',{exact:true}).waitFor();
  await noOverflow(page,'Admin payroll');assert.deepEqual(errors,[]);await context.close();
 }
 for(const width of[1440,390,320]){
  const{context,page,writes,errors}=await fixture(browser,width);
  await page.goto(origin+'/xpace');await page.getByTitle('AGENDA: abrir módulo').click();
  await page.getByRole('button',{name:'PROFESSORES DO MÊS',exact:true}).click();
  await page.getByLabel('Mês da escala').fill('2026-10');
  for(const [scheduleId,level] of [[id(50),'Iniciante'],[id(56),'Avançado']]){
   await page.getByRole('button',{name:'MONTAR TURMA',exact:true}).click();const dialog=page.getByRole('dialog');
   await dialog.getByLabel('TURMA',{exact:true}).selectOption(scheduleId);
   assert.ok((await dialog.locator('.tw-grade-summary').innerText()).toLowerCase().includes(level.toLowerCase()));
   await dialog.getByRole('button',{name:'ESCOLHER PROFESSORES',exact:true}).click();
   assert.equal(await dialog.locator('.tw-builder-date').count(),8);
   await dialog.getByLabel('Professor de 05/10',{exact:true}).selectOption(id(8));
   await noOverflow(page,'Grade dialog '+width);
   await dialog.getByRole('button',{name:'SALVAR E GERAR QUADRO',exact:true}).click();
   await page.getByRole('dialog').waitFor({state:'hidden'});
  }
  assert.equal(writes.filter(w=>w.action==='CREATE_ROSTER').length,2);
  assert.equal(await page.getByRole('heading',{name:'Teens · Agenda',exact:true}).count(),2);
  const popupEvent=page.waitForEvent('popup');await page.getByRole('button',{name:'IMPRIMIR / PDF',exact:true}).click();
  const print=await popupEvent;await print.waitForLoadState('domcontentloaded');
  assert.equal(await print.getByRole('heading',{name:'Teens · Agenda',exact:true}).count(),2);
  assert.ok((await print.locator('body').innerText()).includes('Iniciante'));
  assert.ok((await print.locator('body').innerText()).includes('Avançado'));
  await print.pdf({path:path.join(output,'grades-'+width+'.pdf'),format:'A4',printBackground:true});await print.close();
  await noOverflow(page,'Grade roster '+width);assert.deepEqual(errors,[]);await context.close();
 }
 for(const owner of[true,false]){
  const{context,page,errors}=await fixture(browser,1440,false,owner);
  await page.goto(origin+'/xpace/professor');await page.waitForURL('**/xpace');
  await page.getByTitle('AGENDA: abrir módulo').click();await page.locator('.xd-agenda-nav').getByRole('button',{name:'AGENDA',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'PROFESSORES DO MÊS',exact:true}).count(),owner?1:0);
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log('Teacher mobile browser PASS: optimized build, 320/390, own month/month change, check-in/window/repeat, common login and QR, pull refresh/month/reservation/room/week preservation and gesture guards, reservations/occupation, admin attendance/payroll, manager exclusion, no viewport overflow.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

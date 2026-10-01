// Fully intercepted local UI fixtures: no production stock or messages.
const assert = require('node:assert/strict');
const { chromium } = require('@playwright/test');
const { setup, snapshot, item, origin } = require('./stock-browser-test.cjs');
const family = { ...item, id: '00000000-0000-4000-8000-000000000050', description: 'Camiseta fixture', code: 'XP-FAMILY-FIXTURE', codeMode: 'INTERNAL', hasVariants: true, controlsStock: false, stockQuantity: 3, minimumStock: 0 };
family.variants = ['PP','P','M','G','GG','XG'].map((size, index) => ({ ...item, id: `00000000-0000-4000-8000-${String(60+index).padStart(12,'0')}`, description: `Camiseta fixture · TAM ${size}`, sizeLabel: size, sizeEnabled: true, minimumStock: 0, stockQuantity: size === 'P' ? 3 : 0, code: `XP-SIZE-${size}`, codeMode: 'INTERNAL' }));
(async () => {
 const browser = await chromium.launch({ headless: true, channel: 'chrome' });
 try {
  for (const [width, direction, size] of [[390,'ENTRADA','M'],[320,'BAIXA','P']]) {
   const f = await setup(browser,width,false,[family]);
   await f.page.goto(`${origin}/xpace/app`);
   await f.page.getByRole('button',{name:'Estoque',exact:true}).click();
   await f.page.getByRole('button',{name:`Selecionar ${family.description}`,exact:true}).click();
   await f.page.getByRole('group',{name:'Escolher tamanho'}).waitFor();
   assert.equal(f.writes.length,0,'selecting family does not move any size');
   await snapshot(f.page,`sizes-${width}-choose`);
   await f.page.getByRole('group',{name:'Escolher tamanho'}).getByRole('button',{name:new RegExp(`^${size} `)}).click();
   await f.page.getByRole('button',{name:direction,exact:true}).click();
   await f.page.getByRole('textbox',{name:'Quantidade para movimentar'}).fill('1');
   await snapshot(f.page,`sizes-${width}-${direction.toLowerCase()}`);
   await f.page.getByRole('button',{name:`CONFIRMAR ${direction}`,exact:true}).click();
   await f.page.getByRole('button',{name:`Selecionar ${family.description}`,exact:true}).waitFor();
   await f.page.getByRole('status').filter({hasText:'PRODUTO LANÇADO / BAIXADO COM SUCESSO'}).waitFor();
   assert.equal(f.writes[0].productId,family.variants.find(child=>child.sizeLabel===size).id);
   assert.equal(f.writes[0].direction,direction==='BAIXA'?'SAIDA':'ENTRADA');
   assert.deepEqual(f.errors,[]); await f.context.close();
  }
  const f=await setup(browser,1440,false,[family]);
  await f.page.goto(`${origin}/xpace`);
  await f.page.locator('.xd-module').filter({hasText:'ESTOQUE'}).click();
  await f.page.getByText('Camiseta fixture',{exact:true}).waitFor();
  await snapshot(f.page,'sizes-desktop-catalog');
  await f.page.getByRole('button',{name:'Editar Camiseta fixture'}).click();
  const dialog=f.page.getByRole('dialog',{name:'EDITAR PRODUTO'});
  assert.equal(await dialog.locator('.xs-size-options input:checked').count(),6);
  await snapshot(f.page,'sizes-desktop-grade');
  await dialog.getByRole('button',{name:'CANCELAR',exact:true}).click();
  await f.page.getByRole('button',{name:'SELECIONAR / MOVIMENTAR',exact:true}).click();
  const picker=f.page.getByRole('dialog',{name:'SELECIONAR PRODUTO'});
  await picker.getByRole('button',{name:`Selecionar ${family.description}`,exact:true}).click();
  await picker.getByRole('group',{name:'Escolher tamanho'}).waitFor();
  await picker.getByRole('button',{name:'CANCELAR / OUTRO PRODUTO',exact:true}).click();
  await picker.getByRole('button',{name:`Selecionar ${family.description}`,exact:true}).waitFor();
  await picker.getByRole('button',{name:'Fechar',exact:true}).click();
  await f.page.locator('.xd-active-module').click();
  await f.page.locator('.xd-module').filter({hasText:'RELATÓRIOS'}).click();
  await f.page.getByRole('button',{name:'ESTOQUE · ENTRADAS E BAIXAS',exact:true}).click();
  await f.page.getByText('Operador fixture',{exact:true}).waitFor();
  await snapshot(f.page,'stock-report-desktop');
  await f.page.getByLabel('RESPONSÁVEL',{exact:true}).fill('Operador');
  await f.page.getByRole('button',{name:'FILTRAR',exact:true}).click();
  await f.page.getByText('Operador fixture',{exact:true}).waitFor();
  await f.page.getByRole('button',{name:'Próxima',exact:true}).click();
  await f.page.getByText('Página 2 de 2',{exact:true}).waitFor();
  assert.ok(f.requests.some(url=>url.includes('/estoque/relatorio?')&&url.includes('actor=Operador')&&url.includes('page=2')));
  await f.page.setViewportSize({width:390,height:900});
  await snapshot(f.page,'stock-report-mobile');
  assert.deepEqual(f.writes,[]); assert.deepEqual(f.errors,[]); await f.context.close();
  console.log('PASS stock sizes browser: selecting family requires size, entry/exit target chosen SKU, mobile320/390, grade edit, report responsible/search/pagination and mobile overflow.');
 } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});

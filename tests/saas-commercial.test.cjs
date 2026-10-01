const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
function load(file, imports = {}, env = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'), { compilerOptions:{ module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022 } }).outputText,
    { exports, require:n => { if(n === 'server-only') return {}; if(imports[n]) return imports[n]; throw Error('unexpected import '+n); }, process:{env}, Buffer, URL, AbortSignal, Set, Date, fetch });
  return exports;
}
const rules = load('lib/saas/commercial.ts');
const cycles = load('lib/saas/billing-cycle.ts',{'./commercial':rules});
test('month-end handles leap years and one combined draft per tenant/period; never issues',()=>{
  for(const [period,due] of [['2026-01','2026-01-31'],['2026-02','2026-02-28'],['2028-02','2028-02-29'],['2026-04','2026-04-30'],['2026-12','2026-12-31']]) assert.equal(cycles.monthBounds(period).dueOn,due);
  for(const period of ['2026-13','2026-00','2026-1','invalid'])assert.throws(()=>cycles.monthBounds(period));
  const input={companyId:'school',ownerCompanyId:'owner',period:'2026-10',pricebookId:'00000000-0000-4000-8000-000000000001',pricebook:rules.emptyPricebook(),measuredStudents:51,addons:['WHATSAPP']};
  const draft=cycles.monthlyDraft(input);assert.equal(draft.amountCents,29900);assert.equal(draft.operationKey,'school:2026-10');assert.equal(draft.canIssue,false);assert.equal(draft.settlementAccount,'PLATFORM_PARENT');assert.equal(cycles.monthlyDraft({...input,companyId:'owner'}).kind,'EXEMPT');
});
test('payment reducer is monotonic for delayed events and reviews refunds/account mismatch',()=>{
  const identity={accountId:'mother',paymentId:'p',customerId:'c',reference:'r',valueCents:29900};
  const event=type=>({...identity,type});
  assert.equal(cycles.reducePaymentEvent('PAID',identity,event('PAYMENT_OVERDUE')).state,'PAID');
  assert.equal(cycles.reducePaymentEvent('OVERDUE',identity,event('PAYMENT_CREATED')).state,'OVERDUE');
  assert.equal(cycles.reducePaymentEvent('PENDING',identity,event('PAYMENT_RECEIVED')).state,'PAID');
  assert.equal(cycles.reducePaymentEvent('PAID',identity,event('PAYMENT_REFUNDED')).state,'REVIEW');
  assert.equal(cycles.reducePaymentEvent('REVIEW',identity,event('PAYMENT_RECEIVED')).state,'REVIEW');
  assert.equal(cycles.reducePaymentEvent('CANCELLED',identity,event('PAYMENT_RECEIVED')).state,'REVIEW');
  const mismatch=cycles.reducePaymentEvent('PENDING',identity,{...event('PAYMENT_RECEIVED'),accountId:'child'});assert.equal(mismatch.state,'PENDING');assert.equal(mismatch.reconcile,true);
});
test('payment preference accepts only method/addons; no PAN/CVV/tokens/client totals',()=>{
  const preferences=load('lib/saas/billing-preferences.ts',{'./commercial':rules});
  for(const paymentMethod of ['PIX','BOLETO','CREDIT_CARD']) assert.equal(preferences.validateBillingPreferences({paymentMethod,addons:['WHATSAPP']}).paymentMethod,paymentMethod);
  for(const key of ['cardNumber','cvv','token','tenant_company_id','valueCents']) assert.throws(()=>preferences.validateBillingPreferences({paymentMethod:'PIX',addons:[],[key]:'fake'}));
  assert.throws(()=>preferences.validateBillingPreferences({paymentMethod:'FAKE',addons:[]}));
  assert.throws(()=>preferences.validateBillingPreferences({paymentMethod:'PIX',addons:['FAKE']}));
});
const book = () => rules.validatePricebook({ ...rules.emptyPricebook(), bands:[{ min:0,max:50,monthlyCents:9900 },{ min:51,max:null,monthlyCents:19900 }], studentMetric:'ACTIVE_STUDENTS',dueDay:10,graceDays:5,rangeChange:'NEXT_CYCLE' });
test('authorized bands and WhatsApp price; no provider cost and no live charge',()=> {
  assert.equal(rules.emptyPricebook().addons.WHATSAPP,15000);
  assert.equal(rules.emptyPricebook().whatsappCostCents,undefined);
  const result = rules.quoteMonthly(rules.emptyPricebook(),'client','owner',10,['WHATSAPP']);
  assert.equal(result.monthlyCents,24900); assert.equal(result.canCharge,false); assert.ok(result.blockers.length);
  assert.equal(rules.visiblePricebook(book(),false).whatsappCostCents,undefined);
  assert.equal(rules.visiblePricebook({...book(),whatsappCostCents:10000},true).whatsappCostCents,undefined);
  assert.equal(JSON.stringify(result).includes('whatsappCostCents'),false);
});
test('all authorized band edges covered including 801; combined monthly total',()=> {
  for (const [count,expected] of [[0,9900],[50,9900],[51,14900],[200,14900],[201,19900],[300,19900],[301,24900],[500,24900],[501,29900],[800,29900],[801,34900],[10000,34900]]) {
    assert.equal(rules.quoteMonthly(rules.emptyPricebook(),'school','owner',count,[]).monthlyCents,expected);
    assert.equal(rules.quoteMonthly(rules.emptyPricebook(),'school','owner',count,['WHATSAPP']).monthlyCents,expected+15000);
  }
});
test('only fixed owner tenant is exempt; owner user cannot exempt other tenants',()=> {
  assert.equal(rules.quoteMonthly(book(),'xpace','xpace',500,['WHATSAPP']).monthlyCents,0);
  assert.equal(rules.quoteMonthly(book(),'school','xpace',500,['WHATSAPP']).monthlyCents,34900);
  assert.equal(rules.accountModeForCompany('xpace','xpace'),'PARENT');
  assert.equal(rules.accountModeForCompany('dawos','xpace'),'SUBACCOUNT');
});
test('inclusive boundaries, optional add-on, no fee on mandatory XPay',()=> {
  assert.equal(rules.quoteMonthly(book(),'school','owner',50,[]).monthlyCents,9900);
  const quote = rules.quoteMonthly(book(),'school','owner',51,['WHATSAPP']);
  assert.equal(quote.monthlyCents,34900); assert.equal(quote.lines[1].monthlyCents,0);
});
test('reject overlapping/negative/fractional bands, duplicate or unknown add-ons',()=> {
  for(const bands of [[{min:0,max:50,monthlyCents:100},{min:50,max:null,monthlyCents:200}],[{min:-1,max:null,monthlyCents:100}],[{min:0.5,max:null,monthlyCents:100}],[{min:0,max:null,monthlyCents:1.5}]]) assert.throws(()=>rules.validatePricebook({...book(),bands}));
  for(const addons of [['WHATSAPP','WHATSAPP'],['FAKE'],null]) assert.throws(()=>rules.quoteMonthly(book(),'s','o',5,addons));
  assert.throws(()=>rules.quoteMonthly(book(),'s','o',0.5,[]));
  assert.throws(()=>rules.validatePricebook({...book(),addons:{WHATSAPP:10,XPAY:10}}));
});
test('missing policy/gaps block charging and a deliberate zero is not an undefined price',()=> {
  const zero = rules.validatePricebook({...book(),bands:[{min:0,max:null,monthlyCents:0}]});
  assert.equal(rules.quoteMonthly(zero,'s','o',5,[]).monthlyCents,0);
  assert.equal(rules.quoteMonthly(zero,'s','o',5,[]).canCharge,false);
  const gap = {...book(),bands:[{min:0,max:3,monthlyCents:100},{min:5,max:null,monthlyCents:200}]};
  assert.ok(rules.pricebookBlockers(gap).length);
});
test('receipt checks exact IDs/customer/reference/value; acceptance not payment',()=> {
  const expected = {paymentId:'p1',customerId:'c1',reference:'r1',valueCents:15000};
  assert.equal(rules.evaluateBillingReceipt(expected,{...expected,status:'PENDING'}),'PENDING');
  assert.equal(rules.evaluateBillingReceipt(expected,{...expected,status:'RECEIVED'}),'PAID');
  for(const change of [{paymentId:'p2'},{customerId:'c2'},{reference:'r2'},{valueCents:1}]) assert.equal(rules.evaluateBillingReceipt(expected,{...expected,...change,status:'RECEIVED'}),'REVIEW');
  assert.equal(rules.evaluateBillingReceipt(expected,{...expected,status:'REFUNDED'}),'REVIEW');
});
const imports = {'@/lib/saas/commercial':rules, '@/lib/server/telephony-credentials':{encryptIntegrationCredential:key=>({ciphertext:'encrypted',iv:'iv',authTag:'tag'})}};
test('guarded Sandbox operation persists private mapping before success and never retries UNKNOWN',async()=>{
  let posts=0,state=null,saved=null;
  const access={company:{id:'school'},user:{id:'actor'},profile:{platform_role:'platform_owner'},admin:{async rpc(name,input){
    if(name==='saas_begin_sandbox_operation') {if(state)return{data:{acquired:false,id:'op',status:state}};state='RUNNING';return{data:{acquired:true,id:'op',leaseKey:'lease'}};}
    state=input.p_status;saved=input.p_result;return{};
  }}};
  const fakeClient={async createChild(){posts++;return{accountId:'acc',walletId:'wallet',encryptedKey:{ciphertext:'encrypted',iv:'iv',authTag:'tag'}};}};
  const module=load('lib/server/saas-sandbox-operation.ts',{'crypto':require('crypto'),'@/lib/saas/commercial':rules,'@/lib/server/saas-asaas-sandbox':{createSaasAsaasSandboxClient:()=>fakeClient}},{SAAS_ASAAS_PARENT_SANDBOX_API_KEY:'fixture'});
  const operation={kind:'CREATE_SUBACCOUNT',registration:{}};
  const response=await module.runSaasSandboxOperation(access,'owner',operation);assert.equal(response.status,'SUCCEEDED');assert.equal(JSON.stringify(response).includes('encrypted'),false);assert.equal(saved.encryptedKey.ciphertext,'encrypted');assert.equal((await module.runSaasSandboxOperation(access,'owner',operation)).replayed,true);assert.equal(posts,1);
  state=null;fakeClient.createChild=async()=>{posts++;throw Error('private provider failure');};await assert.rejects(module.runSaasSandboxOperation(access,'owner',operation),/CONFERÊNCIA/);assert.equal(state,'UNKNOWN');await assert.rejects(module.runSaasSandboxOperation(access,'owner',operation),/SEM CONFIRMAÇÃO/);assert.equal(posts,2);
  await assert.rejects(module.runSaasSandboxOperation({...access,profile:{platform_role:'company_manager'}},'owner',operation),e=>e.status===403);
});
test('Asaas adapter permanently sandbox only, opt-in, no parent subaccount/own subscription',async()=> {
  const clientModule = load('lib/server/saas-asaas-sandbox.ts',imports);
  assert.throws(()=>clientModule.createSaasAsaasSandboxClient('secret'),/AUTORIZADO/);
  const moduleEnabled = load('lib/server/saas-asaas-sandbox.ts',imports,{SAAS_ASAAS_SANDBOX_ENABLED:'true'});
  let calls=0;
  const client=moduleEnabled.createSaasAsaasSandboxClient('sandbox-secret',async(url,init)=>{calls++;assert.match(url,/^https:\/\/api-sandbox\.asaas\.com\/v3\//);assert.equal(init.redirect,'error');return Response.json({cpfCnpj:'12345678000199'});});
  await client.inspectParent(); assert.equal(calls,1);
  await assert.rejects(client.createChild('owner','owner',{}),/CONTA MÃE/);
  await assert.rejects(client.simulateSubscription('owner','owner',{}),/ISENTA/);
  assert.equal(calls,1);
});
test('sandbox subscription lookup avoids repeat and mismatched references never become success',async()=> {
  const mod=load('lib/server/saas-asaas-sandbox.ts',imports,{SAAS_ASAAS_SANDBOX_ENABLED:'true'});
  const input={customerId:'cus_123',monthlyCents:15000,dueOn:'2026-10-10',reference:'saas:00000000-0000-4000-8000-000000000001'};
  const client=mod.createSaasAsaasSandboxClient('test',async(url,init)=>{assert.equal(init.method,'GET');return Response.json({data:[{id:'sub_123',customer:'cus_123',value:150}]});});
  const result=await client.simulateSubscription('s','o',input); assert.equal(result.alreadyExists,true);assert.equal(result.paid,false);
  await assert.rejects(client.simulateSubscription('s','o',{...input,monthlyCents:10000}),/DIVERGENTES/);
});
test('ambiguous sandbox POST sanitized, no internal retry or automatic activation',async()=> {
  const mod=load('lib/server/saas-asaas-sandbox.ts',imports,{SAAS_ASAAS_SANDBOX_ENABLED:'true'});let calls=0;
  const client=mod.createSaasAsaasSandboxClient('private-key',async(url,init)=>{calls++;if(init.method==='GET')return Response.json({data:[]});throw Error('private-key and company document');});
  await assert.rejects(client.simulateSubscription('s','o',{customerId:'cus_123',monthlyCents:15000,dueOn:'2026-10-10',reference:'saas:00000000-0000-4000-8000-000000000001'}),e=>e.message.includes('INCERTO')&&!e.message.includes('private-key'));
  assert.equal(calls,2);
});
test('QR proxy returns PNG only, blocks scripts/provider URLs/challenge and preserves callbacks',async()=> {
  const zapi=load('lib/server/zapi-client.ts');const pairing=load('lib/server/saas-zapi-pairing.ts',{'@/lib/server/zapi-client':zapi});
  const credentials={instanceId:'i'.repeat(32),instanceToken:'t'.repeat(32),clientToken:'c'.repeat(32)};
  const png='data:image/png;base64,'+Buffer.from([137,80,78,71,13,10,26,10,1,2,3]).toString('base64');
  const result=await pairing.pairingImage(credentials,async(url,init)=>{assert.match(url,/\/qr-code\/image$/);assert.equal(init.method,'GET');assert.equal(init.redirect,'error');return Response.json({value:png});});assert.equal(result,png);
  for(const payload of ['https://provider/secret','data:image/svg+xml;base64,AAAA',{challenge:{}},{value:'data:image/png;base64,AAAA'}]) await assert.rejects(pairing.pairingImage(credentials,async()=>Response.json(payload)));
});

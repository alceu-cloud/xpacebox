// Real SQL in isolated Postgres; no customers, credentials or external sends.
const { PGlite } = require(process.argv[2] || '@electric-sql/pglite');
const fs = require('node:fs'), assert = require('node:assert/strict');
const db = new PGlite();
const tenant='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
(async()=>{
  await db.exec(`create role anon;create role authenticated;create role service_role;
    create table xpace_leads(id uuid primary key,tenant_company_id uuid,full_name text);
    create table xpace_message_outbox(id uuid primary key,tenant_company_id uuid,connector_id uuid,lead_id uuid,appointment_id uuid,kind text,status text,contact_name text,created_at timestamptz,scheduled_at timestamptz,expires_at timestamptz,delivered_at timestamptz,read_at timestamptz,manually_confirmed_at timestamptz);
    create table xpace_zapi_attempts(message_id uuid primary key,connector_id uuid,started_at timestamptz);`);
  const migration=fs.readdirSync('supabase/migrations').find(n=>n.endsWith('_xpace_message_control_pagination.sql'));
  await db.exec(fs.readFileSync('supabase/migrations/'+migration,'utf8'));
  await db.query('insert into xpace_leads values($1,$2,$3)',[uuid(3),tenant,'Hevelín Cruz']);
  for(let n=0;n<8;n++) {
    await db.query("insert into xpace_message_outbox(id,tenant_company_id,connector_id,lead_id,appointment_id,kind,status,contact_name,created_at,scheduled_at,expires_at) values($1,$2,$3,$4,$5,'VIDEO_BOAS_VINDAS','SENT',$6,now()-($7||' minutes')::interval,now(),now()+interval '1 day')",[uuid(10+n),tenant,uuid(4),n===7?uuid(3):null,uuid(100+n),'Cliente '+n,String(n)]);
  }
  await db.query("insert into xpace_message_outbox(id,tenant_company_id,connector_id,lead_id,appointment_id,kind,status,contact_name,created_at,scheduled_at) values($1,$2,$3,$4,$5,'AVISO_PROFESSOR','QUEUED','Professor Testável',now()-interval '7 minutes',now()+interval '1 day')",[uuid(40),tenant,uuid(4),uuid(3),uuid(107)]);
  await db.query("insert into xpace_message_outbox(id,tenant_company_id,kind,status,contact_name,created_at) values($1,$2,'TESTE','UNKNOWN','Alceu',now())",[uuid(50),tenant]);
  await db.query("insert into xpace_message_outbox(id,tenant_company_id,kind,status,contact_name,created_at) values($1,$2,'COBRANCA','UNKNOWN','Hevelin outro tenant',now())",[uuid(51),other]);
  const page=async(search='',status='TODOS',n=0)=>(await db.query('select xpace_message_control_page($1,$2,$3,$4) as result',[tenant,search,status,n])).rows[0].result;
  let value=await page();assert.equal(value.total,8);assert.equal(value.messageIds.length,5);assert.equal(value.summary.registered,9);assert.equal(value.summary.failures,0);
  value=await page('','TODOS',1);assert.equal(value.messageIds.length,4,'last page includes complete bundle');assert.equal(value.page,1);
  value=await page('hevelin');assert.equal(value.total,1);assert.equal(value.messageIds.length,2,'accentless lead search includes video + professor');
  value=await page('TESTAVEL','QUEUED');assert.equal(value.total,1);assert.equal(value.messageIds.length,2,'status never cuts off other steps of the same lesson');
  assert.equal((await page('%')).total,0,'search is literal, not a wildcard');assert.equal((await page('alceu')).total,0,'test rows are hidden');
  assert.equal((await page('','TODOS',999)).page,1,'removed rows or oversized pages clamp to last page');
  await db.query('insert into xpace_zapi_attempts values($1,$2,now()-interval \'20 minutes\')',[uuid(10),uuid(4)]);
  assert.equal((await page()).summary.receiptPending,1,'only actual cloud sends trigger missing receipt monitoring');
  await db.query('update xpace_message_outbox set delivered_at=now() where id=$1',[uuid(10)]);
  assert.equal((await page()).summary.receiptPending,0,'receipt resolves warning without retry');
  await db.query("update xpace_message_outbox set scheduled_at=now()-interval '11 minutes',expires_at=now()+interval '1 day' where id=$1",[uuid(40)]);
  assert.equal((await page()).summary.lateQueue,1);await db.query('update xpace_message_outbox set expires_at=now()-interval \'1 minute\' where id=$1',[uuid(40)]);
  assert.equal((await page()).summary.lateQueue,0,'expired lesson notices are not actionable late sends');
  assert.equal((await db.query("select has_function_privilege('anon','xpace_message_control_page(uuid,text,text,integer)','execute') as allowed")).rows[0].allowed,false);
  assert.equal((await db.query("select has_function_privilege('authenticated','xpace_message_control_page(uuid,text,text,integer)','execute') as allowed")).rows[0].allowed,false);
  console.log('PASS: five complete bundles, all-history name search, accents, teacher, filters, tenant isolation, hidden tests, cloud receipt monitoring and server-only grants.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>db.close());

// Run with: node scripts/xpace-automatic-renewal-db.test.cjs <path-to-@electric-sql/pglite>
// It uses an in-memory Postgres database and never connects to Supabase or Asaas.
const { PGlite } = require(process.argv[2] || '@electric-sql/pglite');
const fs = require('node:fs');
const assert = require('node:assert/strict');

const company = '00000000-0000-0000-0000-000000000001';
const dailyPlan = '00000000-0000-0000-0000-000000000011';
const monthlyPlan = '00000000-0000-0000-0000-000000000012';
const dailyContract = '00000000-0000-0000-0000-000000000021';
const monthlyContract = '00000000-0000-0000-0000-000000000022';
const pausedContract = '00000000-0000-0000-0000-000000000023';
const student = '00000000-0000-0000-0000-000000000004';

async function main() {
  const db = new PGlite();
  try {
    await db.exec(fs.readFileSync('scripts/fixtures/xpace-cancellation-schema.sql', 'utf8'));
    await db.exec(`
      insert into public.companies values ('${company}');
      insert into public.xpace_membership_plans(id,tenant_company_id,name,billing_interval,duration_months,amount_cents) values
        ('${dailyPlan}','${company}','DIÁRIO','MENSAL',1,1500),
        ('${monthlyPlan}','${company}','MENSAL','MENSAL',1,25000);
      insert into public.xpace_student_contracts(id,tenant_company_id,student_id,plan_id,plan_name_snapshot,billing_interval_snapshot,duration_months_snapshot,amount_cents,base_amount_cents,starts_on,ends_on,first_due_on,status,renews_automatically,discount_type_snapshot,discount_value_snapshot) values
        ('${dailyContract}','${company}','${student}','${dailyPlan}','DIÁRIO','MENSAL',1,950,1000,current_date-1,current_date-1,current_date-1,'ATIVO',true,'PERCENTUAL',500),
        ('${monthlyContract}','${company}','${student}','${monthlyPlan}','MENSAL','MENSAL',1,19000,20000,current_date-1,current_date-1,current_date-1,'ATIVO',true,'FIXO',1000),
        ('${pausedContract}','${company}','${student}','${monthlyPlan}','PAUSADO','MENSAL',1,19000,20000,current_date-1,current_date-1,current_date-1,'PAUSADO',true,'FIXO',1000);
    `);
    await db.exec(fs.readFileSync('supabase/migrations/20260919192506_xpace_sale_cancellation_lifecycle.sql', 'utf8'));
    await db.exec(fs.readFileSync('supabase/migrations/20260919195747_xpace_automatic_renewals_daily_cycle.sql', 'utf8'));
    await db.exec(`
      update public.xpace_membership_plans set billing_interval = 'DIARIO' where id = '${dailyPlan}';
      update public.xpace_student_contracts set billing_interval_snapshot = 'DIARIO' where id = '${dailyContract}';
    `);

    const renewed = await db.query(`select * from public.xpace_renew_due_contracts('${company}', current_date, 20) order by id`);
    assert.equal(renewed.rows.length, 2, 'only active automatic contracts can renew');
    const daily = (await db.query(`select ends_on,base_amount_cents,amount_cents from public.xpace_student_contracts where id='${dailyContract}'`)).rows[0];
    assert.equal(String(daily.ends_on), String((await db.query('select current_date as d')).rows[0].d));
    assert.equal(daily.base_amount_cents, 1500, 'current catalog price is applied at renewal');
    assert.equal(daily.amount_cents, 1425, 'stored percentage discount is applied to new catalog price');
    const monthly = (await db.query(`select ends_on,base_amount_cents,amount_cents from public.xpace_student_contracts where id='${monthlyContract}'`)).rows[0];
    assert.equal(monthly.base_amount_cents, 25000);
    assert.equal(monthly.amount_cents, 24000, 'stored fixed discount remains fixed after a price adjustment');
    assert.equal((await db.query(`select count(*)::int as n from public.xpace_contract_events where event_type='RENOVADO_AUTOMATICAMENTE'`)).rows[0].n, 2);
    assert.equal((await db.query(`select count(*)::int as n from public.xpace_renew_due_contracts('${company}', current_date, 20)`)).rows[0].n, 0, 'a duplicate cron delivery cannot renew twice');
    console.log('Automatic renewal database assertions passed.');
  } finally { await db.close(); }
}
main().catch((error) => { console.error(error.message, error.where || ''); process.exitCode = 1; });

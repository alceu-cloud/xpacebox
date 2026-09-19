// Run with: node scripts/xpace-cancellation-db.test.cjs <path-to-@electric-sql/pglite>
// Uses an in-memory Postgres database; never connects to Supabase or Asaas.
const { PGlite } = require(process.argv[2] || '@electric-sql/pglite');
const fs = require('node:fs');
const assert = require('node:assert/strict');
async function main() {
  const db = new PGlite();
  try {
    await db.exec(fs.readFileSync('scripts/fixtures/xpace-cancellation-schema.sql','utf8'));
    await db.exec(`
      insert into public.companies values ('00000000-0000-0000-0000-000000000001');
      insert into public.xpace_payment_accounts(id,tenant_company_id,legal_name,document_number,email,mobile_phone,monthly_income_cents,postal_code,address,address_number,neighborhood)
        values('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','TEST','TEST','test@example.invalid','TEST',0,'TEST','TEST','TEST','TEST');
      insert into public.xpace_student_contracts(id,tenant_company_id,student_id,plan_name_snapshot,billing_interval_snapshot,duration_months_snapshot,amount_cents,base_amount_cents,starts_on,ends_on,first_due_on,status,payment_method)
        values('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004','TEST','MENSAL',1,29500,29500,current_date,current_date+29,current_date,'ENCERRADO','PIX');
      insert into public.xpace_contract_sales(tenant_company_id,student_id,contract_id,starts_on,first_due_on,status,signature_required,signature_status)
        select tenant_company_id,student_id,id,starts_on,first_due_on,'ENVIADA_PARA_ASSINATURA',true,'ENVIADA' from public.xpace_student_contracts;
      insert into public.xpace_contract_charges(tenant_company_id,student_id,contract_id,competence_on,due_on,base_amount_cents,amount_cents,status,provider_payment_id)
        select tenant_company_id,student_id,id,starts_on,first_due_on,base_amount_cents,amount_cents,'CANCELADO','pay_fixture' from public.xpace_student_contracts;
    `);
    await db.exec(fs.readFileSync('supabase/migrations/20260919192506_xpace_sale_cancellation_lifecycle.sql','utf8'));
    assert.equal((await db.query('select status from public.xpace_contract_sales')).rows[0].status,'CANCELADA');
    assert.equal((await db.query('select status from public.xpace_payment_cancellations')).rows[0].status,'PENDING');
    const results = await db.exec(fs.readFileSync('scripts/xpace-cancellation-regression.sql','utf8'));
    console.log(results.at(-1).rows[0].result);
    assert.equal((await db.query('select count(*)::int as n from public.xpace_student_contracts')).rows[0].n,1);
    console.log('Migration/backfill and financial lifecycle tests passed in isolated Postgres.');
  } finally { await db.close(); }
}
main().catch(error => { console.error(error.message, error.where || ''); process.exitCode = 1; });

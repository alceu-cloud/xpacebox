// Actual Postgres SQL in isolated WASM. No production data or outgoing messages.
const { PGlite } = require('@electric-sql/pglite');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const db = new PGlite();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const tenant = id(1), other = id(2), actor = id(3), outsider = id(4), inactive = id(5);
const readMigration = suffix => fs.readFileSync(path.join('supabase/migrations', fs.readdirSync('supabase/migrations').find(name => name.endsWith(suffix))), 'utf8');

(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table public.companies(id uuid primary key,slug text,active boolean);
    create table public.profiles(id uuid primary key,full_name text,active boolean,platform_role text);
    create table public.company_members(profile_id uuid,company_id uuid,active boolean);
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table public.xpace_message_connectors(id uuid primary key,tenant_company_id uuid);
    create table public.xpace_message_outbox(id uuid primary key default gen_random_uuid(),tenant_company_id uuid,connector_id uuid,kind text constraint xpace_message_outbox_kind_check check(kind in ('TESTE')),contact_name text,destination_phone text,body text,created_by uuid,scheduled_at timestamptz,status text default 'QUEUED');
    grant usage on schema public to service_role;
    grant select on public.companies,public.profiles,public.company_members,public.xpace_message_connectors to service_role;
    grant select,insert on public.xpace_message_outbox to service_role;`);
  await db.exec('alter default privileges in schema public grant all on tables to service_role');
  await db.query('insert into companies values($1,\'xpace\',true),($2,\'dawos\',true)', [tenant, other]);
  await db.query("insert into profiles values($1,'Operador fixture',true,'company_manager'),($2,'Outro tenant',true,'company_manager'),($3,'Inativo',false,'company_manager')", [actor, outsider, inactive]);
  await db.query('insert into company_members values($1,$2,true),($3,$4,true),($5,$2,true)', [actor, tenant, outsider, other, inactive]);
  await db.query('insert into xpace_message_connectors values($1,$2)', [id(8), tenant]);
  await db.exec(readMigration('_xpace_stock_catalog.sql'));
  await db.exec(readMigration('_xpace_stock_ledger_permissions.sql'));
  assert.equal((await db.query('select count(*)::int as n from xpace_stock_categories')).rows[0].n, 5);
  assert.equal((await db.query('select count(*)::int as n from xpace_stock_units')).rows[0].n, 9);
  const category = (await db.query("select id from xpace_stock_categories where description='Bebidas'")).rows[0].id;
  const unit = (await db.query("select id from xpace_stock_units where abbreviation='UN'")).rows[0].id;
  await db.query("insert into xpace_stock_products(id,tenant_company_id,description,cost_price_cents,sale_price_cents,category_id,unit_id,controls_stock,minimum_stock,code,code_mode) values($1,$2,'Água fixture',100,500,$3,$4,true,5,'0001234567890','EXTERNAL')", [id(10), tenant, category, unit]);
  const move = async (request, direction, quantity, who = actor, company = tenant, product = id(10)) => (await db.query('select xpace_move_stock($1,$2,$3,$4,$5,$6,\'fixture\') as result', [company, who, product, id(request), direction, quantity])).rows[0].result;
  await db.exec('set role service_role');
  let value = await move(100, 'ENTRADA', 5); assert.equal(value.stockQuantity, 5); assert.equal(value.lowStock, false);
  await db.exec('reset role');
  // Fixture recipient only; isolated database has no provider or worker.
  await db.query('insert into xpace_stock_settings values($1,\'5511999999999\',now())', [tenant]);
  value = await move(101, 'SAIDA', 1); assert.equal(value.stockQuantity, 4); assert.equal(value.lowStockCrossed, true); assert.equal(value.alertQueued, true);
  value = await move(101, 'SAIDA', 1); assert.equal(value.replayed, true); assert.equal(value.stockQuantity, 4);
  assert.equal((await db.query('select count(*)::int as n from xpace_message_outbox')).rows[0].n, 1, 'same request cannot duplicate low-stock message');
  await assert.rejects(move(101, 'SAIDA', 2), /STOCK_REQUEST_CONFLICT/);
  value = await move(102, 'SAIDA', 1); assert.equal(value.stockQuantity, 3); assert.equal(value.lowStockCrossed, false); assert.equal(value.alertQueued, false);
  await assert.rejects(move(103, 'SAIDA', 4), /STOCK_INSUFFICIENT/);
  assert.equal((await db.query('select stock_quantity from xpace_stock_products where id=$1', [id(10)])).rows[0].stock_quantity, '3.000');
  await assert.rejects(move(104, 'ENTRADA', 0), /STOCK_QUANTITY_INVALID/);
  await assert.rejects(move(104, 'ENTRADA', 1.0004), /STOCK_QUANTITY_INVALID/);
  await assert.rejects(move(104, 'ENTRADA', 1, outsider), /STOCK_ACCESS_DENIED/);
  await assert.rejects(move(104, 'ENTRADA', 1, inactive), /STOCK_ACCESS_DENIED/);
  await assert.rejects(move(104, 'ENTRADA', 1, outsider, other), /STOCK_ACCESS_DENIED/);
  await assert.rejects(db.query('delete from xpace_stock_categories where id=$1', [category]), /foreign key/);
  await assert.rejects(db.query('update xpace_stock_products set controls_stock=false where id=$1', [id(10)]), /check constraint/);
  await move(105, 'ENTRADA', 2); value = await move(106, 'SAIDA', .5); assert.equal(value.stockQuantity, 4.5); assert.equal(value.alertQueued, true, 'restocking rearms threshold');
  assert.equal((await db.query('select count(*)::int as n from xpace_message_outbox')).rows[0].n, 2);
  await db.query('update xpace_stock_products set active=false where id=$1', [id(10)]);
  await assert.rejects(move(107, 'ENTRADA', 1), /STOCK_NOT_FOUND/);
  await db.query('update xpace_stock_products set active=true where id=$1', [id(10)]);
  await move(108, 'SAIDA', 4.5);
  await db.query('update xpace_stock_products set controls_stock=false where id=$1', [id(10)]);
  await assert.rejects(move(109, 'ENTRADA', 1), /STOCK_NOT_CONTROLLED/);
  for (const role of ['anon', 'authenticated']) {
    assert.equal((await db.query(`select has_function_privilege('${role}','xpace_move_stock(uuid,uuid,uuid,uuid,text,numeric,text)','execute') as allowed`)).rows[0].allowed, false);
    assert.equal((await db.query(`select has_table_privilege('${role}','xpace_stock_products','update') as allowed`)).rows[0].allowed, false);
  }
  assert.equal((await db.query("select has_table_privilege('service_role','xpace_stock_movements','update') as allowed")).rows[0].allowed, false, 'ledger cannot be edited by API');
  const balances = await db.query('select count(*)::int as n from xpace_stock_movements where stock_after<>stock_before+case when direction=\'ENTRADA\' then quantity else -quantity end');
  assert.equal(balances.rows[0].n, 0);
  console.log('PASS stock SQL: seeded catalogs, tenant/actor isolation, immutable ledger, insufficient stock, decimal validation, idempotency, threshold/rearm, queue atomicity, archive, RLS/grants.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.close());

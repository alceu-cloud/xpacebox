const { PGlite } = require('@electric-sql/pglite');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const db = new PGlite();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table companies(id uuid primary key,slug text,active boolean);
    create table profiles(id uuid primary key,active boolean,platform_role text);
    create table company_members(company_id uuid,profile_id uuid,active boolean);
    create table xpace_people(id uuid primary key,tenant_company_id uuid,active boolean,is_student boolean);
    grant usage on schema public to service_role;
    grant select on companies,profiles,company_members,xpace_people to service_role;
    alter default privileges in schema public grant all on tables to anon,authenticated,service_role;`);
  await db.query("insert into companies values($1,'xpace',true),($2,'school-a',true),($3,'school-b',true),($4,'disabled',false)", [id(1),id(2),id(3),id(4)]);
  await db.query("insert into profiles values($1,true,'platform_owner'),($2,true,'company_manager'),($3,true,'company_staff'),($4,false,'company_manager'),($5,true,'company_manager')", [id(11),id(12),id(13),id(14),id(15)]);
  await db.query("insert into company_members values($1,$2,true),($1,$3,true),($1,$4,true),($5,$6,true)", [id(2),id(12),id(13),id(14),id(3),id(15)]);
  for (const file of ['20261001225412_saas_commercial_preparation.sql','20261001230148_saas_sandbox_operation_guard.sql','20261001234305_saas_least_privilege.sql','20261001235446_saas_student_observations.sql']) await db.exec(fs.readFileSync(`supabase/migrations/${file}`, 'utf8'));
  await db.query('insert into xpace_people values($1,$2,true,true),($3,$2,false,true),($4,$2,true,false),($5,$6,true,true)', [id(21),id(2),id(22),id(23),id(24),id(3)]);
  const capture = async (company=id(2),actor=id(12),request=id(31)) => (await db.query('select * from saas_observe_students($1,$2,$3)',[company,actor,request])).rows[0];
  await db.exec("set time zone 'Asia/Tokyo'; set role service_role;");
  const one = await capture();
  assert.equal(one.active_students,1); assert.equal(one.source,'OBSERVATION');
  assert.equal(one.local_date.getTime(),(await db.query("select (now() at time zone 'America/Sao_Paulo')::date d")).rows[0].d.getTime());
  assert.equal((await capture()).id,one.id);
  await assert.rejects(capture(id(3),id(12)),/ACCESS_DENIED/);
  await assert.rejects(capture(id(2),id(13)),/ACCESS_DENIED/);
  await assert.rejects(capture(id(2),id(14)),/ACCESS_DENIED/);
  await assert.rejects(capture(id(4),id(11)),/ACCESS_DENIED/);
  await assert.rejects(capture(id(2),id(11)),/IDEMPOTENCY_CONFLICT/);
  await assert.rejects(db.query('update saas_student_observations set active_students=0'),/permission denied/);
  await assert.rejects(db.query('delete from saas_student_observations'),/permission denied/);
  await assert.rejects(db.query('truncate saas_student_observations'),/permission denied/);
  await db.exec('reset role');
  await db.query('insert into xpace_people values($1,$2,true,true)',[id(25),id(2)]);
  await db.exec('set role service_role');
  assert.equal((await capture()).active_students,1); // Same request is immutable despite changed students.
  assert.equal((await capture(id(2),id(12),id(32))).active_students,2);
  const simultaneous = await Promise.all([capture(id(2),id(12),id(33)),capture(id(2),id(12),id(33))]);
  assert.equal(simultaneous[0].id,simultaneous[1].id);
  assert.equal((await capture(id(3),id(15))).active_students,1);
  await db.exec('reset role');
  assert.equal((await db.query('select count(*)::int n from saas_student_observations')).rows[0].n,4);
  await assert.rejects(db.query('update saas_student_observations set active_students=0'),/SNAPSHOT_IMMUTABLE/);
  await assert.rejects(db.query("insert into saas_student_observations(tenant_company_id,created_by,request_id,active_students,source) values($1,$2,$3,999,'DAY_CLOSE')",[id(2),id(12),id(34)]));
  for (const role of ['anon','authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(db.query('select * from saas_student_observations'),/permission denied/);
    await assert.rejects(capture(),/permission denied/);
    await db.exec('reset role');
  }
  const secured=(await db.query("select relrowsecurity r from pg_class where relname='saas_student_observations'")).rows[0];
  assert.equal(secured.r,true);
  await db.close();
  console.log('SaaS observations SQL: server count/time, tenant/actor authorization, immutable idempotent retry, concurrent dedup, no invented close, RLS/minimal grants passed.');
})().catch(async e => { console.error(e); await db.close(); process.exitCode=1; });

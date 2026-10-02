// Isolated PostgreSQL/PGlite fixtures. No live database or WhatsApp calls.
const { PGlite } = require('@electric-sql/pglite');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const db = new PGlite();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const migrations = path.join(__dirname, '..', 'supabase', 'migrations');
const migration = fs.readdirSync(migrations).find(name => name.endsWith('_xpace_trial_reschedule_guard.sql'));

(async () => {
  assert.ok(migration, 'CLI-created reschedule migration exists');
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema private;
    create table public.xpace_leads(id uuid primary key, tenant_company_id uuid not null, mobile text);
    create table public.xpace_class_groups(id uuid primary key, tenant_company_id uuid not null, modality text);
    create table public.xpace_lead_appointments(
      id uuid primary key, tenant_company_id uuid not null, lead_id uuid not null references public.xpace_leads(id) on delete cascade,
      class_group_id uuid, scheduled_on date not null, starts_at time, ends_at time,
      booking_kind text not null default 'NOVO', modality_name_snapshot text,
      attendance_status text not null default 'AGENDADO', confirmation_status text not null default 'PENDENTE',
      trial_limit_override boolean not null default false, trial_limit_override_by uuid, trial_limit_override_at timestamptz,
      note text,
      check (booking_kind in ('NOVO','REAGENDAMENTO','RECUPERACAO')),
      check (attendance_status in ('AGENDADO','COMPARECEU','FALTOU','CANCELADO','NAO_INFORMADO'))
    );
    alter table public.xpace_leads enable row level security;
    alter table public.xpace_lead_appointments enable row level security;
    grant usage on schema public to service_role;
    grant select,insert,update,delete on public.xpace_leads,public.xpace_lead_appointments to service_role;
    grant select on public.xpace_class_groups to service_role;
    set time zone 'Asia/Tokyo';`);
  for (let lead = 1; lead <= 21; lead++) {
    if (lead !== 19) await db.query('insert into public.xpace_leads values($1,$2,$3)',[id(lead),id(1000),lead === 17 ? null : '4799999' + String(lead === 2 ? 1 : lead).padStart(4,'0')]);
  }
  await db.query('insert into public.xpace_leads values($1,$2,$3)',[id(19),id(2000),'47999990001']);
  await db.query('insert into public.xpace_class_groups values($1,$2,$3)',[id(90),id(1000),'JAZZ']);
  const historical = async (appointment, lead, date='2000-01-01', status='FALTOU', changes={}) => db.query(
    `insert into public.xpace_lead_appointments(id,tenant_company_id,lead_id,class_group_id,scheduled_on,starts_at,ends_at,booking_kind,modality_name_snapshot,attendance_status,confirmation_status)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [id(appointment),id(changes.tenant ?? 1000),id(lead),id(90),date,changes.time === undefined ? '18:00' : changes.time,changes.end ?? '19:00',changes.kind ?? 'NOVO',changes.modality === undefined ? 'JAZZ' : changes.modality,status,changes.confirmation ?? 'PENDENTE']);
  for (let lead = 1; lead <= 18; lead++) await historical(lead*100,lead);
  await historical(1900,19,'2000-01-01','FALTOU',{tenant:2000});
  await historical(301,3,'2000-01-02','COMPARECEU');
  await historical(401,4,'2000-01-02','AGENDADO');
  await historical(501,5,'2000-01-01','FALTOU'); // Ambiguous chronological tie.
  await db.query("update public.xpace_lead_appointments set attendance_status='AGENDADO',confirmation_status='NAO_CONFIRMADO' where id=$1",[id(600)]);
  await db.query('update public.xpace_lead_appointments set starts_at=null where id=$1',[id(700)]);
  await db.query('update public.xpace_lead_appointments set modality_name_snapshot=null where id=$1',[id(800)]);
  await db.query("update public.xpace_lead_appointments set scheduled_on='2099-01-01' where id=$1",[id(900)]);
  await historical(1001,10,'2000-01-02','FALTOU',{modality:'BALLET'}); // Two NOVO quota occurrences.
  await historical(1801,18,'2000-01-02','AGENDADO',{kind:'REAGENDAMENTO'}); // Legacy reschedule, no pointer.
  const br = (await db.query(`select
    to_char((clock_timestamp() at time zone 'America/Sao_Paulo') - interval '2 hours','YYYY-MM-DD') past_on,
    to_char((clock_timestamp() at time zone 'America/Sao_Paulo') - interval '2 hours','HH24:MI:SS') past_start,
    to_char((clock_timestamp() at time zone 'America/Sao_Paulo') - interval '2 hours' + interval '1 second','HH24:MI:SS') past_end,
    to_char((clock_timestamp() at time zone 'America/Sao_Paulo') + interval '2 hours','YYYY-MM-DD') future_on,
    to_char((clock_timestamp() at time zone 'America/Sao_Paulo') + interval '2 hours','HH24:MI:SS') future_start,
    to_char((clock_timestamp() at time zone 'America/Sao_Paulo') + interval '2 hours' + interval '1 second','HH24:MI:SS') future_end`)).rows[0];
  await historical(2000,20,br.past_on,'FALTOU',{time:br.past_start,end:br.past_end});
  await historical(2100,21,br.future_on,'FALTOU',{time:br.future_start,end:br.future_end});
  const historicalBefore = (await db.query('select to_jsonb(a) body from public.xpace_lead_appointments a order by id')).rows;

  // Exercise the real NOVO quota alongside the new reschedule guard.
  const oldSql = fs.readFileSync(path.join(migrations,'20260929194625_xpace_trial_client_and_cleanup.sql'),'utf8');
  const quotaSql = oldSql.slice(oldSql.indexOf('create or replace function private.enforce_xpace_trial_lesson_limit()'));
  await db.exec(quotaSql.replace('drop trigger xpace_lead_trial_lesson_limit_guard','drop trigger if exists xpace_lead_trial_lesson_limit_guard'));
  await db.exec(fs.readFileSync(path.join(migrations,migration),'utf8'));
  assert.deepEqual((await db.query("select to_jsonb(a) - 'rescheduled_from_appointment_id' body from public.xpace_lead_appointments a order by id")).rows,historicalBefore,'Migration leaves every historical row intact');
  const create = async (appointment,lead,changes={}) => (await db.query(
    `insert into public.xpace_lead_appointments(id,tenant_company_id,lead_id,class_group_id,scheduled_on,starts_at,ends_at,booking_kind,modality_name_snapshot,attendance_status,rescheduled_from_appointment_id)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *`,
    [id(appointment),id(changes.tenant ?? 1000),id(lead),id(90),changes.date ?? '2099-01-01',changes.time === undefined ? '18:00' : changes.time,'19:00',changes.kind ?? 'REAGENDAMENTO',changes.modality === undefined ? ' jazz ' : changes.modality,changes.status ?? 'AGENDADO',changes.source ? id(changes.source) : null])).rows[0];
  const rejected = async (appointment,lead,changes,error=/XPACE_TRIAL_RESCHEDULE_/) => {
    await assert.rejects(create(appointment,lead,changes),error);
    assert.equal((await db.query('select count(*)::int n from public.xpace_lead_appointments where id=$1',[id(appointment)])).rows[0].n,0);
  };
  await db.exec('set role service_role');

  const first = await create(101,1,{date:'2000-01-02'});
  assert.equal(first.rescheduled_from_appointment_id,id(100));
  assert.equal((await db.query('select attendance_status from public.xpace_lead_appointments where id=$1',[id(100)])).rows[0].attendance_status,'FALTOU');
  await db.query("update public.xpace_lead_appointments set attendance_status='FALTOU' where id=$1",[id(101)]);
  assert.equal((await create(102,1)).rescheduled_from_appointment_id,id(101));
  await rejected(201,2,{modality:'BALLET'},/NO_ELIGIBLE_SOURCE/);
  await rejected(202,2,{source:100},/SOURCE_MISMATCH/);
  await rejected(203,19,{tenant:1000},/LEAD_CONTEXT_INVALID/);
  await rejected(204,2,{source:1900},/SOURCE_MISMATCH/);
  await rejected(302,3,{},/NO_ELIGIBLE_SOURCE/);
  await rejected(402,4,{},/NO_ELIGIBLE_SOURCE/);
  await rejected(502,5,{},/AMBIGUOUS_SOURCE/);
  await rejected(601,6,{},/NO_ELIGIBLE_SOURCE/);
  await rejected(701,7,{},/TIME_REQUIRED/);
  await rejected(801,8,{},/NO_ELIGIBLE_SOURCE/);
  await rejected(802,8,{modality:' '},/MODALITY_REQUIRED/);
  await rejected(803,8,{modality:'SEM MODALIDADE'},/MODALITY_REQUIRED/);
  await rejected(804,8,{modality:'AULA EXPERIMENTAL'},/MODALITY_REQUIRED/);
  await rejected(901,9,{date:'2099-01-02'},/SOURCE_NOT_PAST/);
  await rejected(1101,11,{date:'1999-12-31'},/ORDER_INVALID/);
  await rejected(1201,12,{time:null},/TIME_REQUIRED/);
  assert.equal((await create(2001,20)).rescheduled_from_appointment_id,id(2000),'BR past slot works while session is Asia/Tokyo');
  await rejected(2101,21,{},/SOURCE_NOT_PAST/);
  await db.query("update public.xpace_lead_appointments set attendance_status='COMPARECEU' where id=$1",[id(1600)]);
  await rejected(1601,16,{},/NO_ELIGIBLE_SOURCE/); // Eligibility changed after caller's lookup.
  const quotaReschedule = await create(1002,10);
  assert.equal(quotaReschedule.rescheduled_from_appointment_id,id(1000));
  await rejected(1003,10,{kind:'NOVO',modality:'HIP HOP'},/XPACE_TRIAL_LIMIT_REQUIRES_FEE/);
  await rejected(1301,13,{kind:'NOVO',source:1300,modality:'HIP HOP'},/SOURCE_REQUIRES_REAGENDAMENTO/);
  const immutable = await create(1401,14);
  for (const [sql,args,error] of [
    ['update public.xpace_lead_appointments set rescheduled_from_appointment_id=null where id=$1',[immutable.id],/SOURCE_IMMUTABLE/],
    ['update public.xpace_lead_appointments set rescheduled_from_appointment_id=$1 where id=$2',[id(1500),immutable.id],/SOURCE_IMMUTABLE/],
    ["update public.xpace_lead_appointments set booking_kind='RECUPERACAO' where id=$1",[immutable.id],/SOURCE_IMMUTABLE/],
    ["update public.xpace_lead_appointments set modality_name_snapshot='BALLET' where id=$1",[immutable.id],/CONTEXT_IMMUTABLE/],
    ['update public.xpace_lead_appointments set lead_id=$1 where id=$2',[id(15),immutable.id],/CONTEXT_IMMUTABLE/],
    ['update public.xpace_lead_appointments set tenant_company_id=$1 where id=$2',[id(2000),immutable.id],/CONTEXT_IMMUTABLE/],
  ]) await assert.rejects(db.query(sql,args),error);
  await db.query("update public.xpace_lead_appointments set scheduled_on='2099-01-02' where id=$1",[immutable.id]);
  await db.query("update public.xpace_lead_appointments set attendance_status='COMPARECEU',starts_at=starts_at,modality_name_snapshot=modality_name_snapshot,note='corrected' where id=$1",[immutable.id]);
  await db.query("update public.xpace_lead_appointments set attendance_status='FALTOU' where id=$1",[immutable.id]);
  // Pointer has no FK: source deletion doesn't block normal corrections/lead cascade.
  await db.query('delete from public.xpace_lead_appointments where id=$1',[id(1400)]);
  await db.query("update public.xpace_lead_appointments set attendance_status='COMPARECEU',scheduled_on=scheduled_on,starts_at=starts_at,rescheduled_from_appointment_id=rescheduled_from_appointment_id where id=$1",[immutable.id]);
  await assert.rejects(db.query("update public.xpace_lead_appointments set scheduled_on='2099-01-03' where id=$1",[immutable.id]),/NO_ELIGIBLE_SOURCE/);
  const canceled = await create(1501,15);
  await db.query("update public.xpace_lead_appointments set attendance_status='CANCELADO' where id=$1",[canceled.id]);
  const replacement = await create(1502,15,{date:'2099-01-02'});
  assert.equal(replacement.rescheduled_from_appointment_id,id(1500));
  await assert.rejects(db.query("update public.xpace_lead_appointments set attendance_status='AGENDADO' where id=$1",[canceled.id]),/NO_ELIGIBLE_SOURCE/);
  assert.equal((await create(1701,17)).rescheduled_from_appointment_id,id(1700)); // Phone missing: lead lock.
  await db.query("update public.xpace_lead_appointments set attendance_status='COMPARECEU',starts_at=starts_at where id=$1",[id(1801)]);
  assert.equal((await db.query('select rescheduled_from_appointment_id from public.xpace_lead_appointments where id=$1',[id(1801)])).rows[0].rescheduled_from_appointment_id,null,'Legacy no-op updates do not rewrite historical pointers');

  await db.exec('reset role');
  // A bypassed/stale-snapshot guard still cannot give a source two active children.
  await db.exec('alter table public.xpace_lead_appointments disable trigger xpace_lead_trial_reschedule_guard');
  await assert.rejects(create(1503,15,{date:'2099-01-03',source:1500}),error => error.code === '23505' && error.constraint === 'xpace_trial_reschedule_source_active_unique');
  await db.exec('alter table public.xpace_lead_appointments enable trigger xpace_lead_trial_reschedule_guard');
  const security = (await db.query(`select p.prosecdef, p.proconfig,
    has_function_privilege('anon',p.oid,'EXECUTE') a,
    has_function_privilege('authenticated',p.oid,'EXECUTE') u,
    has_function_privilege('service_role',p.oid,'EXECUTE') s
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private' and p.proname='enforce_xpace_trial_reschedule'`)).rows[0];
  assert.equal(security.prosecdef,false); assert.equal(security.a,false); assert.equal(security.u,false); assert.equal(security.s,false);
  assert.ok(security.proconfig.some(value => value === 'search_path=""'));
  for (const role of ['anon','authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(db.query('select * from public.xpace_lead_appointments'),/permission denied/);
    await db.exec('reset role');
  }
  await db.exec('set role service_role');
  await db.query('delete from public.xpace_leads where id=$1',[id(1)]);
  assert.equal((await db.query('select count(*)::int n from public.xpace_lead_appointments where lead_id=$1',[id(1)])).rows[0].n,0);
  await db.close();
  console.log('Trial reschedule SQL: same lead/modality/past absence, chain, latest-state/tie rejection, immutable audit, source uniqueness, corrections/deletion, NOVO quota and invoker permissions passed.');
})().catch(async error => { console.error(error); await db.close(); process.exitCode = 1; });

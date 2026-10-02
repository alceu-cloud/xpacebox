// Actual PostgreSQL trigger in an isolated WASM database; no live data or messages.
const { PGlite } = require('@electric-sql/pglite');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const db = new PGlite();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
(async () => {
  try {
    await db.exec(`create schema private;
      create table xpace_leads(id uuid primary key,tenant_company_id uuid,mobile text);
      create table xpace_class_groups(id uuid primary key,tenant_company_id uuid,modality text);
      create table xpace_lead_appointments(id uuid primary key default gen_random_uuid(),tenant_company_id uuid,lead_id uuid,class_group_id uuid,scheduled_on date,
        booking_kind text default 'NOVO',attendance_status text default 'AGENDADO',modality_name_snapshot text,
        trial_limit_override boolean default false,trial_limit_override_by uuid,trial_limit_override_at timestamptz);`);
    const filename = fs.readdirSync('supabase/migrations').find(n => n.endsWith('_xpace_trial_absences_preserve_allowance.sql'));
    await db.exec(fs.readFileSync(path.join('supabase/migrations',filename),'utf8'));
    await db.exec(`create trigger xpace_lead_trial_lesson_limit_guard before insert or update of lead_id,booking_kind,attendance_status,trial_limit_override,modality_name_snapshot,class_group_id
      on xpace_lead_appointments for each row execute function private.enforce_xpace_trial_lesson_limit();`);
    const tenant=id(1), other=id(2), lead=id(3), alias=id(4), outsider=id(5);
    await db.query('insert into xpace_leads values($1,$2,\'47999999999\'),($3,$2,\'47999999999\'),($4,$5,\'47999999999\')',[lead,tenant,alias,outsider,other]);
    await db.query("insert into xpace_class_groups values($1,$2,'Teens'),($3,$2,'Jazz'),($4,$2,'Heels'),($5,$6,'Teens')",[id(10),tenant,id(11),id(12),id(13),other]);
    const insert=async(group,status='AGENDADO',who=lead,company=tenant,changes={})=>(await db.query(
      `insert into xpace_lead_appointments(tenant_company_id,lead_id,class_group_id,attendance_status,trial_limit_override,trial_limit_override_by,trial_limit_override_at)
       values($1,$2,$3,$4,$5,$6,$7) returning id`,[company,who,group,status,changes.override??false,changes.by??null,changes.at??null])).rows[0].id;
    const missed=await insert(id(10),'FALTOU');await insert(id(10),'FALTOU');
    await insert(id(13),'COMPARECEU',outsider,other);
    const attended=await insert(id(10),'COMPARECEU');
    const pending=await insert(id(11),'AGENDADO',alias);
    await assert.rejects(()=>insert(id(12)),/XPACE_TRIAL_LIMIT_REQUIRES_FEE/);
    await assert.rejects(()=>db.query("update xpace_lead_appointments set attendance_status='AGENDADO' where id=$1",[missed]),/XPACE_TRIAL_LIMIT_REQUIRES_FEE/);
    // The same state transition used by the midnight job releases the allowance.
    await db.query("update xpace_lead_appointments set attendance_status='FALTOU' where id=$1",[pending]);
    const replacement=await insert(id(11));
    await db.query("update xpace_lead_appointments set attendance_status='COMPARECEU' where id=$1",[replacement]);
    await assert.rejects(()=>insert(id(12)),/XPACE_TRIAL_LIMIT_REQUIRES_FEE/);
    await db.query("update xpace_lead_appointments set attendance_status='CANCELADO' where id=$1",[replacement]);
    await assert.rejects(()=>insert(id(10)),/XPACE_TRIAL_MODALITY_ALREADY_USED/);
    await insert(id(12));
    await assert.rejects(()=>insert(id(11),'AGENDADO',lead,tenant,{override:true}),/XPACE_TRIAL_LIMIT_OVERRIDE_AUDIT_REQUIRED/);
    await insert(id(11),'AGENDADO',lead,tenant,{override:true,by:id(90),at:'2026-10-02T12:00:00Z'});
    // Attendance corrections remain possible without pretending a new booking was made.
    await db.query("update xpace_lead_appointments set attendance_status='FALTOU' where id=$1",[attended]);
    await db.query("update xpace_lead_appointments set attendance_status='COMPARECEU' where id=$1",[attended]);
    console.log('Trial allowance DB: PASS (absences, same modality retry, pending quota, duplicate phone, tenant isolation, midnight transition, reactivation and audited override).');
  } finally { await db.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});

-- Attendance does not reserve an extra seat. Preserve capacity validation for
-- inserts, rescheduling, company changes and reactivating cancelled bookings.
create or replace function private.enforce_xpace_trial_capacity()
returns trigger language plpgsql set search_path = '' as $$
declare
  slot_capacity integer; settings_value jsonb; max_clients integer;
  enrolled_count integer; trial_count integer;
begin
  if new.class_group_id is null or new.class_schedule_id is null or new.attendance_status = 'CANCELADO' then return new; end if;
  if tg_op = 'UPDATE'
    and old.attendance_status <> 'CANCELADO'
    and old.tenant_company_id = new.tenant_company_id
    and old.class_group_id is not distinct from new.class_group_id
    and old.class_schedule_id is not distinct from new.class_schedule_id
    and old.scheduled_on = new.scheduled_on then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.class_schedule_id::text || ':' || new.scheduled_on::text, 0));
  select schedule.capacity, schedule.settings into slot_capacity, settings_value
  from public.xpace_class_schedules schedule
  join public.xpace_class_groups grade on grade.id = schedule.class_group_id
  where schedule.id = new.class_schedule_id and schedule.class_group_id = new.class_group_id
    and schedule.tenant_company_id = new.tenant_company_id and schedule.active = true and grade.active = true
  for update of schedule;
  if not found then raise exception 'XPACE_GRADE_INDISPONIVEL'; end if;
  if not coalesce((settings_value ->> 'allowLeads')::boolean, false) then raise exception 'XPACE_GRADE_NAO_ACEITA_LEADS'; end if;
  max_clients := case when coalesce((settings_value ->> 'maxClientsEnabled')::boolean, false)
    then nullif(settings_value ->> 'maxClients', '')::integer else null end;
  if slot_capacity is not null then max_clients := least(coalesce(max_clients, slot_capacity), slot_capacity); end if;
  if max_clients is null then return new; end if;
  select count(distinct student_id) into enrolled_count from public.xpace_class_enrollments
  where tenant_company_id = new.tenant_company_id and class_group_id = new.class_group_id and status = 'ATIVA'
    and starts_on <= new.scheduled_on and (ends_on is null or ends_on >= new.scheduled_on);
  select count(*) into trial_count from public.xpace_lead_appointments
  where tenant_company_id = new.tenant_company_id and class_schedule_id = new.class_schedule_id
    and scheduled_on = new.scheduled_on and attendance_status <> 'CANCELADO' and id <> new.id;
  if enrolled_count + trial_count >= max_clients then raise exception 'XPACE_LEAD_SLOT_UNAVAILABLE'; end if;
  return new;
end;
$$;

-- Internal, invoker-only routine: not callable through the public Data API.
-- The cutoff comes from the company-local date, never the browser/UTC date.
create function private.xpace_close_unmarked_trial_attendance(
  p_company_id uuid, p_start_on date, p_as_of timestamptz default now()
)
returns integer language plpgsql set search_path = '' as $$
declare changed_count integer;
begin
  if p_company_id is null or p_start_on is null or p_as_of is null then
    raise exception 'XPACE_ABSENCE_INVALID_ARGUMENT';
  end if;
  with candidates as materialized (
    select a.id from public.xpace_lead_appointments a
    where a.tenant_company_id = p_company_id
      and a.attendance_status = 'AGENDADO'
      and a.class_schedule_id is not null
      and a.scheduled_on >= p_start_on
      and a.scheduled_on < (p_as_of at time zone 'America/Sao_Paulo')::date
    order by a.scheduled_on, a.id
    limit 500
    for update of a skip locked
  ), changed as (
    update public.xpace_lead_appointments a
    set attendance_status = 'FALTOU', attended_at = null,
        updated_by = null, updated_at = p_as_of
    from candidates c
    where a.id = c.id and a.tenant_company_id = p_company_id and a.attendance_status = 'AGENDADO'
    returning a.id, a.tenant_company_id, a.lead_id, a.scheduled_on
  ), audited as (
    insert into public.xpace_lead_activities (
      tenant_company_id, lead_id, appointment_id, activity_type, body, payload, created_at
    )
    select tenant_company_id, lead_id, id, 'AGENDAMENTO_ATUALIZADO',
      'PRESENÇA: FALTOU. MARCAÇÃO AUTOMÁTICA NA VIRADA DO DIA, POR AUSÊNCIA DE CHAMADA. PODE SER CORRIGIDA PELA EQUIPE.',
      jsonb_build_object('source', 'MIDNIGHT_AUTO_ABSENCE', 'attendanceStatus', 'FALTOU',
        'previousAttendanceStatus', 'AGENDADO', 'scheduledOn', scheduled_on, 'timeZone', 'America/Sao_Paulo'),
      p_as_of
    from changed
    returning id
  ) select count(*) into changed_count from audited;
  return changed_count;
end;
$$;
revoke all on function private.xpace_close_unmarked_trial_attendance(uuid, date, timestamptz)
  from public, anon, authenticated, service_role;

create index xpace_trials_unmarked_company_date_idx
  on public.xpace_lead_appointments(tenant_company_id, scheduled_on, id)
  where attendance_status = 'AGENDADO' and class_schedule_id is not null;

-- Supabase already preloads pg_cron; enable its SQL interface. No HTTP tokens,
-- Vercel cron timing dependency, or computer at the school is required.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- Every minute detects the date change and catches up after an outage. The
-- activation date is frozen in the job, so old imported history stays untouched.
select cron.schedule(
  'xpace-trial-midnight-absence', '* * * * *',
  format('select private.xpace_close_unmarked_trial_attendance(id, %L::date) from public.companies where slug = ''xpace'';',
    (now() at time zone 'America/Sao_Paulo')::date)
);

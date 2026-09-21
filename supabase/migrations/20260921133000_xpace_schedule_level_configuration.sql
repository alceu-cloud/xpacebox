-- A grade can meet more than once a week.  Each meeting is a real class slot
-- and must keep its own room, instructor, capacity and access rules.
alter table public.xpace_class_schedules
  add column if not exists capacity integer check (capacity is null or capacity > 0),
  add column if not exists settings jsonb not null default '{}'::jsonb;

alter table public.xpace_class_schedules
  drop constraint if exists xpace_class_schedules_settings_object_check,
  add constraint xpace_class_schedules_settings_object_check
    check (jsonb_typeof(settings) = 'object');

-- Existing grades keep their current behavior.  New schedules are configured
-- independently by the agenda UI and no longer read these values from the group.
update public.xpace_class_schedules as schedule
set
  capacity = coalesce(schedule.capacity, grade.capacity),
  settings = case
    when schedule.settings = '{}'::jsonb then grade.settings
    else schedule.settings
  end
from public.xpace_class_groups as grade
where grade.id = schedule.class_group_id
  and grade.tenant_company_id = schedule.tenant_company_id;

-- Trial capacity is also evaluated against the exact schedule selected by the
-- visitor.  Two classes of the same modality can therefore run independently.
create or replace function private.enforce_xpace_trial_capacity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  slot_capacity integer;
  settings_value jsonb;
  max_clients integer;
  enrolled_count integer;
  trial_count integer;
begin
  if new.class_group_id is null or new.class_schedule_id is null or new.attendance_status = 'CANCELADO' then return new; end if;

  perform pg_advisory_xact_lock(hashtextextended(new.class_schedule_id::text || ':' || new.scheduled_on::text, 0));
  select schedule.capacity, schedule.settings
    into slot_capacity, settings_value
    from public.xpace_class_schedules as schedule
    join public.xpace_class_groups as grade on grade.id = schedule.class_group_id
    where schedule.id = new.class_schedule_id
      and schedule.class_group_id = new.class_group_id
      and schedule.tenant_company_id = new.tenant_company_id
      and schedule.active = true
      and grade.active = true
    for update of schedule;
  if not found then raise exception 'XPACE_GRADE_INDISPONIVEL'; end if;
  if not coalesce((settings_value ->> 'allowLeads')::boolean, false) then raise exception 'XPACE_GRADE_NAO_ACEITA_LEADS'; end if;

  max_clients := case when coalesce((settings_value ->> 'maxClientsEnabled')::boolean, false)
    then nullif(settings_value ->> 'maxClients', '')::integer else null end;
  if slot_capacity is not null then max_clients := least(coalesce(max_clients, slot_capacity), slot_capacity); end if;
  if max_clients is null then return new; end if;

  select count(distinct student_id) into enrolled_count
    from public.xpace_class_enrollments
    where tenant_company_id = new.tenant_company_id and class_group_id = new.class_group_id and status = 'ATIVA'
      and starts_on <= new.scheduled_on and (ends_on is null or ends_on >= new.scheduled_on);

  select count(*) into trial_count
    from public.xpace_lead_appointments
    where tenant_company_id = new.tenant_company_id and class_schedule_id = new.class_schedule_id and scheduled_on = new.scheduled_on
      and attendance_status <> 'CANCELADO' and id <> new.id;

  if enrolled_count + trial_count >= max_clients then raise exception 'XPACE_LEAD_SLOT_UNAVAILABLE'; end if;
  return new;
end;
$$;

drop trigger if exists xpace_lead_appointment_capacity_guard on public.xpace_lead_appointments;
create trigger xpace_lead_appointment_capacity_guard
before insert or update of class_group_id, class_schedule_id, scheduled_on, attendance_status
on public.xpace_lead_appointments
for each row execute function private.enforce_xpace_trial_capacity();

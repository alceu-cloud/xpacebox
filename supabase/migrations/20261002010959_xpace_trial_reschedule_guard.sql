-- Preserve every historical appointment. The pointer is an audit snapshot, not
-- a foreign key: deleting a lead/appointment keeps its existing behavior.
alter table public.xpace_lead_appointments
  add column rescheduled_from_appointment_id uuid;

comment on column public.xpace_lead_appointments.rescheduled_from_appointment_id is
  'Original absence used for a new same-lead/same-modality reschedule; set by the private guard, without rewriting legacy appointments.';

create unique index xpace_trial_reschedule_source_active_unique
  on public.xpace_lead_appointments(rescheduled_from_appointment_id)
  where rescheduled_from_appointment_id is not null
    and attendance_status <> 'CANCELADO';

create index xpace_trial_reschedule_history_idx
  on public.xpace_lead_appointments(
    tenant_company_id, lead_id, lower(btrim(modality_name_snapshot)),
    scheduled_on desc, starts_at desc
  )
  where attendance_status <> 'CANCELADO';

create function private.enforce_xpace_trial_reschedule()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  lead_mobile text;
  requested_modality text;
  source_appointment public.xpace_lead_appointments%rowtype;
  source_count integer;
  local_now timestamp := pg_catalog.clock_timestamp() at time zone 'America/Sao_Paulo';
begin
  -- An audited link cannot be removed/reassigned or relabeled to bypass the
  -- source's uniqueness. Legacy rows with no pointer are not rewritten.
  if tg_op = 'UPDATE' then
    if old.rescheduled_from_appointment_id is not null and (
      new.rescheduled_from_appointment_id is distinct from old.rescheduled_from_appointment_id
      or new.booking_kind is distinct from old.booking_kind
    ) then
      raise exception 'XPACE_TRIAL_RESCHEDULE_SOURCE_IMMUTABLE';
    end if;
    if old.booking_kind = 'REAGENDAMENTO' and new.booking_kind = 'REAGENDAMENTO' and (
      new.tenant_company_id is distinct from old.tenant_company_id
      or new.lead_id is distinct from old.lead_id
      or lower(btrim(new.modality_name_snapshot)) is distinct from lower(btrim(old.modality_name_snapshot))
    ) then
      raise exception 'XPACE_TRIAL_RESCHEDULE_CONTEXT_IMMUTABLE';
    end if;
  end if;

  if new.booking_kind <> 'REAGENDAMENTO' then
    if new.rescheduled_from_appointment_id is not null then
      raise exception 'XPACE_TRIAL_RESCHEDULE_SOURCE_REQUIRES_REAGENDAMENTO';
    end if;
    return new;
  end if;

  -- Normal attendance corrections must remain possible, including after a
  -- historical source was corrected/deleted. Restoring a canceled appointment
  -- is different: its active source slot must still be available.
  if tg_op = 'UPDATE'
    and old.booking_kind = 'REAGENDAMENTO'
    and new.tenant_company_id = old.tenant_company_id
    and new.lead_id = old.lead_id
    and new.scheduled_on = old.scheduled_on
    and new.starts_at is not distinct from old.starts_at
    and new.ends_at is not distinct from old.ends_at
    and lower(btrim(new.modality_name_snapshot)) is not distinct from lower(btrim(old.modality_name_snapshot))
    and new.rescheduled_from_appointment_id is not distinct from old.rescheduled_from_appointment_id
    and not (old.attendance_status = 'CANCELADO' and new.attendance_status <> 'CANCELADO') then
    return new;
  end if;

  requested_modality := lower(btrim(coalesce(new.modality_name_snapshot, '')));
  if requested_modality in ('', 'sem modalidade', 'aula experimental') then
    raise exception 'XPACE_TRIAL_RESCHEDULE_MODALITY_REQUIRED';
  end if;
  if new.starts_at is null then
    raise exception 'XPACE_TRIAL_RESCHEDULE_TIME_REQUIRED';
  end if;

  select l.mobile into lead_mobile
  from public.xpace_leads l
  where l.id = new.lead_id and l.tenant_company_id = new.tenant_company_id;
  if not found then
    raise exception 'XPACE_TRIAL_RESCHEDULE_LEAD_CONTEXT_INVALID';
  end if;

  -- The NOVO quota guard uses this same phone key. A shared phone serializes
  -- writes, but is never accepted as proof that two leads are the same person.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    new.tenant_company_id::text || ':' || coalesce(nullif(lead_mobile, ''), new.lead_id::text), 0
  ));

  select a.* into source_appointment
  from public.xpace_lead_appointments a
  where a.tenant_company_id = new.tenant_company_id
    and a.lead_id = new.lead_id
    and a.id <> new.id
    and a.attendance_status <> 'CANCELADO'
    and lower(btrim(a.modality_name_snapshot)) = requested_modality
  order by a.scheduled_on desc, a.starts_at desc nulls first, a.id
  limit 1
  for update;

  if not found then
    raise exception 'XPACE_TRIAL_RESCHEDULE_NO_ELIGIBLE_SOURCE';
  end if;
  select count(*) into source_count
  from public.xpace_lead_appointments a
  where a.tenant_company_id = new.tenant_company_id
    and a.lead_id = new.lead_id
    and a.id <> new.id
    and a.attendance_status <> 'CANCELADO'
    and lower(btrim(a.modality_name_snapshot)) = requested_modality
    and a.scheduled_on = source_appointment.scheduled_on
    and a.starts_at is not distinct from source_appointment.starts_at;
  if source_count <> 1 then
    raise exception 'XPACE_TRIAL_RESCHEDULE_AMBIGUOUS_SOURCE';
  end if;
  if source_appointment.attendance_status <> 'FALTOU' then
    raise exception 'XPACE_TRIAL_RESCHEDULE_NO_ELIGIBLE_SOURCE';
  end if;
  if source_appointment.starts_at is null then
    raise exception 'XPACE_TRIAL_RESCHEDULE_TIME_REQUIRED';
  end if;
  if source_appointment.scheduled_on + coalesce(source_appointment.ends_at, source_appointment.starts_at) >= local_now then
    raise exception 'XPACE_TRIAL_RESCHEDULE_SOURCE_NOT_PAST';
  end if;
  if source_appointment.scheduled_on + coalesce(source_appointment.ends_at, source_appointment.starts_at)
    >= new.scheduled_on + new.starts_at then
    raise exception 'XPACE_TRIAL_RESCHEDULE_ORDER_INVALID';
  end if;
  if new.rescheduled_from_appointment_id is not null
    and new.rescheduled_from_appointment_id <> source_appointment.id then
    raise exception 'XPACE_TRIAL_RESCHEDULE_SOURCE_MISMATCH';
  end if;
  if exists (
    select 1 from public.xpace_lead_appointments a
    where a.rescheduled_from_appointment_id = source_appointment.id
      and a.attendance_status <> 'CANCELADO' and a.id <> new.id
  ) then
    raise exception 'XPACE_TRIAL_RESCHEDULE_SOURCE_ALREADY_USED';
  end if;
  new.rescheduled_from_appointment_id := source_appointment.id;
  return new;
end;
$$;

revoke all on function private.enforce_xpace_trial_reschedule()
  from public, anon, authenticated, service_role;

create trigger xpace_lead_trial_reschedule_guard
before insert or update of tenant_company_id, lead_id, booking_kind,
  scheduled_on, starts_at, ends_at, modality_name_snapshot,
  rescheduled_from_appointment_id, attendance_status
on public.xpace_lead_appointments
for each row execute function private.enforce_xpace_trial_reschedule();

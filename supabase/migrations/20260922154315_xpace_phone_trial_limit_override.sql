alter table public.xpace_lead_appointments
  add column if not exists trial_limit_override boolean not null default false,
  add column if not exists trial_limit_override_by uuid references public.profiles(id) on delete set null,
  add column if not exists trial_limit_override_at timestamptz;

update public.xpace_leads
set mobile = nullif(
  case
    when regexp_replace(coalesce(mobile, ''), '\\D', '', 'g') ~ '^55[0-9]{10,11}$'
      then substring(regexp_replace(coalesce(mobile, ''), '\\D', '', 'g') from 3)
    else regexp_replace(coalesce(mobile, ''), '\\D', '', 'g')
  end,
  ''
)
where mobile is not null;

create or replace function private.enforce_xpace_trial_lesson_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  lead_mobile text;
  used_trials integer;
begin
  if new.booking_kind <> 'NOVO' or new.attendance_status = 'CANCELADO' then
    return new;
  end if;

  if coalesce(new.trial_limit_override, false) then
    if new.trial_limit_override_by is null or new.trial_limit_override_at is null then
      raise exception 'XPACE_TRIAL_LIMIT_OVERRIDE_AUDIT_REQUIRED';
    end if;
    return new;
  end if;

  select mobile into lead_mobile
    from public.xpace_leads
    where id = new.lead_id and tenant_company_id = new.tenant_company_id;

  if lead_mobile is null or lead_mobile = '' then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.tenant_company_id::text || ':' || lead_mobile, 0));

  select count(*) into used_trials
    from public.xpace_lead_appointments as appointment
    join public.xpace_leads as lead on lead.id = appointment.lead_id
    where appointment.tenant_company_id = new.tenant_company_id
      and lead.tenant_company_id = new.tenant_company_id
      and lead.mobile = lead_mobile
      and appointment.booking_kind = 'NOVO'
      and appointment.attendance_status <> 'CANCELADO'
      and appointment.id <> new.id;

  if used_trials >= 2 then
    raise exception 'XPACE_TRIAL_LIMIT_REQUIRES_FEE';
  end if;

  return new;
end;
$$;

drop trigger if exists xpace_lead_trial_lesson_limit_guard on public.xpace_lead_appointments;
create trigger xpace_lead_trial_lesson_limit_guard
before insert or update of lead_id, booking_kind, attendance_status, trial_limit_override
on public.xpace_lead_appointments
for each row execute function private.enforce_xpace_trial_lesson_limit();

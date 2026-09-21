create or replace function private.enforce_xpace_trial_lesson_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  used_trials integer;
begin
  if new.booking_kind <> 'NOVO' or new.attendance_status = 'CANCELADO' then return new; end if;

  perform pg_advisory_xact_lock(hashtextextended(new.lead_id::text, 0));
  select count(*) into used_trials
    from public.xpace_lead_appointments
    where lead_id = new.lead_id
      and tenant_company_id = new.tenant_company_id
      and booking_kind = 'NOVO'
      and attendance_status <> 'CANCELADO'
      and id <> new.id;

  if used_trials >= 2 then
    raise exception 'XPACE_TRIAL_LIMIT_REQUIRES_FEE';
  end if;
  return new;
end;
$$;

drop trigger if exists xpace_lead_trial_lesson_limit_guard on public.xpace_lead_appointments;
create trigger xpace_lead_trial_lesson_limit_guard
before insert or update of lead_id, booking_kind, attendance_status
on public.xpace_lead_appointments
for each row execute function private.enforce_xpace_trial_lesson_limit();

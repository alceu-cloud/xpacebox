-- Local preparation only: FALTOU and CANCELADO do not consume a free trial.
-- Pending bookings still reserve an allowance. Midnight automation is unchanged.
create or replace function private.enforce_xpace_trial_lesson_limit()
returns trigger language plpgsql set search_path = '' as $$
declare
  lead_mobile text;
  used_trials integer;
  repeated_modality integer;
  requested_modality text;
begin
  if new.booking_kind <> 'NOVO' or new.attendance_status in ('CANCELADO', 'FALTOU') then
    return new;
  end if;
  -- Preserve historical attendance correction, but revalidate a missed booking
  -- when it is restored to AGENDADO and therefore reserves a new allowance.
  if tg_op = 'UPDATE'
    and old.booking_kind = 'NOVO' and old.attendance_status <> 'CANCELADO'
    and (old.attendance_status <> 'FALTOU' or new.attendance_status = 'COMPARECEU')
    and old.lead_id = new.lead_id
    and old.class_group_id is not distinct from new.class_group_id
    and old.modality_name_snapshot is not distinct from new.modality_name_snapshot
    and old.trial_limit_override = new.trial_limit_override then
    return new;
  end if;
  if coalesce(new.trial_limit_override, false) then
    if new.trial_limit_override_by is null or new.trial_limit_override_at is null then
      raise exception 'XPACE_TRIAL_LIMIT_OVERRIDE_AUDIT_REQUIRED';
    end if;
    return new;
  end if;
  select mobile into lead_mobile from public.xpace_leads
    where id = new.lead_id and tenant_company_id = new.tenant_company_id;
  if lead_mobile is null or lead_mobile = '' then return new; end if;
  select lower(btrim(coalesce(nullif(new.modality_name_snapshot, ''), g.modality, '')))
    into requested_modality from public.xpace_class_groups g
    where g.id = new.class_group_id and g.tenant_company_id = new.tenant_company_id;
  perform pg_advisory_xact_lock(hashtextextended(new.tenant_company_id::text || ':' || lead_mobile, 0));
  select count(*), count(*) filter (
    where lower(btrim(coalesce(nullif(a.modality_name_snapshot, ''), g.modality, ''))) = requested_modality
  ) into used_trials, repeated_modality
  from public.xpace_lead_appointments a
  join public.xpace_leads l on l.id = a.lead_id
  left join public.xpace_class_groups g on g.id = a.class_group_id and g.tenant_company_id = a.tenant_company_id
  where a.tenant_company_id = new.tenant_company_id
    and l.tenant_company_id = new.tenant_company_id and l.mobile = lead_mobile
    and a.booking_kind = 'NOVO' and a.attendance_status not in ('CANCELADO', 'FALTOU')
    and a.id <> new.id;
  if used_trials >= 2 then raise exception 'XPACE_TRIAL_LIMIT_REQUIRES_FEE'; end if;
  if requested_modality <> '' and repeated_modality > 0 then
    raise exception 'XPACE_TRIAL_MODALITY_ALREADY_USED';
  end if;
  return new;
end;
$$;

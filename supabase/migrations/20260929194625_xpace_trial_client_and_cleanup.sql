-- Keep sent teacher notices as audit history when their appointment is removed.
-- The company guard validates live references and new teacher messages.
alter table public.xpace_message_outbox drop constraint if exists xpace_message_outbox_teacher_context_check;

create function private.xpace_require_teacher_message_context()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.kind = 'AVISO_PROFESSOR' and (new.appointment_id is null or new.instructor_id is null) then
    raise exception 'XPACE_TEACHER_MESSAGE_CONTEXT_REQUIRED';
  end if;
  return new;
end;
$$;
create trigger xpace_teacher_message_insert_guard
before insert on public.xpace_message_outbox
for each row execute function private.xpace_require_teacher_message_context();

alter table public.xpace_leads
  add column linked_student_id uuid references public.xpace_people(id) on delete set null;

create index xpace_leads_company_linked_student_idx
  on public.xpace_leads(tenant_company_id, linked_student_id)
  where linked_student_id is not null;

create function private.xpace_check_lead_linked_student()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.linked_student_id is not null and not exists (
    select 1 from public.xpace_people p
    where p.id = new.linked_student_id
      and p.tenant_company_id = new.tenant_company_id
      and p.is_student and p.active
  ) then
    raise exception 'XPACE_LINKED_STUDENT_WRONG_COMPANY';
  end if;
  return new;
end;
$$;

create trigger xpace_lead_linked_student_guard
before insert or update of linked_student_id, tenant_company_id
on public.xpace_leads for each row execute function private.xpace_check_lead_linked_student();

create or replace function private.enforce_xpace_trial_lesson_limit()
returns trigger language plpgsql set search_path = '' as $$
declare
  lead_mobile text;
  used_trials integer;
  repeated_modality integer;
  requested_modality text;
begin
  if new.booking_kind <> 'NOVO' or new.attendance_status = 'CANCELADO' then
    return new;
  end if;
  -- Historical bookings are not revalidated merely because attendance changes.
  if tg_op = 'UPDATE'
    and old.booking_kind = 'NOVO' and old.attendance_status <> 'CANCELADO'
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
    into requested_modality
    from public.xpace_class_groups g
    where g.id = new.class_group_id and g.tenant_company_id = new.tenant_company_id;

  perform pg_advisory_xact_lock(hashtextextended(new.tenant_company_id::text || ':' || lead_mobile, 0));
  select count(*), count(*) filter (
    where lower(btrim(coalesce(nullif(a.modality_name_snapshot, ''), g.modality, ''))) = requested_modality
  ) into used_trials, repeated_modality
  from public.xpace_lead_appointments a
  join public.xpace_leads l on l.id = a.lead_id
  left join public.xpace_class_groups g on g.id = a.class_group_id and g.tenant_company_id = a.tenant_company_id
  where a.tenant_company_id = new.tenant_company_id
    and l.tenant_company_id = new.tenant_company_id
    and l.mobile = lead_mobile
    and a.booking_kind = 'NOVO'
    and a.attendance_status <> 'CANCELADO'
    and a.id <> new.id;

  if used_trials >= 2 then raise exception 'XPACE_TRIAL_LIMIT_REQUIRES_FEE'; end if;
  if requested_modality <> '' and repeated_modality > 0 then
    raise exception 'XPACE_TRIAL_MODALITY_ALREADY_USED';
  end if;
  return new;
end;
$$;

drop trigger xpace_lead_trial_lesson_limit_guard on public.xpace_lead_appointments;
create trigger xpace_lead_trial_lesson_limit_guard
before insert or update of lead_id, booking_kind, attendance_status, trial_limit_override, modality_name_snapshot, class_group_id
on public.xpace_lead_appointments for each row execute function private.enforce_xpace_trial_lesson_limit();

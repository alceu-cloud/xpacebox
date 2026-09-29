-- Synthetic companies only; no real appointments, customers or messages.
begin;
do $$
declare
  fixture_company uuid := gen_random_uuid(); other_company uuid := gen_random_uuid();
  fixture_group uuid := gen_random_uuid(); fixture_schedule uuid := gen_random_uuid();
  other_group uuid := gen_random_uuid(); other_schedule uuid := gen_random_uuid();
  pending_id uuid; attended_id uuid; cancelled_id uuid; next_day_id uuid;
  first_number bigint; blocked boolean := false; n integer;
begin
  insert into public.companies(id,name,slug) values
    (fixture_company,'TESTE VIRADA','test-midnight-'||fixture_company),
    (other_company,'TESTE OUTRA EMPRESA','test-midnight-'||other_company);
  insert into public.xpace_class_groups(id,tenant_company_id,name,settings) values
    (fixture_group,fixture_company,'TURMA TESTE','{"allowLeads":true}'),
    (other_group,other_company,'TURMA TESTE','{"allowLeads":true}');
  insert into public.xpace_class_schedules(id,tenant_company_id,class_group_id,weekday,starts_at,ends_at,settings) values
    (fixture_schedule,fixture_company,fixture_group,2,'19:00','20:00','{"allowLeads":true}'),
    (other_schedule,other_company,other_group,2,'19:00','20:00','{"allowLeads":true}');
  select least(coalesce(min(lead_number),0),0)-1 into first_number from public.xpace_leads;
  insert into public.xpace_leads(id,lead_number,tenant_company_id,full_name) overriding system value
    select gen_random_uuid(),first_number-row_number() over(),fixture_company,label
    from unnest(array['TESTE PENDENTE','TESTE CONFIRMADO','TESTE PRESENTE','TESTE CANCELADO',
      'TESTE NAO INFORMADO','TESTE HOJE','TESTE FUTURO','TESTE HISTORICO','TESTE SEM HORARIO']) label;
  insert into public.xpace_leads(id,lead_number,tenant_company_id,full_name) overriding system value
    values(gen_random_uuid(),first_number-10,other_company,'TESTE OUTRA EMPRESA');
  insert into public.xpace_lead_appointments(tenant_company_id,lead_id,class_group_id,class_schedule_id,scheduled_on,
    booking_kind,attendance_status,confirmation_status,enrollment_outcome,attended_at)
  select l.tenant_company_id,l.id,
    case when l.full_name='TESTE SEM HORARIO' then null when l.tenant_company_id=other_company then other_group else fixture_group end,
    case when l.full_name='TESTE SEM HORARIO' then null when l.tenant_company_id=other_company then other_schedule else fixture_schedule end,
    case l.full_name when 'TESTE HISTORICO' then '2099-09-28'::date when 'TESTE HOJE' then '2099-09-30'::date
      when 'TESTE FUTURO' then '2099-10-01'::date else '2099-09-29'::date end,
    case when l.full_name='TESTE PENDENTE' then 'NOVO' else 'RECUPERACAO' end,
    case l.full_name when 'TESTE PRESENTE' then 'COMPARECEU' when 'TESTE CANCELADO' then 'CANCELADO'
      when 'TESTE NAO INFORMADO' then 'NAO_INFORMADO' else 'AGENDADO' end,
    case l.full_name when 'TESTE CONFIRMADO' then 'CONFIRMADO' else 'PENDENTE' end,
    'PENDENTE',case when l.full_name='TESTE PRESENTE' then '2099-09-29 22:00:00+00'::timestamptz else null end
  from public.xpace_leads l where l.tenant_company_id in (fixture_company,other_company);

  select a.id into pending_id from public.xpace_lead_appointments a join public.xpace_leads l on l.id=a.lead_id
    where l.tenant_company_id=fixture_company and l.full_name='TESTE PENDENTE';
  select a.id into attended_id from public.xpace_lead_appointments a join public.xpace_leads l on l.id=a.lead_id
    where l.tenant_company_id=fixture_company and l.full_name='TESTE PRESENTE';
  select a.id into cancelled_id from public.xpace_lead_appointments a join public.xpace_leads l on l.id=a.lead_id
    where l.tenant_company_id=fixture_company and l.full_name='TESTE CANCELADO';
  select a.id into next_day_id from public.xpace_lead_appointments a join public.xpace_leads l on l.id=a.lead_id
    where l.tenant_company_id=fixture_company and l.full_name='TESTE HOJE';

  -- UTC already changed, but São Paulo is still 23:59:59: no premature absence.
  n := private.xpace_close_unmarked_trial_attendance(fixture_company,'2099-09-29','2099-09-30 02:59:59+00');
  if n<>0 then raise exception 'Premature UTC cutoff'; end if;
  update public.xpace_class_groups set active=false where id=fixture_group;
  update public.xpace_class_schedules set active=false where id=fixture_schedule;
  n := private.xpace_close_unmarked_trial_attendance(fixture_company,'2099-09-29','2099-09-30 03:00:00+00');
  if n<>2 then raise exception 'Expected two auto-absences, got %',n; end if;
  if (select attendance_status from public.xpace_lead_appointments where id=pending_id)<>'FALTOU' then raise exception 'Pending attendance unchanged'; end if;
  if (select attendance_status from public.xpace_lead_appointments where id=attended_id)<>'COMPARECEU' then raise exception 'Present overwritten'; end if;
  if (select attendance_status from public.xpace_lead_appointments where id=cancelled_id)<>'CANCELADO' then raise exception 'Cancellation overwritten'; end if;
  if not exists(select 1 from public.xpace_lead_appointments a join public.xpace_leads l on l.id=a.lead_id
    where a.tenant_company_id=fixture_company and l.full_name='TESTE NAO INFORMADO' and a.attendance_status='NAO_INFORMADO') then raise exception 'Historical unknown status overwritten'; end if;
  if not exists(select 1 from public.xpace_lead_appointments a join public.xpace_leads l on l.id=a.lead_id
    where a.tenant_company_id=fixture_company and l.full_name='TESTE CONFIRMADO'
      and a.confirmation_status='CONFIRMADO' and a.attendance_status='FALTOU') then raise exception 'Confirmation must not imply presence'; end if;
  if (select attended_at from public.xpace_lead_appointments where id=attended_id)<>'2099-09-29 22:00:00+00'::timestamptz then raise exception 'Presence timestamp overwritten'; end if;
  if (select count(*) from public.xpace_lead_activities where tenant_company_id=fixture_company
      and payload->>'source'='MIDNIGHT_AUTO_ABSENCE' and created_by is null)<>2 then raise exception 'Missing automatic audit'; end if;
  if exists(select 1 from public.xpace_lead_appointments a join public.xpace_leads l on l.id=a.lead_id
    where a.tenant_company_id=fixture_company and l.full_name in('TESTE HOJE','TESTE FUTURO','TESTE HISTORICO','TESTE SEM HORARIO')
      and a.attendance_status<>'AGENDADO') then raise exception 'Future/history/unlinked changed'; end if;
  if exists(select 1 from public.xpace_lead_appointments where tenant_company_id=other_company and attendance_status<>'AGENDADO') then raise exception 'Other company changed'; end if;
  if exists(select 1 from public.xpace_lead_appointments where tenant_company_id=fixture_company and enrollment_outcome<>'PENDENTE') then raise exception 'Enrollment changed'; end if;
  if exists(select 1 from public.xpace_leads where tenant_company_id=fixture_company and pipeline_stage<>'NOVO') then raise exception 'Pipeline changed'; end if;
  n := private.xpace_close_unmarked_trial_attendance(fixture_company,'2099-09-29','2099-09-30 03:01:00+00');
  if n<>0 or (select count(*) from public.xpace_lead_activities where tenant_company_id=fixture_company)<>2 then raise exception 'Retry duplicated audit'; end if;

  -- Human correction is allowed even after a group is archived/over capacity.
  update public.xpace_lead_appointments set attendance_status='COMPARECEU',attended_at='2099-09-30 10:00:00+00' where id=pending_id;
  n := private.xpace_close_unmarked_trial_attendance(fixture_company,'2099-09-29','2099-10-01 03:05:00+00');
  if n<>1 or (select attendance_status from public.xpace_lead_appointments where id=next_day_id)<>'FALTOU' then raise exception 'Catch-up failed'; end if;
  if (select attendance_status from public.xpace_lead_appointments where id=pending_id)<>'COMPARECEU' then raise exception 'Correction overwritten'; end if;

  -- The capacity guard still blocks reactivation/new allocations and rescheduling.
  begin
    update public.xpace_lead_appointments set attendance_status='AGENDADO' where id=cancelled_id;
  exception when others then
    if sqlerrm<>'XPACE_GRADE_INDISPONIVEL' then raise; end if; blocked:=true;
  end;
  if not blocked then raise exception 'Inactive group accepts reactivation'; end if;
  update public.xpace_class_groups set active=true where id=fixture_group;
  update public.xpace_class_schedules set active=true,capacity=1 where id=fixture_schedule;
  blocked:=false;
  begin
    update public.xpace_lead_appointments set attendance_status='AGENDADO' where id=cancelled_id;
  exception when others then
    if sqlerrm<>'XPACE_LEAD_SLOT_UNAVAILABLE' then raise; end if; blocked:=true;
  end;
  if not blocked then raise exception 'Over-capacity reactivation allowed'; end if;
  blocked:=false;
  begin
    update public.xpace_lead_appointments set scheduled_on='2099-09-29' where id=next_day_id;
  exception when others then
    if sqlerrm<>'XPACE_LEAD_SLOT_UNAVAILABLE' then raise; end if; blocked:=true;
  end;
  if not blocked then raise exception 'Over-capacity rescheduling allowed'; end if;
  blocked:=false;
  begin
    insert into public.xpace_lead_appointments(tenant_company_id,lead_id,class_group_id,class_schedule_id,scheduled_on,booking_kind)
      select fixture_company,lead_id,fixture_group,fixture_schedule,'2099-09-29','RECUPERACAO'
      from public.xpace_lead_appointments where id=next_day_id;
  exception when others then
    if sqlerrm<>'XPACE_LEAD_SLOT_UNAVAILABLE' then raise; end if; blocked:=true;
  end;
  if not blocked then raise exception 'Over-capacity new booking allowed'; end if;
  if has_function_privilege('anon','private.xpace_close_unmarked_trial_attendance(uuid,date,timestamptz)','execute')
    or has_function_privilege('authenticated','private.xpace_close_unmarked_trial_attendance(uuid,date,timestamptz)','execute')
    or has_function_privilege('service_role','private.xpace_close_unmarked_trial_attendance(uuid,date,timestamptz)','execute') then
    raise exception 'Internal routine exposed';
  end if;
end;
$$;
rollback;

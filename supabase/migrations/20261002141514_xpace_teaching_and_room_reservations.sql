alter table public.xpace_instructors add column lesson_rate_cents integer check(lesson_rate_cents>=0);
alter table public.xpace_rooms add column hourly_rate_cents integer not null default 3500 check(hourly_rate_cents>=0),
  add column attendance_token uuid not null default gen_random_uuid();
alter table public.xpace_class_schedules add column teaching_enabled boolean not null default false,
  add column teaching_from date, add column teaching_until date;
create table public.xpace_teacher_access (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  instructor_id uuid not null references public.xpace_instructors(id) on delete cascade,
  active boolean not null default true,
  unique(tenant_company_id,instructor_id)
);
create table public.xpace_teaching_months (
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  month date not null check(extract(day from month)=1),
  reviewed_at timestamptz, reviewed_by uuid references public.profiles(id),
  primary key(tenant_company_id,month)
);
create table public.xpace_teaching_lessons (
  id uuid primary key default gen_random_uuid(),
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  schedule_id uuid not null references public.xpace_class_schedules(id),
  scheduled_on date not null,
  starts_at time not null, ends_at time not null check(ends_at>starts_at),
  class_name text not null,
  room_id uuid not null references public.xpace_rooms(id),room_name text not null,
  instructor_id uuid not null references public.xpace_instructors(id),instructor_name text not null,
  status text not null default 'PREVISTA' check(status in ('PREVISTA','REALIZADA','CANCELADA')),
  rate_cents integer check(rate_cents>=0),
  rate_override boolean not null default false,
  confirmed_at timestamptz, confirmed_by uuid references public.profiles(id),
  confirmation_source text check(confirmation_source in ('EQUIPE','PROFESSOR','QR')),
  note text not null default '',updated_at timestamptz not null default now(),
  unique(tenant_company_id,schedule_id,scheduled_on)
);
create index xpace_teaching_lessons_period on public.xpace_teaching_lessons(tenant_company_id,scheduled_on,instructor_id);
alter table public.xpace_room_rentals add column room_id uuid references public.xpace_rooms(id),
  add column instructor_id uuid references public.xpace_instructors(id),
  add column hourly_rate_cents integer check(hourly_rate_cents>=0),
  add column request_id uuid unique,
  add column cancellation_charge_cents integer check(cancellation_charge_cents>=0),
  add column cancellation_decided_by uuid references public.profiles(id),
  add column cancellation_reason text;
create table public.xpace_teaching_audit (
  id uuid primary key default gen_random_uuid(),tenant_company_id uuid not null references public.companies(id),
  actor_id uuid references public.profiles(id),entity_id uuid,action text not null,
  before_value jsonb,after_value jsonb,reason text,created_at timestamptz not null default now()
);
alter table public.xpace_teacher_access enable row level security;
alter table public.xpace_teaching_months enable row level security;
alter table public.xpace_teaching_lessons enable row level security;
alter table public.xpace_teaching_audit enable row level security;
revoke all on public.xpace_teacher_access,public.xpace_teaching_months,public.xpace_teaching_lessons,public.xpace_teaching_audit from anon,authenticated;
grant all on public.xpace_teacher_access,public.xpace_teaching_months,public.xpace_teaching_lessons,public.xpace_teaching_audit to service_role;

create function public.xpace_prepare_teaching_month(p_company uuid,p_month date)
returns void language plpgsql security invoker set search_path='' as $$
begin
  if extract(day from p_month)<>1 then raise exception 'MONTH_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended('teaching:'||p_company::text||':'||p_month::text,0));
  insert into public.xpace_teaching_months(tenant_company_id,month) values(p_company,p_month) on conflict do nothing;
  if exists(select 1 from public.xpace_teaching_months where tenant_company_id=p_company and month=p_month and reviewed_at is not null) then return; end if;
  insert into public.xpace_teaching_lessons(tenant_company_id,schedule_id,scheduled_on,starts_at,ends_at,class_name,room_id,room_name,instructor_id,instructor_name)
  select p_company,s.id,d::date,s.starts_at,s.ends_at,g.name,r.id,r.name,i.id,i.full_name
  from public.xpace_class_schedules s
  join public.xpace_class_groups g on g.id=s.class_group_id and g.tenant_company_id=p_company and g.active
  join public.xpace_rooms r on r.id=s.room_id and r.tenant_company_id=p_company and r.active
  join public.xpace_instructors i on i.id=s.instructor_id and i.tenant_company_id=p_company and i.active
  cross join generate_series(p_month::timestamp,(p_month+interval '1 month - 1 day')::timestamp,interval '1 day') d
  where s.tenant_company_id=p_company and s.active and s.teaching_enabled and s.teaching_from is not null
    and d::date>=s.teaching_from and (s.teaching_until is null or d::date<=s.teaching_until)
    and extract(dow from d)=s.weekday
  on conflict(tenant_company_id,schedule_id,scheduled_on) do nothing;
end $$;

-- One tenant lock is deliberately shared by all schedule and rental mutations:
-- this also protects old rental/grade screens from races with the teacher app.
create function private.xpace_room_booking_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare local_start timestamp;local_end timestamp;begin
  perform pg_advisory_xact_lock(hashtextextended('rooms:'||new.tenant_company_id::text,0));
  if new.status='CANCELADA' then return new;end if;
  if new.room_id is not null then
    select name into new.room_name from public.xpace_rooms where id=new.room_id and tenant_company_id=new.tenant_company_id and active;
    if not found then raise exception 'ROOM_INVALID';end if;
  end if;
  local_start:=new.starts_at at time zone 'America/Sao_Paulo';local_end:=new.ends_at at time zone 'America/Sao_Paulo';
  if exists(select 1 from public.xpace_room_rentals r where r.tenant_company_id=new.tenant_company_id and r.id is distinct from new.id
    and lower(btrim(r.room_name))=lower(btrim(new.room_name)) and r.status<>'CANCELADA' and r.starts_at<new.ends_at and r.ends_at>new.starts_at)
    or exists(select 1 from public.xpace_class_schedules s join public.xpace_class_groups g on g.id=s.class_group_id and g.active
    cross join generate_series(local_start::date::timestamp,local_end::date::timestamp,interval '1 day') d
    where s.tenant_company_id=new.tenant_company_id and s.active and extract(dow from d)=s.weekday
      and (s.room_id=new.room_id or lower(btrim(s.room_name))=lower(btrim(new.room_name)))
      and (not s.teaching_enabled or (d::date>=s.teaching_from and (s.teaching_until is null or d::date<=s.teaching_until)))
      and not exists(select 1 from public.xpace_teaching_lessons cancelled where cancelled.tenant_company_id=new.tenant_company_id and cancelled.schedule_id=s.id and cancelled.scheduled_on=d::date and cancelled.status='CANCELADA')
      and d::date+s.starts_at<local_end and d::date+s.ends_at>local_start)
    or exists(select 1 from public.xpace_teaching_lessons l where l.tenant_company_id=new.tenant_company_id and l.status<>'CANCELADA'
      and (l.room_id=new.room_id or lower(btrim(l.room_name))=lower(btrim(new.room_name)))
      and l.scheduled_on+l.starts_at<local_end and l.scheduled_on+l.ends_at>local_start) then
    raise exception 'CONFLITO DE SALA NESTE HORÁRIO' using errcode='23P01';
  end if;return new;
end $$;
create trigger xpace_teacher_room_booking_guard before insert or update of room_id,room_name,starts_at,ends_at,status on public.xpace_room_rentals for each row execute function private.xpace_room_booking_guard();
create function private.xpace_schedule_rental_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('rooms:'||new.tenant_company_id::text,0));
  if new.active and exists(select 1 from public.xpace_room_rentals r
    cross join generate_series((r.starts_at at time zone 'America/Sao_Paulo')::date::timestamp,(r.ends_at at time zone 'America/Sao_Paulo')::date::timestamp,interval '1 day') d
    where r.tenant_company_id=new.tenant_company_id and r.status<>'CANCELADA' and extract(dow from d)=new.weekday
      and (new.room_id=r.room_id or lower(btrim(new.room_name))=lower(btrim(r.room_name)))
      and (not new.teaching_enabled or (d::date>=new.teaching_from and (new.teaching_until is null or d::date<=new.teaching_until)))
      and (d::date+new.starts_at) at time zone 'America/Sao_Paulo'<r.ends_at
      and (d::date+new.ends_at) at time zone 'America/Sao_Paulo'>r.starts_at) then
    raise exception 'CONFLITO COM RESERVA DE SALA' using errcode='23P01';end if;return new;
end $$;
-- Alphabetic trigger order puts the tenant lock before the legacy conflict guard.
create trigger xpace_a_schedule_rental_guard before insert or update on public.xpace_class_schedules for each row execute function private.xpace_schedule_rental_guard();

create function public.xpace_create_teaching_grade(p_company uuid,p_actor uuid,p_title text,p_instructor uuid,p_room uuid,p_days integer[],p_start time,p_end time,p_from date)
returns uuid language plpgsql security invoker set search_path='' as $$
declare group_id uuid;day_of_week integer;room_title text;begin
  perform pg_advisory_xact_lock(hashtextextended('rooms:'||p_company::text,0));
  if length(btrim(p_title)) not between 1 and 120 or cardinality(p_days) not between 1 and 7 or p_end<=p_start or p_from<(now() at time zone 'America/Sao_Paulo')::date
    or not exists(select 1 from public.xpace_instructors where id=p_instructor and tenant_company_id=p_company and active) then raise exception 'GRADE_INVALID';end if;
  select name into room_title from public.xpace_rooms where id=p_room and tenant_company_id=p_company and active;
  if not found then raise exception 'ROOM_INVALID';end if;
  insert into public.xpace_class_groups(tenant_company_id,name,modality,created_by,updated_by) values(p_company,btrim(p_title),btrim(p_title),p_actor,p_actor) returning id into group_id;
  foreach day_of_week in array p_days loop
    if day_of_week not between 0 and 6 then raise exception 'WEEKDAY_INVALID';end if;
    insert into public.xpace_class_schedules(tenant_company_id,class_group_id,weekday,starts_at,ends_at,room_id,room_name,instructor_id,teaching_enabled,teaching_from,created_by)
      values(p_company,group_id,day_of_week,p_start,p_end,p_room,room_title,p_instructor,true,p_from,p_actor);
  end loop;
  return group_id;
end $$;

create function public.xpace_change_teaching_lesson(p_company uuid,p_actor uuid,p_lesson uuid,p_status text,p_instructor uuid,p_rate integer,p_override boolean,p_note text,p_teacher uuid default null,p_qr uuid default null)
returns void language plpgsql security invoker set search_path='' as $$
declare l public.xpace_teaching_lessons;person public.xpace_instructors;month_date date;begin
  select * into l from public.xpace_teaching_lessons where id=p_lesson and tenant_company_id=p_company;
  if not found then raise exception 'LESSON_NOT_FOUND';end if;
  month_date:=date_trunc('month',l.scheduled_on)::date;
  perform pg_advisory_xact_lock(hashtextextended('teaching:'||p_company::text||':'||month_date::text,0));
  select * into l from public.xpace_teaching_lessons where id=p_lesson and tenant_company_id=p_company for update;
  if exists(select 1 from public.xpace_teaching_months where tenant_company_id=p_company and month=month_date and reviewed_at is not null) then raise exception 'MONTH_CLOSED';end if;
  if p_teacher is not null then
    if not exists(select 1 from public.xpace_teacher_access a join public.profiles p on p.id=a.profile_id where a.profile_id=p_actor and a.tenant_company_id=p_company and a.instructor_id=p_teacher and a.active and p.active and p.platform_role='company_teacher')
      or l.instructor_id<>p_teacher or p_status<>'REALIZADA' or p_instructor<>p_teacher then raise exception 'TEACHER_FORBIDDEN';end if;
    if l.status='REALIZADA' then return;end if;
    if l.status='CANCELADA' or now()<((l.scheduled_on+l.starts_at) at time zone 'America/Sao_Paulo')-interval '15 minutes'
      or now()>((l.scheduled_on+l.ends_at) at time zone 'America/Sao_Paulo')+interval '30 minutes' then raise exception 'ATTENDANCE_WINDOW_CLOSED';end if;
    if p_qr is not null and not exists(select 1 from public.xpace_rooms where id=l.room_id and tenant_company_id=p_company and attendance_token=p_qr and active) then raise exception 'ROOM_QR_INVALID';end if;
    p_override:=l.rate_override;p_rate:=l.rate_cents;p_note:=l.note;
  end if;
  if p_status not in ('PREVISTA','REALIZADA','CANCELADA') or (p_rate is not null and p_rate<0) then raise exception 'LESSON_INVALID';end if;
  select * into person from public.xpace_instructors where id=p_instructor and tenant_company_id=p_company and active;
  if not found then raise exception 'INSTRUCTOR_INVALID';end if;
  perform pg_advisory_xact_lock(hashtextextended('rooms:'||p_company::text,0));
  if p_status<>'CANCELADA' and (
    exists(select 1 from public.xpace_room_rentals r where r.tenant_company_id=p_company and r.status<>'CANCELADA'
      and (r.room_id=l.room_id or lower(btrim(r.room_name))=lower(btrim(l.room_name)))
      and r.starts_at<((l.scheduled_on+l.ends_at) at time zone 'America/Sao_Paulo') and r.ends_at>((l.scheduled_on+l.starts_at) at time zone 'America/Sao_Paulo'))
    or exists(select 1 from public.xpace_teaching_lessons other where other.tenant_company_id=p_company and other.id<>l.id and other.scheduled_on=l.scheduled_on and other.instructor_id=p_instructor and other.status<>'CANCELADA' and other.starts_at<l.ends_at and other.ends_at>l.starts_at)
    or exists(select 1 from public.xpace_class_schedules s join public.xpace_class_groups g on g.id=s.class_group_id and g.active
      where s.tenant_company_id=p_company and s.active and s.id<>l.schedule_id and s.instructor_id=p_instructor and s.weekday=extract(dow from l.scheduled_on)
        and s.starts_at<l.ends_at and s.ends_at>l.starts_at
        and (not s.teaching_enabled or (l.scheduled_on>=s.teaching_from and (s.teaching_until is null or l.scheduled_on<=s.teaching_until)))
        and not exists(select 1 from public.xpace_teaching_lessons materialized where materialized.tenant_company_id=p_company and materialized.schedule_id=s.id and materialized.scheduled_on=l.scheduled_on))
  ) then raise exception 'CONFLITO DE SALA OU PROFESSOR' using errcode='23P01';end if;
  -- Full lesson rate; duration does not prorate this amount. Unset is not free.
  if p_status='REALIZADA' and not p_override then
    p_rate:=case when l.status='REALIZADA' and l.instructor_id=p_instructor then l.rate_cents else person.lesson_rate_cents end;
  end if;
  update public.xpace_teaching_lessons set status=p_status,instructor_id=person.id,instructor_name=person.full_name,rate_cents=p_rate,rate_override=p_override,
    confirmed_at=case when p_status='REALIZADA' then coalesce(l.confirmed_at,now()) end,confirmed_by=case when p_status='REALIZADA' then p_actor end,
    confirmation_source=case when p_status='REALIZADA' then case when p_qr is not null then 'QR' when p_teacher is not null then 'PROFESSOR' else 'EQUIPE' end end,
    note=left(coalesce(p_note,''),500),updated_at=now() where id=p_lesson;
  insert into public.xpace_teaching_audit(tenant_company_id,actor_id,entity_id,action,before_value,after_value)
    select p_company,p_actor,p_lesson,'AULA_ATUALIZADA',to_jsonb(l),to_jsonb(updated) from public.xpace_teaching_lessons updated where id=p_lesson;
end $$;

create function public.xpace_review_teaching_month(p_company uuid,p_actor uuid,p_month date,p_reopen boolean,p_reason text)
returns void language plpgsql security invoker set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('teaching:'||p_company::text||':'||p_month::text,0));
  if p_reopen and length(btrim(coalesce(p_reason,'')))<3 then raise exception 'REASON_REQUIRED';end if;
  if not p_reopen and exists(select 1 from public.xpace_teaching_lessons where tenant_company_id=p_company and date_trunc('month',scheduled_on)::date=p_month and status='REALIZADA' and rate_cents is null) then raise exception 'MISSING_LESSON_RATE';end if;
  update public.xpace_teaching_months set reviewed_at=case when p_reopen then null else now() end,reviewed_by=case when p_reopen then null else p_actor end where tenant_company_id=p_company and month=p_month;
  if not found then raise exception 'MONTH_NOT_FOUND';end if;
  insert into public.xpace_teaching_audit(tenant_company_id,actor_id,action,reason) values(p_company,p_actor,case when p_reopen then 'MES_REABERTO' else 'MES_CONFERIDO' end,p_month::text||' '||coalesce(p_reason,''));
end $$;

create function public.xpace_reserve_teacher_room(p_company uuid,p_actor uuid,p_instructor uuid,p_room uuid,p_start timestamptz,p_end timestamptz,p_request uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare r public.xpace_rooms;teacher_name text;reservation public.xpace_room_rentals;reservation_id uuid;minutes numeric;begin
  perform pg_advisory_xact_lock(hashtextextended('rooms:'||p_company::text,0));
  select * into reservation from public.xpace_room_rentals where request_id=p_request;
  if found then
    if reservation.tenant_company_id<>p_company or reservation.created_by<>p_actor or reservation.instructor_id<>p_instructor or reservation.room_id<>p_room or reservation.starts_at<>p_start or reservation.ends_at<>p_end then raise exception 'RESERVATION_REPLAY_MISMATCH';end if;
    return reservation.id;
  end if;
  select * into r from public.xpace_rooms where id=p_room and tenant_company_id=p_company and active;
  if not found then raise exception 'ROOM_INVALID';end if;
  select full_name into teacher_name from public.xpace_instructors where id=p_instructor and tenant_company_id=p_company and active;
  if not found then raise exception 'INSTRUCTOR_INVALID';end if;
  minutes:=extract(epoch from p_end-p_start)/60;
  if minutes<=0 or minutes>720 or minutes<>trunc(minutes) or p_start<now() or p_start>now()+interval '366 days'
    or (p_start at time zone 'America/Sao_Paulo')::date<>(p_end at time zone 'America/Sao_Paulo')::date then raise exception 'RESERVATION_INVALID';end if;
  insert into public.xpace_room_rentals(tenant_company_id,room_id,room_name,instructor_id,renter_name,starts_at,ends_at,amount_cents,hourly_rate_cents,created_by,request_id)
    values(p_company,p_room,r.name,p_instructor,teacher_name,p_start,p_end,round(minutes*r.hourly_rate_cents/60),r.hourly_rate_cents,p_actor,p_request) returning id into reservation_id;
  return reservation_id;
end $$;

revoke all on function public.xpace_prepare_teaching_month(uuid,date),public.xpace_create_teaching_grade(uuid,uuid,text,uuid,uuid,integer[],time,time,date),
  public.xpace_change_teaching_lesson(uuid,uuid,uuid,text,uuid,integer,boolean,text,uuid,uuid),public.xpace_review_teaching_month(uuid,uuid,date,boolean,text),
  public.xpace_reserve_teacher_room(uuid,uuid,uuid,uuid,timestamptz,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.xpace_prepare_teaching_month(uuid,date),public.xpace_create_teaching_grade(uuid,uuid,text,uuid,uuid,integer[],time,time,date),
  public.xpace_change_teaching_lesson(uuid,uuid,uuid,text,uuid,integer,boolean,text,uuid,uuid),public.xpace_review_teaching_month(uuid,uuid,date,boolean,text),
  public.xpace_reserve_teacher_room(uuid,uuid,uuid,uuid,timestamptz,timestamptz,uuid) to service_role;
revoke all on function private.xpace_room_booking_guard(),private.xpace_schedule_rental_guard() from public,anon,authenticated;

create function public.xpace_cancel_teacher_reservation(p_company uuid,p_actor uuid,p_id uuid,p_teacher uuid,p_charge integer,p_decision boolean,p_reason text)
returns void language plpgsql security invoker set search_path='' as $$
declare rental public.xpace_room_rentals;begin
  perform pg_advisory_xact_lock(hashtextextended('rooms:'||p_company::text,0));
  select * into rental from public.xpace_room_rentals where id=p_id and tenant_company_id=p_company for update;
  if not found or (p_teacher is not null and rental.instructor_id is distinct from p_teacher) then raise exception 'RESERVATION_NOT_FOUND';end if;
  if length(btrim(coalesce(p_reason,'')))<3 then raise exception 'REASON_REQUIRED';end if;
  if p_decision then
    if p_teacher is not null or rental.status<>'CANCELADA' or p_charge is null or p_charge<0 then raise exception 'CANCELLATION_INVALID';end if;
    update public.xpace_room_rentals set cancellation_charge_cents=p_charge,cancellation_decided_by=p_actor,cancellation_reason=left(p_reason,500),updated_at=now() where id=p_id;
  else
    if rental.status='CANCELADA' then return;end if;
    update public.xpace_room_rentals set status='CANCELADA',cancellation_reason=left(p_reason,500),updated_at=now() where id=p_id;
  end if;
  insert into public.xpace_teaching_audit(tenant_company_id,actor_id,entity_id,action,before_value,after_value,reason)
    select p_company,p_actor,p_id,case when p_decision then 'COBRANCA_CANCELAMENTO' else 'RESERVA_CANCELADA' end,to_jsonb(rental),to_jsonb(updated),p_reason from public.xpace_room_rentals updated where id=p_id;
end $$;
revoke all on function public.xpace_cancel_teacher_reservation(uuid,uuid,uuid,uuid,integer,boolean,text) from public,anon,authenticated;
grant execute on function public.xpace_cancel_teacher_reservation(uuid,uuid,uuid,uuid,integer,boolean,text) to service_role;

-- A restricted teacher never inherits the broader membership-based table policies.
create function private.xpace_restricted_teacher_membership() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.active and exists(select 1 from public.profiles where id=new.profile_id and platform_role='company_teacher') then raise exception 'TEACHER_MEMBERSHIP_FORBIDDEN';end if;
  return new;
end $$;
create trigger xpace_restricted_teacher_membership_guard before insert or update on public.company_members for each row execute function private.xpace_restricted_teacher_membership();
revoke all on function private.xpace_restricted_teacher_membership() from public,anon,authenticated;

create function private.xpace_restrict_teacher_profile() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.platform_role='company_teacher' then update public.company_members set active=false where profile_id=new.id and active;end if;
  return new;
end $$;
create trigger xpace_restrict_teacher_profile_guard after insert or update of platform_role on public.profiles for each row execute function private.xpace_restrict_teacher_profile();
revoke all on function private.xpace_restrict_teacher_profile() from public,anon,authenticated;

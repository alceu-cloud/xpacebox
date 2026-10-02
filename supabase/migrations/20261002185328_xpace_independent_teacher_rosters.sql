-- Monthly teacher assignments are independent of enrollment/class schedules.
create table public.xpace_teaching_rosters (
 id uuid primary key default gen_random_uuid(),
 tenant_company_id uuid not null references public.companies(id),
 month date not null check(extract(day from month)=1),
 title text not null check(length(btrim(title)) between 1 and 120),
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 unique(tenant_company_id,month,title)
);
alter table public.xpace_teaching_rosters enable row level security;
revoke all on public.xpace_teaching_rosters from public,anon,authenticated,service_role;
grant select,insert on public.xpace_teaching_rosters to service_role;
create index xpace_teaching_rosters_month on public.xpace_teaching_rosters(tenant_company_id,month);
alter table public.xpace_teaching_lessons alter column schedule_id drop not null,
 alter column instructor_id drop not null;
alter table public.xpace_teaching_lessons add column roster_id uuid references public.xpace_teaching_rosters(id);
alter table public.xpace_teaching_lessons add constraint xpace_lesson_single_source
 check((schedule_id is not null and roster_id is null) or (schedule_id is null and roster_id is not null));
create unique index xpace_teacher_roster_day on public.xpace_teaching_lessons(tenant_company_id,roster_id,scheduled_on) where roster_id is not null;
create function public.xpace_create_teacher_roster(p_company uuid,p_actor uuid,p_month date,p_title text,p_instructor uuid,p_room uuid,p_days integer[],p_start time,p_end time)
returns uuid language plpgsql security invoker set search_path='' as $$
declare roster uuid;room_title text;person public.xpace_instructors;begin
 if p_month is null or p_title is null or p_days is null or p_start is null or p_end is null
  or extract(day from p_month)<>1 or p_month<'2020-01-01' or p_month>'2100-12-01' or length(btrim(p_title)) not between 1 and 120
  or cardinality(p_days) not between 1 and 7 or exists(select 1 from unnest(p_days) d where d not between 0 and 6 or d is null)
  or p_end<=p_start then raise exception 'ROSTER_INVALID';end if;
 perform pg_advisory_xact_lock(hashtextextended('teaching:'||p_company::text||':'||p_month::text,0));
 perform pg_advisory_xact_lock(hashtextextended('rosters:'||p_company::text,0));
 if exists(select 1 from public.xpace_teaching_months where tenant_company_id=p_company and month=p_month and reviewed_at is not null) then raise exception 'MONTH_CLOSED';end if;
 select name into room_title from public.xpace_rooms where id=p_room and tenant_company_id=p_company and active;
 if not found then raise exception 'ROOM_INVALID';end if;
 if p_instructor is not null then
  select * into person from public.xpace_instructors where id=p_instructor and tenant_company_id=p_company and active;
  if not found then raise exception 'INSTRUCTOR_INVALID';end if;
 end if;
 if p_instructor is not null and exists(select 1 from public.xpace_teaching_lessons l where l.tenant_company_id=p_company and l.roster_id is not null and l.instructor_id=p_instructor and l.status<>'CANCELADA'
  and l.scheduled_on>=p_month and l.scheduled_on<p_month+interval '1 month' and extract(dow from l.scheduled_on)=any(p_days) and l.starts_at<p_end and l.ends_at>p_start) then raise exception 'TEACHER_ROSTER_CONFLICT';end if;
 insert into public.xpace_teaching_months(tenant_company_id,month) values(p_company,p_month) on conflict do nothing;
 insert into public.xpace_teaching_rosters(tenant_company_id,month,title,created_by) values(p_company,p_month,btrim(p_title),p_actor) returning id into roster;
 insert into public.xpace_teaching_lessons(tenant_company_id,roster_id,scheduled_on,starts_at,ends_at,class_name,room_id,room_name,instructor_id,instructor_name)
 select p_company,roster,d::date,p_start,p_end,btrim(p_title),p_room,room_title,p_instructor,coalesce(person.full_name,'')
 from generate_series(p_month::timestamp,(p_month+interval '1 month - 1 day')::timestamp,interval '1 day') d
 where extract(dow from d)=any(p_days);
 insert into public.xpace_teaching_audit(tenant_company_id,actor_id,entity_id,action) values(p_company,p_actor,roster,'ESCALA_MENSAL_CRIADA');
 return roster;
end $$;
create function public.xpace_update_roster_lesson(p_company uuid,p_actor uuid,p_lesson uuid,p_status text,p_instructor uuid,p_room uuid,p_start time,p_end time,p_rate integer,p_override boolean,p_note text,p_teacher uuid default null,p_qr uuid default null)
returns void language plpgsql security invoker set search_path='' as $$
declare l public.xpace_teaching_lessons;person public.xpace_instructors;month_date date;room_title text;local_now timestamp;begin
 select * into l from public.xpace_teaching_lessons where id=p_lesson and tenant_company_id=p_company and roster_id is not null;
 if not found then raise exception 'LESSON_NOT_FOUND';end if;
 month_date:=date_trunc('month',l.scheduled_on)::date;
 perform pg_advisory_xact_lock(hashtextextended('teaching:'||p_company::text||':'||month_date::text,0));
 perform pg_advisory_xact_lock(hashtextextended('rosters:'||p_company::text,0));
 select * into l from public.xpace_teaching_lessons where id=p_lesson and tenant_company_id=p_company for update;
 if exists(select 1 from public.xpace_teaching_months where tenant_company_id=p_company and month=month_date and reviewed_at is not null) then raise exception 'MONTH_CLOSED';end if;
 if p_teacher is not null then
  if not exists(select 1 from public.xpace_teacher_access a join public.profiles p on p.id=a.profile_id where a.profile_id=p_actor and a.tenant_company_id=p_company and a.instructor_id=p_teacher and a.active and p.active and p.platform_role='company_teacher')
   or l.instructor_id is distinct from p_teacher or p_status<>'REALIZADA' or p_instructor is distinct from p_teacher then raise exception 'TEACHER_FORBIDDEN';end if;
  local_now:=now() at time zone 'America/Sao_Paulo';
  if l.status='CANCELADA' or local_now::date<>l.scheduled_on or local_now<l.scheduled_on+l.starts_at-interval '15 minutes'
   or local_now>l.scheduled_on+l.starts_at+interval '15 minutes' then raise exception 'ATTENDANCE_WINDOW_CLOSED';end if;
  if p_qr is not null and not exists(select 1 from public.xpace_rooms where id=l.room_id and tenant_company_id=p_company and attendance_token=p_qr and active) then raise exception 'ROOM_QR_INVALID';end if;
  if l.status='REALIZADA' then return;end if;
  p_room:=l.room_id;p_start:=l.starts_at;p_end:=l.ends_at;p_override:=l.rate_override;p_rate:=l.rate_cents;p_note:=l.note;
 end if;
 if p_status not in ('PREVISTA','REALIZADA','CANCELADA') or p_end<=p_start or p_room is null or p_start is null or p_end is null or (p_rate is not null and p_rate<0)
  or (p_status='REALIZADA' and p_instructor is null) then raise exception 'LESSON_INVALID';end if;
 select name into room_title from public.xpace_rooms where id=p_room and tenant_company_id=p_company and active;
 if not found then raise exception 'ROOM_INVALID';end if;
 if p_instructor is not null then
  select * into person from public.xpace_instructors where id=p_instructor and tenant_company_id=p_company and active;
  if not found then raise exception 'INSTRUCTOR_INVALID';end if;
 end if;
 -- This is a staffing check only. It never creates, alters or reads class schedules.
 if p_status<>'CANCELADA' and p_instructor is not null and exists(select 1 from public.xpace_teaching_lessons other where other.tenant_company_id=p_company and other.roster_id is not null and other.id<>l.id and other.scheduled_on=l.scheduled_on and other.instructor_id=p_instructor and other.status<>'CANCELADA' and other.starts_at<p_end and other.ends_at>p_start) then raise exception 'TEACHER_ROSTER_CONFLICT';end if;
 if p_status='REALIZADA' and not p_override then
  p_rate:=case when l.status='REALIZADA' and l.instructor_id=p_instructor then l.rate_cents else person.lesson_rate_cents end;
 elsif not p_override then p_rate:=null;end if;
 update public.xpace_teaching_lessons set status=p_status,instructor_id=p_instructor,instructor_name=coalesce(person.full_name,''),
  room_id=p_room,room_name=room_title,starts_at=p_start,ends_at=p_end,rate_cents=p_rate,rate_override=p_override,
  confirmed_at=case when p_status='REALIZADA' then coalesce(l.confirmed_at,now()) end,confirmed_by=case when p_status='REALIZADA' then p_actor end,
  confirmation_source=case when p_status='REALIZADA' then case when p_qr is not null then 'QR' when p_teacher is not null then 'PROFESSOR' else 'EQUIPE' end end,
  note=left(coalesce(p_note,''),500),updated_at=now() where id=p_lesson;
 insert into public.xpace_teaching_audit(tenant_company_id,actor_id,entity_id,action,before_value,after_value)
 select p_company,p_actor,p_lesson,'ESCALA_ATUALIZADA',to_jsonb(l),to_jsonb(updated) from public.xpace_teaching_lessons updated where id=p_lesson;
end $$;
revoke all on function public.xpace_create_teacher_roster(uuid,uuid,date,text,uuid,uuid,integer[],time,time),
 public.xpace_update_roster_lesson(uuid,uuid,uuid,text,uuid,uuid,time,time,integer,boolean,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.xpace_create_teacher_roster(uuid,uuid,date,text,uuid,uuid,integer[],time,time),
 public.xpace_update_roster_lesson(uuid,uuid,uuid,text,uuid,uuid,time,time,integer,boolean,text,uuid,uuid) to service_role;

-- Independent staffing entries do not create room occupation.
create or replace function private.xpace_room_booking_guard() returns trigger language plpgsql security invoker set search_path='' as $$
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
    or exists(select 1 from public.xpace_teaching_lessons l where l.tenant_company_id=new.tenant_company_id and l.schedule_id is not null and l.status<>'CANCELADA'
      and (l.room_id=new.room_id or lower(btrim(l.room_name))=lower(btrim(new.room_name)))
      and l.scheduled_on+l.starts_at<local_end and l.scheduled_on+l.ends_at>local_start) then
    raise exception 'CONFLITO DE SALA NESTE HORÁRIO' using errcode='23P01';
  end if;return new;
end $$;

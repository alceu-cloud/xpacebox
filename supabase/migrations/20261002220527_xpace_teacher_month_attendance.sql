-- Distinguish a teacher absence from cancellation; preserve historical rows.
alter table public.xpace_teaching_lessons drop constraint xpace_teaching_lessons_status_check;
alter table public.xpace_teaching_lessons add constraint xpace_teaching_lessons_status_check check(status in ('PREVISTA','REALIZADA','FALTOU','CANCELADA'));

create or replace function public.xpace_update_roster_lesson(p_company uuid,p_actor uuid,p_lesson uuid,p_status text,p_instructor uuid,p_room uuid,p_start time,p_end time,p_rate integer,p_override boolean,p_note text,p_teacher uuid default null,p_qr uuid default null)
returns void language plpgsql security invoker set search_path='' as $$
declare l public.xpace_teaching_lessons;person public.xpace_instructors;month_date date;room_title text;local_now timestamp;begin
 select * into l from public.xpace_teaching_lessons where id=p_lesson and tenant_company_id=p_company and roster_id is not null;
 if not found then raise exception 'LESSON_NOT_FOUND';end if;
 if p_teacher is null and not exists(select 1 from public.profiles where id=p_actor and active and platform_role='platform_owner') then raise exception 'ADMIN_REQUIRED';end if;
 month_date:=date_trunc('month',l.scheduled_on)::date;
 perform pg_advisory_xact_lock(hashtextextended('teaching:'||p_company::text||':'||month_date::text,0));
 perform pg_advisory_xact_lock(hashtextextended('rosters:'||p_company::text,0));
 select * into l from public.xpace_teaching_lessons where id=p_lesson and tenant_company_id=p_company for update;
 if exists(select 1 from public.xpace_teaching_months where tenant_company_id=p_company and month=month_date and reviewed_at is not null) then raise exception 'MONTH_CLOSED';end if;
 if p_teacher is not null then
  if not exists(select 1 from public.xpace_teacher_access a join public.profiles p on p.id=a.profile_id where a.profile_id=p_actor and a.tenant_company_id=p_company and a.instructor_id=p_teacher and a.active and p.active and p.platform_role='company_teacher')
   or l.instructor_id is distinct from p_teacher or p_status<>'REALIZADA' or p_instructor is distinct from p_teacher then raise exception 'TEACHER_FORBIDDEN';end if;
  local_now:=now() at time zone 'America/Sao_Paulo';
  if l.status not in ('PREVISTA','REALIZADA') or local_now::date<>l.scheduled_on or local_now<l.scheduled_on+l.starts_at-interval '15 minutes'
   or local_now>l.scheduled_on+l.starts_at+interval '15 minutes' then raise exception 'ATTENDANCE_WINDOW_CLOSED';end if;
  if p_qr is not null and not exists(select 1 from public.xpace_rooms where id=l.room_id and tenant_company_id=p_company and attendance_token=p_qr and active) then raise exception 'ROOM_QR_INVALID';end if;
  if l.status='REALIZADA' then return;end if;
  p_room:=l.room_id;p_start:=l.starts_at;p_end:=l.ends_at;p_override:=l.rate_override;p_rate:=l.rate_cents;p_note:=l.note;
 end if;
 if p_status not in ('PREVISTA','REALIZADA','FALTOU','CANCELADA') or p_end<=p_start or p_room is null or p_start is null or p_end is null or (p_rate is not null and p_rate<0)
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

revoke all on function public.xpace_update_roster_lesson(uuid,uuid,uuid,text,uuid,uuid,time,time,integer,boolean,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.xpace_update_roster_lesson(uuid,uuid,uuid,text,uuid,uuid,time,time,integer,boolean,text,uuid,uuid) to service_role;

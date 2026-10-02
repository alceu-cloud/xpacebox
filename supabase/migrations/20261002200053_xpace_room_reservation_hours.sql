create or replace function public.xpace_reserve_teacher_room(p_company uuid,p_actor uuid,p_instructor uuid,p_room uuid,p_start timestamptz,p_end timestamptz,p_request uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare r public.xpace_rooms;teacher_name text;reservation public.xpace_room_rentals;reservation_id uuid;minutes numeric;local_start timestamp;local_end timestamp;begin
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
  if minutes<=0 or minutes>840 or minutes<>trunc(minutes) or p_start<now() or p_start>now()+interval '366 days'
    or (p_start at time zone 'America/Sao_Paulo')::date<>(p_end at time zone 'America/Sao_Paulo')::date then raise exception 'RESERVATION_INVALID';end if;
  local_start:=p_start at time zone 'America/Sao_Paulo';local_end:=p_end at time zone 'America/Sao_Paulo';
  if p_start is null or p_end is null or local_start::time<'08:00'::time or local_end::time>'22:00'::time then raise exception 'RESERVATION_HOURS';end if;
  insert into public.xpace_room_rentals(tenant_company_id,room_id,room_name,instructor_id,renter_name,starts_at,ends_at,amount_cents,hourly_rate_cents,created_by,request_id)
    values(p_company,p_room,r.name,p_instructor,teacher_name,p_start,p_end,round(minutes*r.hourly_rate_cents/60),r.hourly_rate_cents,p_actor,p_request) returning id into reservation_id;
  return reservation_id;
end $$;

-- Also protects the XPACE legacy rental screen; existing records are not changed.
create function private.xpace_room_reservation_hours_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare local_start timestamp;local_end timestamp;
begin
 if new.status='CANCELADA' then return new;end if;
 if not exists(select 1 from public.companies where id=new.tenant_company_id and slug='xpace') then return new;end if;
 local_start:=new.starts_at at time zone 'America/Sao_Paulo';local_end:=new.ends_at at time zone 'America/Sao_Paulo';
 if local_start is null or local_end is null or local_start::date<>local_end::date or local_end<=local_start or local_start::time<'08:00'::time or local_end::time>'22:00'::time then raise exception 'RESERVATION_HOURS';end if;
 return new;
end $$;
revoke all on function private.xpace_room_reservation_hours_guard() from public,anon,authenticated;
create trigger xpace_room_reservation_hours before insert or update of starts_at,ends_at,status,tenant_company_id on public.xpace_room_rentals for each row execute function private.xpace_room_reservation_hours_guard();
revoke all on function public.xpace_reserve_teacher_room(uuid,uuid,uuid,uuid,timestamptz,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.xpace_reserve_teacher_room(uuid,uuid,uuid,uuid,timestamptz,timestamptz,uuid) to service_role;

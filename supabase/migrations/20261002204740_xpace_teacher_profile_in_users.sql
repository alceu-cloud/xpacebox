-- Normal platform users, with an optional teacher identity for their own lessons/reservations.
create function public.xpace_save_teacher_user(
 p_actor uuid,p_profile uuid,p_name text,p_email text,p_role text,
 p_company uuid,p_instructor uuid default null,p_teacher_active boolean default true
) returns void language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.profiles where id=p_actor and active and platform_role='platform_owner') then raise exception 'USER_ADMIN_REQUIRED';end if;
 if p_role is null or p_role not in ('platform_owner','company_manager','company_user','company_staff','company_teacher') or nullif(btrim(p_name),'') is null or nullif(btrim(p_email),'') is null then raise exception 'USER_PROFILE_INVALID';end if;
 if p_actor=p_profile and p_role<>'platform_owner' then raise exception 'USER_SELF_ROLE_CHANGE';end if;
 perform pg_advisory_xact_lock(hashtextextended('teacher-user:'||p_profile::text,0));
 if p_company is not null and not exists(select 1 from public.companies where id=p_company and active) then raise exception 'USER_COMPANY_INVALID';end if;
 if p_role='company_teacher' then
  if p_company is null or not exists(select 1 from public.companies where id=p_company and slug='xpace' and active) then raise exception 'TEACHER_COMPANY_INVALID';end if;
  perform id from public.xpace_instructors where id=p_instructor and tenant_company_id=p_company and active for update;
  if not found then raise exception 'INSTRUCTOR_INVALID';end if;
  if exists(select 1 from public.xpace_teacher_access where tenant_company_id=p_company and instructor_id=p_instructor and profile_id<>p_profile) then raise exception 'TEACHER_ALREADY_LINKED';end if;
 elsif p_role<>'platform_owner' and p_company is null then raise exception 'USER_COMPANY_INVALID';
 end if;
 insert into public.profiles(id,full_name,email,platform_role,active)
 values(p_profile,btrim(p_name),lower(btrim(p_email)),p_role,true)
 on conflict(id) do update set full_name=excluded.full_name,email=excluded.email,platform_role=excluded.platform_role;
 if p_role='company_teacher' then
  update public.company_members set active=false where profile_id=p_profile and active;
  insert into public.xpace_teacher_access(profile_id,tenant_company_id,instructor_id,active)
  values(p_profile,p_company,p_instructor,coalesce(p_teacher_active,true))
  on conflict(profile_id) do update set tenant_company_id=excluded.tenant_company_id,instructor_id=excluded.instructor_id,active=excluded.active;
 else
  delete from public.xpace_teacher_access where profile_id=p_profile;
  if p_company is not null then
   insert into public.company_members(profile_id,company_id,active) values(p_profile,p_company,true)
   on conflict(company_id,profile_id) do update set active=true;
  end if;
 end if;
end $$;
revoke all on function public.xpace_save_teacher_user(uuid,uuid,text,text,text,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.xpace_save_teacher_user(uuid,uuid,text,text,text,uuid,uuid,boolean) to service_role;

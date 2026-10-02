-- Keep historical class identity without linking staffing to academic mutations.
alter table public.xpace_teaching_rosters
 add column grade_details jsonb check(grade_details is null or jsonb_typeof(grade_details)='object'),
 add column grade_key text;
alter table public.xpace_teaching_lessons add column grade_details jsonb check(grade_details is null or jsonb_typeof(grade_details)='object');
alter table public.xpace_teaching_rosters drop constraint xpace_teaching_rosters_tenant_company_id_month_title_key;
create unique index xpace_roster_legacy_title on public.xpace_teaching_rosters(tenant_company_id,month,title) where grade_key is null;
create unique index xpace_roster_grade_key on public.xpace_teaching_rosters(tenant_company_id,month,grade_key) where grade_key is not null;
grant update(title,grade_details,grade_key) on public.xpace_teaching_rosters to service_role;
create function public.xpace_create_grade_teacher_roster(
 p_company uuid,p_actor uuid,p_month date,p_title text,p_room uuid,p_days integer[],p_start time,p_end time,p_assignments jsonb,p_details jsonb,p_key text
) returns uuid language plpgsql security invoker set search_path='' as $$
declare roster uuid;begin
 if not exists(select 1 from public.profiles p where p.id=p_actor and p.active and
  (p.platform_role='platform_owner' or (p.platform_role='company_manager' and exists(select 1 from public.company_members m where m.profile_id=p_actor and m.company_id=p_company and m.active))))
 then raise exception 'TEACHER_FORBIDDEN';end if;
 if p_title is null or length(btrim(p_title)) not between 1 and 120 or p_details is null or jsonb_typeof(p_details)<>'object'
  or p_key is null or length(p_key) not between 1 and 2000 then raise exception 'ROSTER_INVALID';end if;
 -- The existing transaction validates every teacher, date, conflict and month lock.
 roster:=public.xpace_create_assigned_teacher_roster(p_company,p_actor,p_month,gen_random_uuid()::text,p_room,p_days,p_start,p_end,p_assignments);
 update public.xpace_teaching_rosters set title=btrim(p_title),grade_details=p_details,grade_key=p_key where id=roster and tenant_company_id=p_company;
 update public.xpace_teaching_lessons set class_name=btrim(p_title),grade_details=p_details where roster_id=roster and tenant_company_id=p_company;
 return roster;
end $$;
revoke all on function public.xpace_create_grade_teacher_roster(uuid,uuid,date,text,uuid,integer[],time,time,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.xpace_create_grade_teacher_roster(uuid,uuid,date,text,uuid,integer[],time,time,jsonb,jsonb,text) to service_role;

-- Save one complete monthly class and its per-date teachers in one transaction.
create function public.xpace_create_assigned_teacher_roster(
 p_company uuid,p_actor uuid,p_month date,p_title text,p_room uuid,p_days integer[],p_start time,p_end time,p_assignments jsonb
) returns uuid language plpgsql security invoker set search_path='' as $$
declare roster uuid;entry jsonb;lesson public.xpace_teaching_lessons;expected integer;
begin
 if p_assignments is null or jsonb_typeof(p_assignments)<>'array' then raise exception 'ROSTER_ASSIGNMENTS_INVALID';end if;
 if jsonb_array_length(p_assignments) not between 1 and 31 then raise exception 'ROSTER_ASSIGNMENTS_INVALID';end if;
 if exists(select 1 from jsonb_array_elements(p_assignments) a where jsonb_typeof(a)<>'object'
  or coalesce(a->>'day','')!~'^\d{4}-\d{2}-\d{2}$' or not(a ? 'instructorId')
  or (a->>'instructorId' is not null and a->>'instructorId'!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))
  or (select count(distinct a->>'day') from jsonb_array_elements(p_assignments) a)<>jsonb_array_length(p_assignments)
 then raise exception 'ROSTER_ASSIGNMENTS_INVALID';end if;
 roster:=public.xpace_create_teacher_roster(p_company,p_actor,p_month,p_title,null,p_room,p_days,p_start,p_end);
 select count(*) into expected from public.xpace_teaching_lessons where tenant_company_id=p_company and roster_id=roster;
 if expected<>jsonb_array_length(p_assignments) then raise exception 'ROSTER_ASSIGNMENTS_INVALID';end if;
 for entry in select value from jsonb_array_elements(p_assignments) loop
  select * into lesson from public.xpace_teaching_lessons where tenant_company_id=p_company and roster_id=roster and scheduled_on::text=entry->>'day';
  if not found then raise exception 'ROSTER_ASSIGNMENTS_INVALID';end if;
  perform public.xpace_update_roster_lesson(p_company,p_actor,lesson.id,'PREVISTA',(entry->>'instructorId')::uuid,p_room,p_start,p_end,null,false,'',null,null);
 end loop;
 return roster;
end $$;
revoke all on function public.xpace_create_assigned_teacher_roster(uuid,uuid,date,text,uuid,integer[],time,time,jsonb) from public,anon,authenticated;
grant execute on function public.xpace_create_assigned_teacher_roster(uuid,uuid,date,text,uuid,integer[],time,time,jsonb) to service_role;

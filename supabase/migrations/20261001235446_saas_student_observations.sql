-- Manual observations only. No scheduler, billing decision or inferred history.
-- Applied with Supabase MCP; version verified in the remote history.
create table public.saas_student_observations (
  id uuid primary key default gen_random_uuid(),
  tenant_company_id uuid not null references public.companies(id),
  created_by uuid not null references public.profiles(id),
  request_id uuid not null,
  observed_at timestamptz not null default now(),
  local_date date not null default (now() at time zone 'America/Sao_Paulo')::date,
  active_students integer not null check (active_students >= 0),
  source text not null default 'OBSERVATION' check (source = 'OBSERVATION'),
  unique (tenant_company_id, request_id),
  check (local_date = (observed_at at time zone 'America/Sao_Paulo')::date)
);
create index saas_student_observations_company_date_idx on public.saas_student_observations(tenant_company_id, observed_at desc, id);
create index saas_student_observations_actor_idx on public.saas_student_observations(created_by);
alter table public.saas_student_observations enable row level security;
revoke all on public.saas_student_observations from public, anon, authenticated, service_role;
grant select, insert on public.saas_student_observations to service_role;
create trigger saas_student_observation_immutable before update or delete on public.saas_student_observations
  for each row execute function public.saas_reject_snapshot_change();

create function public.saas_observe_students(p_company uuid, p_actor uuid, p_request uuid)
returns public.saas_student_observations language plpgsql security invoker set search_path = '' as $$
declare v_snapshot public.saas_student_observations;
begin
  if p_request is null or not exists(select 1 from public.companies c where c.id=p_company and c.active)
  or not exists(select 1 from public.profiles p where p.id=p_actor and p.active and
    (p.platform_role='platform_owner' or (p.platform_role='company_manager' and exists
      (select 1 from public.company_members m where m.company_id=p_company and m.profile_id=p_actor and m.active)))) then
    raise exception 'SAAS_OBSERVATION_ACCESS_DENIED';
  end if;
  -- Retry reads the existing observation; never updates it to today's count.
  insert into public.saas_student_observations(tenant_company_id, created_by, request_id, active_students)
    select p_company, p_actor, p_request, count(*)::integer from public.xpace_people
      where tenant_company_id=p_company and active=true and is_student=true
    on conflict(tenant_company_id, request_id) do nothing;
  select * into v_snapshot from public.saas_student_observations
    where tenant_company_id=p_company and request_id=p_request;
  if v_snapshot.created_by <> p_actor then raise exception 'SAAS_OBSERVATION_IDEMPOTENCY_CONFLICT'; end if;
  return v_snapshot;
end; $$;
revoke all on function public.saas_observe_students(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.saas_observe_students(uuid,uuid,uuid) to service_role;

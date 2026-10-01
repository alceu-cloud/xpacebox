-- No external effects. Journal reserved for explicitly authorized Sandbox tests.
-- Filename follows the applied Supabase MCP history version; do not reapply.
create table public.saas_sandbox_operations (
  id uuid primary key default gen_random_uuid(),
  tenant_company_id uuid not null references public.companies(id),
  created_by uuid not null references public.profiles(id),
  kind text not null check (kind in ('CREATE_SUBACCOUNT','CREATE_SUBSCRIPTION')),
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  status text not null default 'RUNNING' check (status in ('RUNNING','SUCCEEDED','UNKNOWN')),
  lease_key uuid not null default gen_random_uuid(),
  lease_until timestamptz not null default now()+interval '5 minutes',
  private_result jsonb,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (tenant_company_id,kind)
);
create index saas_sandbox_operations_actor_idx on public.saas_sandbox_operations(created_by);
alter table public.saas_sandbox_operations enable row level security;
revoke all on public.saas_sandbox_operations from public,anon,authenticated;
grant select,insert,update on public.saas_sandbox_operations to service_role;

create function public.saas_begin_sandbox_operation(p_company uuid,p_actor uuid,p_kind text,p_fingerprint text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_record public.saas_sandbox_operations; v_id uuid;
begin
  if not exists(select 1 from public.profiles where id=p_actor and active and platform_role='platform_owner')
  or not exists(select 1 from public.companies where id=p_company and active)
  or exists(select 1 from public.saas_commercial_settings where owner_company_id=p_company) then
    raise exception 'SAAS_SANDBOX_ACCESS_DENIED';
  end if;
  insert into public.saas_sandbox_operations(tenant_company_id,created_by,kind,fingerprint)
    values(p_company,p_actor,p_kind,p_fingerprint) on conflict(tenant_company_id,kind) do nothing returning id into v_id;
  select * into v_record from public.saas_sandbox_operations where tenant_company_id=p_company and kind=p_kind for update;
  if v_record.fingerprint<>p_fingerprint then raise exception 'SAAS_SANDBOX_INPUT_CONFLICT'; end if;
  if v_id is not null then
    return jsonb_build_object('acquired',true,'id',v_record.id,'leaseKey',v_record.lease_key,'status','RUNNING');
  end if;
  if v_record.status='RUNNING' and v_record.lease_until<now() then
    update public.saas_sandbox_operations set status='UNKNOWN',finished_at=now() where id=v_record.id;
    v_record.status:='UNKNOWN';
  end if;
  -- Never renew an expired lease or retry an ambiguous POST automatically.
  return jsonb_build_object('acquired',false,'id',v_record.id,'status',v_record.status);
end; $$;

create function public.saas_finish_sandbox_operation(p_id uuid,p_lease uuid,p_status text,p_result jsonb)
returns void language plpgsql security invoker set search_path='' as $$
begin
  if p_status not in ('SUCCEEDED','UNKNOWN') or p_status is null then raise exception 'SAAS_SANDBOX_STATUS_INVALID'; end if;
  update public.saas_sandbox_operations set status=p_status,private_result=p_result,finished_at=now()
    where id=p_id and lease_key=p_lease and status='RUNNING';
  if not found then raise exception 'SAAS_SANDBOX_LEASE_INVALID'; end if;
end; $$;
revoke all on function public.saas_begin_sandbox_operation(uuid,uuid,text,text),public.saas_finish_sandbox_operation(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.saas_begin_sandbox_operation(uuid,uuid,text,text),public.saas_finish_sandbox_operation(uuid,uuid,text,jsonb) to service_role;

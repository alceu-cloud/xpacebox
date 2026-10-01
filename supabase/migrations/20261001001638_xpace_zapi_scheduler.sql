-- Cloud dispatch uses Supabase Cron, not a school-PC process or a browser timer.
create extension if not exists pg_net with schema extensions;
create table public.xpace_zapi_scheduler (
  id boolean primary key default true check(id),
  secret_hash text not null,
  configured_at timestamptz not null default now(),
  last_tick_at timestamptz,
  last_success_at timestamptz,
  last_error text
);
alter table public.xpace_zapi_scheduler enable row level security;
revoke all on public.xpace_zapi_scheduler from anon,authenticated;
grant all on public.xpace_zapi_scheduler to service_role;

create function public.xpace_authorize_zapi_scheduler(p_secret text)
returns boolean language sql security invoker set search_path='' as $$
  select length(p_secret) between 40 and 100 and exists(select 1 from public.xpace_zapi_scheduler where secret_hash=encode(extensions.digest(p_secret,'sha256'),'hex'));
$$;
create function public.xpace_zapi_scheduler_ready()
returns boolean language sql security definer set search_path='' as $$
  select exists(select 1 from cron.job j cross join public.xpace_zapi_scheduler s
    where j.jobname='xpace-zapi-cloud' and j.active and j.schedule='* * * * *'
      and s.last_success_at>=s.configured_at and s.last_success_at>now()-interval '3 minutes');
$$;
create function public.xpace_prepare_zapi_scheduler()
returns boolean language plpgsql security definer set search_path='' as $$
declare private_secret text; secret_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('xpace-zapi-scheduler'));
  select id,decrypted_secret into secret_id,private_secret from vault.decrypted_secrets where name='xpace_zapi_scheduler' limit 1;
  if secret_id is null then
    private_secret:=encode(extensions.gen_random_bytes(32),'hex');
    select vault.create_secret(private_secret,'xpace_zapi_scheduler','XPACEBOX cloud dispatch; never display') into secret_id;
  end if;
  insert into public.xpace_zapi_scheduler(id,secret_hash) values(true,encode(extensions.digest(private_secret,'sha256'),'hex'))
    on conflict(id) do update set secret_hash=excluded.secret_hash,configured_at=now();
  perform cron.schedule('xpace-zapi-cloud','* * * * *',$job$
    select net.http_get(
      url:='https://www.xpacebox.com.br/api/cron/xpace-zapi',
      headers:=jsonb_build_object('Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='xpace_zapi_scheduler' limit 1)),
      timeout_milliseconds:=55000
    );
  $job$);
  return true;
end $$;
create function public.xpace_record_zapi_scheduler_tick(p_success boolean)
returns boolean language sql security invoker set search_path='' as $$
  update public.xpace_zapi_scheduler set last_tick_at=now(),
    last_success_at=case when p_success then now() else last_success_at end,
    last_error=case when p_success then null else 'ZAPI_SCHEDULER_EXECUTION_FAILED' end where id=true returning true;
$$;
revoke all on function public.xpace_authorize_zapi_scheduler(text),public.xpace_zapi_scheduler_ready(),public.xpace_prepare_zapi_scheduler(),public.xpace_record_zapi_scheduler_tick(boolean) from public,anon,authenticated;
grant execute on function public.xpace_authorize_zapi_scheduler(text),public.xpace_zapi_scheduler_ready(),public.xpace_prepare_zapi_scheduler(),public.xpace_record_zapi_scheduler_tick(boolean) to service_role;
-- No job is installed until a manager explicitly prepares it through the protected API.

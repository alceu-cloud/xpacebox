-- Preferences belong to one authenticated user in one company. Browser writes
-- are revoked; the API derives both identifiers from verified company access.
create table public.company_notification_preferences (
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  categories text[] not null default array['EXPERIMENTAL','FINANCEIRO','CONTRATO','EMAIL','WHATSAPP','CRM'],
  read_before jsonb not null default '{}'::jsonb check (jsonb_typeof(read_before) = 'object'),
  updated_at timestamptz not null default now(),
  primary key (tenant_company_id, profile_id),
  check (categories <@ array['EXPERIMENTAL','FINANCEIRO','CONTRATO','EMAIL','WHATSAPP','CRM']::text[])
);
create index company_notification_preferences_profile_idx on public.company_notification_preferences(profile_id);
alter table public.company_notification_preferences enable row level security;
revoke all on public.company_notification_preferences from public, anon, authenticated, service_role;
grant select, insert, update on public.company_notification_preferences to service_role;
grant select on public.company_notification_preferences to authenticated;
create policy notification_preferences_own_read on public.company_notification_preferences
  for select to authenticated using (profile_id = (select auth.uid()) and public.has_company_access(tenant_company_id));

-- Persist previously unrecorded automation failures. There is no acknowledge or
-- dismiss operation: only the corresponding successful execution resolves it.
create table public.company_automation_issues (
  id uuid primary key default gen_random_uuid(),
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  automation text not null,
  scope_key text not null,
  category text not null check (category in ('FINANCEIRO','CONTRATO','EMAIL','WHATSAPP')),
  summary text not null check (length(summary) between 1 and 240),
  first_failed_at timestamptz not null default now(),
  last_failed_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (tenant_company_id, automation, scope_key)
);
create index company_automation_issues_open_idx on public.company_automation_issues(tenant_company_id, resolved_at, last_failed_at);
alter table public.company_automation_issues enable row level security;
revoke all on public.company_automation_issues from public, anon, authenticated, service_role;
grant select, insert, update on public.company_automation_issues to service_role;

-- Monotonic per-category read cursors under a row lock. Does not overwrite a
-- preference saved concurrently from another device, or move read state back.
create function public.mark_company_notifications_read(p_company uuid, p_profile uuid, p_cursors jsonb)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_existing jsonb; v_key text; v_value text;
begin
  if not exists (select 1 from public.profiles p where p.id=p_profile and p.active and
    (p.platform_role='platform_owner' or exists (select 1 from public.company_members m where m.company_id=p_company and m.profile_id=p_profile and m.active))) then
    raise exception 'User has no company access' using errcode='42501';
  end if;
  if jsonb_typeof(p_cursors) <> 'object' then raise exception 'Invalid cursors'; end if;
  insert into public.company_notification_preferences(tenant_company_id,profile_id) values(p_company,p_profile) on conflict do nothing;
  select read_before into v_existing from public.company_notification_preferences where tenant_company_id=p_company and profile_id=p_profile for update;
  for v_key,v_value in select key,value from jsonb_each_text(p_cursors) loop
    if v_key not in ('EXPERIMENTAL','FINANCEIRO','CONTRATO','EMAIL','WHATSAPP','CRM') or v_value::timestamptz > now() then raise exception 'Invalid cursor'; end if;
    if v_existing->>v_key is null or (v_existing->>v_key)::timestamptz < v_value::timestamptz then v_existing := v_existing || jsonb_build_object(v_key,v_value); end if;
  end loop;
  update public.company_notification_preferences set read_before=v_existing,updated_at=now() where tenant_company_id=p_company and profile_id=p_profile;
end $$;
revoke all on function public.mark_company_notifications_read(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.mark_company_notifications_read(uuid,uuid,jsonb) to service_role;

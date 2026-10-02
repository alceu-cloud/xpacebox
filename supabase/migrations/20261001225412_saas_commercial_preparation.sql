-- Preparation only: no real account, charge, subscription, cron or legacy change.
-- Applied with Supabase MCP; filename matches the confirmed remote history version.
create table public.saas_commercial_settings (
  singleton boolean primary key default true check (singleton),
  owner_company_id uuid not null unique references public.companies(id),
  phase text not null default 'PREPARATION' check (phase = 'PREPARATION'),
  created_at timestamptz not null default now()
);
insert into public.saas_commercial_settings(owner_company_id)
select id from public.companies where slug = 'xpace' and active = true;

create table public.saas_pricebooks (
  id uuid primary key default gen_random_uuid(),
  revision bigint generated always as identity unique,
  config jsonb not null check (jsonb_typeof(config) = 'object'),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
-- Prices explicitly authorized by Alceu. Student pricing/policies remain unset.
insert into public.saas_pricebooks(config) values ('{"bands":[{"min":0,"max":50,"monthlyCents":9900},{"min":51,"max":200,"monthlyCents":14900},{"min":201,"max":300,"monthlyCents":19900},{"min":301,"max":500,"monthlyCents":24900},{"min":501,"max":800,"monthlyCents":29900},{"min":801,"max":null,"monthlyCents":34900}],"addons":{"WHATSAPP":15000},"studentMetric":"PENDING","billingTiming":"MONTH_END","graceDays":null,"rangeChange":"PENDING"}');

create table public.saas_order_drafts (
  id uuid primary key default gen_random_uuid(),
  tenant_company_id uuid not null references public.companies(id),
  created_by uuid not null references public.profiles(id),
  request_id uuid not null,
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  pricebook_id uuid not null references public.saas_pricebooks(id),
  quote jsonb not null check ((jsonb_typeof(quote) = 'object' and quote->>'canCharge' = 'false' and quote->>'kind' = 'SIMULATION') is true),
  status text not null default 'DRAFT' check (status = 'DRAFT'),
  created_at timestamptz not null default now(),
  unique (tenant_company_id, request_id)
);
create index saas_order_drafts_company_date_idx on public.saas_order_drafts(tenant_company_id, created_at desc);
create index saas_order_drafts_actor_idx on public.saas_order_drafts(created_by);
create index saas_order_drafts_pricebook_idx on public.saas_order_drafts(pricebook_id);
create index saas_pricebooks_actor_idx on public.saas_pricebooks(created_by);

create table public.saas_payment_account_drafts (
  tenant_company_id uuid primary key references public.companies(id),
  account_mode text not null check (account_mode in ('PARENT','SUBACCOUNT')),
  status text not null default 'PREPARATION' check (status = 'PREPARATION'),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index saas_payment_account_drafts_actor_idx on public.saas_payment_account_drafts(created_by);

create table public.saas_whatsapp_connections (
  tenant_company_id uuid primary key references public.companies(id),
  instance_id text not null unique check (instance_id ~ '^[A-Za-z0-9_-]{16,200}$'),
  credential_ciphertext text not null,
  credential_iv text not null,
  credential_auth_tag text not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index saas_whatsapp_connections_actor_idx on public.saas_whatsapp_connections(created_by);

-- Preferences are not a subscription, module entitlement or payment authorization.
create table public.saas_billing_preferences (
  tenant_company_id uuid primary key references public.companies(id),
  payment_method text not null check (payment_method in ('PIX','BOLETO','CREDIT_CARD')),
  addons text[] not null default '{}' check (addons <@ array['WHATSAPP']::text[] and cardinality(addons) <= 1),
  status text not null default 'PREPARATION' check (status = 'PREPARATION'),
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now()
);
create index saas_billing_preferences_actor_idx on public.saas_billing_preferences(updated_by);
-- Read model for future confirmed parent-account invoices; no issuer/job wired yet.
create table public.saas_billing_invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_company_id uuid not null references public.companies(id),
  pricebook_id uuid not null references public.saas_pricebooks(id),
  period_start date not null,
  due_on date not null check (due_on >= period_start),
  total_cents bigint not null check (total_cents >= 0 and total_cents <= 100000000),
  lines jsonb not null check (jsonb_typeof(lines) = 'array'),
  payment_method text not null check (payment_method in ('PIX','BOLETO','CREDIT_CARD')),
  status text not null check (status in ('PENDING','PAID','OVERDUE','CANCELLED','REVIEW')),
  provider_payment_id text not null unique,
  created_at timestamptz not null default now(),
  unique (tenant_company_id,period_start)
);
create index saas_billing_invoices_company_date_idx on public.saas_billing_invoices(tenant_company_id,due_on desc,id);
create index saas_billing_invoices_pricebook_idx on public.saas_billing_invoices(pricebook_id);

-- Immutable snapshots: never rewrite a quoted pricebook or draft to hide history.
create function public.saas_reject_snapshot_change() returns trigger language plpgsql security invoker set search_path = '' as $$
begin raise exception 'SAAS_SNAPSHOT_IMMUTABLE'; end; $$;
create trigger saas_pricebook_immutable before update or delete on public.saas_pricebooks for each row execute function public.saas_reject_snapshot_change();
create trigger saas_order_immutable before update or delete on public.saas_order_drafts for each row execute function public.saas_reject_snapshot_change();

create function public.saas_save_pricebook(p_actor uuid,p_expected uuid,p_config jsonb)
returns public.saas_pricebooks language plpgsql security invoker set search_path = '' as $$
declare v_latest uuid; v_book public.saas_pricebooks;
begin
  if not exists(select 1 from public.profiles where id=p_actor and active and platform_role='platform_owner') then
    raise exception 'SAAS_ACCESS_DENIED';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(1936154995,1);
  select id into v_latest from public.saas_pricebooks order by revision desc limit 1;
  if v_latest is distinct from p_expected then raise exception 'SAAS_PRICEBOOK_CONFLICT'; end if;
  insert into public.saas_pricebooks(config,created_by) values(p_config,p_actor) returning * into v_book;
  return v_book;
end; $$;

create function public.saas_check_account_mode() returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_owner uuid;
begin
  select owner_company_id into v_owner from public.saas_commercial_settings where singleton;
  if v_owner is null or new.account_mode <> (case when new.tenant_company_id = v_owner then 'PARENT' else 'SUBACCOUNT' end) then
    raise exception 'SAAS_ACCOUNT_MODE_INVALID';
  end if;
  return new;
end; $$;
create trigger saas_payment_account_mode before insert or update on public.saas_payment_account_drafts for each row execute function public.saas_check_account_mode();

create function public.saas_save_order_draft(p_company uuid,p_actor uuid,p_request uuid,p_fingerprint text,p_pricebook uuid,p_quote jsonb)
returns public.saas_order_drafts language plpgsql security invoker set search_path = '' as $$
declare v_order public.saas_order_drafts;
        v_owner uuid;
begin
  if not exists(select 1 from public.companies c where c.id=p_company and c.active)
  or not exists(select 1 from public.profiles p where p.id=p_actor and p.active and
    (p.platform_role='platform_owner' or (p.platform_role='company_manager' and exists(select 1 from public.company_members m where m.company_id=p_company and m.profile_id=p_actor and m.active)))) then
    raise exception 'SAAS_ACCESS_DENIED';
  end if;
  select owner_company_id into v_owner from public.saas_commercial_settings where singleton;
  if v_owner is null or p_quote->>'exempt' is distinct from (p_company=v_owner)::text
  or p_quote->>'accountMode' is distinct from (case when p_company=v_owner then 'PARENT' else 'SUBACCOUNT' end) then
    raise exception 'SAAS_EXEMPTION_INVALID';
  end if;
  insert into public.saas_order_drafts(tenant_company_id,created_by,request_id,fingerprint,pricebook_id,quote)
  values(p_company,p_actor,p_request,p_fingerprint,p_pricebook,p_quote)
  on conflict(tenant_company_id,request_id) do nothing;
  select * into v_order from public.saas_order_drafts where tenant_company_id=p_company and request_id=p_request;
  if v_order.fingerprint<>p_fingerprint or v_order.created_by<>p_actor then raise exception 'SAAS_IDEMPOTENCY_CONFLICT'; end if;
  return v_order;
end; $$;

alter table public.saas_commercial_settings enable row level security;
alter table public.saas_pricebooks enable row level security;
alter table public.saas_order_drafts enable row level security;
alter table public.saas_payment_account_drafts enable row level security;
alter table public.saas_whatsapp_connections enable row level security;
alter table public.saas_billing_preferences enable row level security;
alter table public.saas_billing_invoices enable row level security;
revoke all on public.saas_billing_preferences,public.saas_billing_invoices from public,anon,authenticated;
grant select,insert,update on public.saas_billing_preferences to service_role;
grant select on public.saas_billing_invoices to service_role;
revoke all on public.saas_commercial_settings,public.saas_pricebooks,public.saas_order_drafts,public.saas_payment_account_drafts,public.saas_whatsapp_connections from public,anon,authenticated;
grant select on public.saas_commercial_settings to service_role;
grant select,insert on public.saas_pricebooks,public.saas_order_drafts,public.saas_payment_account_drafts,public.saas_whatsapp_connections to service_role;
grant usage,select on sequence public.saas_pricebooks_revision_seq to service_role;
revoke all on function public.saas_reject_snapshot_change(),public.saas_check_account_mode(),public.saas_save_order_draft(uuid,uuid,uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.saas_reject_snapshot_change(),public.saas_check_account_mode(),public.saas_save_order_draft(uuid,uuid,uuid,text,uuid,jsonb) to service_role;
revoke all on function public.saas_save_pricebook(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.saas_save_pricebook(uuid,uuid,jsonb) to service_role;

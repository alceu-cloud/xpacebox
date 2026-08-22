create table if not exists public.crm_customer_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  owner_profile_id uuid references public.profiles(id) on delete set null,
  purchase_frequency_days integer check (purchase_frequency_days is null or purchase_frequency_days > 0),
  average_purchase_value numeric(14,2) not null default 0,
  last_purchase_at date,
  next_purchase_at date,
  next_contact_at timestamptz,
  relationship_status text not null default 'ACTIVE' check (relationship_status in ('ACTIVE', 'DORMANT', 'BLOCKED')),
  whatsapp_opt_in boolean not null default false,
  whatsapp_opt_in_at timestamptz,
  whatsapp_opt_in_source text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_company_id, client_id)
);

create table if not exists public.crm_activities (
  id uuid primary key default gen_random_uuid(),
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  representative_profile_id uuid references public.profiles(id) on delete set null,
  activity_type text not null check (activity_type in ('WHATSAPP', 'CALL', 'EMAIL', 'VISIT', 'NOTE', 'QUOTE')),
  outcome text not null check (outcome in ('CONTACTED', 'NO_RESPONSE', 'QUOTE_REQUESTED', 'PURCHASE_EXPECTED', 'FOLLOW_UP', 'NO_INTEREST', 'OTHER')),
  subject text,
  notes text,
  occurred_at timestamptz not null default now(),
  next_action_type text check (next_action_type is null or next_action_type in ('WHATSAPP', 'CALL', 'EMAIL', 'VISIT', 'QUOTE', 'FOLLOW_UP')),
  next_action_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.crm_opportunities (
  id uuid primary key default gen_random_uuid(),
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  representative_profile_id uuid references public.profiles(id) on delete set null,
  title text not null,
  stage text not null default 'CONTACT_PENDING' check (stage in ('CONTACT_PENDING', 'CONTACTED', 'QUOTE_PREPARATION', 'QUOTE_SENT', 'NEGOTIATION', 'WON', 'LOST')),
  estimated_value numeric(14,2) not null default 0,
  expected_close_date date,
  quote_id uuid references public.quotes(id) on delete set null,
  notes text,
  lost_reason text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_business_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  seller_company_id uuid not null references public.seller_companies(id) on delete cascade,
  status text not null default 'NOT_CONNECTED' check (status in ('NOT_CONNECTED', 'PENDING', 'CONNECTED', 'ERROR')),
  meta_business_account_id text,
  waba_id text,
  phone_number_id text,
  display_phone_number text,
  display_name text,
  credential_reference text,
  webhook_subscribed boolean not null default false,
  connected_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (tenant_company_id, seller_company_id)
);

create table if not exists public.whatsapp_message_log (
  id uuid primary key default gen_random_uuid(),
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  seller_company_id uuid references public.seller_companies(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  activity_id uuid references public.crm_activities(id) on delete set null,
  direction text not null check (direction in ('OUTBOUND', 'INBOUND')),
  status text not null default 'QUEUED' check (status in ('QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED')),
  template_name text,
  body_preview text,
  meta_message_id text,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists crm_profiles_company_idx on public.crm_customer_profiles(tenant_company_id, next_contact_at);
create index if not exists crm_profiles_owner_idx on public.crm_customer_profiles(tenant_company_id, owner_profile_id);
create index if not exists crm_activities_client_idx on public.crm_activities(tenant_company_id, client_id, occurred_at desc);
create index if not exists crm_opportunities_company_stage_idx on public.crm_opportunities(tenant_company_id, stage, updated_at desc);
create index if not exists crm_opportunities_client_idx on public.crm_opportunities(tenant_company_id, client_id);
create index if not exists whatsapp_message_client_idx on public.whatsapp_message_log(tenant_company_id, client_id, created_at desc);

alter table public.crm_customer_profiles enable row level security;
alter table public.crm_activities enable row level security;
alter table public.crm_opportunities enable row level security;
alter table public.whatsapp_business_connections enable row level security;
alter table public.whatsapp_message_log enable row level security;

drop policy if exists crm_customer_profiles_company_access on public.crm_customer_profiles;
create policy crm_customer_profiles_company_access on public.crm_customer_profiles
for all using (public.can_access_company(tenant_company_id))
with check (public.can_access_company(tenant_company_id));

drop policy if exists crm_activities_company_access on public.crm_activities;
create policy crm_activities_company_access on public.crm_activities
for all using (public.can_access_company(tenant_company_id))
with check (public.can_access_company(tenant_company_id));

drop policy if exists crm_opportunities_company_access on public.crm_opportunities;
create policy crm_opportunities_company_access on public.crm_opportunities
for all using (public.can_access_company(tenant_company_id))
with check (public.can_access_company(tenant_company_id));

drop policy if exists whatsapp_connections_company_access on public.whatsapp_business_connections;
create policy whatsapp_connections_company_access on public.whatsapp_business_connections
for all using (public.can_access_company(tenant_company_id))
with check (public.can_access_company(tenant_company_id));

drop policy if exists whatsapp_message_log_company_access on public.whatsapp_message_log;
create policy whatsapp_message_log_company_access on public.whatsapp_message_log
for all using (public.can_access_company(tenant_company_id))
with check (public.can_access_company(tenant_company_id));

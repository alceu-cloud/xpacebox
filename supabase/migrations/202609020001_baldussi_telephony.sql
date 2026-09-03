create table if not exists public.telephony_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_company_id uuid not null unique references public.companies(id) on delete cascade,
  provider text not null default 'METRICX' check (provider = 'METRICX'),
  status text not null default 'NOT_CONFIGURED' check (status in ('NOT_CONFIGURED', 'PENDING', 'CONNECTED', 'ERROR')),
  webhook_key uuid not null unique default gen_random_uuid(),
  webhook_secret_hash text,
  api_key_ciphertext text,
  api_key_iv text,
  api_key_auth_tag text,
  audio_retention_days integer not null default 180 check (audio_retention_days between 30 and 3650),
  transcript_retention_days integer not null default 730 check (transcript_retention_days between 30 and 3650),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.telephony_user_extensions (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.telephony_connections(id) on delete cascade,
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  extension text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, profile_id),
  unique (connection_id, extension)
);

create table if not exists public.telephony_call_events (
  id uuid primary key default gen_random_uuid(),
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  connection_id uuid not null references public.telephony_connections(id) on delete cascade,
  provider_call_id text not null,
  client_id uuid references public.clients(id) on delete set null,
  representative_profile_id uuid references public.profiles(id) on delete set null,
  activity_id uuid references public.crm_activities(id) on delete set null,
  extension text,
  extension_group text,
  representative_name text,
  direction text not null check (direction in ('INBOUND', 'OUTBOUND', 'UNKNOWN')),
  remote_phone text,
  status text not null,
  started_at timestamptz,
  duration_seconds integer not null default 0,
  audio_url text,
  transcript text,
  justification text,
  summary text,
  quality_score numeric(4,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, provider_call_id)
);

create index if not exists telephony_call_events_company_client_idx
  on public.telephony_call_events(tenant_company_id, client_id, started_at desc);
create index if not exists telephony_call_events_company_representative_idx
  on public.telephony_call_events(tenant_company_id, representative_profile_id, started_at desc);

alter table public.telephony_connections enable row level security;
alter table public.telephony_user_extensions enable row level security;
alter table public.telephony_call_events enable row level security;

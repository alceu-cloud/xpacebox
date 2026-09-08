create table if not exists public.email_integration_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_company_id uuid not null unique references public.companies(id) on delete cascade,
  provider text not null default 'RESEND' check (provider = 'RESEND'),
  enabled boolean not null default true,
  sender_email text,
  reply_to_email text,
  api_key_ciphertext text,
  api_key_iv text,
  api_key_auth_tag text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.email_integration_connections enable row level security;

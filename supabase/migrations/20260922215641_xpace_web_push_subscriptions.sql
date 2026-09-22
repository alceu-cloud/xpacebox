-- Subscriptions are private device credentials. All access goes through
-- authenticated XPACE API routes, never directly from the browser.
create table public.xpace_web_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  endpoint_hash text not null unique,
  endpoint text not null,
  p256dh text not null,
  auth_secret text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(endpoint_hash) = 64),
  check (length(endpoint) between 30 and 2048),
  check (length(p256dh) between 40 and 200),
  check (length(auth_secret) between 16 and 100)
);

create index xpace_web_push_subscriptions_company_idx
  on public.xpace_web_push_subscriptions(tenant_company_id);

alter table public.xpace_web_push_subscriptions enable row level security;
revoke all on table public.xpace_web_push_subscriptions from anon, authenticated;
grant select, insert, update, delete on table public.xpace_web_push_subscriptions to service_role;

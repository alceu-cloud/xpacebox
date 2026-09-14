create table if not exists public.sample_overdue_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  sample_id uuid not null references public.client_samples(id) on delete cascade,
  scheduled_for date not null,
  recipient_email text not null,
  overdue_days integer not null check (overdue_days > 0),
  status text not null default 'PENDING' check (status in ('PENDING', 'SENT', 'FAILED')),
  provider_message_id text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sample_id, scheduled_for)
);

create index if not exists sample_overdue_email_deliveries_schedule_idx
  on public.sample_overdue_email_deliveries (tenant_company_id, scheduled_for, status);

alter table public.sample_overdue_email_deliveries enable row level security;

revoke all on table public.sample_overdue_email_deliveries from anon, authenticated;

create table if not exists public.daily_agenda_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  recipient_profile_id uuid not null references public.profiles(id) on delete cascade,
  scheduled_for date not null,
  recipient_email text not null,
  overdue_count integer not null default 0,
  today_count integer not null default 0,
  status text not null default 'PENDING' check (status in ('PENDING', 'SENT', 'FAILED')),
  provider_message_id text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_company_id, recipient_profile_id, scheduled_for)
);

create index if not exists daily_agenda_email_deliveries_schedule_idx
  on public.daily_agenda_email_deliveries (scheduled_for, status);

alter table public.daily_agenda_email_deliveries enable row level security;

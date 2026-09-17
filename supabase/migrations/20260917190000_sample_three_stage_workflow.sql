alter table public.client_samples
  add column if not exists production_due_date date,
  add column if not exists ready_at date,
  add column if not exists customer_delivery_date date,
  add column if not exists delivered_at date,
  add column if not exists approval_due_date date,
  add column if not exists approved_at date;

update public.client_samples
set production_due_date = delivery_date
where production_due_date is null and delivery_date is not null;

alter table public.client_samples
  drop constraint if exists client_samples_status_check;

alter table public.client_samples
  add constraint client_samples_status_check
  check (status in ('REQUESTED', 'IN_PRODUCTION', 'READY', 'SENT', 'APPROVED', 'REJECTED', 'CANCELLED'));

create index if not exists client_samples_open_production_due_idx
  on public.client_samples (tenant_company_id, production_due_date)
  where closed_at is null and production_due_date is not null and status in ('REQUESTED', 'IN_PRODUCTION');

create index if not exists client_samples_open_customer_delivery_idx
  on public.client_samples (tenant_company_id, customer_delivery_date)
  where closed_at is null and customer_delivery_date is not null and status = 'READY';

create index if not exists client_samples_open_approval_due_idx
  on public.client_samples (tenant_company_id, approval_due_date)
  where closed_at is null and approval_due_date is not null and status = 'SENT';

alter table public.sample_overdue_email_deliveries
  add column if not exists control_stage text not null default 'PRODUCAO';

alter table public.sample_overdue_email_deliveries
  drop constraint if exists sample_overdue_email_deliveries_sample_id_scheduled_for_key;

create unique index if not exists sample_overdue_email_deliveries_stage_day_key
  on public.sample_overdue_email_deliveries (sample_id, control_stage, scheduled_for);

create table public.xpace_lead_sources (
  id uuid primary key default gen_random_uuid(),
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(btrim(name)) between 2 and 100)
);

create unique index xpace_lead_sources_company_name_unique
  on public.xpace_lead_sources(tenant_company_id, lower(name));

create table public.xpace_lead_loss_reasons (
  id uuid primary key default gen_random_uuid(),
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(btrim(name)) between 2 and 100)
);

create unique index xpace_lead_loss_reasons_company_name_unique
  on public.xpace_lead_loss_reasons(tenant_company_id, lower(name));

create table public.xpace_lead_import_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  source_file_name text not null,
  source_sheet_name text,
  source_checksum text,
  imported_rows integer not null default 0 check (imported_rows >= 0),
  note text,
  imported_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index xpace_lead_import_batches_company_created_idx
  on public.xpace_lead_import_batches(tenant_company_id, created_at desc);

create table public.xpace_leads (
  id uuid primary key default gen_random_uuid(),
  lead_number bigint generated always as identity unique,
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  full_name text not null,
  mobile text,
  email text,
  pipeline_stage text not null default 'NOVO' check (pipeline_stage in ('NOVO', 'ATENDIMENTO', 'AULA_EXPERIMENTAL', 'NEGOCIACAO', 'GANHO', 'PERDIDO')),
  source_id uuid references public.xpace_lead_sources(id) on delete set null,
  source_note text,
  assigned_to uuid references public.profiles(id) on delete set null,
  loss_reason_id uuid references public.xpace_lead_loss_reasons(id) on delete set null,
  loss_note text,
  converted_person_id uuid references public.xpace_people(id) on delete set null,
  converted_contract_id uuid references public.xpace_student_contracts(id) on delete set null,
  legacy_import_batch_id uuid references public.xpace_lead_import_batches(id) on delete set null,
  legacy_row_number integer check (legacy_row_number is null or legacy_row_number > 0),
  legacy_payload jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  won_at timestamptz,
  lost_at timestamptz,
  check (length(btrim(full_name)) between 2 and 180),
  check (email is null or email = lower(email)),
  check (legacy_payload is null or jsonb_typeof(legacy_payload) = 'object')
);

create index xpace_leads_company_pipeline_idx
  on public.xpace_leads(tenant_company_id, pipeline_stage, updated_at desc);
create index xpace_leads_company_assigned_idx
  on public.xpace_leads(tenant_company_id, assigned_to, updated_at desc);
create index xpace_leads_company_mobile_idx
  on public.xpace_leads(tenant_company_id, mobile) where mobile is not null;
create index xpace_leads_company_name_idx
  on public.xpace_leads(tenant_company_id, full_name);
create unique index xpace_leads_legacy_import_row_unique
  on public.xpace_leads(legacy_import_batch_id, legacy_row_number)
  where legacy_import_batch_id is not null and legacy_row_number is not null;

create table public.xpace_lead_appointments (
  id uuid primary key default gen_random_uuid(),
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  lead_id uuid not null references public.xpace_leads(id) on delete cascade,
  class_group_id uuid references public.xpace_class_groups(id) on delete set null,
  class_schedule_id uuid references public.xpace_class_schedules(id) on delete set null,
  scheduled_on date not null,
  starts_at time,
  ends_at time,
  booking_kind text not null default 'NOVO' check (booking_kind in ('NOVO', 'REAGENDAMENTO', 'RECUPERACAO')),
  confirmation_status text not null default 'PENDENTE' check (confirmation_status in ('PENDENTE', 'CONFIRMADO', 'NAO_CONFIRMADO', 'NAO_INFORMADO')),
  attendance_status text not null default 'AGENDADO' check (attendance_status in ('AGENDADO', 'COMPARECEU', 'FALTOU', 'CANCELADO', 'NAO_INFORMADO')),
  enrollment_outcome text not null default 'PENDENTE' check (enrollment_outcome in ('PENDENTE', 'MATRICULOU', 'NAO_MATRICULOU', 'NAO_INFORMADO')),
  assigned_to uuid references public.profiles(id) on delete set null,
  attendant_name_snapshot text,
  modality_name_snapshot text,
  instructor_name_snapshot text,
  class_name_snapshot text,
  legacy_week_label text,
  note text,
  survey_status text not null default 'PENDENTE' check (survey_status in ('PENDENTE', 'ENVIADA', 'NAO_ENVIADA', 'NAO_INFORMADO')),
  welcome_video_url text,
  welcome_delivery_status text not null default 'NAO_CONFIGURADO' check (welcome_delivery_status in ('NAO_CONFIGURADO', 'PENDENTE', 'ENVIADO', 'FALHOU', 'DISPENSADO')),
  welcome_delivered_at timestamptz,
  confirmed_at timestamptz,
  attended_at timestamptz,
  outcome_recorded_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at),
  check (welcome_video_url is null or welcome_video_url ~ '^https?://')
);

create index xpace_lead_appointments_company_date_idx
  on public.xpace_lead_appointments(tenant_company_id, scheduled_on desc);
create index xpace_lead_appointments_company_group_date_idx
  on public.xpace_lead_appointments(tenant_company_id, class_group_id, scheduled_on)
  where attendance_status <> 'CANCELADO';
create index xpace_lead_appointments_lead_date_idx
  on public.xpace_lead_appointments(lead_id, scheduled_on desc);
create unique index xpace_lead_appointments_lead_group_date_unique
  on public.xpace_lead_appointments(lead_id, class_group_id, scheduled_on)
  where class_group_id is not null and attendance_status <> 'CANCELADO';

create table public.xpace_lead_activities (
  id uuid primary key default gen_random_uuid(),
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  lead_id uuid not null references public.xpace_leads(id) on delete cascade,
  appointment_id uuid references public.xpace_lead_appointments(id) on delete cascade,
  activity_type text not null check (activity_type in ('LEAD_CRIADO', 'ETAPA_ALTERADA', 'AGENDAMENTO_CRIADO', 'AGENDAMENTO_ATUALIZADO', 'CONTATO', 'NOTA', 'IMPORTADO', 'CONVERTIDO', 'PERDIDO', 'VIDEO_PENDENTE', 'VIDEO_ENVIADO')),
  body text,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index xpace_lead_activities_lead_created_idx
  on public.xpace_lead_activities(lead_id, created_at desc);

create or replace function private.enforce_xpace_trial_capacity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  group_capacity integer;
  settings_value jsonb;
  max_clients integer;
  enrolled_count integer;
  trial_count integer;
begin
  if new.class_group_id is null or new.attendance_status = 'CANCELADO' then return new; end if;

  perform pg_advisory_xact_lock(hashtextextended(new.class_group_id::text || ':' || new.scheduled_on::text, 0));
  select capacity, settings into group_capacity, settings_value
    from public.xpace_class_groups
    where id = new.class_group_id and tenant_company_id = new.tenant_company_id and active = true
    for update;
  if not found then raise exception 'XPACE_GRADE_INDISPONIVEL'; end if;
  if not coalesce((settings_value ->> 'allowLeads')::boolean, false) then raise exception 'XPACE_GRADE_NAO_ACEITA_LEADS'; end if;

  max_clients := case when coalesce((settings_value ->> 'maxClientsEnabled')::boolean, false)
    then nullif(settings_value ->> 'maxClients', '')::integer else null end;
  if group_capacity is not null then max_clients := least(coalesce(max_clients, group_capacity), group_capacity); end if;
  if max_clients is null then return new; end if;

  select count(distinct student_id) into enrolled_count
    from public.xpace_class_enrollments
    where tenant_company_id = new.tenant_company_id and class_group_id = new.class_group_id and status = 'ATIVA'
      and starts_on <= new.scheduled_on and (ends_on is null or ends_on >= new.scheduled_on);

  select count(*) into trial_count
    from public.xpace_lead_appointments
    where tenant_company_id = new.tenant_company_id and class_group_id = new.class_group_id and scheduled_on = new.scheduled_on
      and attendance_status <> 'CANCELADO' and id <> new.id;

  if enrolled_count + trial_count >= max_clients then raise exception 'XPACE_LEAD_SLOT_UNAVAILABLE'; end if;
  return new;
end;
$$;

drop trigger if exists xpace_lead_appointment_capacity_guard on public.xpace_lead_appointments;
create trigger xpace_lead_appointment_capacity_guard
before insert or update of class_group_id, scheduled_on, attendance_status
on public.xpace_lead_appointments
for each row execute function private.enforce_xpace_trial_capacity();

alter table public.xpace_lead_sources enable row level security;
alter table public.xpace_lead_loss_reasons enable row level security;
alter table public.xpace_lead_import_batches enable row level security;
alter table public.xpace_leads enable row level security;
alter table public.xpace_lead_appointments enable row level security;
alter table public.xpace_lead_activities enable row level security;

revoke all on table public.xpace_lead_sources from anon, authenticated;
revoke all on table public.xpace_lead_loss_reasons from anon, authenticated;
revoke all on table public.xpace_lead_import_batches from anon, authenticated;
revoke all on table public.xpace_leads from anon, authenticated;
revoke all on table public.xpace_lead_appointments from anon, authenticated;
revoke all on table public.xpace_lead_activities from anon, authenticated;

grant select, insert, update, delete on table public.xpace_lead_sources to service_role;
grant select, insert, update, delete on table public.xpace_lead_loss_reasons to service_role;
grant select, insert, update, delete on table public.xpace_lead_import_batches to service_role;
grant select, insert, update, delete on table public.xpace_leads to service_role;
grant select, insert, update, delete on table public.xpace_lead_appointments to service_role;
grant select, insert, update, delete on table public.xpace_lead_activities to service_role;

alter table public.xpace_lead_appointments
  add column actual_instructor_id uuid references public.xpace_instructors(id) on delete set null,
  add column actual_instructor_name_snapshot text;

create index xpace_lead_appointments_company_actual_instructor_date_idx
  on public.xpace_lead_appointments(tenant_company_id, actual_instructor_id, scheduled_on desc)
  where actual_instructor_id is not null;

with legacy_instructors as (
  select distinct
    appointment.tenant_company_id,
    lower(btrim(regexp_replace(regexp_replace(appointment.instructor_name_snapshot, '^professora?\s+', '', 'i'), '\s+', ' ', 'g'))) as legacy_name
  from public.xpace_lead_appointments as appointment
  where coalesce(btrim(appointment.instructor_name_snapshot), '') <> ''
),
missing_instructors as (
  select legacy.tenant_company_id, legacy.legacy_name
  from legacy_instructors as legacy
  where legacy.legacy_name not in ('a definir', 'não informado')
    and not exists (
    select 1
    from public.xpace_instructors as instructor
    where instructor.tenant_company_id = legacy.tenant_company_id
      and lower(btrim(regexp_replace(instructor.full_name, '^professora?\s+', '', 'i'))) = legacy.legacy_name
  )
)
insert into public.xpace_instructors (tenant_company_id, full_name)
select tenant_company_id, 'PROFESSOR ' || initcap(legacy_name)
from missing_instructors;

with instructors_by_legacy_name as (
  select
    instructor.id,
    instructor.tenant_company_id,
    instructor.full_name,
    lower(btrim(regexp_replace(instructor.full_name, '^professora?\s+', '', 'i'))) as legacy_name
  from public.xpace_instructors as instructor
)
update public.xpace_lead_appointments as appointment
set
  actual_instructor_id = instructor.id,
  actual_instructor_name_snapshot = instructor.full_name
from instructors_by_legacy_name as instructor
where appointment.tenant_company_id = instructor.tenant_company_id
  and appointment.actual_instructor_id is null
  and coalesce(btrim(appointment.instructor_name_snapshot), '') <> ''
  and lower(btrim(regexp_replace(regexp_replace(appointment.instructor_name_snapshot, '^professora?\s+', '', 'i'), '\s+', ' ', 'g'))) = instructor.legacy_name;

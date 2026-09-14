create table public.xpace_rooms (
  id uuid primary key default gen_random_uuid(),
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  coverage_type text not null default 'COBERTO' check (coverage_type in ('COBERTO', 'ABERTO', 'OUTRO')),
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_company_id, name)
);

create index xpace_rooms_company_active_name_idx
  on public.xpace_rooms(tenant_company_id, active, name);

alter table public.xpace_class_schedules
  add column room_id uuid references public.xpace_rooms(id) on delete restrict,
  add column instructor_id uuid references public.xpace_instructors(id) on delete restrict;

create index xpace_class_schedules_company_room_time_idx
  on public.xpace_class_schedules(tenant_company_id, room_id, weekday, starts_at)
  where active and room_id is not null;

create index xpace_class_schedules_company_instructor_time_idx
  on public.xpace_class_schedules(tenant_company_id, instructor_id, weekday, starts_at)
  where active and instructor_id is not null;

create or replace function private.enforce_xpace_schedule_conflicts()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.active and (new.room_id is not null or new.instructor_id is not null) and exists (
    select 1
    from public.xpace_class_schedules as existing
    where existing.tenant_company_id = new.tenant_company_id
      and existing.weekday = new.weekday
      and existing.active
      and existing.id is distinct from new.id
      and existing.starts_at < new.ends_at
      and existing.ends_at > new.starts_at
      and (
        (new.room_id is not null and existing.room_id = new.room_id)
        or (new.instructor_id is not null and existing.instructor_id = new.instructor_id)
      )
  ) then
    raise exception 'CONFLITO DE SALA OU PROFESSOR NESTE HORÁRIO'
      using errcode = '23P01';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_xpace_schedule_conflicts() from public;

drop trigger if exists xpace_schedule_conflict_guard on public.xpace_class_schedules;
create trigger xpace_schedule_conflict_guard
before insert or update on public.xpace_class_schedules
for each row execute function private.enforce_xpace_schedule_conflicts();

alter table public.xpace_rooms enable row level security;

revoke all on table public.xpace_rooms from anon, authenticated;
grant select, insert, update, delete on table public.xpace_rooms to service_role;

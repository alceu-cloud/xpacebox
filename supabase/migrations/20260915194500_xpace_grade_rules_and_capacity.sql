alter table public.xpace_rooms
  add column if not exists capacity integer check (capacity is null or capacity > 0);

alter table public.xpace_class_groups
  add column if not exists source_type text not null default 'CONTRATO' check (source_type in ('CONTRATO', 'SERVICO')),
  add column if not exists settings jsonb not null default '{}'::jsonb,
  drop constraint if exists xpace_class_groups_settings_object_check,
  add constraint xpace_class_groups_settings_object_check check (jsonb_typeof(settings) = 'object');

create or replace function private.enforce_xpace_class_capacity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  group_capacity integer;
  settings_value jsonb;
  max_clients integer;
  student_gender text;
  gender_rule text;
  already_enrolled boolean;
  enrolled_count integer;
begin
  if new.status <> 'ATIVA' then return new; end if;

  perform pg_advisory_xact_lock(hashtextextended(new.class_group_id::text, 0));
  select capacity, settings into group_capacity, settings_value
    from public.xpace_class_groups
    where id = new.class_group_id and tenant_company_id = new.tenant_company_id and active = true;
  if not found then raise exception 'XPACE_GRADE_INDISPONIVEL'; end if;

  gender_rule := coalesce(settings_value #>> '{restrictions,gender}', 'TODOS');
  if gender_rule <> 'TODOS' then
    select gender into student_gender from public.xpace_people where id = new.student_id and tenant_company_id = new.tenant_company_id;
    if student_gender is distinct from gender_rule then raise exception 'XPACE_GRADE_RESTRITA_POR_GENERO'; end if;
  end if;

  max_clients := case when coalesce((settings_value ->> 'maxClientsEnabled')::boolean, false)
    then nullif(settings_value ->> 'maxClients', '')::integer else null end;
  if group_capacity is not null then max_clients := least(coalesce(max_clients, group_capacity), group_capacity); end if;
  if max_clients is null then return new; end if;

  select exists(
    select 1 from public.xpace_class_enrollments
    where tenant_company_id = new.tenant_company_id and class_group_id = new.class_group_id and student_id = new.student_id
      and status = 'ATIVA' and starts_on <= new.starts_on and (ends_on is null or ends_on >= new.starts_on)
  ) into already_enrolled;
  if already_enrolled then return new; end if;

  select count(distinct student_id) into enrolled_count from public.xpace_class_enrollments
    where tenant_company_id = new.tenant_company_id and class_group_id = new.class_group_id and status = 'ATIVA'
      and starts_on <= new.starts_on and (ends_on is null or ends_on >= new.starts_on);
  if enrolled_count >= max_clients then raise exception 'XPACE_GRADE_SEM_VAGAS'; end if;
  return new;
end;
$$;

drop trigger if exists xpace_class_capacity_guard on public.xpace_class_enrollments;
create trigger xpace_class_capacity_guard
before insert or update of class_group_id, student_id, starts_on, ends_on, status
on public.xpace_class_enrollments
for each row execute function private.enforce_xpace_class_capacity();

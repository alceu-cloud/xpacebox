create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

alter table public.clients
  add column if not exists updated_by uuid references public.profiles(id) on delete set null;

create table if not exists public.client_change_history (
  id uuid primary key default gen_random_uuid(),
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_by_name text not null default 'USUARIO',
  changes jsonb not null default '[]'::jsonb check (jsonb_typeof(changes) = 'array'),
  created_at timestamptz not null default now()
);

create index if not exists client_change_history_client_created_idx
  on public.client_change_history(client_id, created_at desc);

create index if not exists client_change_history_tenant_created_idx
  on public.client_change_history(tenant_company_id, created_at desc);

alter table public.client_change_history enable row level security;
revoke all on table public.client_change_history from public, anon, authenticated;
grant select on table public.client_change_history to service_role;

create or replace function private.sync_client_product_company(
  target_client_id uuid,
  target_tenant_company_id uuid,
  seller_company_name text,
  changed_at timestamptz,
  change_source text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  normalized_company text := upper(trim(coalesce(seller_company_name, '')));
begin
  update public.company_manager_settings as settings
  set data = jsonb_set(
        settings.data,
        '{productFichas}',
        (
          select coalesce(jsonb_agg(
            case
              when ficha->>'clientId' = target_client_id::text then
                jsonb_set(
                  jsonb_set(
                    jsonb_set(ficha, '{company}', to_jsonb(normalized_company), true),
                    '{accessories}',
                    (
                      select coalesce(
                        jsonb_agg(jsonb_set(accessory, '{company}', to_jsonb(normalized_company), true)),
                        '[]'::jsonb
                      )
                      from jsonb_array_elements(coalesce(ficha->'accessories', '[]'::jsonb)) as accessory
                    ),
                    true
                  ),
                  '{changeHistory}',
                  case
                    when upper(trim(coalesce(ficha->>'company', ''))) is distinct from normalized_company then
                      coalesce(ficha->'changeHistory', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
                        'id', gen_random_uuid()::text,
                        'revision', coalesce(nullif(ficha->>'revision', ''), '1'),
                        'changedAt', changed_at,
                        'changes', jsonb_build_array(jsonb_build_object(
                          'label', 'CAIXA PRINCIPAL - EMPRESA',
                          'previousValue', coalesce(nullif(ficha->>'company', ''), 'NAO INFORMADO'),
                          'nextValue', normalized_company,
                          'source', change_source
                        ))
                      ))
                    else coalesce(ficha->'changeHistory', '[]'::jsonb)
                  end,
                  true
                )
              else ficha
            end
            order by position
          ), '[]'::jsonb)
          from jsonb_array_elements(settings.data->'productFichas') with ordinality as product(ficha, position)
        ),
        true
      ),
      updated_at = changed_at
  where settings.tenant_company_id = target_tenant_company_id
    and jsonb_typeof(settings.data->'productFichas') = 'array'
    and exists (
      select 1
      from jsonb_array_elements(settings.data->'productFichas') as candidate(ficha)
      where candidate.ficha->>'clientId' = target_client_id::text
        and (
          upper(trim(coalesce(candidate.ficha->>'company', ''))) is distinct from normalized_company
          or exists (
            select 1
            from jsonb_array_elements(coalesce(candidate.ficha->'accessories', '[]'::jsonb)) as accessory
            where upper(trim(coalesce(accessory->>'company', ''))) is distinct from normalized_company
          )
        )
    );
end;
$$;

create or replace function private.audit_client_changes_and_sync_products()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  detected_changes jsonb;
  updater_name text;
  seller_name text;
begin
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'field', field,
        'previousValue', to_jsonb(old)->field,
        'nextValue', to_jsonb(new)->field
      ) order by field
    ),
    '[]'::jsonb
  )
  into detected_changes
  from jsonb_object_keys(to_jsonb(new)) as changed_field(field)
  where not (field = any (array[
    'id', 'client_number', 'tenant_company_id', 'created_by', 'created_at', 'updated_by', 'updated_at'
  ]))
    and to_jsonb(old)->field is distinct from to_jsonb(new)->field;

  if jsonb_array_length(detected_changes) > 0 then
    select coalesce(nullif(trim(profile.full_name), ''), profile.email, 'USUARIO')
    into updater_name
    from public.profiles as profile
    where profile.id = new.updated_by;

    insert into public.client_change_history (
      tenant_company_id, client_id, changed_by, changed_by_name, changes, created_at
    ) values (
      new.tenant_company_id, new.id, new.updated_by, coalesce(updater_name, 'USUARIO'), detected_changes, new.updated_at
    );
  end if;

  if old.seller_company_id is distinct from new.seller_company_id then
    select upper(trim(company.name))
    into seller_name
    from public.seller_companies as company
    where company.id = new.seller_company_id
      and company.tenant_company_id = new.tenant_company_id;

    perform private.sync_client_product_company(
      new.id,
      new.tenant_company_id,
      coalesce(seller_name, ''),
      new.updated_at,
      'ALTERACAO AUTOMATICA PELO CADASTRO DO CLIENTE'
    );
  end if;

  return new;
end;
$$;

revoke all on function private.sync_client_product_company(uuid, uuid, text, timestamptz, text) from public, anon, authenticated;
revoke all on function private.audit_client_changes_and_sync_products() from public, anon, authenticated;

drop trigger if exists audit_client_changes_and_sync_products on public.clients;
create trigger audit_client_changes_and_sync_products
after update on public.clients
for each row
execute function private.audit_client_changes_and_sync_products();

do $$
declare
  client_record record;
begin
  for client_record in
    select client.id, client.tenant_company_id, upper(trim(company.name)) as seller_company_name
    from public.clients as client
    join public.seller_companies as company
      on company.id = client.seller_company_id
     and company.tenant_company_id = client.tenant_company_id
  loop
    perform private.sync_client_product_company(
      client_record.id,
      client_record.tenant_company_id,
      client_record.seller_company_name,
      now(),
      'SINCRONIZACAO INICIAL COM O CADASTRO DO CLIENTE'
    );
  end loop;
end;
$$;

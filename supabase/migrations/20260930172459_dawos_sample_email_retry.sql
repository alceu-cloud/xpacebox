-- A retry is a separate, auditable attempt against one existing daily notice.
-- The active-attempt constraint and row locks make concurrent clicks safe.
create table public.sample_overdue_email_attempts (
  id uuid primary key default gen_random_uuid(),
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  delivery_id uuid not null references public.sample_overdue_email_deliveries(id) on delete cascade,
  status text not null check (status in ('PROCESSING', 'ACCEPTED', 'FAILED', 'UNKNOWN')),
  recipient_email text not null,
  idempotency_key text unique,
  provider_message_id text,
  error_code text,
  error_message text,
  attempted_by uuid references public.profiles(id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  check (status = 'PROCESSING' or finished_at is not null)
);
create index sample_overdue_email_attempts_delivery_idx
  on public.sample_overdue_email_attempts (delivery_id, started_at desc);
create index sample_overdue_email_attempts_company_status_idx
  on public.sample_overdue_email_attempts (tenant_company_id, status, delivery_id);
create index sample_overdue_email_attempts_actor_idx
  on public.sample_overdue_email_attempts (attempted_by);
create unique index sample_overdue_email_attempts_active_idx
  on public.sample_overdue_email_attempts (delivery_id)
  where status in ('PROCESSING', 'UNKNOWN');
alter table public.sample_overdue_email_attempts enable row level security;
revoke all on public.sample_overdue_email_attempts from public, anon, authenticated, service_role;
grant select, insert, update on public.sample_overdue_email_attempts to service_role;

-- Preserve the original failure before a retry can change the delivery row.
insert into public.sample_overdue_email_attempts
  (tenant_company_id, delivery_id, status, recipient_email, provider_message_id,
   error_message, started_at, finished_at)
select tenant_company_id, id, 'FAILED', recipient_email, provider_message_id,
       error_message, created_at, updated_at
from public.sample_overdue_email_deliveries
where status = 'FAILED';

create function public.claim_sample_overdue_email_retry(
  p_company_id uuid, p_delivery_id uuid, p_actor_id uuid
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  d public.sample_overdue_email_deliveries%rowtype;
  s public.client_samples%rowtype;
  v_attempt_id uuid := gen_random_uuid();
  v_stage text;
begin
  if not exists (
    select 1 from public.companies where id = p_company_id and slug = 'dawos' and active
  ) then raise exception 'EMPRESA INVALIDA.' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = p_actor_id and p.active and (
      p.platform_role = 'platform_owner' or exists (
        select 1 from public.company_members m
        where m.company_id = p_company_id and m.profile_id = p_actor_id
          and m.active and (m.company_role = 'company_manager' or p.platform_role = 'company_manager')
      )
    )
  ) then raise exception 'APENAS O GERENTE AUTORIZADO PODE REENVIAR.' using errcode = '42501'; end if;

  select * into d from public.sample_overdue_email_deliveries
  where id = p_delivery_id and tenant_company_id = p_company_id for update;
  if not found then raise exception 'AVISO NAO ENCONTRADO.' using errcode = 'P0002'; end if;
  select * into s from public.client_samples
  where id = d.sample_id and tenant_company_id = p_company_id for update;
  if not found or s.closed_at is not null then
    raise exception 'AMOSTRA ENCERRADA OU NAO ENCONTRADA.' using errcode = '23514';
  end if;
  v_stage := case when s.status in ('REQUESTED', 'IN_PRODUCTION') then 'PRODUCAO'
                  when s.status = 'READY' then 'ENTREGA'
                  when s.status = 'SENT' then 'APROVACAO' else '' end;
  if v_stage is distinct from d.control_stage then
    raise exception 'A ETAPA DA AMOSTRA MUDOU. ATUALIZE A PAGINA.' using errcode = '23514';
  end if;
  if d.status is distinct from 'FAILED' then
    raise exception 'ESTE AVISO NAO ESTA DISPONIVEL PARA REENVIO.' using errcode = '23514';
  end if;
  if exists (select 1 from public.sample_overdue_email_attempts
    where delivery_id = d.id and status in ('PROCESSING', 'UNKNOWN')) then
    raise exception 'EXISTE UMA TENTATIVA EM ANDAMENTO OU SEM CONFIRMACAO. CONFIRA O PROVEDOR ANTES DE REENVIAR.' using errcode = '23514';
  end if;
  insert into public.sample_overdue_email_attempts
    (id, tenant_company_id, delivery_id, status, recipient_email, idempotency_key, attempted_by)
  values (v_attempt_id, p_company_id, d.id, 'PROCESSING', d.recipient_email,
          'dawos-sample-overdue-retry-' || v_attempt_id::text, p_actor_id);
  update public.sample_overdue_email_deliveries
  set status = 'PENDING', updated_at = now()
  where id = d.id and tenant_company_id = p_company_id;
  return v_attempt_id;
end $$;
revoke all on function public.claim_sample_overdue_email_retry(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_sample_overdue_email_retry(uuid, uuid, uuid) to service_role;

create function public.finish_sample_overdue_email_retry(
  p_company_id uuid, p_delivery_id uuid, p_attempt_id uuid,
  p_status text, p_provider_message_id text default null,
  p_error_code text default null, p_error_message text default null
) returns void language plpgsql security invoker set search_path = '' as $$
declare
  a public.sample_overdue_email_attempts%rowtype;
  d public.sample_overdue_email_deliveries%rowtype;
begin
  if p_status not in ('ACCEPTED', 'FAILED', 'UNKNOWN') then
    raise exception 'RESULTADO INVALIDO.' using errcode = '22023';
  end if;
  if p_status = 'ACCEPTED' and nullif(btrim(coalesce(p_provider_message_id, '')), '') is null then
    raise exception 'ACEITE SEM ID DO PROVEDOR.' using errcode = '22023';
  end if;
  select * into d from public.sample_overdue_email_deliveries
  where id = p_delivery_id and tenant_company_id = p_company_id for update;
  if not found or d.status is distinct from 'PENDING' then
    raise exception 'O AVISO NAO ESTA EM PROCESSAMENTO.' using errcode = '23514';
  end if;
  select * into a from public.sample_overdue_email_attempts
  where id = p_attempt_id and delivery_id = p_delivery_id
    and tenant_company_id = p_company_id for update;
  if not found or a.status is distinct from 'PROCESSING' then
    raise exception 'TENTATIVA INVALIDA OU JA FINALIZADA.' using errcode = '23514';
  end if;
  update public.sample_overdue_email_attempts set
    status = p_status, provider_message_id = nullif(btrim(coalesce(p_provider_message_id, '')), ''),
    error_code = left(p_error_code, 100), error_message = left(p_error_message, 1000),
    finished_at = now()
  where id = a.id;
  update public.sample_overdue_email_deliveries set
    status = case when p_status = 'ACCEPTED' then 'SENT' else 'FAILED' end,
    provider_message_id = case when p_status = 'ACCEPTED' then p_provider_message_id else null end,
    sent_at = case when p_status = 'ACCEPTED' then now() else null end,
    error_message = case when p_status = 'ACCEPTED' then null else left(p_error_message, 1000) end,
    updated_at = now()
  where id = d.id;
end $$;
revoke all on function public.finish_sample_overdue_email_retry(uuid, uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.finish_sample_overdue_email_retry(uuid, uuid, uuid, text, text, text, text) to service_role;

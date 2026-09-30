-- Additive, sample-only migration. Existing dates are a known baseline, not
-- reconstructed promises. No external messages or other business data change.
alter table public.client_samples
  add column original_production_due_date date,
  add column original_customer_delivery_date date,
  add column original_approval_due_date date,
  add column deadline_baseline_at timestamptz;

update public.client_samples set
  original_production_due_date = coalesce(production_due_date, delivery_date),
  original_customer_delivery_date = customer_delivery_date,
  original_approval_due_date = approval_due_date,
  deadline_baseline_at = now();

create table public.sample_deadline_events (
  id uuid primary key default gen_random_uuid(),
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  sample_id uuid not null references public.client_samples(id) on delete cascade,
  stage text not null check (stage in ('PRODUCAO','ENTREGA','APROVACAO')),
  action text not null check (action in ('BASELINE','REPROGRAM','MARK_READY','MARK_DELIVERED','APPROVE','REJECT')),
  old_due_date date,
  new_due_date date,
  actual_date date,
  reason text,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_by_name text,
  created_at timestamptz not null default now(),
  check (action <> 'REPROGRAM' or (length(btrim(reason)) >= 3 and new_due_date is not null))
);
create index sample_deadline_events_sample_idx on public.sample_deadline_events(tenant_company_id,sample_id,created_at);
create index sample_deadline_events_actor_idx on public.sample_deadline_events(changed_by);
alter table public.sample_deadline_events enable row level security;
revoke all on public.sample_deadline_events from public,anon,authenticated,service_role;
grant select,insert on public.sample_deadline_events to service_role;
-- All existing sample UI uses authenticated server APIs. No direct browser
-- writes can bypass the audit or spoof the actor passed to the server-only RPC.
revoke insert,update,delete,truncate,references,trigger on public.client_samples from anon,authenticated;

insert into public.sample_deadline_events(tenant_company_id,sample_id,stage,action,new_due_date,reason)
select tenant_company_id,id,'PRODUCAO','BASELINE',original_production_due_date,'PRAZO CONHECIDO NO INICIO DO HISTORICO; ADIAMENTOS ANTERIORES NAO RECONSTRUIDOS'
from public.client_samples where original_production_due_date is not null;
insert into public.sample_deadline_events(tenant_company_id,sample_id,stage,action,new_due_date,reason)
select tenant_company_id,id,'ENTREGA','BASELINE',original_customer_delivery_date,'PRAZO CONHECIDO NO INICIO DO HISTORICO'
from public.client_samples where original_customer_delivery_date is not null;
insert into public.sample_deadline_events(tenant_company_id,sample_id,stage,action,new_due_date,reason)
select tenant_company_id,id,'APROVACAO','BASELINE',original_approval_due_date,'PRAZO CONHECIDO NO INICIO DO HISTORICO'
from public.client_samples where original_approval_due_date is not null;

create function private.sample_original_deadlines_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.status not in ('REQUESTED','IN_PRODUCTION') or new.ready_at is not null or new.delivered_at is not null or new.approved_at is not null or new.closed_at is not null then
      raise exception 'NOVA AMOSTRA DEVE INICIAR EM PRODUCAO.' using errcode='23514';
    end if;
    new.original_production_due_date := coalesce(new.production_due_date,new.delivery_date);
    new.original_customer_delivery_date := new.customer_delivery_date;
    new.original_approval_due_date := new.approval_due_date;
    new.deadline_baseline_at := null;
  else
    if (new.production_due_date is distinct from old.production_due_date
      or new.delivery_date is distinct from old.delivery_date
      or new.customer_delivery_date is distinct from old.customer_delivery_date
      or new.approval_due_date is distinct from old.approval_due_date
      or new.ready_at is distinct from old.ready_at or new.delivered_at is distinct from old.delivered_at
      or new.approved_at is distinct from old.approved_at or new.closed_at is distinct from old.closed_at
      or new.status is distinct from old.status)
      and current_setting('app.sample_workflow_id',true) is distinct from old.id::text then
      raise exception 'USE O FLUXO DE AMOSTRAS PARA PRESERVAR O HISTORICO.' using errcode='23514';
    end if;
    if (old.original_production_due_date is not null and new.original_production_due_date is distinct from old.original_production_due_date)
      or (old.original_customer_delivery_date is not null and new.original_customer_delivery_date is distinct from old.original_customer_delivery_date)
      or (old.original_approval_due_date is not null and new.original_approval_due_date is distinct from old.original_approval_due_date)
      or new.deadline_baseline_at is distinct from old.deadline_baseline_at then
      raise exception 'O PRAZO ORIGINAL NAO PODE SER ALTERADO.' using errcode='23514';
    end if;
    new.original_production_due_date := coalesce(old.original_production_due_date,new.production_due_date,new.delivery_date);
    new.original_customer_delivery_date := coalesce(old.original_customer_delivery_date,new.customer_delivery_date);
    new.original_approval_due_date := coalesce(old.original_approval_due_date,new.approval_due_date);
  end if;
  return new;
end $$;
revoke all on function private.sample_original_deadlines_guard() from public,anon,authenticated;
create trigger sample_original_deadlines_guard before insert or update on public.client_samples
for each row execute function private.sample_original_deadlines_guard();

-- A row lock + optimistic expected state makes deadline update and event insert
-- atomic and prevents a stale dialog from overwriting a colleague's change.
create function public.change_sample_deadline(
  p_company_id uuid, p_sample_id uuid, p_actor_id uuid, p_action text,
  p_expected_status text, p_expected_due date,
  p_new_due date default null, p_actual_date date default null, p_reason text default null
) returns void language plpgsql security invoker set search_path = '' as $$
declare
  s public.client_samples%rowtype;
  actor public.profiles%rowtype;
  stage_name text;
  due date;
  earliest date;
  today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select * into s from public.client_samples where id=p_sample_id and tenant_company_id=p_company_id for update;
  if not found then raise exception 'AMOSTRA NAO ENCONTRADA.' using errcode='P0002'; end if;
  select * into actor from public.profiles where id=p_actor_id and active;
  if not found then raise exception 'USUARIO INVALIDO.' using errcode='42501'; end if;
  if coalesce(actor.platform_role,'') <> 'platform_owner' and not exists (
    select 1 from public.company_members where company_id=p_company_id and profile_id=p_actor_id and active
  ) then raise exception 'SEM ACESSO A ESTA EMPRESA.' using errcode='42501'; end if;
  if coalesce(actor.platform_role,'') not in ('platform_owner','company_manager') and s.responsible_profile_id is distinct from p_actor_id then
    raise exception 'VOCE NAO PODE ATUALIZAR ESTA AMOSTRA.' using errcode='42501';
  end if;
  if s.closed_at is not null or s.status not in ('REQUESTED','IN_PRODUCTION','READY','SENT') then
    raise exception 'ESTA AMOSTRA JA ESTA ENCERRADA.' using errcode='23514';
  end if;
  if s.status in ('REQUESTED','IN_PRODUCTION') then stage_name:='PRODUCAO'; due:=coalesce(s.production_due_date,s.delivery_date); earliest:=s.requested_at;
  elsif s.status='READY' then stage_name:='ENTREGA'; due:=s.customer_delivery_date; earliest:=coalesce(s.ready_at,s.requested_at);
  else stage_name:='APROVACAO'; due:=s.approval_due_date; earliest:=coalesce(s.delivered_at,s.requested_at); end if;
  if s.status is distinct from p_expected_status or due is distinct from p_expected_due then
    raise exception 'A AMOSTRA FOI ALTERADA POR OUTRA PESSOA. ATUALIZE E TENTE NOVAMENTE.' using errcode='40001';
  end if;
  perform set_config('app.sample_workflow_id',s.id::text,true);
  if p_action='REPROGRAM' then
    if p_new_due is null or p_new_due < today or p_new_due < earliest or p_new_due is not distinct from due then
      raise exception 'INFORME UM NOVO PRAZO VALIDO, A PARTIR DE HOJE.' using errcode='22023';
    end if;
    if length(btrim(coalesce(p_reason,''))) < 3 or length(p_reason)>2000 then
      raise exception 'INFORME O MOTIVO DA REPROGRAMACAO (3 A 2000 CARACTERES).' using errcode='22023';
    end if;
    update public.client_samples set
      production_due_date=case when stage_name='PRODUCAO' then p_new_due else production_due_date end,
      delivery_date=case when stage_name='PRODUCAO' then p_new_due else delivery_date end,
      customer_delivery_date=case when stage_name='ENTREGA' then p_new_due else customer_delivery_date end,
      approval_due_date=case when stage_name='APROVACAO' then p_new_due else approval_due_date end,
      updated_at=now() where id=s.id and tenant_company_id=p_company_id;
  else
    if p_actual_date is null or p_actual_date < earliest or p_actual_date > today then
      raise exception 'INFORME A DATA REAL ENTRE O INICIO DA ETAPA E HOJE.' using errcode='22023';
    end if;
    if p_action in ('MARK_READY','MARK_DELIVERED') and (p_new_due is null or p_new_due < p_actual_date) then
      raise exception 'O PROXIMO PRAZO NAO PODE SER ANTERIOR A DATA REAL.' using errcode='22023';
    end if;
    if p_action='MARK_READY' and stage_name='PRODUCAO' then
      update public.client_samples set status='READY',ready_at=p_actual_date,customer_delivery_date=p_new_due,updated_at=now() where id=s.id;
    elsif p_action='MARK_DELIVERED' and stage_name='ENTREGA' then
      update public.client_samples set status='SENT',delivered_at=p_actual_date,approval_due_date=p_new_due,updated_at=now() where id=s.id;
    elsif p_action='APPROVE' and stage_name='APROVACAO' then
      update public.client_samples set status='APPROVED',approved_at=p_actual_date,closed_at=p_actual_date,updated_at=now() where id=s.id;
    elsif p_action='REJECT' and stage_name='APROVACAO' then
      update public.client_samples set status='REJECTED',closed_at=p_actual_date,updated_at=now() where id=s.id;
    else raise exception 'ACAO INVALIDA PARA A ETAPA ATUAL.' using errcode='22023'; end if;
  end if;
  insert into public.sample_deadline_events(tenant_company_id,sample_id,stage,action,old_due_date,new_due_date,actual_date,reason,changed_by,changed_by_name)
  values(p_company_id,s.id,stage_name,p_action,due,case when p_action='REPROGRAM' then p_new_due else null end,
    case when p_action='REPROGRAM' then null else p_actual_date end,nullif(btrim(p_reason),''),p_actor_id,actor.full_name);
end $$;
revoke all on function public.change_sample_deadline(uuid,uuid,uuid,text,text,date,date,date,text) from public,anon,authenticated;
grant execute on function public.change_sample_deadline(uuid,uuid,uuid,text,text,date,date,date,text) to service_role;

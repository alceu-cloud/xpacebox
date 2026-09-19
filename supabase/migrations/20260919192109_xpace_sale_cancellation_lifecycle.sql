-- Commercial completion depends on receipt, independently of the signature.
alter table public.xpace_contract_sales add column effective_at timestamptz;
alter table public.xpace_contract_charges
  add column payment_account_id uuid references public.xpace_payment_accounts(id),
  add column provider_cancelled_at timestamptz;
alter table public.xpace_contract_events drop constraint xpace_contract_events_event_type_check;
alter table public.xpace_contract_events add constraint xpace_contract_events_event_type_check
  check (event_type in ('CRIADO','STATUS_ALTERADO','ASSINATURA_ENVIADA','ASSINATURA_CONCLUIDA','ASSINATURA_RECUSADA','ASSINATURA_FALHOU',
    'ACESSO_BLOQUEADO_INADIMPLENCIA','ACESSO_LIBERADO_PAGAMENTO','ACESSO_BLOQUEADO_ASSINATURA','ACESSO_LIBERADO_ASSINATURA','LEMBRETE_ASSINATURA','PAGAMENTO_CONFIRMADO'));

create table public.xpace_payment_cancellations (
  charge_id uuid primary key references public.xpace_contract_charges(id) on delete restrict,
  tenant_company_id uuid not null references public.companies(id),
  status text not null default 'PENDING' check (status in ('PENDING','PROCESSING','DONE','REVIEW')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  lease_token uuid,
  last_error text,
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.xpace_payment_cancellations enable row level security;
revoke all on public.xpace_payment_cancellations from public, anon, authenticated;
grant select, insert, update on public.xpace_payment_cancellations to service_role;
create index xpace_payment_cancellations_pending_idx on public.xpace_payment_cancellations(next_attempt_at)
  where status in ('PENDING','PROCESSING');
create index xpace_sales_effective_idx on public.xpace_contract_sales(tenant_company_id,effective_at)
  where effective_at is not null;
create index xpace_charges_account_idx on public.xpace_contract_charges(payment_account_id) where payment_account_id is not null;
create index xpace_cancellations_company_idx on public.xpace_payment_cancellations(tenant_company_id,charge_id);

-- Recover the account from actual provider events, falling back only when there
-- is exactly one account in the tenant's history (never guess across accounts).
update public.xpace_contract_charges ch set payment_account_id = a.id
from public.xpace_payment_accounts a
where a.tenant_company_id = ch.tenant_company_id and ch.provider_payment_id is not null
  and (exists (select 1 from public.xpace_payment_webhook_events e
      where e.payment_account_id = a.id and e.payload->'payment'->>'id' = ch.provider_payment_id)
    or 1 = (select count(*) from public.xpace_payment_accounts a2 where a2.tenant_company_id = ch.tenant_company_id));

update public.xpace_contract_sales s set effective_at = p.paid_at
from (select contract_id, min(coalesce(paid_at,updated_at)) paid_at from public.xpace_contract_charges
      where status = 'RECEBIDO' and paid_amount_cents > 0 group by contract_id) p
where p.contract_id = s.contract_id;

create function public.xpace_sale_commercial_state() returns trigger language plpgsql security invoker set search_path = '' as $$
declare closed boolean;
begin
  if TG_OP = 'UPDATE' then new.effective_at := coalesce(old.effective_at,new.effective_at); end if;
  select status in ('CANCELADO','ENCERRADO') into closed from public.xpace_student_contracts
    where id = new.contract_id and tenant_company_id = new.tenant_company_id;
  new.status := case when new.effective_at is not null then 'CONCLUIDA' when closed then 'CANCELADA' else 'EM_PREPARACAO' end;
  if closed then
    new.signature_due_on := null;
    if new.effective_at is null then
      new.cancelled_at := coalesce(new.cancelled_at,now());
      new.cancellation_reason := coalesce(new.cancellation_reason,'CANCELADA ANTES DO PRIMEIRO RECEBIMENTO.');
    end if;
  end if;
  return new;
end $$;
create trigger xpace_sale_commercial_state before insert or update on public.xpace_contract_sales
  for each row execute function public.xpace_sale_commercial_state();

create function public.xpace_normalize_contract_ending() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if old.status in ('CANCELADO','ENCERRADO') and new.status not in ('CANCELADO','ENCERRADO') then
    raise exception 'CONTRATO ENCERRADO NÃO PODE SER REATIVADO POR EVENTOS TARDIOS';
  end if;
  if new.status in ('CANCELADO','ENCERRADO') then
    new.status := case when exists (select 1 from public.xpace_contract_sales where contract_id = new.id and effective_at is not null)
      or exists (select 1 from public.xpace_contract_charges where contract_id = new.id and status = 'RECEBIDO' and paid_amount_cents > 0)
      then 'ENCERRADO' else 'CANCELADO' end;
    new.cancelled_at := coalesce(new.cancelled_at,now());
    new.cancel_effective_on := coalesce(new.cancel_effective_on,(now() at time zone 'America/Sao_Paulo')::date);
    new.payment_access_blocked := false;
    new.signature_access_blocked := false;
    new.payment_access_blocked_at := null;
    new.signature_access_blocked_at := null;
  end if;
  return new;
end $$;
create trigger xpace_normalize_contract_ending before update of status on public.xpace_student_contracts
  for each row execute function public.xpace_normalize_contract_ending();

create function public.xpace_guard_charge_state() returns trigger language plpgsql security invoker set search_path = '' as $$
declare c public.xpace_student_contracts;
begin
  if TG_OP = 'UPDATE' then
    if old.status = 'RECEBIDO' and new.status <> 'RECEBIDO' then
      new.status := old.status; new.paid_at := old.paid_at; new.paid_amount_cents := old.paid_amount_cents;
      new.provider_status := old.provider_status;
    elsif old.status = 'CANCELADO' and new.status = 'ABERTO' then
      new.status := old.status; new.provider_status := old.provider_status;
    end if;
    if old.status = 'RECEBIDO' and new.provider_status in ('PENDING','OVERDUE','DELETED') then
      new.provider_status := old.provider_status;
    end if;
  end if;
  if new.status = 'ABERTO' then
    select * into c from public.xpace_student_contracts where id = new.contract_id and tenant_company_id = new.tenant_company_id for share;
    if c.id is null then raise exception 'CONTRATO NÃO PERTENCE À EMPRESA'; end if;
    if c.status = 'CANCELADO' or (c.status in ('ENCERRADO','PAUSADO') and new.due_on >= coalesce(c.cancel_effective_on,(now() at time zone 'America/Sao_Paulo')::date))
      or (c.cancel_effective_on is not null and new.due_on >= c.cancel_effective_on) then
      new.status := 'CANCELADO'; new.cancelled_at := coalesce(new.cancelled_at,now());
    end if;
  end if;
  return new;
end $$;
create trigger xpace_guard_charge_state before insert or update on public.xpace_contract_charges
  for each row execute function public.xpace_guard_charge_state();

create function public.xpace_charge_lifecycle() returns trigger language plpgsql security invoker set search_path = '' as $$
declare is_pix boolean;
begin
  if new.status = 'RECEBIDO' and new.paid_amount_cents > 0 then
    update public.xpace_contract_sales set effective_at = coalesce(effective_at,new.paid_at,now()),updated_at = now()
      where contract_id = new.contract_id and tenant_company_id = new.tenant_company_id and effective_at is null;
  end if;
  if new.status = 'CANCELADO' and new.provider_cancelled_at is null then
    select payment_method = 'PIX' into is_pix from public.xpace_student_contracts where id = new.contract_id;
    if new.provider_payment_id is not null or is_pix then
      insert into public.xpace_payment_cancellations(charge_id,tenant_company_id) values(new.id,new.tenant_company_id)
        on conflict(charge_id) do nothing;
      -- Issuance can finish after cancellation; reopen the intent for its new ID.
      if TG_OP = 'UPDATE' and new.provider_payment_id is distinct from old.provider_payment_id then
        update public.xpace_payment_cancellations set status = 'PENDING',next_attempt_at = now(),completed_at = null
          where charge_id = new.id and status = 'DONE';
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger xpace_charge_lifecycle after insert or update on public.xpace_contract_charges
  for each row execute function public.xpace_charge_lifecycle();

create function public.xpace_apply_contract_ending() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.status in ('CANCELADO','ENCERRADO','PAUSADO') or new.cancel_effective_on is not null then
    update public.xpace_contract_charges set status = 'CANCELADO',cancelled_at = coalesce(cancelled_at,now()),updated_at = now()
      where tenant_company_id = new.tenant_company_id and contract_id = new.id and status = 'ABERTO'
        and (new.status = 'CANCELADO' or due_on >= coalesce(new.cancel_effective_on,(now() at time zone 'America/Sao_Paulo')::date));
  end if;
  if new.status in ('CANCELADO','ENCERRADO') then
    update public.xpace_contract_sales set updated_at = now() where contract_id = new.id and tenant_company_id = new.tenant_company_id;
    update public.xpace_class_enrollments e set status = 'ENCERRADA',ends_on = greatest(e.starts_on,new.cancel_effective_on)
      where e.tenant_company_id = new.tenant_company_id and e.student_id = new.student_id and e.status = 'ATIVA'
        and (e.class_group_id = new.class_group_id or exists (select 1 from public.xpace_contract_class_groups g where g.contract_id = new.id and g.class_group_id = e.class_group_id))
        and not exists (select 1 from public.xpace_student_contracts other
          where other.id <> new.id and other.tenant_company_id = new.tenant_company_id and other.student_id = new.student_id
            and other.status in ('ATIVO','AGENDADO','PAUSADO') and (other.class_group_id = e.class_group_id or exists
              (select 1 from public.xpace_contract_class_groups g where g.contract_id = other.id and g.class_group_id = e.class_group_id)));
  end if;
  return new;
end $$;
create trigger xpace_apply_contract_ending after update of status,cancel_effective_on on public.xpace_student_contracts
  for each row execute function public.xpace_apply_contract_ending();

-- Receipts and cancellation acquire the contract before its charges.
create function public.xpace_sync_payment(p_account uuid,p_payment jsonb,p_event text) returns void
language plpgsql security invoker set search_path = '' as $$
declare ch public.xpace_contract_charges; company uuid; state text := p_payment->>'status'; paid boolean; removed boolean;
begin
  select tenant_company_id into company from public.xpace_payment_accounts where id = p_account;
  if company is null then raise exception 'CONTA XPAY NÃO ENCONTRADA'; end if;
  if coalesce(p_payment->>'id','') = '' then return; end if;
  select * into ch from public.xpace_contract_charges
    where tenant_company_id = company and ((provider_payment_id = p_payment->>'id'
      and (payment_account_id = p_account or payment_account_id is null))
      or (provider_payment_id is null and payment_account_id = p_account and id::text = p_payment->>'externalReference'));
  if not found then return; end if;
  perform 1 from public.xpace_student_contracts where id = ch.contract_id and tenant_company_id = company for update;
  select * into ch from public.xpace_contract_charges where id = ch.id for update;
  if ch.provider_payment_id is null then
    update public.xpace_contract_charges set provider_payment_id = p_payment->>'id' where id = ch.id;
  elsif ch.provider_payment_id <> p_payment->>'id' then return;
  end if;
  paid := state in ('CONFIRMED','RECEIVED','RECEIVED_IN_CASH');
  removed := p_event = 'PAYMENT_DELETED' or coalesce((p_payment->>'deleted')::boolean,false);
  if paid and not removed then
    update public.xpace_contract_charges set status = 'RECEBIDO',provider_status = state,payment_account_id = p_account,
      paid_amount_cents = round((p_payment->>'value')::numeric * 100)::integer,
      paid_at = coalesce(paid_at,now()),updated_at = now(),provider_error = null where id = ch.id;
    if ch.status <> 'RECEBIDO' then
      insert into public.xpace_contract_events(tenant_company_id,contract_id,event_type,note)
        values(company,ch.contract_id,'PAGAMENTO_CONFIRMADO',case when ch.status = 'CANCELADO'
          then 'PAGAMENTO IDENTIFICADO APÓS CANCELAMENTO. REVISAR; NENHUM ESTORNO AUTOMÁTICO FOI FEITO.' else 'RECEBIMENTO CONFIRMADO PELO ASAAS.' end);
    end if;
    if not exists(select 1 from public.xpace_contract_charges where contract_id = ch.contract_id and status = 'ABERTO'
        and due_on <= (now() at time zone 'America/Sao_Paulo')::date - 4) then
      update public.xpace_student_contracts set payment_access_blocked = false,payment_access_blocked_at = null,updated_at = now()
        where id = ch.contract_id and payment_access_blocked and status in ('ATIVO','AGENDADO');
    end if;
  elsif removed and ch.status <> 'RECEBIDO' then
    update public.xpace_contract_charges set status = 'CANCELADO',provider_status = 'DELETED',provider_cancelled_at = now(),
      cancelled_at = coalesce(cancelled_at,now()),pix_copy_paste = null,pix_qr_code_url = null,provider_error = null,updated_at = now() where id = ch.id;
  elsif ch.status = 'ABERTO' and state in ('PENDING','OVERDUE') then
    update public.xpace_contract_charges set provider_status = state,updated_at = now() where id = ch.id;
  end if;
end $$;

create function public.xpace_claim_cancellations(p_company uuid default null,p_contract uuid default null) returns setof public.xpace_payment_cancellations
language sql security invoker set search_path = '' as $$
  with claimed as (
    select j.charge_id from public.xpace_payment_cancellations j join public.xpace_contract_charges c on c.id = j.charge_id
    where (p_company is null or j.tenant_company_id = p_company) and (p_contract is null or c.contract_id = p_contract)
      and ((j.status = 'PENDING' and j.next_attempt_at <= now()) or (j.status = 'PROCESSING' and j.lease_until < now()))
    order by j.next_attempt_at,j.charge_id limit 10 for update of j skip locked
  ) update public.xpace_payment_cancellations j set status = 'PROCESSING',attempts = attempts + 1,
    lease_until = now() + interval '5 minutes',lease_token = gen_random_uuid()
    from claimed where j.charge_id = claimed.charge_id returning j.*;
$$;

-- Existing never-paid closed sales are voided; receipt history remains intact.
update public.xpace_student_contracts set status = status where status in ('CANCELADO','ENCERRADO');
update public.xpace_contract_sales set updated_at = now();
update public.xpace_contract_charges set updated_at = now() where status = 'CANCELADO';

revoke execute on function public.xpace_sale_commercial_state(),public.xpace_normalize_contract_ending(),
  public.xpace_guard_charge_state(),public.xpace_charge_lifecycle(),public.xpace_apply_contract_ending(),public.xpace_sync_payment(uuid,jsonb,text),
  public.xpace_claim_cancellations(uuid,uuid) from public,anon,authenticated;
grant execute on function public.xpace_sale_commercial_state(),public.xpace_normalize_contract_ending(),
  public.xpace_guard_charge_state(),public.xpace_charge_lifecycle(),public.xpace_apply_contract_ending(),public.xpace_sync_payment(uuid,jsonb,text),
  public.xpace_claim_cancellations(uuid,uuid) to service_role;

-- A daily plan is intentionally a real billing interval, not a testing
-- shortcut. It lets the renewal worker exercise the same contract, price and
-- financial lifecycle used by monthly, semiannual and annual plans.
alter table public.xpace_membership_plans
  drop constraint xpace_membership_plans_billing_interval_check;
alter table public.xpace_membership_plans
  add constraint xpace_membership_plans_billing_interval_check
    check (billing_interval in ('DIARIO','MENSAL','TRIMESTRAL','SEMESTRAL','ANUAL'));

alter table public.xpace_student_contracts
  drop constraint xpace_student_contracts_billing_interval_snapshot_check;
alter table public.xpace_student_contracts
  add constraint xpace_student_contracts_billing_interval_snapshot_check
    check (billing_interval_snapshot in ('DIARIO','MENSAL','TRIMESTRAL','SEMESTRAL','ANUAL'));

alter table public.xpace_contract_events
  drop constraint xpace_contract_events_event_type_check;
alter table public.xpace_contract_events
  add constraint xpace_contract_events_event_type_check
    check (event_type in (
      'CRIADO','STATUS_ALTERADO','ASSINATURA_ENVIADA','ASSINATURA_CONCLUIDA',
      'ASSINATURA_RECUSADA','ASSINATURA_FALHOU','ACESSO_BLOQUEADO_INADIMPLENCIA',
      'ACESSO_LIBERADO_PAGAMENTO','ACESSO_BLOQUEADO_ASSINATURA',
      'ACESSO_LIBERADO_ASSINATURA','LEMBRETE_ASSINATURA','PAGAMENTO_CONFIRMADO',
      'RENOVADO_AUTOMATICAMENTE'
    ));

-- Claims due contracts row-by-row. The row lock makes duplicated or concurrent
-- cron invocations harmless: one renewal advances a contract by exactly one
-- term and writes one audit event.
create function public.xpace_renew_due_contracts(
  p_company uuid,
  p_today date,
  p_limit integer default 100
) returns table (
  id uuid,
  student_id uuid,
  starts_on date,
  first_due_on date,
  ends_on date,
  billing_interval_snapshot text,
  duration_months_snapshot integer,
  base_amount_cents integer,
  amount_cents integer,
  benefit_name_snapshot text,
  discount_type_snapshot text,
  discount_value_snapshot integer,
  enrollment_service_snapshot jsonb,
  renews_automatically boolean,
  status text,
  cancel_effective_on date
) language plpgsql security invoker set search_path = '' as $$
declare
  current_contract public.xpace_student_contracts;
  catalog_amount integer;
  next_start date;
  next_end date;
  next_base integer;
  next_amount integer;
  processed integer := 0;
begin
  for current_contract in
    select c.*
      from public.xpace_student_contracts c
     where c.tenant_company_id = p_company
       and c.status = 'ATIVO'
       and c.renews_automatically
       and c.cancel_effective_on is null
       and c.ends_on < p_today
     order by c.ends_on, c.id
     limit greatest(1, least(p_limit, 500))
     for update skip locked
  loop
    processed := processed + 1;
    next_start := current_contract.ends_on + 1;
    next_end := case
      when current_contract.billing_interval_snapshot = 'DIARIO' then next_start
      else (next_start + make_interval(months => current_contract.duration_months_snapshot))::date - 1
    end;

    select p.amount_cents into catalog_amount
      from public.xpace_membership_plans p
     where p.id = current_contract.plan_id
       and p.tenant_company_id = p_company;
    next_base := coalesce(catalog_amount, current_contract.base_amount_cents);
    next_amount := case current_contract.discount_type_snapshot
      when 'PERCENTUAL' then greatest(0, next_base - round(next_base * coalesce(current_contract.discount_value_snapshot, 0) / 10000.0)::integer)
      when 'FIXO' then greatest(0, next_base - coalesce(current_contract.discount_value_snapshot, 0))
      else next_base
    end;

    update public.xpace_student_contracts c
       set ends_on = next_end,
           base_amount_cents = next_base,
           amount_cents = next_amount,
           updated_at = now()
     where c.id = current_contract.id;

    insert into public.xpace_contract_events(
      tenant_company_id, contract_id, event_type, previous_status, next_status, note
    ) values (
      p_company, current_contract.id, 'RENOVADO_AUTOMATICAMENTE', 'ATIVO', 'ATIVO',
      format('RENOVAÇÃO AUTOMÁTICA: NOVA VIGÊNCIA DE %s ATÉ %s.', to_char(next_start, 'DD/MM/YYYY'), to_char(next_end, 'DD/MM/YYYY'))
    );

    return query
      select c.id,c.student_id,c.starts_on,c.first_due_on,c.ends_on,c.billing_interval_snapshot,
             c.duration_months_snapshot,c.base_amount_cents,c.amount_cents,c.benefit_name_snapshot,
             c.discount_type_snapshot,c.discount_value_snapshot,c.enrollment_service_snapshot,
             c.renews_automatically,c.status,c.cancel_effective_on
        from public.xpace_student_contracts c where c.id = current_contract.id;
  end loop;
end $$;

revoke execute on function public.xpace_renew_due_contracts(uuid,date,integer) from public, anon, authenticated;
grant execute on function public.xpace_renew_due_contracts(uuid,date,integer) to service_role;

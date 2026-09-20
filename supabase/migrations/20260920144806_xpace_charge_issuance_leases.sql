alter table public.xpace_contract_charges
  add column if not exists provider_issue_lease_token uuid,
  add column if not exists provider_issue_lease_until timestamptz;

create index if not exists xpace_contract_charges_issue_queue_idx
  on public.xpace_contract_charges(tenant_company_id, competence_on)
  where status = 'ABERTO' and provider_payment_id is null;

create function public.xpace_claim_pending_payment_issue(
  p_company uuid,
  p_charge uuid,
  p_account uuid,
  p_lease_token uuid,
  p_lease_until timestamptz
) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare
  claimed boolean := false;
begin
  update public.xpace_contract_charges
     set payment_account_id = p_account,
         provider_issue_lease_token = p_lease_token,
         provider_issue_lease_until = p_lease_until,
         updated_at = now()
   where id = p_charge
     and tenant_company_id = p_company
     and status = 'ABERTO'
     and provider_payment_id is null
     and (provider_issue_lease_until is null or provider_issue_lease_until < now())
  returning true into claimed;
  return coalesce(claimed, false);
end $$;

revoke execute on function public.xpace_claim_pending_payment_issue(uuid,uuid,uuid,uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.xpace_claim_pending_payment_issue(uuid,uuid,uuid,uuid,timestamptz) to service_role;

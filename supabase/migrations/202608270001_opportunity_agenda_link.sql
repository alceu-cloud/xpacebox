alter table public.crm_activities
  add column if not exists opportunity_id uuid references public.crm_opportunities(id) on delete set null;

create index if not exists crm_activities_opportunity_idx
  on public.crm_activities(tenant_company_id, opportunity_id, next_action_at);

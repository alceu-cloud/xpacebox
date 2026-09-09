begin;

-- These legacy tables are not used by the current application. Their previous
-- policies granted unrestricted read and write access through the public API.
drop policy if exists anon_users_policy on public.xpace_users;
drop policy if exists anon_mats_policy on public.xpace_materials;
drop policy if exists anon_params_policy on public.xpace_pricing_params;

alter table public.xpace_users enable row level security;
alter table public.xpace_materials enable row level security;
alter table public.xpace_pricing_params enable row level security;

revoke all privileges on table public.xpace_users from anon, authenticated;
revoke all privileges on table public.xpace_materials from anon, authenticated;
revoke all privileges on table public.xpace_pricing_params from anon, authenticated;

commit;

-- Browser access is read-only for the current profile. All profile and company
-- administration goes through authenticated server routes using the service role.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
for select to authenticated
using ((select auth.uid()) = id or (select public.is_platform_owner()));

drop policy if exists profiles_update on public.profiles;
create policy profiles_update_platform_owner on public.profiles
for update to authenticated
using ((select public.is_platform_owner()))
with check ((select public.is_platform_owner()));

drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete_platform_owner on public.profiles
for delete to authenticated
using ((select public.is_platform_owner()));

drop policy if exists company_members_select on public.company_members;
create policy company_members_select on public.company_members
for select to authenticated
using (profile_id = (select auth.uid()) or (select public.is_platform_owner()));

drop policy if exists companies_select on public.companies;
create policy companies_select on public.companies
for select to authenticated
using ((select public.is_platform_owner()) or (select public.has_company_access(id)));

drop policy if exists companies_insert_platform_owner on public.companies;
create policy companies_insert_platform_owner on public.companies
for insert to authenticated
with check ((select public.is_platform_owner()));

-- Quote numbers are issued only by the server route. They must not be callable
-- through the public Supabase RPC endpoint.
revoke execute on function public.next_quote_number(uuid, text) from public, anon, authenticated;
grant execute on function public.next_quote_number(uuid, text) to service_role;

-- Anonymous visitors never need these authorization helpers. Signed-in users
-- retain access because the functions are used by RLS policies.
revoke execute on function public.can_access_company(uuid) from anon;
revoke execute on function public.has_company_access(uuid) from anon;
revoke execute on function public.is_platform_owner() from anon;

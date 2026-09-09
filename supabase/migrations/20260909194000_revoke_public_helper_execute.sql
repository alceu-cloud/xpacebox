-- Explicit role grants are kept for RLS evaluation. Remove the inherited PUBLIC
-- grants so anonymous callers cannot invoke the helpers through PostgREST RPC.
revoke execute on function public.can_access_company(uuid) from public;
revoke execute on function public.has_company_access(uuid) from public;
revoke execute on function public.is_platform_owner() from public;

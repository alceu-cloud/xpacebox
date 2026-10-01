-- Supabase can grant ALL to service_role through default privileges.
-- GRANT SELECT,INSERT alone does not remove those inherited table ACLs.
revoke all on public.xpace_stock_movements from service_role;
grant select,insert on public.xpace_stock_movements to service_role;

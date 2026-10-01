-- Supabase defaults may grant ALL to service_role. GRANT SELECT alone does not
-- Applied remotely; this filename matches the verified migration history.
-- remove existing write/DDL privileges. Restrict only this preparation module;
-- do not change project-wide defaults, legacy integrations, or existing data.
revoke all on table
  public.saas_commercial_settings,
  public.saas_pricebooks,
  public.saas_order_drafts,
  public.saas_payment_account_drafts,
  public.saas_whatsapp_connections,
  public.saas_billing_preferences,
  public.saas_billing_invoices,
  public.saas_sandbox_operations
from public, anon, authenticated, service_role;

grant select on public.saas_commercial_settings, public.saas_billing_invoices to service_role;
grant select, insert on public.saas_pricebooks, public.saas_order_drafts,
  public.saas_payment_account_drafts, public.saas_whatsapp_connections to service_role;
grant select, insert, update on public.saas_billing_preferences,
  public.saas_sandbox_operations to service_role;

revoke all on sequence public.saas_pricebooks_revision_seq from public, anon, authenticated, service_role;
grant usage, select on sequence public.saas_pricebooks_revision_seq to service_role;

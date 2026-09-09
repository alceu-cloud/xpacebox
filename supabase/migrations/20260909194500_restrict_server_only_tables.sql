-- These tables are accessed only through authenticated server routes using the
-- service role. Prevent future browser access if an RLS policy is added later.
revoke all on table public.company_manager_settings from anon, authenticated;
revoke all on table public.daily_agenda_email_deliveries from anon, authenticated;
revoke all on table public.email_integration_connections from anon, authenticated;
revoke all on table public.telephony_call_events from anon, authenticated;
revoke all on table public.telephony_connections from anon, authenticated;
revoke all on table public.telephony_user_extensions from anon, authenticated;

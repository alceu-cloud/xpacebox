-- One-time school release requested by the operator for existing XPACE trials.
-- This is NOT customer consent. New appointments remain null unless explicitly opted in.
alter table public.xpace_lead_appointments
  add column whatsapp_legacy_allowed_at timestamptz;

comment on column public.xpace_lead_appointments.whatsapp_legacy_allowed_at is
  'Operational school release for trials created before 2026-09-29T22:25:22.138042Z; not customer consent. Does not authorize financial messages.';

update public.xpace_lead_appointments
set whatsapp_legacy_allowed_at = '2026-09-29T22:25:22.138042Z'::timestamptz
where tenant_company_id = (select id from public.companies where slug = 'xpace')
  and created_at < '2026-09-29T22:25:22.138042Z'::timestamptz
  and not whatsapp_opt_in
  and whatsapp_legacy_allowed_at is null;

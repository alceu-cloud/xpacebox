-- Bounded technical metadata only: never raw payloads, recipient numbers, IDs, URLs or secrets.
create table public.xpace_zapi_receipt_diagnostics (
  connector_id uuid not null references public.xpace_zapi_connections(connector_id) on delete cascade,
  callback_type text not null check(callback_type in ('STATUS','SEND','OTHER')),
  reported_status text not null check(reported_status in ('SENT','RECEIVED','READ','READ_BY_ME','PLAYED','OTHER')),
  parser_result text not null check(parser_result in ('PARSED','INSTANCE_MISMATCH','GROUP','PHONE_FORMAT','STATUS_UNSUPPORTED','TYPE_UNSUPPORTED','IDS_FORMAT','TIMESTAMP_FORMAT')),
  last_received_at timestamptz not null default now(),
  primary key(connector_id,callback_type)
);
alter table public.xpace_zapi_receipt_diagnostics enable row level security;
revoke all on public.xpace_zapi_receipt_diagnostics from public,anon,authenticated;
grant all on public.xpace_zapi_receipt_diagnostics to service_role;

-- Keep server acceptance separate from WhatsApp delivery/read receipts.
alter table public.xpace_message_outbox
  add column delivered_at timestamptz,
  add column read_at timestamptz;

create index xpace_message_outbox_provider_receipt_idx
  on public.xpace_message_outbox(connector_id, provider_message_id)
  where provider_message_id is not null;

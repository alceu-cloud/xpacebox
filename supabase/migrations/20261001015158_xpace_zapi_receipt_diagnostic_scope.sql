-- Keep bounded diagnostic shapes separately so unrelated group traffic cannot overwrite a test failure.
alter table public.xpace_zapi_receipt_diagnostics
  add column message_scope text not null default 'UNKNOWN' check(message_scope in ('MATCHED','UNMATCHED','UNKNOWN'));
alter table public.xpace_zapi_receipt_diagnostics
  drop constraint xpace_zapi_receipt_diagnostics_pkey,
  add primary key(connector_id,callback_type,reported_status,parser_result,message_scope);

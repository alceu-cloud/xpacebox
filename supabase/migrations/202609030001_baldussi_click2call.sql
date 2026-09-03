alter table public.telephony_connections
  add column if not exists click_to_call_username text,
  add column if not exists click_to_call_token_ciphertext text,
  add column if not exists click_to_call_token_iv text,
  add column if not exists click_to_call_token_auth_tag text,
  add column if not exists click_to_call_base_url text not null default 'https://cloud10.baldussi.com.br/suite/api';

alter table public.telephony_user_extensions
  add column if not exists click_to_call_extension text;

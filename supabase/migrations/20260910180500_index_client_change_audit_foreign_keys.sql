create index if not exists client_change_history_changed_by_idx
  on public.client_change_history(changed_by);

create index if not exists clients_updated_by_idx
  on public.clients(updated_by);

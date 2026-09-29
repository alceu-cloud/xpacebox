alter table public.xpace_lead_appointments
  add column survey_opt_in boolean not null default false;

alter table public.xpace_message_outbox drop constraint xpace_message_outbox_kind_check;
alter table public.xpace_message_outbox add constraint xpace_message_outbox_kind_check
  check (kind in (
    'ASSINATURA', 'COBRANCA', 'TESTE', 'VIDEO_BOAS_VINDAS',
    'LEMBRETE_VESPERA', 'CONFIRMACAO_DIA', 'COBRANCA_PIX_AUTOMATICA',
    'AVISO_PROFESSOR', 'PESQUISA_SATISFACAO'
  ));

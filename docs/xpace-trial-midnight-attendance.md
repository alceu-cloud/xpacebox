# Falta automática de aulas experimentais

A rotina `xpace-trial-midnight-absence` roda no Supabase a cada minuto. Na virada
do dia em `America/Sao_Paulo`, experimentais com horário vinculado que ainda
estão `AGENDADO` passam para `FALTOU`. Funciona sem abrir o site ou ligar o PC
da escola. A tela mostra o resultado ao recarregar os dados.

`FALTOU` automático tem o mesmo efeito do registrado manualmente para identificar
reagendamento da mesma pessoa/modalidade. Não é necessário a equipe marcar a
falta antes: ela precisa registrar `COMPARECEU` quando houver presença ou corrigir
posteriormente uma falta automática indevida. Confirmação de agendamento não é
chamada; confirmados e não confirmados viram falta se continuarem `AGENDADO`.

## Proteções

- O job resolve somente a empresa `xpace`; toda atualização é limitada ao seu ID.
- Não altera `COMPARECEU`, `FALTOU`, `CANCELADO` ou `NAO_INFORMADO`, nem aulas de
  hoje/futuras ou histórico anterior à data de ativação registrada no job.
- Registros sem horário vinculado ficam fora (inclusive histórico não vinculado).
- Cada alteração gera um registro no histórico do lead, identificado como
  `MIDNIGHT_AUTO_ABSENCE`. Não muda o funil, a matrícula ou os envios de WhatsApp.
- A equipe pode corrigir a chamada normalmente na agenda, CRM ou app. “Sem
  chamada” não comprova ausência real; confira os resultados antes de usá-los
  para avaliação de professores.
- Uma repetição do job não duplica o histórico. Bloqueios de linha evitam
  sobrescrever uma chamada que está sendo salva; itens bloqueados ficam para a
  próxima execução. Lotes de até 500 evitam uma transação excessivamente longa.
- A função é privada, `SECURITY INVOKER` e sem execução para clientes ou
  `service_role`. O job roda como `postgres`, sem chave no navegador.

## Verificação e manutenção

No SQL Editor, consulte apenas este job em `cron.job` e seus resultados em
`cron.job_run_details`. Uma indisponibilidade do banco pode atrasar a virada;
o próximo ciclo recupera as aulas pendentes desde a ativação.

Conferência somente de leitura em 01/10/2026 às 22:21 (Brasília): job ativo,
frequência de um minuto, execução como `postgres`, início em 29/09/2026 e cinco
últimas execuções com sucesso. Nenhuma aula elegível de dia anterior permaneceu
`AGENDADO` naquela consulta. Função privada/invoker e permissões restritas
confirmadas; nenhuma alteração de presença real, novo cron ou reaplicação da
migration foi necessária. Isso é uma conferência datada, não monitor permanente.

Para pausar, use `cron.alter_job` com o `jobid` previamente conferido e
`active := false`. Não desinstale `pg_cron`: isso removeria também outros jobs.

O teste `scripts/xpace-midnight-attendance-regression.sql` usa empresas e aulas
fictícias dentro de uma transação com `ROLLBACK`, sem mensagens reais.

`npm run test:trial-rebooking` também inclui a função SQL real de fechamento em
PGlite, integrada ao guard e à identificação TypeScript de reagendamento. Prova
a virada em Brasília com sessão Tokyo, sequência de duas faltas/reagendamentos,
vínculos auditados, atividades idempotentes e correção humana preservada. Usa
somente fixtures locais; não instala pg_cron, não testa capacidade nessa fixture
mínima e não simula concorrência entre conexões reais. O teste integrado passou
na revisão de 01/10/2026, sem executar o job nem criar aulas em produção.

# Experimentais após faltas e públicos Teens/Adulto

Preparação local de 02/10/2026, sem commit, deploy ou aplicação em produção.

O telefone continua sendo a identidade da cota das duas experimentais. `FALTOU`, inclusive a falta automática da meia-noite, não consome cota; `CANCELADO` também não. `AGENDADO` reserva uma vaga na cota, para não permitir três aulas futuras gratuitas simultâneas. `COMPARECEU` consome uma aula. A mesma modalidade pode ser tentada novamente depois de falta; a regra anterior de segunda modalidade continua para uma aula já utilizada.

Conferência do formulário público, indicação no CRM e trigger de banco usam essa regra. A migration `20261002134706_xpace_trial_absences_preserve_allowance.sql` troca somente a função da cota; não altera o job da meia-noite nem os triggers de capacidade/reagendamento. Guard usa lock por tenant/telefone; mudança de uma falta para novo agendamento revalida a cota. Correções históricas de presença e exceção auditada do gestor são preservadas.

Públicos centralizados em `lib/xpace/trial-schedule.ts`: Baby 4–6, Kids 7–11, Teens 12–16 e Adulto 17+. Formulário público, Agenda e Pocket reutilizam os textos. Não muda a regra de responsável/contrato para menores de 18 anos e não transfere alunos existentes automaticamente.

Testes API/SQL isolados: duas faltas, falta + presença, modalidade repetida após falta, identidade por telefone em cadastros diferentes, quota futura, tenants, transformação de falta em agendamento, correção histórica, exceção auditada e transição usada pelo job. Teste de semanas e virada de dia/ano do Pocket passou com os novos públicos.

Histórico remoto lido em 02/10/2026 já contém `20261002010959_xpace_trial_reschedule_guard`, posterior à base Git local. É trigger separado e a mudança local da cota não o remove. Ainda é obrigatório buscar/integrar os commits do colega somente quando ele terminar, conferir conflitos e repetir os testes antes de publicar. A leitura do histórico não significa que o Git local foi atualizado.

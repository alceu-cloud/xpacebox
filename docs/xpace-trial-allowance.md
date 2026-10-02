# Experimentais após faltas e públicos Teens/Adulto

Implementada e integrada à main do colega em 02/10/2026; migration aplicada individualmente no projeto existente. Publicação autorizada por Alceu.

O telefone continua sendo a identidade da cota das duas experimentais. `FALTOU`, inclusive a falta automática da meia-noite, não consome cota; `CANCELADO` também não. `AGENDADO` reserva uma vaga na cota, para não permitir três aulas futuras gratuitas simultâneas. `COMPARECEU` consome uma aula. Isso inclui `NOVO` e `REAGENDAMENTO`: uma presença reagendada não vira uma terceira aula gratuita; `RECUPERACAO` mantém o fluxo próprio. A mesma modalidade pode ser tentada novamente depois de falta; a regra anterior de segunda modalidade continua para uma aula já utilizada.

Conferência do formulário público, indicação no CRM e trigger de banco usam essa regra. A migration `20261002165847_xpace_trial_absences_preserve_allowance.sql` troca somente a função da cota; não altera o job da meia-noite nem os triggers de capacidade/reagendamento. Guard usa lock por tenant/telefone; mudança de uma falta para novo agendamento revalida a cota. Correções históricas de presença e exceção auditada do gestor são preservadas.

Públicos centralizados em `lib/xpace/trial-schedule.ts`: Baby 4–6, Kids 7–11, Teens 12–16 e Adulto 17+. Formulário público, Agenda e Pocket reutilizam os textos. Não muda a regra de responsável/contrato para menores de 18 anos e não transfere alunos existentes automaticamente.

Testes API/SQL isolados: duas faltas, falta + presença, modalidade repetida após falta, identidade por telefone em cadastros diferentes, quota futura, tenants, transformação de falta em agendamento, correção histórica, exceção auditada e transição usada pelo job. Teste de semanas e virada de dia/ano do Pocket passou com os novos públicos.

Integração preserva o reagendamento automático do colega e seu trigger separado, validando presença/pêndencia após reagendamento com a cota nova. Teste SQL real aplica os dois guards e cobre duas faltas, presença reagendada, duas aulas utilizadas, nova tentativa da mesma modalidade e vagas futuras. Job da meia-noite não foi alterado. Falta registrada antes do fim libera cota, mas só uma fonte realmente passada vira REAGENDAMENTO.


Migration complementar aplicada individualmente: `20261002170923_xpace_trial_allowance_private_permissions.sql`, revogando execução direta do helper privado inclusive por service_role. Permissões reais conferidas; teste integrado com role de servidor confirma que inserts/updates continuam acionando ambos os triggers. Publicação funcional da integração e76bc74 comprovada por Vercel/revisão pública em 02/10/2026, sem agendamento real de teste.

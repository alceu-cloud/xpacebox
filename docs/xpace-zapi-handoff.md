# Continuação: integração Z-API do XPACEBOX

## Revisão da continuação (30/09/2026)

O usuário retomou e autorizou revisão, aplicação das migrations e publicação. **A integração continua desativada: não há credenciais Z-API salvas nem teste real pela nova integração.** A publicação não equivale à liberação da fila.

- Concorrência: reserva transacional do teste, lease, claim atômico e barreira de tentativa única. Salvar a primeira configuração já bloqueia novos claims do consumidor local; mensagens em andamento continuam exigindo conferência.
- Recibos: mesmo telefone brasileiro com/sem nono dígito; LID não é convertido em telefone; ID + destinatário + instância são verificados. READ_BY_ME não comprova entrega. Erros tardios não desfazem entrega/leitura real.
- A prova do teste pertence à versão atual das credenciais, expira em 30 minutos e não aceita conferência manual. Regravar credenciais invalida provas anteriores. A ativação exige confirmação humana e ausência de heartbeat local por 90 segundos, sem envios em andamento.
- Agendamento: existência do cron não basta. O painel exige execução bem-sucedida recente do endpoint; falhas permanecem nas providências. O alerta geral e a pontuação usam saúde cloud quando ativa, não o PC antigo.
- Uma requisição interrompida não prende o teste pausado em SENDING para sempre: após cinco minutos passa a UNKNOWN na reconciliação, sem repetir o POST. Um recibo tardio válido ainda pode confirmar o resultado. Pausar impede novas retiradas, mas não interrompe uma mensagem já em andamento.
- Diagnóstico de preparação: o cron consulta também configurações ainda desativadas, sem retirar/enviar mensagens. Consulta GET `/me` da Z-API e retorna apenas indicadores de configuração dos dois callbacks, filtros e preservação do robô; nunca tokens/endereço privado. Esses indicadores não substituem recibo real de entrega. A tarefa antiga deixou de enviar heartbeat às 21h04 de 30/09 na última consulta; isso não comprova que sua tarefa Windows foi desativada.
- O webhook registra somente tipo/status allowlisted e resultado de validação em `xpace_zapi_receipt_diagnostics` (no máximo três linhas por conector, acesso exclusivo service-role). Isso distingue ausência de callback de rejeição de formato sem guardar payload, telefone, IDs, mensagem ou segredo. Migration aplicada: `20261001014526_xpace_zapi_receipt_diagnostics.sql`. Consulta real `/me` às 22h42 confirmou os dois endereços corretos, filtros desativados e robô preservado; isso ainda não comprova recibo do teste.
- Migrations aplicadas via Supabase e arquivos alinhados ao histórico real: `20261001001620_xpace_zapi_cloud.sql` e `20261001001638_xpace_zapi_scheduler.sql`. As quatro tabelas Z-API têm RLS e acesso somente service-role; o aviso informativo RLS sem políticas é intencional nesse desenho server-only. Nenhuma configuração habilitada pela migration.
- Histórico autorizado: quatro envios antigos sem recibo de Julia Correa/Vitor Bittencourt receberam `manually_confirmed_at` e justificativa. **Não são recibos de entrega fabricados.** O teste UNKNOWN de Alceu já confirmado no chat foi regularizado e retirado das pendências sem apagar o histórico. Envios futuros permanecem na regra normal.
- Validação: 9 testes de adapter, SQL real em PostgreSQL isolado (PGlite 0.3.14), regressões de aula/professor/notificações/status e interface desktop/mobile. `npm run build` completo passou com o ambiente local configurado; warnings CSS preexistentes. Nunca houve envio real Z-API nesses testes.

### Para concluir pessoalmente

1. **Loja → Configurar conector → Configurar Z-API**: preencher ID da instância, token da instância e Client-Token, sem mandar valores no chat. Salvar mantém a fila pausada.
2. Copiar o endereço privado dos recibos para **Ao enviar** e **Receber status da mensagem**, preservando **Ao receber** do atendimento e a instância/sessão existentes.
3. Parar/desativar a tarefa antiga `XPACEBOX Integrador WhatsApp` no PC da escola, sem apagar sessão/.env. Fechar a janela não impede reinício pela tarefa. Não abrir instância paralela.
4. Consultar conexão; fazer **um teste novo somente para Alceu**. Conferir no celular e aguardar recibo real no painel. Não liberar por simples aceitação ou ID. Não repetir uma tentativa ambígua sem conferir a conversa.
5. Preparar o agendamento se ainda não estiver saudável; aguardar a execução confirmada e 90 segundos sem heartbeat local. Marcar as duas confirmações e ativar. Apenas QUEUED elegíveis e no prazo serão consumidos; UNKNOWN não volta para a fila automaticamente.

Limitação de operação: uma mensagem por minuto para o consumidor cloud atual. É conservador e pode formar backlog com mais escolas/clientes; medir antes de ampliar. Trocar o host não transforma a Z-API em API oficial da Meta nem elimina risco de bloqueio.

Na revisão, 9 itens continuam QUEUED (inclusive avisos futuros e duas pesquisas dentro do prazo), nenhum SENDING/UNKNOWN. Ariel (confirmação e professor), vídeo de Hevelin e um segundo teste antigo têm aceitação sem recibo: não há prova automática de entrega nem autorização para inventá-la. Avisos da aula já encerrada de Ariel não devem ser reenviados fora do prazo. A nova Z-API não consegue obter retroativamente recibos de mensagens enviadas pelo conector local.

## Handoff original preservado (antes da retomada)

O texto abaixo descreve o estado anterior em `c4ab12e`, e não deve ser usado como estado atual das migrations/testes.

## Objetivo e autorizações

Substituir o consumo local da fila por Z-API na nuvem, mantendo a instância e o número já usados pelo robô de atendimento da escola. O usuário autorizou publicação depois dos testes, mas agora pediu apenas salvar/enviar o trabalho para continuação. Nenhum envio Z-API real foi feito pelo assistente.

## Locais

- Cópia isolada desta implementação: `C:\Users\User\Documents\Codex\2026-09-21\xap\work\xpacebox-zapi`.
- Repositório original do amigo: `C:\XpaceBox\xpacebox` (não modificado por esta implementação).
- Conector instalado: `C:\XpaceBox\connector` (não modificado, parado ou desativado nesta implementação).
- Sessão: `%LOCALAPPDATA%\XpaceBox\message-connector`; logs: `%LOCALAPPDATA%\XpaceBox\message-connector-logs`.
- GitHub `alceu-cloud/xpacebox`, produção `https://www.xpacebox.com.br`, Vercel `pricing-app-1`.
- Supabase `iphmzkrwhrzjkmivbxno`. Use o conector Supabase existente, não pedir service-role ou tokens pelo chat.

## Verificado no painel Z-API

A instância **Xpace** está conectada e paga. O webhook **Ao receber** aponta para `https://atendimento-xpace.onrender.com/webhook`: pertence ao robô de atendimento e **não deve ser alterado**. Os campos **Ao enviar** e **Receber status da mensagem** estavam vazios. Nenhuma configuração do painel foi salva ou alterada. Não gerar outro token nem QR.

## Implementado localmente (ainda precisa revisão ponta a ponta)

- Regras do worker extraídas para `lib/server/xpace-message-worker.ts`; a rota local conserva a autenticação existente.
- Adapter `lib/server/zapi-client.ts`: texto/vídeo, Client-Token, timeout, erros sanitizados, sem retry automático; resposta com ID é aceitação, não entrega.
- `lib/server/xpace-zapi.ts`: credenciais criptografadas usando o helper existente, tentativa única por mensagem, lease de execução, reconciliação de recibos.
- Rotas de configuração de gestor, teste isolado com a fila pausada, ativação exigindo recibo real recente e confirmação humana, webhook autenticado e cron.
- Painel `ZapiConnectorSettings.tsx`; saúde do conector exibida como Z-API quando ativada. A interface não exibe novamente tokens salvos.
- Duas migrations **somente em arquivos; NÃO aplicadas**: conexões/tentativas/eventos e agendamento Supabase Cron + Vault + pg_net. Cloud fica desativada e pausada por padrão.
- Cron proposto consome uma mensagem por minuto. `pg_cron` e Vault já estão instalados; `pg_net` disponível, mas ainda não instalado. A rotina só será criada por ação explícita do gestor.

## Pendências críticas antes de merge/deploy/ativação

1. Conferir `git status` e buscar main atual: o amigo pode ter novos commits. Preservar todos os trabalhos concorrentes. Revisar o diff desta branch.
2. Rodar testes unitários e integração controlada; o TypeScript passou numa etapa anterior, mas houve alterações posteriores. Verificar o resultado final de build indicado no handoff do chat.
3. Revisar e testar SQL/RPCs, isolamento de tenant, monotonicidade dos recibos e a corrida webhook antes de RESULT. Confirmar schema real de `extensions.digest`/`gen_random_bytes`. Aplicar apenas as duas migrations revisadas com ferramenta de migration; nunca `supabase db push`/repair às cegas.
4. **Normalização PN:** comparação do destinatário por SHA256 é estrita. Z-API pode retornar telefone brasileiro sem o nono dígito; criar/testar normalização consistente no TypeScript e no RPC. Não confundir PN com LID nem marcar recibo de outro destinatário.
5. Vincular prova de teste à versão da configuração: hoje ativação aceita um teste recente de 30 minutos, mas não invalida automaticamente a prova quando credenciais são salvas outra vez. Acrescentar `configured_at` ou versão da configuração e validar tentativa posterior.
6. Revisar activation/lease concorrentes e limite de teste; impedir duas mensagens de teste em chamadas simultâneas com IDs diferentes. Testes com o mesmo requestId são idempotentes.
7. Confirmar agendamento realmente executando o endpoint, não apenas cron.job existente; considerar heartbeat e saúde de scheduler. Uma mensagem/minuto é conservador, mas pode formar backlog; só ampliar após medir duração/intervalo, sem exceder runtime.
8. Confirmar chave de criptografia de integrações já configurada na produção; jamais imprimir env/credenciais. As chaves Z-API serão preenchidas pessoalmente pelo usuário na interface de gestor depois do deploy.
9. Configurar **apenas Ao enviar e Receber status da mensagem** com o endereço privado autenticado do XPACEBOX, preservando Ao receber e demais configurações. Não expor esse endereço/chaves em chat, screenshots ou logs.
10. Fazer um teste NOVO somente para Alceu, fila de clientes isolada/pausada. Aguardar aceitação + webhook RECEIVED/READ + recebimento real no celular. DeliveryCallback e SENT não provam entrega; READ_BY_ME deve ser ignorado.
11. Na troca, parar/desativar a tarefa local sem apagar sessão/.env. Somente então ativar cloud, conferir bloqueio de CLAIM/HEARTBEAT local, liberar QUEUED e acompanhar recibos reais. Não deixar dois consumidores.
12. Revisar textos/saúde/pontuação: não depender de heartbeat local quando cloud ativa; não anunciar garantia contra banimento. Z-API é alternativa em nuvem, não API oficial Meta.

## Verificação na pausa

- `node --test tests/zapi-client.test.cjs`: **7 testes passaram**, cobrindo texto/vídeo, erro/timeout sem retry, aceitação versus entrega, READ_BY_ME e sanitização.
- `git diff --check`: sem problemas de whitespace.
- Build final: compilação e validação de tipos passaram; `npm run build` **não concluiu** porque o prerender de `/dashboard` exige variáveis Supabase ausentes nesta cópia isolada. Nenhuma credencial foi copiada para contornar isso. Repetir o build completo em ambiente configurado antes de merge. Há warnings CSS existentes de `end` versus `flex-end`.
- Migrations e tabelas Z-API: **nenhuma aplicada**, ausência das tabelas confirmada no Supabase.
- Última leitura do conector antigo em 30/09/2026 às **20:42:02 (Brasília)**: `ERROR`, 9 `QUEUED`, 0 `SENDING`, 1 `UNKNOWN`. A Z-API permanece conectada no próprio painel, mas não integrada/ativada no XPACEBOX.
- Flags do .env carregadas sem exibição: `XPACEBOX_PAUSE_SEND` não está ativa, `XPACEBOX_SEND_LIMIT` não foi definido. Não confundir ausência de pausa com conexão saudável. Nenhum processo foi parado/reiniciado nesta tarefa.
- Tarefa `XPACEBOX Integrador WhatsApp`: `Running`; um launcher e um worker filho, ambos Node 22, sem `--pause-send` forçado. Estar executando não comprova conexão WhatsApp.
- Fora do Git desta implementação: somente `node_modules`, `.next` e `tsconfig.tsbuildinfo` (dependências/cache). Nenhum código fonte deste trabalho foi deixado de fora. Arquivos do conector instalado e de outros trabalhos do amigo foram preservados, sem incluí-los nesta branch.

## Configurações necessárias (somente nomes)

- Já usadas no servidor: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `INTEGRATION_CREDENTIAL_ENCRYPTION_KEY` (helper aceita fallback `BALDUSSI_CREDENTIAL_ENCRYPTION_KEY`).
- Agendamento: `CRON_SECRET` para cron convencional é opcional se for usado o segredo dedicado do Supabase Vault, criado pela rotina proposta.
- Formulário privado Z-API: `instanceId`, `instanceToken`, `clientToken`; **preenchimento pessoal do usuário**, nunca pelo chat. Webhook usa segredo separado gerado e armazenado criptografado.
- Nenhuma credencial foi salva, copiada para arquivos deste checkout ou incluída no Git. A página foi apenas consultada, sem salvar configurações.

## Regras preservadas

- Reusar `xpace_message_outbox`, histórico, autorização e validação do agendamento; não recriar envios já recebidos.
- Nunca reenviar UNKNOWN automaticamente. ID retornado não basta para verde. Verde somente entrega/leitura real.
- Professor recebe aviso três horas antes da aula conforme `beb1e0f`; não antecipar/burlar essa regra.
- Não alterar cobranças, contratos, outros clientes, Meta/ManyChat ou robô de atendimento para testar.
- Não apagar sessão, .env, pareamento, chave do conector ou histórico de erro. Não mostrar tokens, telefones completos ou conteúdo de mensagens em diagnóstico.
- Não pintar cards cinza de verde: cinza pode significar ausência histórica de registro. Julia Venturi tinha só pesquisa registrada, não os demais envios. Aviso futuro de Esyher ao professor permanece programado para 07/10 às 16h.

## Referências oficiais usadas

- Texto: https://developer.z-api.io/message/send-text
- Vídeo: https://developer.z-api.io/message/send-message-video
- Status: https://developer.z-api.io/instance/status
- Recibos: https://developer.z-api.io/webhooks/on-whatsapp-message-status-changes
- DeliveryCallback e erros: https://developer.z-api.io/webhooks/on-message-send-examples
- Conceito: https://developer.z-api.io/webhooks/introduction

Retornos RECEIVED/READ comprovam recibo. DeliveryCallback apenas informa entrega ao WhatsApp, não ao contato. O webhook de status tem `instanceId`, `ids`, `phone`, `momment` em milissegundos. Erro assíncrono não deve produzir reenvio automático.

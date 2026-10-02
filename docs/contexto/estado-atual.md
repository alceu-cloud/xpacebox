# Estado atual do XPACEBOX

Última conferência desta base de contexto: 01/10/2026, America/Sao_Paulo. Este retrato reúne a documentação de continuidade do colega e a entrega de grade de tamanhos, relatório e cadastro de produtos desta conversa. Leia commits e mudanças posteriores antes de assumir que o retrato continua atual. A referência de atualização é a `main` corrente, nunca um hash congelado neste arquivo.

Atualização de interface/navegação em 02/10/2026 abaixo. Ela não renova snapshots antigos de saldo, integrações ou dados do banco: nenhum dado operacional foi modificado ou reconferido nesta tarefa.

## Arquitetura e módulos

XPACEBOX é SaaS multiempresa/modular em Next.js, React, TypeScript, Supabase Auth/Postgres/Storage e Vercel. Há ambientes/regras para XPACE, DAWOS, CARCAT e GTA. Preserve administração da plataforma separada das empresas, vínculos por usuário, módulos autorizados e isolamento de dados.

Existem clientes/CRM, produtos/fichas técnicas, formação de preço direta e por engenharia, orçamentos, amostras, notificações, relatórios e módulos específicos da escola. O código possui integrações XPay/Asaas, Autentique e Baldussi; existência de código não comprova que cada ambiente foi configurado/testado. Não modificar cobranças/contratos para testar outras funcionalidades.

O visual é claro, compacto e segue identidade da empresa. Alceu prefere poucas informações abertas por padrão, configurações recolhidas e pouco espaço desperdiçado. Preservar textos/formatos do módulo, e-mails em minúsculas, escala global, fontes e componentes existentes.

## XPACE no iPhone e no desktop

- App vigente é PWA instalada na Tela de Início: `/xpace/app`. Não é app nativo na App Store.
- Abas: Dashboard, Agenda e Estoque, com saudação, sino e atualização puxando para baixo.
- Agenda vincula leads à aula/data correta pelo agendamento existente. Presença é `COMPARECEU`/`FALTOU`; matrícula continua decisão da atendente. Não criar segunda presença ou matricular automaticamente.
- Falta de experimental sem chamada é automática na virada do dia em Brasília: o job `xpace-trial-midnight-absence` muda `AGENDADO` para `FALTOU` nas aulas de dias anteriores com horário vinculado, desde a ativação. Não exige marcação manual de falta nem PC ligado; preserva presentes/cancelados e permite correção pela equipe. A falta automática também é fonte válida de reagendamento da mesma modalidade. Detalhes em `docs/xpace-trial-midnight-attendance.md`.
- Push de novo agendamento foi implantado e o usuário confirmou recebimento. Preservar o par VAPID existente. Limites: versão documentada aceita endpoints Apple e não possui fila persistente/retry; push falho não desfaz agendamento.
- Rolagem com mouse no desktop foi restaurada sem remover pull-to-refresh móvel. Não interceptar rolagem interna, controles/modais nem descartar formulário editado sem confirmação.
- `components/BuildRevision.tsx` mostra `VERSÃO` usando `NEXT_PUBLIC_BUILD_REVISION`. `next.config.mjs` deriva a revisão do build/Git. Preservar identificação nas telas, sem fixar hash na interface.

## Reagendamento após falta — regra autorizada em 01/10/2026

Implementado no link público e na inclusão pela Agenda: identificar o lead por cadastro compatível e classificar automaticamente `REAGENDAMENTO` somente se a última aula não cancelada da **mesma modalidade** ficou `FALTOU`, encerrou em Brasília e antecede o novo horário. Outra modalidade continua `NOVO`, mantendo quota e consentimento existentes. CRM manual valida a mesma condição; não usar esse tipo para contornar quota de outra modalidade. Nome/telefone/e-mail ambíguos exigem equipe, sem misturar familiares nem fundir leads. Reconhecimento cadastral não é autenticação por SMS.

Falta antiga, agendamento e histórico permanecem; o novo resultado pertence à nova aula. `FALTOU` pode ter sido registrado pela equipe ou pela rotina existente à meia-noite; não é necessário marcar a falta manualmente. Última presença/pendência da modalidade impede reaproveitar uma falta antiga. Não confirmar, cancelar ou reagendar antecipadamente não equivale a `FALTOU`: o job fecha somente a presença ainda `AGENDADO` depois da virada do dia, independentemente de confirmação. Casos sem horário/modalidade ou empate ficam para conferência. Fonte auditável + guard invoker privado + índice único protegem a mesma falta de dois reagendamentos ativos; nenhum backfill/cron/permissão pública novo. Detalhes e limitações em `docs/xpace-reports.md`.

Conferência somente de leitura em 01/10/2026 às 22:21, Brasília: job de falta ativo, frequência de um minuto, executado como postgres, início fixado em 29/09/2026 e últimas cinco execuções bem-sucedidas. Função privada invoker sem execução para anon/authenticated/service_role; nenhuma aula elegível de dia anterior ainda pendente na consulta. Não foi forçada uma virada nem alterada presença real. A rotina existente foi preservada, sem novo cron/migration.

Revisão do esclarecimento de Alceu: passou teste integrado PGlite com a função SQL real de falta automática e o guard novo, incluindo corte 23:59:59/meia-noite Brasília mesmo com sessão em Tokyo, detecção TypeScript, duas gerações de reagendamento, confirmação independente, atividades sem duplicação e correção humana preservada. Reexecutados os 23 testes Node e as métricas de relatório. Mudança somente de testes/documentação, sem alterar código operacional, dados ou cron; o teste isolado não executa pg_cron nem prova concorrência entre conexões/capacidade.

Passaram localmente 23 testes Node de lógica/APIs, SQL PGlite com quota real/isolamento/fonte duplicada/correções/exclusões, regressões de experimentais/relatórios, TypeScript e build otimizado. Nenhuma aula ou WhatsApp real criado para teste. A prova de unicidade não é teste de duas sessões PostgreSQL reais. Migration `20261002010959_xpace_trial_reschedule_guard.sql` aplicada individualmente, com histórico remoto alinhado: coluna/trigger/índice único válidos, função invoker privada sem execução direta de anon/authenticated/service_role e RLS/grants de clientes preservados. Zero fontes preenchidas na conferência; sem backfill. Advisors não apontaram a nova função/índices; isso não significa ausência de avisos preexistentes no projeto. Código publicado no commit `8ecf6bee77193e6a822c94bffb470e3cc57023f0`: push para `main` confirmado, status Vercel bem-sucedido e bundle servido em `www.xpacebox.com.br/xpace` com revisão `8ecf6be`. Página pública e GET público responderam 200; GETs de Agenda/CRM sem sessão responderam 401. Não foi feito POST de agendamento real em produção: a validação funcional da regra foi isolada, sem gerar aulas nem avisos de clientes.

## WhatsApp na nuvem

Z-API está implantada/ativada; o usuário e recibos anteriores confirmaram operação. A saúde atual precisa ser consultada no painel/API, não deduzida deste arquivo. A instância/número também servem ao robô de atendimento. Preserve “Ao receber” do robô; não sobrescrever com o callback de recibos do XPACEBOX.

O conector Baileys/local deixou de ser necessário. A tarefa Windows antiga foi removida e arquivos guardados de forma recuperável em `C:\Users\User\AppData\Local\XpaceBox\connector-desativado-20261001`. Não iniciar `npm start`, restaurar autostart ou gerar pareamento/QR/chave. Não apagar arquivos privados/sessão.

Regras de estados:

- ID/“processada”/aceitação do servidor não comprovam entrega.
- Verde somente por recibo válido de entrega/leitura ou conferência manual explícita com campo/nota próprios. Não inventar `delivered_at/read_at`.
- Validar mensagem, destinatário, instância e tentativa. `READ_BY_ME` não comprova entrega ao cliente; LID não é telefone.
- `UNKNOWN` não é reenviado automaticamente. Conferir conversa e autorização antes de nova tentativa ambígua.
- Agendamento futuro não é falha. Aviso de aula passada não deve ser disparado só para limpar painel.
- Um tick no WhatsApp não confirma entrega; dois cinza confirmam entrega sem leitura/resposta.
- Alerta de 15 minutos sem recibo pede conferência, não expira a espera e não autoriza reenvio. Recibos tardios válidos são reconciliados; lookup auxiliar de LID possui janela de 3 dias no código e exige análise se a confirmação for muito tardia.

O painel consulta aproximadamente a cada 10 segundos enquanto visível. O consumidor cloud documentado retira uma mensagem por minuto: possível gargalo multiempresa; medir antes de ampliar. Z-API não é API oficial Meta e não elimina risco de bloqueio.

O Integrador possui título compacto, conexão menor, configuração Z-API recolhida e abas LEADS/NOTIFICAÇÕES. LEADS reúne experimentais/professores; NOTIFICAÇÕES reúne avisos internos/estoque. Testes ficam fora das listas/contadores normais. Falhas/incertos/falta de recibo seguem nas Providências. O botão inferior “Voltar para loja” foi removido, preservando navegação superior.

Não guardar contagens fixas de fila nesta memória. Último caso discutido no chat: mensagem de Julia visível no WhatsApp da escola com um tick, sem comprovação de entrega; consultar estado atual, não reenviar pelo alerta.

## Estoque implementado

- Desktop: Produtos, Categorias, Unidades e Folha de códigos.
- Categorias iniciais: Acessórios, Alimentos, Bebidas, Equipamentos e Roupas.
- Unidades iniciais: Caixa/CX, Grama/G, Litro/L, Metro/M, Mililitro/ML, Pacote/PCT, Peça/PC, Quilograma/KG, Unidade/UN.
- Cadastro em modal com descrição, custo/venda, unidade, categoria, foto, controlar estoque, mínimo e código da embalagem ou QR interno.
- Preservar zeros iniciais. Sabores, cores e embalagens diferentes ficam em produtos separados. Tamanhos do mesmo modelo ficam na grade; cada SKU possui seu próprio saldo e código. Arquivar preserva histórico; categorias/unidades em uso não são excluídas.
- App oferece seleção por lista, pesquisa pelo nome, foto/saldo, entrada/baixa e confirmação de quantidade. Não é necessário ler QR nem autorizar câmera.
- Saldo inicia em zero; entrada registra saldo inicial. Não permitir negativo.
- Saldo, histórico e alerta são atômicos. Após resposta ambígua, mesma operação usa o mesmo `requestId` UUID e payload; não duplicar movimento.
- Exemplo de regra: com mínimo configurado em 5, saldo 5→4 gera aviso na tela e, com destinatário/integrador configurados, WhatsApp ao Alceu. O mínimo não é sempre 5: os novos cadastros desta conversa usam zero, sem inventar um ponto de reposição. Não repetir enquanto abaixo; reposição até o mínimo rearma. Destinatário em `xpace_stock_settings.alert_phone`, fora do Git e da resposta pública.

Atualização do amigo incorporada sem alterar seu código:

- Produto com grade de tamanhos PP/P/M/G/GG/XG aparece como um modelo no catálogo e na folha de QR. Selecionar o modelo na lista exige escolher o tamanho antes de entrada ou baixa; roupas usam peças inteiras.
- Editar grade preserva IDs, QR, saldos e histórico. Tamanho com saldo não pode ser removido. Remoção sem saldo arquiva; arquivar modelo bloqueia tamanhos; reativar modelo não restaura tamanho removido.
- Relatórios → Estoque · Entradas e baixas, somente gestores: período em Brasília, produto, responsável e tipo, 50 registros por página, nota e saldo antes/depois, inclusive produtos arquivados. Nome do responsável preserva o snapshot do lançamento; conta compartilhada não identifica a pessoa física.
- Existe `scripts/import-stock-photo-catalog.cjs` para importação explícita por operador, dry-run por padrão. Não executar `--apply` ou repetir catálogo só por encontrar o script; conferir manifesto, autorização e dados atuais. A importação das fotos abaixo já foi concluída; não cadastrá-las novamente.

### Cadastro das fotos concluído em 01/10/2026

Conferência em produção realizada nesta conversa após publicação e importação autorizada (snapshot histórico, não saldos atuais):

- 16 novos Red Horse com foto e QR interno exclusivo, sabores/versões/volumes separados; custo R$4,50 e venda R$10,00 por unidade. Inclui a garrafa tradicional 275 ml e os sabores em lata 473 ml. Não usar o código de barras do fabricante para esses cadastros.
- Red Horse Powerdrink Creatina Maçã Verde Zero Açúcar 350 ml já existia. Foto e descrição atualizadas sem trocar ID/QR/preços; saldo 3 preservado naquela conferência. Não criar outro cadastro.
- Camiseta XPACE — 2ª coleção: custo R$79,90 / venda R$109,90; Calça XPACE: R$129,90 / R$159,90; Camiseta HHI 2026 — Ohio: R$49,90 / R$49,90, sem margem bruta.
- Cada roupa possui PP/P/M/G/GG/XG dentro de um só modelo visível, com seis SKUs de tamanho. Os produtos/tamanhos novos começaram zerados porque Alceu não informou as quantidades reais; lançar por Entrada conforme contagem física.
- Na conferência: 20 produtos visíveis com foto, 18 SKUs de tamanho e 38 códigos únicos. O único movimento preexistente permaneceu; a importação não criou entradas/baixas fictícias nem enviou testes reais de estoque.
- Imagens foram enviadas ao bucket de produtos. Manifesto, prompts da edição integrada e imagens finais estão na pasta local `output/stock-catalog-20261001` da cópia usada nesta conversa; essa pasta não foi enviada ao GitHub e pode não existir em outro computador. Não importar novamente nem pedir chaves para reconstruí-la. Consulte os produtos existentes antes de qualquer nova carga.
- Build, testes de estoque e testes de navegador gerais + grade/relatório passaram. Navegador usou fixtures interceptadas, incluindo entrada/baixa por tamanho em 320/390 px, filtros/responsável/paginação e impressão A4. Deploy Vercel confirmado; `/xpace` e `/xpace/app` retornaram 200 e a rota nova de relatório retornou 401 sem sessão, como esperado. Isso não substitui teste físico de câmera no iPhone ou entrega real de alertas.

Gerentes/proprietário gerenciam catálogo; membros autorizados movimentam; custo somente a gerentes. Tenant/autor vêm da sessão. Tabelas com RLS e acesso direto de `anon/authenticated` revogado; RPCs invoker, search_path vazio, service-role. Ledger append-only no servidor: leitura/inserção, sem alteração/apagamento. Fotos no bucket público `xpace-stock-images`, JPEG/PNG/WebP até 3 MB, upload autorizado pelo servidor; sem documentos pessoais.

**Financeiro do estoque expressamente adiado.** Entrada/baixa não geram venda, receita, cobrança ou recebimento. Separar venda, consumo e perda antes de integrar; toda baixa não é venda.

Migrations desta entrega já aplicadas, sem `repair`/push geral:

- `20261001191516_xpace_stock_catalog.sql`.
- `20261001191521_xpace_message_notification_tabs.sql`.
- `20261001191820_xpace_stock_ledger_permissions.sql`.
- `20261001205529_xpace_stock_sizes.sql` — grade de tamanhos. Registro remoto confirmado nesta publicação por consulta somente de leitura; não foi aplicada novamente.

Não reaplicar. Consulte o histórico remoto para quaisquer migrations posteriores.

## Impressão e câmera

Folha compacta publicada/verificada: A4 com margens 10 mm, três colunas horizontais, foto pequena, nome, preço/unidade e QR 22 mm; identificador extenso não impresso. Teste de 30 produtos comuns coube em uma página. Nomes longos expandem cartão sem truncar. Imprimir a 100%, sem cabeçalhos/rodapés. PDF renderizado foi inspecionado e QR reduzido decodificado.

Histórico da câmera: ZXing suporta QR e EAN-13, inclusive fixture começando em 789; houve relatos de dificuldade com prata/reflexo e códigos vizinhos. A entrega de seleção por lista substitui o leitor no fluxo de movimentação. O componente/decoder e os códigos existentes foram preservados, mas o app não solicita câmera para selecionar produtos.

## DAWOS e pendências a reconferir

Cadastro de amostra usa modal; abertura da tela mostra indicadores, botão e lista. E-mails de amostras têm “Tentar novamente” na própria pendência, autorizado a gerente, uma tentativa do aviso específico com idempotência/histórico. Teste/configuração não resolvem falha antiga; sucesso só após aceite real salvo e recebimento conferido separadamente.

Destinatários: produção = PPCP + suporte, consultor em cópia; entrega/aprovação = somente consultor. Não trocar durante reenvio nem executar todas as amostras para testar. Situação final do antigo aviso PAES BUENO AM-000002 não foi reconferida nesta entrega; consultar banco/provedor antes de declarar resolvido ou reenviar.

Pedido de fórmulas de maleta/transpasse parcial foi pausado por trabalho do amigo. Não declarar entregue sem conferir código/banco e alinhamento com Alceu. Integração oficial Meta teve restrição/verificação no histórico: não recriar portfólios ou migrar número automaticamente.

## Verificações realizadas e próximas provas

Antes desta publicação documental, foram reexecutados e passaram `npm run test:stock` (incluindo SQL da grade e testes do relatório), `node scripts/xpace-scroll-test.cjs` e `npm run build`, já sobre o código atualizado do amigo. Nas entregas anteriores também passaram `node tests/message-control-db.test.cjs` e os testes visuais de catálogo/app/impressão com `npm run test:stock:browser`; essa validação anterior não substitui prova física nem afirma que os novos testes visuais de grade foram reexecutados nesta publicação.

SQL testado em PostgreSQL isolado/PGlite; navegador com auth/API/provedores interceptados e dados fictícios. Não foram criados movimentos nem enviados avisos reais nesses testes. Build visual local usou Supabase público fictício; não usar essa configuração em produção. Vercel faz build próprio. Impressão automatizada exige Poppler/pdfinfo no PATH ou `PDFINFO`.

Ainda exige prova física/autorizada: câmera em embalagens/iPhone e cruzamento real de estoque mínimo com recibo na aba NOTIFICAÇÕES. Há avisos documentados de dependências; não executar `npm audit fix` geral às cegas.

Em cada continuação: confira Git atual, autenticações e módulo relevante, preserve trabalho concorrente e mantenha este estado atualizado sem inventar verificação de produção.

Revisão documental de continuidade em 01/10/2026: README principal passou a apontar esta entrada, referência antiga fixa foi retirada e a manutenção no mesmo commit foi explicitada no `AGENTS.md`. Nenhum código, dado, migração, credencial ou envio real foi alterado nessa revisão. Para esta mudança apenas documental, conferir links locais e `git diff --check` é a validação proporcional; os testes de aplicação acima pertencem às entregas identificadas, não foram reexecutados só para revisar o texto.

## SaaS comercial — base implementada em 01/10/2026

Leia [SaaS comercial](../saas-commercial.md) antes de continuar este módulo. A base inicial foi implementada; isso **não significa SaaS inteiro pronto para vender nem cobrança automática ativa**.

Decisões vigentes: XPACE é a empresa principal/isenta e usa a conta mãe da XPACEBOX (mesmo CNPJ informado pelo usuário); outras empresas terão subcontas para recebimentos de seus alunos. A mensalidade SaaS e adicionais pertence à conta mãe. Xpace Pay obrigatório sem mensalidade de módulo; tarifas separadas. Integrador de mensagens opcional R$150/mês somado ao plano, sem nome Z-API ou custo interno na interface do cliente. O usuário dispensou registrar o custo do fornecedor.

Preços autorizados: 0–50 alunos R$99; 51–200 R$149; 201–300 R$199; 301–500 R$249; 501–800 R$299; 801 ou mais R$349. Fechamento no final do mês. Não confundir as faixas da imagem com a regra de medição: alunos faturáveis/média diária ainda pendentes.

Entrega: loja por slug, Config → Planos e Pagamentos e página genérica, preferência Pix/boleto/cartão e adicional em preparação, histórico de faturas paginado, tabela versionada/CAS/imutável, simulações idempotentes/tenant no servidor, conta principal protegida contra subconta indevida, registro cifrado e QR opt-in de outra empresa, adapters Sandbox e guard de operação incerta. Helpers puros de fechamento/eventos atrasados não são cron ou webhook ativos. Nenhum cartão completo/CVV armazenado; não há checkout real ligado.

Continuação após alinhar com o amigo: medição pura por competência prepara ativos no último fechamento e média diária exata, sem inventar dias nem arredondar. A regra segue PENDING, sem coleta automática. Planos e Pagamentos mostra cinco observações manuais e permite registrar a contagem atual (tenant, autor, hora Brasília e quantidade definidos no servidor/banco), com UUID idempotente e ledger imutável. Observação não é DAY_CLOSE, média ou fatura; fonte DAY_CLOSE não é gravável nessa API/tabela. Nenhuma contagem real foi criada para teste.

Migrations aplicadas individualmente e alinhadas ao histórico remoto: `20261001225412_saas_commercial_preparation.sql` e `20261001230148_saas_sandbox_operation_guard.sql`. Não reaplicar nem fazer repair/mass push. Conferência após primeira migration: XPACE como principal, fase PREPARATION, preços corretos, zero rascunhos/preferências/faturas/conexões novas. Nenhuma conta/assinatura/cobrança/mensagem externa criada. RLS e privilégios só servidor; aviso INFO sem policy é intencional.

Também aplicadas e verificadas individualmente: `20261001234305_saas_least_privilege.sql` e `20261001235446_saas_student_observations.sql`. A primeira corrigiu defaults Supabase que mantinham ALL em service_role apesar de grants mínimos; configuração principal/faturas agora SELECT-only e nenhum DELETE/TRUNCATE nas tabelas SaaS. A segunda adicionou observações append-only com RLS e grants explícitos. Consulta final: fase PREPARATION, zero faturas/operações Sandbox/observações. Nenhuma alteração de dados das empresas, chave, callback ou cron operacional.

Testes finais desta entrega: 34 testes Node SaaS/API/adapters/medição e dois suites SQL PGlite cobrindo as quatro migrations; regressão `npm run test:stock` e rolagem; telas em desktop1440/mobile320/390 com autenticação/APIs interceptadas; TypeScript/build otimizado verificados. Testes de navegador SaaS incluem observação, retry incerto com o mesmo UUID e gravação confirmada seguida de falha de leitura. Estoque/lista/grade/relatório também foram reconferidos após integrar o amigo. Somente o conflito documental exigiu resolução. Screenshot mobile inspecionado, sem overflow nem revisão cobrindo texto. Testes visuais não comprovam checkout/recibo real.

Publicação funcional conferida em 01/10/2026 (Brasília): pacote `7b27a5ce` enviado à main, remoto confirmado e Vercel success em xpacebox/pricing-app-1. `/xpace`, `/xpace/app`, `/loja/xpace` e `/planos/xpace` retornaram 200; página de planos mostrou a revisão derivada do provedor `7b27a5c`. API de plano retornou 401 sem sessão e GET na API de observação retornou 405, como esperado. Verificação somente de leitura, sem conta/assinatura/pagamento/observação/WhatsApp real. Uma publicação documental posterior registra esta prova, sem mudar comportamento. Em nova conversa, conferir a revisão atual do Git/Vercel, não usar este hash histórico como destino.

## Seleção de produtos por lista e barra desktop — entrega de 01/10/2026

Em 01/10/2026, Alceu pediu trocar a seleção por câmera/QR por uma lista no estoque, mantendo tamanho, entrada/baixa, quantidade e mensagem de sucesso. Após a preparação isolada, autorizou conferir a revisão atual e commitar as duas alterações. A cópia de trabalho estava alinhada com a `main` corrente; a outra cópia inspecionada estava limpa e em revisão ancestral já incorporada. Nenhuma alteração do amigo foi sobrescrita.

Implementada na branch local `feat/stock-product-list-20261001`, pasta `C:/Users/User/Documents/Codex/2026-10-01/ola/work/xpacebox-product-list`: foto/nome/categoria/saldo, busca por nome, paginação pela API existente, reconferência do produto escolhido e retorno à lista atualizada. O atalho desktop usa o mesmo seletor. Painéis de grade/movimento, códigos/cadastro/impressão, API, banco e integrações foram preservados.

Passaram localmente build, testes de estoque, rolagem e navegador com fixtures (320/390 px, busca, 101 produtos/paginação, cancelamento, saldo atualizado, alerta, retry idempotente, tamanhos e seletor desktop). Sem migrations, dados, env de produção ou mensagens reais. Alceu autorizou explicitamente o envio à `main` e a publicação Vercel em 01/10/2026, substituindo a espera anterior; remoto/concorrência foram novamente conferidos antes do envio. Confirmar separadamente push, deploy e revisão visível antes de declarar produção atualizada. Detalhes em `docs/xpace-stock.md`.

A nota SaaS pertence a outro escopo e foi preservada durante essa entrega de estoque; a continuação SaaS foi autorizada depois por Alceu nesta conversa.

Pedido adicional de 01/10/2026: no computador, alinhar `PRODUTOS`, pesquisa, categorias e `INCLUIR ARQUIVADOS` na mesma linha. Ajustado no catálogo desktop, sem alteração da PWA do celular. Conferido em navegador isolado a 1440/1024/768 px: controles alinhados e página sem overflow; pesquisa e filtros funcionam. PWA 390 px permanece sem a barra desktop. Textos do cadastro e da folha impressa foram ajustados para orientar seleção pela lista, mantendo IDs/QR e impressão A4. Build e testes completos foram reconferidos para a versão final antes do commit.

Publicação funcional comprovada em 01/10/2026: push à `main` confirmado e status Vercel `success` para `xpacebox/pricing-app-1`. `/xpace` e `/xpace/app` responderam HTTP 200; os arquivos públicos em produção continham a revisão da entrega, a lista/pesquisa por nome, o seletor desktop e a barra alinhada. A conferência foi somente de leitura, sem sessão, dados ou mensagens reais; testes de operação autenticada/alerta físico continuam sujeitos às provas já descritas. Não confundir confirmação dos arquivos publicados com movimentação real de estoque.

## Árvore de links — histórico da preparação de 01/10/2026

Alceu pediu um novo item opcional na Loja, tipo Linktree: R$19,90/mês no contexto dos adicionais SaaS, XPACE isenta, com endereço por empresa e seções de contratos/planos, produtos, eventos e agendamento de aula. Pedido explícito de pré-montagem e conclusão amanhã. Cartão/prévia reutilizado na loja genérica e na Loja XPACE, com preço ou isenção validada no servidor da loja genérica, teclado nativo e aviso de publicação indisponível. Caminho `/links/[companySlug]` é somente planejado: nenhuma página pública ativa nem contratação nesta entrega.

Helpers puros, validação preliminar de destinos e cinco testes novos preparados. Passaram 39 testes Node SaaS e dois suites SQL isolados, TypeScript, build otimizado e navegador com fixtures (desktop1440/mobile320/390 e Loja XPACE). Screenshot móvel inspecionado sem overflow; endereço preservado em minúsculas. `LINK_HUB` não integra ainda o pricebook, preferência ou quote: não mudar cobranças antigas silenciosamente. Nenhuma migration, escrita em produção, mensagem, conta/assinatura, callback ou cron financeiro alterado. Detalhes e etapas em `docs/saas-link-hub.md`. Lembrete local de uma execução criado para 02/10 às 09h Brasília, apenas para avisar da retomada, sem continuar sozinho.

Ajuste visual de 02/10/2026 concluído separadamente, sem retomar a implementação comercial: Árvore de links com painel roxo e ícone ramificado no mesmo padrão de XPay/Mensagens, lateral no desktop e acima no celular. Preço/isenção/PREPARAÇÃO/prévia preservados. Regressão de 39 testes Node + dois suites SQL, TypeScript/build e navegador isolado (loja genérica1440/390/320, Loja XPACE1440/768/390/320) conferidos. Nenhuma API, migration, cobrança ou ativação alterada. As pendências abaixo continuam válidas; o ajuste de aparência não publica a página pública.

## Planos e Pagamentos e navegação — 02/10/2026

Pedido de Alceu: corrigir tela desalinhada, seguir botões/identidade existentes e fazer Voltar retornar à tela anterior, enquanto a logo abre o início. Esclarecimento posterior em 02/10: **não quer flechinhas nem botão separado; o próprio título superior deve ser clicável**, preservando o visual anterior. A interpretação anterior de adicionar seta foi corrigida no código, `AGENTS.md` e [Navegação](../navigation.md). Exemplo conferido: Início → Configurações → Planos e Pagamentos; clicar no título do plano volta para Configurações, clicar em Configurações volta para Início. Esses documentos ficam no Git, não há cópia desse contexto em tabela do banco.

Planos e Pagamentos agora separa resumo, preferências e faturas, com botão roxo arredondado, ícones, menor espaço vazio e preços/observações/explicação recolhíveis. A interface explica PREPARATION: salvar preferências não contrata, não liga integração, não captura cartão e não cria fatura/cobrança. XPACE permanece isenta; medição faturável e homologação continuam pendentes. Não houve API financeira, migration, credencial, cron, integração ou escrita de clientes alterada.

Revisados os cabeçalhos de XPACE, Config/Notificações, financeiro, XPay, app, central/usuários, outras empresas e páginas genéricas da loja/plano. Cabeçalho móvel tem duas linhas quando necessário, sem cortar título. Histórico de telas substitui destinos fixos; Config e módulos usam IDs na entrada de navegação da aba para recuperar o plano ao voltar da loja genérica. Logo reinicia o painel; logo XPACEBOX abre central. Bloqueio operacional obrigatório do CRM preservado. Isso não promete recuperar rascunhos ou todos os filtros internos dos módulos legados; formulário/modal mantém suas ações específicas. Plano pede confirmação para abandonar preferências não salvas.

A correção usa `BackTitle`: botão nativo com aparência de texto, título clicável sem seta/fundo/borda e dica de retorno, teclado/foco e proteção de preferências não salvas. O histórico e a ação da logo foram preservados. Setas de retorno antigas dos menus de Clientes/Gerenciador/Relatórios/Formação de preço também foram retiradas sem trocar suas ações; paginação/calendário permanecem, pois não são Voltar entre telas.

Conferência local da correção: três testes puros de navegação; suite própria em1440/1024/768/390/320, incluindo título clicável inteiro/sem flechas, teclado Enter, CRM, Loja→benefícios→conta, Config→notificações, níveis financeiros, preferência não salva, logo, plano→loja genérica→volta ao plano e fallback de link direto. Reexecutados navegador SaaS/plano/observações, financeiro visual, app/semanas/presença, notificações DAWOS/XPACE e rolagem/pull-to-refresh. Screenshots desktop/celular inspecionados. Fixtures interceptam autenticação/APIs/provedores, sem movimentos, faturas ou envios reais. Os testes SQL/API/estoque da entrega inicial continuam sendo evidências daquela fase, não foram usados para alegar uma nova consulta ao banco nesta correção visual. Scripts de navegador foram ajustados para selecionar o título de retorno, não um botão de seta.

TypeScript e build otimizado final da correção passaram, com71 rotas estáticas geradas; avisos CSS preexistentes do Autoprefixer não são falhas desta entrega. `BuildRevision` foi preservado, assim como alterações preexistentes `supabase/.temp/cli-latest` e `output/`. A primeira versão visual, `88b5dab5`, teve push/Vercel success e revisão `88b5dab` + novo componente do plano confirmados nos arquivos públicos em02/10; API de plano sem sessão respondeu401. Essa prova histórica não comprova publicação da correção sem setas: conferir separadamente seu commit/deploy/revisão visível. Provas autenticadas destas telas são locais. As pendências SaaS/Árvore de links abaixo continuam abertas: redesenho e regra de navegação não concluem sua implementação comercial.

## Professores do mês, salas, experimentais e links — correções de 02/10/2026

A primeira integração XPACE foi publicada em 8acb212 e conferida por Vercel/bundle. Alceu pediu depois as correções abaixo; esta seção é o estado operacional atual, substituindo a interpretação anterior de uma grade acadêmica compartilhada. A main foi reconferida antes da publicação, sem novos commits do colega; sua cópia não foi alterada.

**Agenda → Professores do mês:** escala mensal independente das grades acadêmicas, sem criar/alterar turmas, horários, matrículas ou ocupação. Montar escala / Conferência, somente administração/proprietário e gerência, com autorização na API. Escolher mês (inclusive seguinte), turma ativa das grades da Agenda, sala, dias/horário/duração; abrir todas as datas e escolher professor em cada uma antes de Salvar e gerar quadro; depois corrigir professor, sala e horário por ocorrência. Tabela Professor/Horário/Dia/Sala/Check; Imprimir / PDF gera o mês completo para os professores. Não importar automaticamente a planilha ou criar vínculo persistente com as grades existentes; o catálogo fornece somente a escolha/nome da turma. [Detalhes](../xpace-teaching-workload.md).

Correção do campo Turma em02/10: seletor de turmas ativas da Agenda, limitado à empresa do gestor. Nome copiado para o quadro mensal, sem sincronização ou vínculo persistente com a grade; sala/dias/horários continuam próprios da escala. Servidor valida seleção e ignora nome livre adulterado; arquivadas/inexistentes/outro tenant são recusadas. Sem migration ou dados reais alterados. Build/TypeScript (77 rotas), test:xpace-teaching e navegador1440/390/320 passaram: catálogo, atribuição por data, quadros/PDFs e celular sem overflow. API com fixtures recusou seleção inválida/arquivada/outro tenant e derivou nome do cadastro. Publicação conferida em02/10: commit59a5274 na main, Vercel success; páginas principais HTTP200, revisão59a5274, seletor de grade e classGroupId nos bundles públicos. APIs aulas/árvore/usuários-professores HTTP401 sem sessão, acesso antigo HTTP410. Fluxos autenticados comprovados localmente com fixtures, sem criar/alterar turma ou escala real para teste.

Novo esclarecimento em02/10: a escolha dos professores deve acontecer antes de gravar. Fluxo corrigido e testado localmente: Montar turma → turma/sala/dias/horário → Escolher professores → todas as datas do mês com seletor por linha → Salvar e gerar quadro. Teens segunda/quarta emoutubro2026 gera05,07,12,14,19,21,26,28, com professor diferente por ocorrência; depois repetir Adulto e demais turmas. PDF por turma e PDF do mês inteiro. RPC transacional novo em20261002194108_xpace_save_assigned_teacher_roster.sql (aplicada individualmente e permissões conferidas); falha não salva parcialmente. Fonte continua independente das grades acadêmicas.

Administrativo → Professores mantém Valor da hora-aula (valor completo por aula, inclusive os45 minutos de Alceu), sem botão Acesso. **Usuários → Novo usuário / Editar → Perfil Professor** cria ou gerencia o usuário normal da plataforma, com empresa XPACE e escolha do professor cadastrado para identificar aulas/reservas. Login comum `/login`, com encaminhamento para https://www.xpacebox.com.br/xpace/professor. Professor vê somente Minhas aulas (próprias daquele dia) e Reserva de sala com Reservar/Ocupação; cadastro, escala mensal e conferência permanecem restritos. Admin mantém painel completo e pode abrir também o app; Gerente autorizado tem gestão das aulas/salas. Contas/vínculos anteriores preservados e editáveis em Usuários, incluindo senha e ativar/desativar acesso; API antiga de criação em Professores retorna410. Sem sessão, QR retoma a sala após o login comum, com retorno restrito à página docente. Não foi criada/alterada conta real para teste.

Correção de perfil em02/10: migration20261002204740_xpace_teacher_profile_in_users.sql aplicada individualmente; RPC invoker/search_path vazio/EXECUTE somente service_role conferidos. Salvamento transacional de perfil/vínculo/membership, sem alterar valores ou contas automaticamente. Teacher não herda permissões gerais; Admin validado no servidor/banco. Isolamento, vínculo duplicado/inativo, troca de perfil, conta desativada e rollback da conta recém-criada testados com fixtures/PGlite. Advisor sem achado da nova função, preservando três avisos preexistentes. Build/TypeScript final (77 rotas), test:xpace-teaching e navegador1440/390/320 passaram: criar/editar Professor em Usuários, manter/trocar vínculo, desativar acesso, retirar botão antigo, Admin no app, redirecionar Professor fora de Usuários e QR sem sessão → login comum → confirmação da própria aula. Provas autenticadas com fixtures, sem usuários, aulas ou reservas reais de teste. Publicação conferida em02/10: commit83997ed na main, Vercel success, /xpace, /xpace/professor, /usuarios, /login e /aula-experimental HTTP200; revisão83997ed e perfil/seleção de professor nos bundles públicos. APIs aulas, árvore de links e usuários/professores HTTP401 sem sessão; antiga API de acesso HTTP410. Funcionalidade autenticada comprovada localmente com fixtures, sem criação/alteração de usuário real para teste.

QR por sala: Agenda → Reserva de sala → Ocupação → Imprimir QR da sala, também na Ocupação principal para gestores. Confirma somente o professor atribuído, sala e dia em Brasília, entre 15 minutos antes e 15 minutos depois do início (19h → 18h45–19h15, inclusive). Repetição idempotente; mudança de taxa não reescreve aula confirmada. Remuneração por realizadas, para mês seguinte, conferência com reabertura justificada; financeiro automático adiado. QR identifica a sala, sem comprovar localização física; validação em aparelho/sala segue operacional.

**Agenda → Reserva de sala:** área separada. Ocupação gráfica semanal (segunda–domingo, 08h–22h), compartilhada com Ocupação principal; na principal navega todas as salas, na Reserva navega semanas independentemente em cada sala. Grade acadêmica e locações ocupam horários; a escala de professores é independente e não os altera. Banco mantém bloqueio atômico de reservas com aulas e locações, incluindo telas antigas, e preços proporcionais/congelados/idempotência. Salas existentes R$35/h, editável em Config → Financeiro → Valor das salas.

Nova regra autorizada: cancelamento libera a sala, sai da lista e não gera cobrança/decisão de pagamento. Histórico preservado; pendências antigas canceladas da XPACE zeradas com auditoria, sem alterar decisões já registradas ou dados de outros tenants. Cartões menores, duas linhas e letras maiores. Relatórios atuais consideram reservas ativas. Integração com financeiro continua adiada.

Pedido posterior em02/10: reserva às04h passou indevidamente; corrigido localmente para iniciar a partir de08:00 e terminar até22:00 no mesmo dia emBrasília, limites inclusivos (inclusive08h–22h). Tela/API/RPC validam faixa; novo trigger protege também locação antiga da XPACE, sem alterar histórico nem outros tenants e permitindo cancelamento. Migration20261002200053_xpace_room_reservation_hours.sql aplicada individualmente, trigger ativo e RPC invoker/sem EXECUTE de cliente conferidos. Build, test:xpace-teaching e navegador1440/390/320 passaram, incluindo04h/07:59/22:01 bloqueados,08h/22h inclusivos,14h proporcionais, UTC/Brasília, locação antiga, cancelamento de histórico e isolamento. Sem reserva real de teste; Publicação conferida em02/10: commit8f327cf enviado à main, páginas /xpace e /xpace/professor HTTP200 e revisão8f327cf/regra08h–22h nos bundles públicos; APIs aulas/acesso sem sessão HTTP401. Provas autenticadas da faixa de horários são locais com fixtures, sem reserva real criada ou cancelada para teste. Preço, conflitos e idempotência preservados.

Correção de 02/10/2026: o cartão da reserva mostra nome e celular do professor em Reservas do mês e Minhas reservas. Usa o cadastro em Administrativo → Professores, inclusive para reservas de professores arquivados; sem celular, mostra Telefone não cadastrado. Número formatado e link de ligação, sem envio de mensagem. Duas linhas no desktop, com quebra natural no celular. Consulta de contatos limitada aos professores das reservas visíveis e ao tenant da sessão; professor recebe somente o próprio contato, e Ocupação continua sem identidades/telefones. Sem migration ou alteração de reserva/cadastro real. Build/TypeScript, test:xpace-teaching e navegador com fixtures1440/390/320 passaram; cobertos contato vazio, professor arquivado, isolamento de outro professor/tenant e cartão sem overflow. Publicação conferida em02/10: commit207aa54 na main, Vercel success; /xpace, /xpace/professor e /aula-experimental HTTP200, revisão207aa54 e campos/componentes de contato nos bundles públicos. APIs aulas, árvore de links e acesso de professores HTTP401 sem sessão. A prova de nomes/telefones e fluxos autenticados foi local com dados fictícios; nenhum contato real consultado ou alterado para teste.

**Árvore de links:** somente Loja → cartão Árvore de links → Abrir árvore de links. Atalho separado do painel inicial removido. Links/Aparência/Estatísticas, editar/criar/ativar/ordenar/copiar, logo/tema/cor/prévia e rota pública após configuração; estatísticas estimadas por navegador. Outros tenants aguardam entitlement/comercial, sem ativar SaaS. [Detalhes](../xpace-link-tree.md).

O antigo Ver prévia no cartão mostrava somente um exemplo estático da preparação, não os links reais. Retirado do cartão XPACE nesta segunda correção; acesso ao editor mantido, com prévia real emAparência. Loja de outras empresas mantém preparação comercial.

Segunda correção publicada e conferida em02/10: commit727c822 na main, Vercel success, revisão727c822 e montagem por data/PDF por turma nos bundles públicos. /xpace, /xpace/professor e /aula-experimental HTTP200; aulas, árvore de links e acesso de professores HTTP401 sem sessão. Build, test:xpace-teaching e navegador1440/390/320 passaram, incluindo oito datas de outubro2026, Teens/Adulto, professores alternados, quadros e PDFs separados; nenhuma turma ou presença real criada. Não resta pendência de publicação dessa correção; o pedido posterior de grade completa consta na nota final.

Experimentais preservados: falta manual/automática libera cota; presença e pendência NOVO/REAGENDAMENTO contam nas duas por telefone. Reagendamento do colega, identidade/capacidade/job à meia-noite preservados. Teens 12–16 e Adulto17+, responsável de menor de18 inalterado. [Regra e testes](../xpace-trial-allowance.md). Estoque por lista/grade de tamanhos, SaaS e navegação por título também preservados.

Migrations aplicadas individualmente ao Supabase existente, arquivos alinhados ao histórico remoto, sem repair ou push geral:
- Base anterior: 20261002165847_xpace_trial_absences_preserve_allowance.sql, 20261002165917_xpace_link_tree.sql, 20261002165924_xpace_teaching_and_room_reservations.sql, 20261002170923_xpace_trial_allowance_private_permissions.sql.
- Correção: 20261002185328_xpace_independent_teacher_rosters.sql e 20261002185339_xpace_cancelled_reservations_no_charge.sql. Fonte própria xpace_teaching_rosters/roster_id, sem schedule_id acadêmico nas novas ocorrências. Estrutura/histórico anterior preservado.
- Conferência real em02/10: nova tabela com RLS, cliente sem SELECT/EXECUTE, novas funções invoker/search_path vazio; zero escalas fictícias criadas e zero cancelamentos pendentes da XPACE. Advisor tem somente novo INFO de ausência intencional de policy em tabela exclusiva do servidor; avisos anteriores não foram alterados.

Testes locais finais: TypeScript/build Next (76 rotas), test:xpace-teaching incluindo nove datas de setembro2026 independentes, escolha por data/valores congelados, janela QR15/15 inclusive, isolamento de professor/tenant, mês fechado, bloqueios de locação e cancelamento sem cobrança; Auth/admin mock para cadastro/troca de senha/rollback apenas da conta nova; navegação pura. Navegador1440/390/320 com auth/APIs interceptadas: escala/PDF, acesso, QR/confirmar, áreas permitidas, semanas globais/por sala, cancelamento sumindo, cartões legíveis, impressão QR, Loja/árvore/retorno e ausência de overflow. Revisão visível preservada e reposicionada no rodapé do app do professor para não cobrir controles. Provas autenticadas são locais, sem clientes, contas, aulas, reservas ou mensagens reais de teste.

Publicação funcional confirmada em02/10/2026: commit9250af9 enviado à main, Vercel success; /xpace, /xpace/professor e /aula-experimental HTTP200. Bundles públicos exibiram revisão9250af9 e componentes da escala independente, ocupação semanal, cartões compactos, links, estoque e Adulto17+. APIs aulas, árvore de links e acesso de professores responderam401 sem sessão. Isso comprova deploy e bloqueio público; os fluxos autenticados foram verificados localmente com fixtures, sem operação real de teste. Configurar valores/logins/escala e os links reais pela equipe antes de usar a operação. A nota abaixo conserva o pedido posterior de grade completa e as pendências comerciais multiempresa/Asaas.

## Nota temporária — continuação

Checkpoint atualizado em02/10/2026: a seleção simples da turma foi publicada e conferida no commit59a5274; comprovação documental enviada em265a18d. **Novo pedido XPACE pendente: escolher a grade completa, com estilo/modalidade, nível, público, sala e horários, visível já em Montar turma, no quadro salvo e na impressão/PDF.** O pacote anterior continua publicado; esta nova correção ainda não foi implementada. A janela de cinco horas atingiu90% usados durante a leitura inicial; parada conforme AGENTS.md, sem afirmar falta de saldo de créditos. Há também as pendências comerciais abaixo, preservadas.

### Retomada prioritária — grade completa em Professores do mês

Pedido direto de Alceu em02/10: “tem que ser a grade completa […] estilo Streetdance […] nível iniciante […] público […] qual sala”, ajustar a folha de impressão, e esclarecimento posterior: “na hora de eu montar também tem que ter isso”. Não basta acrescentar nomes apenas no PDF. Precisa identificar corretamente a grade/horário durante a seleção e montagem, e conservar a identificação ao salvar e imprimir.

Imagem e esclarecimento final: o seletor atual mostra apenas estilos (Street Dance, Ballet etc.), e isso está incorreto. Cada opção precisa identificar a grade específica com nível, público e horário já cadastrados, além de sala/dias: exemplo Street Dance · Iniciante · Teens · SEG19h · Sala1. A escolha deve puxar/preencher os dados corretos da aula para montar a escala e imprimir depois, sem obrigar a digitar manualmente esses horários. Não basta enriquecer só o nome de modalidade ou só o cabeçalho do PDF. Preservar diferentes grades do mesmo estilo e sala/horário por ocorrência quando houver diferença entre dias.

Estado verificado: cópia isolada C:/Users/User/Documents/Codex/2026-10-01/ola/work/xpacebox-product-list, branch feat/stock-product-list-20261001, HEAD265a18d; fetch origin sem novos commits e cópia limpa antes deste checkpoint. Não alterar a cópia do amigo. Apenas leitura/diagnóstico e documentação realizados neste novo pedido; nenhum código, migration, dado real ou teste novo. Resultado anterior testado/publicado não valida este pedido.

Fontes confirmadas: xpace_class_groups tem modality e class_level; xpace_class_schedules tem weekday, starts_at, ends_at, room_id/room_name, class_level, age_group e age_groups. API Agenda já normaliza nível/público e organiza horários por turma. API aulas atual retorna somente id/name de grupos; TeacherRosterBuilder seleciona classGroupId e monta sala/dias/horário manualmente. A API CREATE_ROSTER valida turma ativa/tenant e copia somente o nome. Escala é independente, sem alteração de professores, horários, matrículas ou ocupação da Agenda.

Arquivos principais: app/api/xpace/aulas/route.ts, components/xpace-dance/TeacherRosterBuilder.tsx, TeachingWorkspace.tsx e teacher-month-print.ts, lib/xpace/teacher-roster.ts e trial-schedule.ts. Conferir testes teaching-access-api, teacher-roster-db e scripts/xpace-links-teaching-browser-test.cjs. Impressão atual agrupa por class_name e usa seção sem quebra; quadros também agrupam por class_name. Atenção: nomes iguais com níveis/públicos/horários diferentes não podem misturar quadros. Banco tem título de até120 caracteres e unicidade empresa/mês/título; não resolver anexando/truncando arbitrariamente todos os dados no nome. Identificação completa deve ser preservada como snapshot da escala, sem sincronização posterior com Agenda e sem inventar dados de escalas antigas.

Próximos passos desta correção:
1. Reconferir Git, contexto, uso e skills Supabase antes de implementar. Autorização para concluir, testar e publicar permanece, sem nova confirmação do mesmo pedido.
2. Ler a grade completa de forma mínima por tenant, distinguindo variantes por nível/público/sala/horários. Mostrar esses dados já na seleção e montagem, com sala/dias/horários da grade identificável; preservar escolha dos professores por data.
3. Persistir identificação completa de forma segura e histórica; revisar necessidade de migration/RPC transacional, unicidade e identificação dos quadros por escala. Preservar escalas antigas, remuneração e isolamento. Servidor valida a seleção; não confiar em metadados livres enviados pelo cliente.
4. Ajustar quadro e PDF por turma/mês com estilo, nível, público, sala/horários legíveis e paginação A4 adequada. Não juntar grades de mesmo nome. Testar/renderizar PDF e verificar desktop/celular.
5. Completar testes API/DB apropriados, TypeScript/build e navegador com fixtures antes de publicar. Não criar aulas/turmas/usuários reais para teste. Atualizar documentação no commit funcional, reconferir remoto, publicar e verificar deploy. Remover esta subseção resolvida, preservando pendências SaaS abaixo.

### Pendência de retomada — contratação SaaS da Árvore de links

Editor, persistência, rota pública e estatísticas da XPACE concluídos em 02/10/2026, conforme a seção operacional acima e docs/xpace-link-tree.md. Aparada a pendência resolvida. Restam entitlement/publicação para outras empresas e integração comercial do adicional à mensalidade por versão nova de preços, além da homologação SaaS abaixo. Não ativar cobrança real; confirmar periodicidade antes da contratação.

### Escopo autorizado e bloqueios

Continuar preparação multiempresa, loja, assinatura mensal conjunta, Planos e Pagamentos, Asaas mãe/filhas e WhatsApp exclusivo por empresa. Commit/push de mudanças solicitadas e testadas autorizado, preservando trabalho concorrente. Não criar contas/assinaturas/cobranças **reais**, instâncias pagas, mandar mensagens de teste para clientes, ativar cron financeiro ou interromper XPACE nesta fase. Autorização futura de teste Sandbox deve ser específica; nenhuma flag nova foi habilitada.

A pergunta sobre ativos no fechamento versus média diária foi enviada, ainda sem resposta no checkpoint. Não assumir a métrica, proporcionalidade de adicional no meio do mês, mudança de faixa, tolerância ou cancelamento só por se parecer com Next Fit. Preços e fechamento no fim do mês já estão definidos acima; não perguntar tudo novamente.

### Ponto exato e arquivos

Cópia `C:/XpaceBox`, branch `main`, remoto `alceu-cloud/xpacebox`; reconferir revisão atual. Módulo/documentação `docs/saas-commercial.md`. As telas novas salvam apenas preparação. API de checkout/job SaaS/webhook financeiro/subconta real por empresa e integração operacional de novas escolas **ainda não implementados**. O helper `runSaasSandboxOperation` não é chamado por endpoint ou cron; antes de expô-lo, validar empresa→cliente Asaas e preço calculado no servidor. Ele não retorna chave/resultado privado ao navegador, e bloqueia tentativa incerta ou lease expirado sem repetir POST.

Rotas/telas operacionais existentes continuam em vários pontos específicas de `/api/xpace/...`. Loja por slug não autoriza outra escola a operar esses módulos. Nunca copiar acesso/filas da XPACE para criar um novo cliente. Alterações preexistentes `supabase/.temp/cli-latest` e `output/` não pertencem a este pacote e foram preservadas.

### Próximos passos em ordem

1. Conferir Git atual, regras/contexto, autenticação e documentação do módulo. Revisar alterações concorrentes antes de qualquer publicação; usar skills Supabase/UI aplicáveis.
2. Obter/registrar regra de alunos e contratação por competência. Helper de cobertura está pronto; observações manuais não são fechamento. Se escolher média diária, definir arredondamento, ampliar enum e iniciar histórico confiável sem inventar médias de meses passados.
3. Completar onboarding/vínculos financeiros por tenant e conta mãe XPACE. Completar cliente/assinatura SaaS na mãe, checkout hospedado de cartão, Pix/boleto e metadados seguros de pagamento; nenhum PAN/CVV no banco. Asaas exige tokenização habilitada em produção para mudar valor de assinatura de cartão; incluir isso na homologação.
4. Ligar fechamento mensal, emissão única de plano+adicionais, eventos/recibos autenticados, deduplicação/reconciliação, cancelamento/inadimplência e entitlement no servidor. Não tratar preferência, redirect ou ID retornado como pago; REVIEW/UNKNOWN exigem conferência.
5. Generalizar operação/módulos/consumidor WhatsApp para novas empresas sem romper XPACE. Isolar dados, assinaturas, filas, credenciais e eventos de ponta a ponta. Registro/QR novo não é envio funcionando.
6. Implementar runner Sandbox protegido para teste autorizado e testar dois tenants, concurrent workers, limites/faixas/mês bissexto, aprovação/recusa, webhook duplicado/atrasado, alteração de preço e UNKNOWN. Migrations já aplicadas não precisam ser repetidas.
7. Atualizar contexto/documentação e publicar só partes prontas/testadas. Ativação real vem somente depois da liberação Asaas, regras comerciais e autorização/prova isolada. Ao terminar toda a continuação, incorporar resultados e retirar esta nota; se sobrar trabalho ou aproximar 10% disponíveis, substituir por checkpoint atual sem empilhar recados. Não enviar mensagem a outra conversa.

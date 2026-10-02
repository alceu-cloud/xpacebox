# Estado atual do XPACEBOX

Última conferência desta base de contexto: 01/10/2026, America/Sao_Paulo. Este retrato reúne a documentação de continuidade do colega e a entrega de grade de tamanhos, relatório e cadastro de produtos desta conversa. Leia commits e mudanças posteriores antes de assumir que o retrato continua atual. A referência de atualização é a `main` corrente, nunca um hash congelado neste arquivo.

## Arquitetura e módulos

XPACEBOX é SaaS multiempresa/modular em Next.js, React, TypeScript, Supabase Auth/Postgres/Storage e Vercel. Há ambientes/regras para XPACE, DAWOS, CARCAT e GTA. Preserve administração da plataforma separada das empresas, vínculos por usuário, módulos autorizados e isolamento de dados.

Existem clientes/CRM, produtos/fichas técnicas, formação de preço direta e por engenharia, orçamentos, amostras, notificações, relatórios e módulos específicos da escola. O código possui integrações XPay/Asaas, Autentique e Baldussi; existência de código não comprova que cada ambiente foi configurado/testado. Não modificar cobranças/contratos para testar outras funcionalidades.

O visual é claro, compacto e segue identidade da empresa. Alceu prefere poucas informações abertas por padrão, configurações recolhidas e pouco espaço desperdiçado. Preservar textos/formatos do módulo, e-mails em minúsculas, escala global, fontes e componentes existentes.

## XPACE no iPhone e no desktop

- App vigente é PWA instalada na Tela de Início: `/xpace/app`. Não é app nativo na App Store.
- Abas: Dashboard, Agenda e Estoque, com saudação, sino e atualização puxando para baixo.
- Agenda vincula leads à aula/data correta pelo agendamento existente. Presença é `COMPARECEU`/`FALTOU`; matrícula continua decisão da atendente. Não criar segunda presença ou matricular automaticamente.
- Push de novo agendamento foi implantado e o usuário confirmou recebimento. Preservar o par VAPID existente. Limites: versão documentada aceita endpoints Apple e não possui fila persistente/retry; push falho não desfaz agendamento.
- Rolagem com mouse no desktop foi restaurada sem remover pull-to-refresh móvel. Não interceptar rolagem interna, controles/modais nem descartar formulário editado sem confirmação.
- `components/BuildRevision.tsx` mostra `VERSÃO` usando `NEXT_PUBLIC_BUILD_REVISION`. `next.config.mjs` deriva a revisão do build/Git. Preservar identificação nas telas, sem fixar hash na interface.

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

## Nota temporária — continuação

Checkpoint de 01/10/2026: base comercial e observações de alunos preparadas; mudanças de estoque do amigo preservadas após integração. A janela de cinco horas renovou durante a retomada; não houve esgotamento de crédito. O motivo da passagem é a necessidade de definição comercial e homologação/autorizações ainda pendentes, não o limite de uso. Não declarar SaaS inteiro pronto para vender.

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

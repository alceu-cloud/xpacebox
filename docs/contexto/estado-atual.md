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

## Seleção de produtos por lista e barra desktop — entrega de 01/10/2026

Em 01/10/2026, Alceu pediu trocar a seleção por câmera/QR por uma lista no estoque, mantendo tamanho, entrada/baixa, quantidade e mensagem de sucesso. Após a preparação isolada, autorizou conferir a revisão atual e commitar as duas alterações. A cópia de trabalho estava alinhada com a `main` corrente; a outra cópia inspecionada estava limpa e em revisão ancestral já incorporada. Nenhuma alteração do amigo foi sobrescrita.

Implementada na branch local `feat/stock-product-list-20261001`, pasta `C:/Users/User/Documents/Codex/2026-10-01/ola/work/xpacebox-product-list`: foto/nome/categoria/saldo, busca por nome, paginação pela API existente, reconferência do produto escolhido e retorno à lista atualizada. O atalho desktop usa o mesmo seletor. Painéis de grade/movimento, códigos/cadastro/impressão, API, banco e integrações foram preservados.

Passaram localmente build, testes de estoque, rolagem e navegador com fixtures (320/390 px, busca, 101 produtos/paginação, cancelamento, saldo atualizado, alerta, retry idempotente, tamanhos e seletor desktop). Sem migrations, dados, env de produção ou mensagens reais. Alceu autorizou explicitamente o envio à `main` e a publicação Vercel em 01/10/2026, substituindo a espera anterior; remoto/concorrência foram novamente conferidos antes do envio. Confirmar separadamente push, deploy e revisão visível antes de declarar produção atualizada. Detalhes em `docs/xpace-stock.md`.

A nota SaaS abaixo pertence a outro escopo e foi preservada; este pedido não a retoma nem a resolve.

Pedido adicional de 01/10/2026: no computador, alinhar `PRODUTOS`, pesquisa, categorias e `INCLUIR ARQUIVADOS` na mesma linha. Ajustado no catálogo desktop, sem alteração da PWA do celular. Conferido em navegador isolado a 1440/1024/768 px: controles alinhados e página sem overflow; pesquisa e filtros funcionam. PWA 390 px permanece sem a barra desktop. Textos do cadastro e da folha impressa foram ajustados para orientar seleção pela lista, mantendo IDs/QR e impressão A4. Build e testes completos foram reconferidos para a versão final antes do commit.

Publicação funcional comprovada em 01/10/2026: push à `main` confirmado e status Vercel `success` para `xpacebox/pricing-app-1`. `/xpace` e `/xpace/app` responderam HTTP 200; os arquivos públicos em produção continham a revisão da entrega, a lista/pesquisa por nome, o seletor desktop e a barra alinhada. A conferência foi somente de leitura, sem sessão, dados ou mensagens reais; testes de operação autenticada/alerta físico continuam sujeitos às provas já descritas. Não confundir confirmação dos arquivos publicados com movimentação real de estoque.

## Nota temporária — continuação

Checkpoint de 01/10/2026: conversa interrompida para alinhar a passagem, não por esgotamento de crédito. A última consulta mostrava 48% disponíveis na janela de cinco horas. Essa porcentagem é histórica e deve ser consultada novamente ao retomar.

### Escopo e decisões autorizados

Preparar, implementar e testar isoladamente a estrutura SaaS comercial: loja de mensalidades e adicionais, assinatura da escola por faixas de alunos e integração Asaas multiempresa. **Não criar contas reais, cobranças, assinaturas financeiras ou instâncias Z-API pagas nem ativar cobrança automática nesta preparação.** Alceu informará faixas/valores depois; não inventar preços nem tratar preço indefinido como gratuito.

- A decisão mais recente substitui a proposta inicial: XPACE e XPACEBOX têm o mesmo CNPJ informado pelo usuário; XPACE usa a conta principal do Asaas e é isenta de mensalidade do software/adicionais. Não criar uma subconta para XPACE. Isso não isenta tarifas cobradas pelos provedores.
- Outras empresas devem usar subcontas separadas, com credenciais e eventos isolados por tenant. Uma empresa não pode escolher a conta mãe pelo navegador ou herdar a isenção por ser gerida pelo dono da plataforma.
- Xpace Pay é obrigatório para recebimento/conciliação e não terá mensalidade de módulo. Os outros itens da loja precisam ser contratáveis mensalmente. Integrador WhatsApp é adicional pago, com instância/número próprios de cada empresa.
- Faixas de alunos, preços do software e do WhatsApp estão pendentes. Definição de aluno faturável, data de medição, mudança de faixa, vencimento, cancelamento/inadimplência e ativação após pagamento também precisam de decisão explícita antes de ligar a cobrança.
- Não alterar o WhatsApp/robô XPACE atual nem interromper acessos existentes para implantar o piloto comercial. Não reativar conector antigo.

### Trabalho realizado e ponto de parada

Foi feita apenas inspeção inicial; **nenhuma implementação SaaS deste pedido, migration ou teste funcional novo foi concluído**. Cópia inspecionada `C:/XpaceBox`, remoto `alceu-cloud/xpacebox`, branch `main`; reconferir revisão atual ao começar. Alterações locais preexistentes em `supabase/.temp/cli-latest` e `output/` foram preservadas.

Encontrado: `lib/server/xpay-asaas.ts` já cria subconta com chave da conta mãe e cifra a credencial retornada; `app/api/xpace/xpay/route.ts` está restrita à empresa XPACE; `20260915140647_xpay_payment_accounts.sql` associa contas e eventos por tenant, mas não implementa sozinho o modelo comercial solicitado. `lib/server/company-access.ts` valida sessão/perfil e vínculo no servidor. Loja é aberta por `components/xpace-dance/DanceWorkspace.tsx`; localizar a definição/importação real de `XPayStore` antes de editar (não existe arquivo `components/xpace-dance/XPayStore.tsx`).

Documentação oficial consultada: [subcontas Asaas](https://docs.asaas.com/docs/criacao-de-subcontas), [criação de subconta](https://docs.asaas.com/reference/criar-subconta) e [QR Z-API](https://developer.z-api.io/instance/qr-code-image). O modelo Asaas depende de homologação/enquadramento BaaS e limites de avaliação; não assumir liberação definitiva. Z-API documenta QR em imagem, mas o fluxo seguro por empresa ainda não foi implementado. Revalidar documentação antes de integrar.

### Próximos passos, em ordem

1. Ler regras/contexto e módulos relevantes, conferir remoto/concorrência; usar as skills Supabase e UI aplicáveis. Não sobrescrever trabalho do colega.
2. Concluir o inventário de loja, permissões/módulos, contas financeiras, webhooks e Z-API. Definir conta principal exclusiva da XPACE e subcontas dos demais tenants, sem misturar recebimentos de alunos com a mensalidade que a empresa paga ao SaaS.
3. Implementar estrutura protegida/configurável para catálogo, faixas não sobrepostas, preços ainda não publicados, isenção exclusiva XPACE, assinatura por empresa e adicionais mensais. Preparar checkout/idempotência/reconciliação e ativação por pagamento validado, sem cobranças reais ou bloqueio retroativo de clientes atuais.
4. Preparar onboarding por empresa Asaas e QR WhatsApp via servidor, sem expor tokens, sem compartilhar instâncias e sem substituir o callback do robô. Operações externas com custo continuam adiadas.
5. Testar autorização/isolamento, concorrência, duplicidade, preços indefinidos, isenção, limites das faixas, eventos fora de ordem e onboarding com fixtures/sandbox autorizado. Novas migrations devem ser revisadas e testadas isoladamente; não aplicar em produção por simples leitura deste checkpoint.
6. Manter o contexto e documentação do módulo, publicar somente mudanças prontas/testadas conforme autorização vigente e informar pendências de preços/homologação/teste real. Ao acabar a continuação, incorporar resultados permanentes e remover esta nota; se atingir o limite antes, substituir por checkpoint atualizado.

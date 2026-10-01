# Estoque XPACE

## Escopo desta entrega

- Desktop: Estoque → Produtos, Categorias, Unidades e Folha de códigos.
- Impressão da folha em A4 com margens de 10 mm, três colunas, cartões horizontais e QR de 22 mm (incluindo a margem branca). Foto, nome e preço/unidade permanecem; o identificador interno extenso não é impresso. Até 30 produtos com nomes comuns cabem em uma página; nomes excepcionalmente longos expandem o cartão sem cortar texto. Imprimir a 100%, sem cabeçalhos/rodapés do navegador. Prévia de tela permanece inalterada.
- App `/xpace/app`: Dashboard, Agenda e Estoque. Câmera para QR/código de barras e busca manual de contingência.
- Cadastro em modal: descrição, custo/venda em centavos, categoria, unidade, controle/mínimo, foto e código da embalagem ou QR interno.
- Saldo começa em zero. Lance o saldo inicial com Entrada. Baixas não podem deixar saldo negativo. Cada tamanho/cor/embalagem deve ter um código e produto próprio.
- Produtos podem ser arquivados/reativados, preservando histórico. Categorias/unidades em uso não são excluídas.
- **Não há integração financeira nesta entrega.** Entrada/baixa não criam venda, receita, cobrança ou recebimento. Venda e consumo/perda precisarão de operações distintas quando a integração financeira for autorizada; não inferir recebimento de toda baixa.
- DAWOS e o conector local antigo não são alterados.

## Permissões e dados

As APIs `/api/xpace/estoque` e `/api/xpace/estoque/[id]/imagem` usam `requireCompanyAccess` com slug fixo XPACE. Gerentes/proprietário gerenciam o catálogo e fotos. Membros ativos da XPACE consultam e movimentam estoque; custo só é retornado a gerentes. Tenant e autor vêm da sessão validada, nunca do JSON enviado pelo navegador.

Tabelas: `xpace_stock_categories`, `xpace_stock_units`, `xpace_stock_products`, `xpace_stock_movements` e `xpace_stock_settings`. RLS habilitado; acesso direto de `anon`/`authenticated` revogado. Funções SQL `SECURITY INVOKER`, `search_path=''`, execução somente `service_role`. O histórico é append-only para o servidor (SELECT/INSERT, sem UPDATE/DELETE). Isso exige revogar primeiro as permissões padrão do Supabase, não apenas acrescentar GRANT.

O alerta informativo [RLS sem políticas](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) é intencional neste modelo server-only: nenhum navegador acessa essas tabelas diretamente. Índices novos aparecem como não utilizados antes do primeiro uso; não removê-los por isso.

Bucket público `xpace-stock-images`: somente fotos de produtos, até 3 MB, JPEG/PNG/WebP. Upload/removal só pelo servidor autorizado. Não publicar documentos pessoais nesse bucket.

## Movimento e alerta mínimo

`xpace_move_stock` faz saldo + histórico + criação do aviso em uma transação. Trava o produto e serializa a chave de operação. `requestId` UUID é reutilizado após falha ambígua de rede; a mesma operação não é aplicada duas vezes, e a chave não pode ser reaproveitada com outro conteúdo.

Alerta só ao cruzar `saldo >= mínimo` para `saldo < mínimo`. Reposição até o mínimo rearma o alerta. Novas baixas enquanto já abaixo não geram spam. A tela mostra o alerta mesmo se o destinatário/Integrador ainda não estiverem configurados.

Destinatário em `xpace_stock_settings.alert_phone`, separado do Git e não devolvido pela API. Foi configurado no servidor para o número autorizado por Alceu; nenhum segredo novo é necessário. Não registrar telefone em logs públicos.

Aviso `ESTOQUE_BAIXO` entra no outbox existente, consumido pela Z-API na nuvem. O Integrador separa **LEADS** (experimentais/professores) de **NOTIFICAÇÕES** (estoque e demais avisos), mantendo testes fora das listas. Configuração da Z-API fica recolhida até clicar no botão. A função anterior de paginação permanece disponível para clientes antigos.

Somente recibo de entrega/leitura ou conferência manual deixa o card verde. ID/aceitação não provam entrega. Falha/incerto, fila atrasada ou falta de recibo continuam usando as Providências existentes. Não reenvie UNKNOWN automaticamente e não troque o webhook de recebimento do robô de atendimento.

## Migrations e implantação

Aplicadas individualmente no projeto já configurado em 01/10/2026; os nomes locais foram alinhados aos timestamps registrados pelo servidor, sem repair ou db push geral:

1. `20261001191516_xpace_stock_catalog.sql` — tabelas, 5 categorias/9 unidades, bucket, função de movimento e novo tipo de aviso.
2. `20261001191521_xpace_message_notification_tabs.sql` — paginação/resumo separados por aba, sem alterar registros antigos.
3. `20261001191820_xpace_stock_ledger_permissions.sql` — remove permissões padrão de alteração/apagamento do histórico.

Verificação remota: 5 categorias, 9 unidades, nenhum produto/movimento/alerta de teste; RPC de notificações funcional; navegador sem acesso direto; servidor pode acrescentar histórico, mas não editar/apagar. Não aplicar novamente migrations já registradas.

Não foi alterada credencial da Z-API, cron, conexão, sessão do WhatsApp ou conta financeira. Esta entrega não envia mensagens reais automaticamente durante a validação.

## Testes

```text
npm ci
npm run test:stock
node tests/message-control-db.test.cjs
node scripts/xpace-scroll-test.cjs
npm run build
```

`test:stock` valida entrada de dados, permissões/tenant da API e SQL real em PostgreSQL isolado via PGlite: saldo, idempotência, mínimo/rearme, histórico e fila atômicos. Inclui permissões padrão semelhantes às do Supabase. Os testes de notificações validam paginação, separação das abas e recibos reais.

Para teste visual isolado, compile com URL pública fictícia `https://fixture.supabase.co` e chave pública placeholder, inicie o servidor local na porta 3007 e execute `npm run test:stock:browser`. Todos os requests de auth/API/provedores são interceptados. Valida modais/lista/QR/print, telas 390/320 px, baixa/aviso, ausência de verde para mera aceitação e decodificação QR/EAN-13. Não usar esse ambiente fictício em produção.

No iPhone real, após publicar, abrir novamente o app, permitir câmera e verificar um código da embalagem e um da folha. Há busca manual se a câmera for bloqueada. Não há pareamento WhatsApp novo nem dependência do PC.

Dependências novas fixadas no lockfile: ZXing (leitura), qrcode (folha), tipos QR e PGlite (apenas testes). O audit do repositório apontou avisos preexistentes de Next/PostCSS/Sharp/Nanoid; atualizar esses componentes é trabalho separado, não foi executado um audit fix automático nesta entrega.

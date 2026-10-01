# Estado atual do XPACEBOX

Última conferência desta base de contexto: 01/10/2026, America/Sao_Paulo. Este retrato inclui a conversa de Z-API/estoque e a atualização posterior do amigo para grade de tamanhos e relatório de movimentações, consultada na `main` antes de publicar a documentação. Leia commits e mudanças posteriores antes de assumir que o retrato continua atual. A referência de atualização é a `main` corrente, nunca um hash congelado neste arquivo.

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
- App lê QR/código de barras, oferece busca manual, foto/saldo, entrada/baixa e confirmação de quantidade.
- Saldo inicia em zero; entrada registra saldo inicial. Não permitir negativo.
- Saldo, histórico e alerta são atômicos. Após resposta ambígua, mesma operação usa o mesmo `requestId` UUID e payload; não duplicar movimento.
- Mínimo 5 e saldo 5→4 gera aviso na tela e WhatsApp ao Alceu. Não repetir enquanto abaixo; reposição até o mínimo rearma. Destinatário em `xpace_stock_settings.alert_phone`, fora do Git e da resposta pública.

Atualização do amigo incorporada sem alterar seu código:

- Produto com grade de tamanhos PP/P/M/G/GG/XG aparece como um modelo no catálogo e na folha de QR. O QR do modelo exige escolher o tamanho antes de entrada ou baixa; roupas usam peças inteiras.
- Editar grade preserva IDs, QR, saldos e histórico. Tamanho com saldo não pode ser removido. Remoção sem saldo arquiva; arquivar modelo bloqueia tamanhos; reativar modelo não restaura tamanho removido.
- Relatórios → Estoque · Entradas e baixas, somente gestores: período em Brasília, produto, responsável e tipo, 50 registros por página, nota e saldo antes/depois, inclusive produtos arquivados. Nome do responsável preserva o snapshot do lançamento; conta compartilhada não identifica a pessoa física.
- Existe `scripts/import-stock-photo-catalog.cjs` para importação explícita por operador, dry-run por padrão. Não executar `--apply` ou repetir catálogo só por encontrar o script; conferir manifesto, autorização e dados atuais. A situação de importações particulares do amigo não foi auditada neste handoff.

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

Leitor ZXing suporta QR e EAN-13, inclusive fixture começando em 789. Usuário relatou dificuldade com prata/reflexo e dois códigos na embalagem; não foi feita correção de câmera nessa entrega. Câmera fechando com “Produto não encontrado” indica leitura sem cadastro correspondente. Manter código completo/margens visíveis, evitar reflexo e cobrir outro código. Quadro é guia; decodificação usa o frame completo. Usuário decidiu usar QR interno nos produtos difíceis. Teste sintético não garante leitura física em toda embalagem.

## DAWOS e pendências a reconferir

Cadastro de amostra usa modal; abertura da tela mostra indicadores, botão e lista. E-mails de amostras têm “Tentar novamente” na própria pendência, autorizado a gerente, uma tentativa do aviso específico com idempotência/histórico. Teste/configuração não resolvem falha antiga; sucesso só após aceite real salvo e recebimento conferido separadamente.

Destinatários: produção = PPCP + suporte, consultor em cópia; entrega/aprovação = somente consultor. Não trocar durante reenvio nem executar todas as amostras para testar. Situação final do antigo aviso PAES BUENO AM-000002 não foi reconferida nesta entrega; consultar banco/provedor antes de declarar resolvido ou reenviar.

Pedido de fórmulas de maleta/transpasse parcial foi pausado por trabalho do amigo. Não declarar entregue sem conferir código/banco e alinhamento com Alceu. Integração oficial Meta teve restrição/verificação no histórico: não recriar portfólios ou migrar número automaticamente.

## Verificações realizadas e próximas provas

Antes desta publicação documental, foram reexecutados e passaram `npm run test:stock` (incluindo SQL da grade e testes do relatório), `node scripts/xpace-scroll-test.cjs` e `npm run build`, já sobre o código atualizado do amigo. Nas entregas anteriores também passaram `node tests/message-control-db.test.cjs` e os testes visuais de catálogo/app/impressão com `npm run test:stock:browser`; essa validação anterior não substitui prova física nem afirma que os novos testes visuais de grade foram reexecutados nesta publicação.

SQL testado em PostgreSQL isolado/PGlite; navegador com auth/API/provedores interceptados e dados fictícios. Não foram criados movimentos nem enviados avisos reais nesses testes. Build visual local usou Supabase público fictício; não usar essa configuração em produção. Vercel faz build próprio. Impressão automatizada exige Poppler/pdfinfo no PATH ou `PDFINFO`.

Ainda exige prova física/autorizada: câmera em embalagens/iPhone e cruzamento real de estoque mínimo com recibo na aba NOTIFICAÇÕES. Há avisos documentados de dependências; não executar `npm audit fix` geral às cegas.

Em cada continuação: confira Git atual, autenticações e módulo relevante, preserve trabalho concorrente e mantenha este estado atualizado sem inventar verificação de produção.

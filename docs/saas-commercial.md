# SaaS comercial — preparação inicial

Conferência de implementação/banco em 01/10/2026. Esta entrega prepara a base comercial; **não torna a plataforma inteira pronta para vender nem liga cobrança automática**. Não confundir uma tela funcional de preparação com checkout, conta financeira homologada ou recorrência já operante.

## Decisões do Alceu

- XPACE e XPACEBOX têm o mesmo CNPJ informado pelo proprietário. Apenas a empresa XPACE, identificada no servidor pelo registro principal, usa a conta mãe e é isenta de mensalidade do software e adicionais. Gerenciar outra escola como `platform_owner` não torna essa escola isenta.
- Outras empresas terão subcontas Asaas próprias para os recebimentos dos seus alunos. A mensalidade que essas empresas pagam pelo software é receita da **conta mãe XPACEBOX**, não da subconta da escola. Nenhuma comissão sobre pagamentos dos alunos foi definida ou implementada.
- Xpace Pay obrigatório, R$0 de mensalidade de módulo. Isso não elimina tarifas dos provedores. Contas, credenciais, cobranças e eventos atuais não foram migrados para a conta mãe nesta entrega.
- Integrador de mensagens opcional por R$150/mês, somado ao plano em uma cobrança mensal única. Cliente não vê nome Z-API nem custo interno na nova interface. O usuário dispensou registrar o custo do fornecedor; esse campo não existe no pricebook. Adicionais futuros precisam de catálogo/código e regras explícitos; não aceitar um código arbitrário do navegador.
- Árvore de links: pré-montagem solicitada em 01/10/2026, anúncio R$19,90/mês para outras empresas e XPACE isenta. Cartão/prévia na Loja, sem contratação, publicação pública ou alteração do pricebook/preferências. Periodicidade mensal segue o contexto dos adicionais, a confirmar antes de cobrar. `LINK_HUB` ainda não é aceito na API comercial; integrar por nova versão de preços e migration revisada, sem modificar quotes históricas. Continuação em [Árvore de links](saas-link-hub.md).
- Fechamento no final do mês. Sem cobrança ou débito real nesta preparação. Pix e boleto exigirão pagamento pelo cliente; selecionar Pix não autoriza Pix Automático. Cartão recorrente depende de contratação e autorização no provedor.

| Alunos | Mensalidade |
| --- | --- |
| 0–50 | R$99 |
| 51–200 | R$149 |
| 201–300 | R$199 |
| 301–500 | R$249 |
| 501–800 | R$299 |
| 801 ou mais | R$349 |

As faixas vieram da imagem Next Fit, com preços substituídos conforme instrução. A última faixa começa em **801**, cobrindo a lacuna literal do exemplo “acima de 801”; ajuste informado ao usuário. Essas são mensalidades do software, não taxas financeiras.

Ainda definir: aluno faturável (ativos no fechamento ou média diária), data/exclusões da medição, proporcionalidade de adicional ligado no meio do mês, troca de faixa, cancelamento e tolerância de inadimplência. `PENDING`/`null` significa pendente, não grátis. Não usar a contagem informada na simulação para emitir cobrança.

## Implementado

- Loja genérica `/loja/[slug]`, APIs `/api/saas/store` e `/api/saas/whatsapp`, sem hardcode da XPACE nos novos acessos. A sessão, perfil ativo e vínculo com a empresa são validados no servidor por `requireCompanyAccess`.
- Preços em centavos, faixas contínuas e sem sobreposição, versões imutáveis. Edição protegida por transação/advisory lock e versão esperada: duas sessões não sobrescrevem silenciosamente uma tabela desatualizada. Simulações fixam a versão de preço; reenvio da mesma operação usa idempotência por empresa/UUID/fingerprint.
- Config → **Planos e Pagamentos** na XPACE, componente reutilizável e página genérica `/planos/[slug]`. Gestores têm resumo, alunos ativos **de hoje**, tabela, escolha Pix/boleto/cartão e adicional. Preferências são persistidas como `PREPARATION`, não como assinatura nem autorização financeira. API aceita apenas forma e adicionais; rejeita PAN/CVV/token, tenant, preço e campos inesperados.
- Histórico de faturas com paginação de 10, isolado por empresa. Banco está vazio e **nenhum emissor de faturas está ligado**. Não inventar vencimentos, faturas, cartões, IDs Asaas, recibos ou marcar como pago manualmente para demonstrar a tela. Não há botão pagar real nem captura de cartão nesta fase.
- XPACE bloqueada contra criação de subconta pelo endpoint antigo; leitura, histórico e operações existentes foram preservados. Textos da loja/conta explicam a exceção da conta mãe. A vinculação efetiva da conta principal ainda precisa ser implementada/homologada, não presumida a partir desse bloqueio.
- Registro técnico de conexão WhatsApp de outra empresa, exclusivo e cifrado, somente pelo dono da plataforma. Clientes não recebem tokens. Consulta QR via servidor opt-in, valida PNG e bloqueia URL/SVG/challenge inválidos. Não cria instância paga, não redefine sessão, não troca callbacks e não pareia XPACE pelo fluxo novo. A instanciação do novo consumidor por tenant ainda não foi integrada.
- Adapter Asaas separado, **Sandbox fixo**, sem fallback à chave de produção: inspeção de documento da mãe, proteção contra mesma empresa, criação de subconta com chave retornada cifrada, e assinatura de teste com consulta de referência antes de criar. Sem splits/comissão. Não conectado a endpoint público, cron ou checkout.
- `runSaasSandboxOperation`: guarda SQL de operação externa antes da chamada, uma reserva por empresa/finalidade. Sucesso só após persistir resultado privado cifrado. Repetição concluída não chama novamente; `RUNNING` bloqueia concorrência, lease expirado vira `UNKNOWN`, e resultado incerto não é reenviado. Não apagar o journal para liberar nova tentativa; reconciliar primeiro no provedor. Um futuro runner deve validar o vínculo empresa/cliente Asaas e o total calculado no servidor, nunca aceitar `customerId`/valor livres do navegador.
- Helpers puros de fechamento no último dia do mês, incluindo fevereiro/bissexto, rascunho único por empresa/competência destinado à conta mãe e tratamento conservador de eventos fora de ordem/refundos. **Não são webhook nem job ativos**. Apenas confirmação/recebimento com conta, cobrança, cliente, referência e valor correspondentes pode indicar pagamento; `REVIEW` não vira pago por um recibo atrasado.
- `measureStudents` prepara as duas alternativas de medição sem escolher por Alceu: ativos no último fechamento ou média diária com cobertura completa. Usa relógio confiável em Brasília, valida tenant/datas/duplicidade, não completa dias faltantes com zero e não arredonda média sem regra explícita. `DAY_CLOSE` só é utilizável após terminar aquele dia; mês futuro/incompleto permanece bloqueado. É helper puro, sem captura diária ligada; o pricebook continua `PENDING` e o enum de configuração ainda não expõe média diária.
- Planos e Pagamentos permite **Registrar contagem atual** e mostra somente as cinco últimas observações. `/api/saas/students` recebe apenas UUID da operação; contagem, tenant, gestor e data vêm do servidor/banco. Ledger `OBSERVATION` é imutável, não aceita `DAY_CLOSE` e não substitui histórico diário faturável. Retry de POST incerto conserva o UUID; uma gravação confirmada continua visível mesmo se a leitura seguinte falhar. Nenhuma observação real foi criada para testar a entrega.

## Banco e segurança

Aplicadas individualmente pelo Supabase MCP no projeto `iphmzkrwhrzjkmivbxno`:

- `20261001225412_saas_commercial_preparation.sql` — sete tabelas de preparação, versões, rascunhos, preferências, read model de faturas e credenciais privadas.
- `20261001230148_saas_sandbox_operation_guard.sql` — journal e RPCs de reserva/finalização de testes Sandbox.
- `20261001234305_saas_least_privilege.sql` — revoga também os privilégios preexistentes de `service_role` nas oito tabelas SaaS e na sequência, depois concede somente o necessário. A consulta real confirmou os defaults amplos do Supabase; um simples `GRANT SELECT` não removia INSERT/UPDATE/DELETE/TRUNCATE. Correção limitada ao módulo novo, sem alterar defaults globais ou integrações antigas. Configuração principal/faturas são SELECT-only; demais tabelas sem DELETE/TRUNCATE.
- `20261001235446_saas_student_observations.sql` — ledger de observações e RPC com contagem/data no banco, escopo ativo e idempotência por empresa/operação, sem scheduler ou fechamento inventado.

Arquivos locais foram alinhados às versões **confirmadas no histórico remoto** após aplicar, sem `repair`, aplicação em massa ou reaplicação. Não reaplicar. Não houve conta, cobrança, assinatura, mensagem ou instância externa criada. Primeira conferência pós-DDL: dono `xpace`, fase `PREPARATION`, seis faixas corretas, adicional 15000 centavos; zero rascunhos, preferências, faturas e novas conexões. Reconferir números atuais em vez de tratar esse snapshot como saldo futuro.

RLS ligada nas nove tabelas, sem políticas de acesso direto, com privilégios revogados de `PUBLIC`/`anon`/`authenticated`; operações apenas pelo servidor e seu acesso validado. SQL inclui índices dos vínculos e tenant/data. Fase e rascunhos têm constraints impedindo ativação. Advisor do módulo indicou apenas **INFO `rls_enabled_no_policy`**, intencional para o acesso exclusivamente servidor ([explicação do linter](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)). Isso não significa que todos os avisos históricos do projeto estejam resolvidos. Conferência após as migrations de continuação: fase PREPARATION, zero operações Sandbox, zero faturas e zero observações; grants mínimos confirmados no catálogo real.

Configurações novas, **sem valores**:

- `SAAS_ASAAS_SANDBOX_ENABLED=true` e `SAAS_ASAAS_PARENT_SANDBOX_API_KEY` somente após autorizar teste isolado. Chave Sandbox da conta mãe, nunca chave de subconta/produção; configurar privadamente no servidor. Nenhuma flag foi ligada nesta entrega.
- `SAAS_ZAPI_PAIRING_ENABLED=true` apenas para teste autorizado de outra empresa. Inicialmente bloqueado. Criptografia usa o mecanismo existente `INTEGRATION_CREDENTIAL_ENCRYPTION_KEY`, sem recriar/trocar a chave.

Não exportar tokens, chaves retornadas, `.env`, resultados privados de operações ou URLs privadas para cliente, logs, chat ou documentação. Não alterar callback “Ao receber” do robô XPACE nem reativar conector Windows.

## Testes e limite da prova

Passaram `npm run test:saas` (34 testes Node de regras/API/adapters/medição + dois suites SQL PGlite cobrindo as quatro migrations, inclusive defaults amplos do Supabase), regressão de estoque, TypeScript e build Next. Testes visuais validam loja/plano em desktop1440 e mobile320/390: preferências, soma, edição exclusiva do dono, privacidade, contagem manual, retry incerto com mesmo UUID e distinção de gravação confirmada/leitura falha. Revisão do build preservada sem cobrir texto. Não é prova de entrega WhatsApp, checkout Asaas ou cobrança real. Fixtures interceptam autenticação/APIs/provedores e não escrevem dados de clientes. Mudanças de lista/barra desktop do amigo foram integradas; build/testes dos dois escopos reconferidos antes da publicação.

## Próxima etapa antes de vender

Prova de publicação em 01/10/2026 (America/Sao_Paulo): push funcional `7b27a5ce` confirmado na main, Vercel success, rotas XPACE/app/loja/plano 200 e revisão pública `7b27a5c` no plano (abreviação do provedor). Sem sessão, API do plano negou com 401; API de observação não aceita GET (405). Nenhum teste autenticado ou efeito financeiro real em produção foi realizado. Estes são fatos históricos; descobrir a revisão atual a cada continuação.

1. Confirmar regras da medição e adicionais/competência/cancelamento. Se escolher média diária, definir arredondamento para a faixa e ampliar o enum configurável após autorização. Implementar captura confiável do fechamento, não usando observações manuais como substituto; média diária não pode ser reconstruída confiavelmente só pelo estado atual dos cadastros.
2. Completar onboarding financeiro por tenant e vinculação da mãe XPACE, com persistência de IDs e credenciais, reaproveitando o guard e reconciliação dos resultados incertos. Não criar contas reais até liberação Asaas/autorização.
3. Implementar checkout hospedado de cartão, assinatura/cliente **da conta mãe** para cobrar o SaaS, boleto e Pix; guardar apenas IDs/token cifrado quando necessário + bandeira/final do cartão vindo do provedor. Conta da escola permanece responsável pelos recebimentos dos alunos. Não capturar PAN/CVV no sistema.
4. Implementar emissão/revisão mensal única, conciliação por webhook autenticado, deduplicação de eventos, matching de conta/tenant/valor, revisão de estorno e processo operacional para UNKNOWN. Ligar helpers puros a registros transacionais reais; não tratar preferência ou sucesso de redirect como pagamento. Não reescrever mensalidades passadas ou cobranças pendentes sem regra explícita.
5. Tornar módulos/filas de outras escolas multiempresa de ponta a ponta. **Diversas rotas/telas operacionais continuam `/api/xpace/...`; a loja genérica não resolve esse hardcode.** Contratação/entitlement e instância própria precisam ser validados no servidor; empresas não podem acessar a operação XPACE por trocar slug.
6. Criar runner Sandbox autorizado com dados fictícios e testar aprovação/recusa, Pix/boleto, alteração de faixa, limites e mês bissexto, concorrência entre processos, webhook duplicado/atrasado, inadimplência e cancelamento. Guard/teste de SQL isolado não substitui reconciliação real com Asaas.
7. Só depois da homologação, autorização e prova isolada liberar novos clientes/cobrança; preservar XPACE, clientes antigos e WhatsApp existente durante todo o piloto.

Documentação oficial conferida: [subcontas](https://docs.asaas.com/docs/criacao-de-subcontas), [assinaturas](https://docs.asaas.com/docs/assinaturas), [checkout recorrente](https://docs.asaas.com/docs/checkout-com-assinatura-recorrente), [cartão recorrente](https://docs.asaas.com/docs/criando-assinatura-com-cartao-de-credito), [eventos de cobrança](https://docs.asaas.com/docs/webhook-para-cobrancas) e [QR WhatsApp](https://developer.z-api.io/instance/qr-code-image). **Asaas exige habilitação de tokenização em produção para alterar valor de assinatura de cartão; solicitar ao gerente de contas e validar durante homologação.** Boleto não está listado como forma do checkout hospedado Pix/cartão: usar o fluxo de cobrança/assinatura apropriado, não inserir `BOLETO` naquele checkout sem suporte.

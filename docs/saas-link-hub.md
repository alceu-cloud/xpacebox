# Árvore de links — pré-montagem

Pedido e implementação inicial em 01/10/2026 (America/Sao_Paulo). Alceu pediu uma pré-montagem e conclusão no dia seguinte; esta etapa **não publica uma página pública nem permite contratar o adicional**.

## Decisões e limites

- Item opcional da Loja: **Árvore de links**, preço anunciado R$19,90/mês para outras empresas. Periodicidade mensal assumida pelo contexto dos adicionais SaaS; confirmar antes de ligar contratação/cobrança. Somará ao plano quando a integração comercial estiver pronta, sem cobrança avulsa inventada nesta etapa.
- XPACE permanece isenta, identificada pelo tenant principal no servidor. Ser dono da plataforma não isenta outra empresa. Na loja genérica o cartão recebe `exempt` do DTO autorizado; a loja operacional antiga é exclusiva da XPACE e usa a isenção existente.
- Um endereço público separado por empresa, planejado como `/links/[companySlug]` no domínio do sistema. **A rota ainda não existe.** Não enviar o endereço planejado aos clientes como se estivesse publicado.
- Quatro seções: contratos/planos, produtos, eventos e agendamento de aula experimental. A árvore deve encaminhar aos fluxos públicos próprios de cada empresa; não expor telas administrativas, APIs, tokens ou URLs privadas de webhook. Checkout/venda real de contratos e produtos não foi criado por este pedido preliminar.

## Preparado

- `lib/saas/link-hub.ts`: catálogo `LINK_HUB`/1990 centavos/PREPARATION, seções e caminho planejado. Validador puro para até quatro destinos HTTPS, títulos, códigos únicos e rejeição básica de endereços locais/credenciais; não busca URLs e **não substitui autorização, entitlement ou análise de destinos**. Ainda não conectado a editor/API.
- `components/saas/LinkHubPreparation.tsx` e CSS: cartão compacto reutilizado em `CommercialStore` e `XPayStore`, preço/isenção e prévia recolhida com `details`/`summary` nativos e foco de teclado. Seções ilustrativas, sem links/botões de contratação; publicação indisponível explicitamente. Slug legado inválido mostra endereço “A definir”, sem derrubar a loja.
- Testes puros em `tests/saas-link-hub.test.cjs`, incluídos em `test:saas`. Testes de navegador em `scripts/saas-browser-test.cjs` cobrem preços, isenção, teclado, quatro seções, ausência de links ativos/escritas e larguras móveis.
- **`LINK_HUB` deliberadamente não foi acrescentado ao `addonCodes`, preferências ou pricebook ativo.** Quotes antigas não mudam e rejeitam esse código. Adicionar silenciosamente um preço padrão às versões imutáveis seria incorreto: a integração futura requer migration revisada e nova versão explícita de preços.
- Nenhuma migration, alteração de dados, credencial, callback, cron financeiro, conta, cobrança ou ativação feita nesta etapa. A aplicação existente e os trabalhos concorrentes foram preservados.

## Conferência local

`npm run test:saas`: 39 testes Node e dois suites SQL isolados passaram; `npx tsc --noEmit` e build Next otimizado passaram. Navegador local com APIs/autenticação interceptadas passou em desktop1440 e mobile320/390, incluindo a Loja XPACE, isenção recebida do servidor, prévia por Space/Enter, quatro seções e nenhuma escrita/link ativo ao abrir. Screenshot mobile320 inspecionado, sem overflow; a regra global de maiúsculas foi sobrescrita somente no endereço para preservar o caminho correto. Nenhum servidor local de teste ficou aberto. Não confundir fixtures locais com operação/venda real ou publicação em produção; conferir Git/Vercel antes de declarar o deploy concluído.

## Continuação para 02/10/2026

1. Ler AGENTS/contexto, conferir Git atual e alterações concorrentes; não usar um hash fixo como base. Consultar a revisão e o estado real da publicação da pré-montagem.
2. Revisar os fluxos públicos existentes por tenant e identificar destinos faltantes. Não encaminhar clientes às rotas administrativas específicas da XPACE nem inventar um checkout funcional.
3. Criar configuração persistida por empresa, editor protegido pela sessão/perfil/vínculo e permissões de gestor no servidor, com validação de URLs e DTO público mínimo. Usar skills Supabase e UI, migration individual e grants/RLS mínimos. Não renderizar HTML arbitrário nem buscar URLs no servidor para esta árvore.
4. Implementar `/links/[companySlug]`, identidade visual da empresa e apenas links publicados/autorizados. Empresa inexistente, inativa ou sem direito não deve expor informação privada. Publicação/despublicação e autorização precisam estar no servidor; prévia não equivale a publicação.
5. Integrar `LINK_HUB` ao catálogo de contratação, preferências, entitlement e cobrança mensal conjunta com nova versão imutável do pricebook. XPACE isenta por ID principal. Não ligar cobranças reais enquanto o SaaS/Asaas e regras de competência/cancelamento estiverem pendentes.
6. Testar dois tenants, isolamento, links perigosos, slug inválido, publicação/despublicação, mobile320/390, preço/isenção e nenhum efeito em mensalidades antigas. Atualizar este documento e o checkpoint; retirar somente o recado temporário resolvido.

Lembrete local de uma execução criado no Codex para 02/10/2026 às 09h Brasília, ligado à conversa: `retomar-rvore-de-links-do-xpacebox`. Apenas lembra de retomar; **não autoriza trabalho, deploy ou cobrança automática ao disparar**. Execução local depende do computador e aplicativo ativos ([documentação oficial](https://learn.chatgpt.com/docs/automations)).

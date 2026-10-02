# Navegação e títulos do XPACEBOX

Regra permanente esclarecida por Alceu em 02/10/2026: retorno no próprio título, **sem flechinhas**. Substitui a interpretação anterior de criar uma seta ao lado. Aplica-se aos cabeçalhos e telas autenticadas compartilhadas; não altera autorização, cobrança, pareamento ou dados das empresas.

## Padrão

- O título superior é a ação de retorno: clicar em **CRM**, **Configurações**, **Planos e Pagamentos** etc. volta à tela anterior. Preservar fonte, cor e posição do título, sem borda/fundo de botão, ícone de seta ou botão de retorno separado. Usar botão nativo com nome do título, dica "Voltar à tela anterior", foco visível e teclado, não uma div apenas com onClick.
- Exemplo: Início → Configurações → Planos e Pagamentos. Clicar em Planos e Pagamentos volta para Configurações; clicar em Configurações volta para a tela que abriu esse módulo (Início nesse caminho).
- Voltar recupera o caminho percorrido, não uma tabela fixa de destinos. Exemplo: Loja → benefícios XPay → conta; a primeira volta leva aos benefícios, a segunda à Loja.
- A logo XPACE abre o painel inicial da escola. Nas outras empresas, a logo da empresa abre seu início; a logo XPACEBOX abre a central. Início e Voltar são ações diferentes.
- Na primeira tela não há passo anterior interno. Links abertos diretamente usam um destino interno seguro se não houver histórico do aplicativo; não enviar o usuário a um site externo por falta de histórico.
- No celular, logo/controle e título podem ocupar duas linhas. Título inteiro, foco visível e área de toque acessível; não usar overflow escondido como solução para texto cortado.
- Voltar de etapa e Cancelar dentro de assistentes/modais são ações do formulário, não atalhos para o painel. Preserve salvamento, confirmação e bloqueios operacionais existentes.

## Implementação

- `components/navigation/BackTitle.tsx`: título clicável sem ícones, reutilizando retorno entre rotas com fallback interno; `RouteBackProvider` no layout principal. Referrer interno é considerado somente enquanto não consumido por uma volta.
- `components/navigation/WorkspaceNavigation.tsx` + `lib/navigation.ts`: pilha das telas visitadas, sem duplicar a mesma tela nem remover a primeira. Subtelas registram título/ação no cabeçalho da XPACE.
- Tela e submenus de Config usam IDs de navegação em `history.state`, associados à entrada atual da aba e preservando o estado do Next. Isso permite sair do plano para a loja genérica e voltar ao plano. São apenas nomes de telas, sem formulários, credenciais ou dados pessoais. Entrar novamente em Config por um novo atalho começa seu menu; clicar na logo reinicia o painel.
- O histórico não é autorização nem armazenamento de formulário. Dados e permissões continuam validados pelos acessos existentes. Não promete restaurar todos os filtros, rascunhos ou subtelas de módulos legados.
- `navigation-guard.ts`: Planos e Pagamentos bloqueia saída durante sua operação e pede confirmação ao abandonar preferências alteradas sem salvar. Essa proteção não equivale a proteção global de todos os formulários nem a interceptação do botão físico do navegador.

## Áreas revisadas

| Área | Aplicação do padrão |
| --- | --- |
| XPACE desktop/web móvel | Logo para início; título superior clicável, sem seta; histórico de telas em vez de destinos fixos |
| Config / Plano / Notificações | Título superior clicável e retorno pelos níveis visitados; sem botão separado |
| Financeiro | Subtelas voltam ao hub; hub volta à tela que o abriu |
| XPay | Conta volta ao caminho de entrada, inclusive benefícios; etapas de cadastro preservadas |
| App XPACE | Títulos de listas/detalhes/notificações clicáveis, sem setas; logo para Dashboard; callbacks de presença preservados |
| Outras empresas | Histórico entre módulos; logo da empresa reinicia seu painel; bloqueio obrigatório do CRM preservado |
| Loja / Plano por slug | Logo contextual e título clicável; fallback interno; revisão do build preservada |
| Central / Usuários | Logo compartilhada abre central; título de usuários clicável |

Cabeçalhos legados reutilizáveis também foram alinhados para não reintroduzir retornos fixos quando usados futuramente. Retornos textuais existentes nos menus de Clientes, Gerenciador, Formação de preço e Relatórios mantêm sua ação, sem ArrowLeft. Login, tela inicial, agendamento público e ações de fechar/cancelar modal não recebem atalhos que desviem seus fluxos públicos. Setas de calendário, paginação ou expansão não são retorno de tela e continuam existentes.

## Conferência

`npm run test:navigation` cobre a pilha pura; `npm run test:navigation:browser` usa somente fixtures locais e valida desktop1440/1024/tablet768/mobile390/320, título clicável dentro do viewport sem flechas, teclado Enter, CRM, caminho XPay, Config/Notificações, níveis do financeiro, preferências não salvas, logo e retorno entre plano/loja. Os scripts de navegador usam o controle do título e distinguem essa ação das abas de módulo. Conferir os resultados da execução atual no contexto; existência do script não comprova aprovação ou deploy.

Não há documento de contexto no banco nesta implementação: regras e checkpoint ficam no Git, em `AGENTS.md`, `docs/contexto/` e documentação do módulo. Não criar uma tabela só para duplicar esses arquivos.

# Contexto permanente do XPACEBOX

Esta pasta é a entrada para continuar o XPACEBOX em outra conversa. Ela reúne regras permanentes e um retrato de decisões verificadas, sem guardar credenciais nem depender de um commit específico. Para começar, leia `AGENTS.md`, atualize com segurança a visão do Git e leia [Estado atual](estado-atual.md).

## Texto para iniciar outra conversa

> Continue o repositório `alceu-cloud/xpacebox`. Leia `AGENTS.md` e `docs/contexto/README.md`. Primeiro confira o caminho, o estado do Git e trabalhos locais; busque a `main` atual e atualize somente de forma segura, sem perder mudanças minhas ou do meu amigo. Depois leia `docs/contexto/estado-atual.md`, confira GitHub e Supabase e aguarde meu pedido. Não use um commit fixo como base. Ao concluir mudanças autorizadas, mantenha o contexto atualizado e me informe o commit e o estado real da publicação.

“Atualizar” aqui significa buscar o remoto e integrar apenas quando seguro. Não significa fazer push, migrations ou deploy ao iniciar uma conversa.

## Repositório e conexões

- GitHub: `https://github.com/alceu-cloud/xpacebox`.
- Branch de produção: `main`. A branch de trabalho deve ser descoberta no Git, não presumida por este documento.
- Produção: `https://www.xpacebox.com.br`.
- Vercel: equipe `xpacebox`, projeto `pricing-app-1`.
- Supabase existente: `iphmzkrwhrzjkmivbxno`.
- Cópia isolada usada para Z-API/estoque: `C:\Users\User\Documents\Codex\2026-09-21\xap\work\xpacebox-zapi`.
- Cópia utilizada pelo amigo: `C:\XpaceBox\xpacebox`. Não modificar essa cópia só porque o caminho está documentado.

Em outro computador, descubra a pasta correta pela raiz Git e pelo remote. Não crie clone/projeto duplicado nem copie segredos por presumir que estes caminhos existem. Uma conversa nova precisa conferir a disponibilidade e autenticação das ferramentas; este arquivo não garante que uma sessão anterior continuará autenticada.

## Configurações sem valores secretos

Configurações conhecidas no código/servidor incluem:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- `INTEGRATION_CREDENTIAL_ENCRYPTION_KEY`, `CRON_SECRET`, `NEXT_PUBLIC_APP_URL`.
- `NEXT_PUBLIC_BUILD_REVISION`, `VERCEL_GIT_COMMIT_SHA`, `GITHUB_SHA` para identificação do build.
- `WEB_PUSH_ENABLED`, `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, `WEB_PUSH_VAPID_SUBJECT`.
- `XPAY_ASAAS_ENVIRONMENT`, `XPAY_ASAAS_PARENT_API_KEY`, `XPAY_ASAAS_WEBHOOK_BASE_URL`, `XPAY_ASAAS_WEBHOOK_TOKEN` para o código XPay/Asaas existente; verificar estado/ambiente antes de usar.

Os nomes não são orientação para recriar ou trocar chaves. Use configurações privadas existentes. Credenciais Z-API/e-mail são armazenadas no servidor e não devem ser exportadas para o contexto. Se faltar autenticação, pedir reautenticação no produto, não uma chave pelo chat.

## Ordem de leitura

1. `AGENTS.md` e esta entrada.
2. Git atual e [Estado atual](estado-atual.md), distinguindo decisões de snapshots antigos.
3. [Arquitetura multiempresa](../../ARQUITETURA-V2.md).
4. Documentação do módulo em questão:
   - [Estoque](../xpace-stock.md).
   - [Z-API e histórico da migração](../xpace-zapi-handoff.md).
   - [Push no iPhone](../xpace-iphone-push.md).
   - [Presença em experimentais](../xpace-trial-midnight-attendance.md).
   - [Relatórios XPACE](../xpace-reports.md).
   - [Grade de aulas, professores e salas](../xpace-teaching-workload.md).
   - [Árvore de links](../xpace-link-tree.md).
   - [Faltas, cota de experimentais e públicos](../xpace-trial-allowance.md).
   - [Prazos e e-mails DAWOS](../dawos-sample-deadlines.md).
   - [Notificações por empresa](../company-notifications.md).
   - [Identidade visual por empresa](../company-branding.md).

`project_context.md` e `CONTEXTO-NOVA-TAREFA-CODEX.md` são contexto legado: contêm caminhos, branches e pendências superados. Não tratá-los como estado operacional atual. O documento Z-API preserva trechos de várias fases; “não ativado” no histórico não prevalece sobre a validação posterior.

## Como manter esta entrada útil

Atualize o estado/documentação na mesma mudança que alterou comportamento relevante. Use datas de conferência, evidências e limites; deixe a revisão atual ser descoberta no Git. Documentação esquecida não se atualiza sozinha, e a regra de leitura não substitui inspeção do código/banco.

Uma mudança apenas documental pode disparar build pela integração Git/Vercel. Quando outro agente estiver trabalhando, não publique na `main` sem a autorização vigente e a conferência do remoto. Se o usuário pedir para esperar “publica”, mantenha o pacote somente na cópia local até nova autorização.

## Continuar uma tarefa interrompida

Se houver `Nota temporária — continuação` no fim do [Estado atual](estado-atual.md), ela contém o checkpoint da tarefa em andamento. Para autorizar a próxima conversa a retomá-la, Alceu pode enviar:

> Leia https://github.com/alceu-cloud/xpacebox/blob/main/docs/contexto/README.md e os documentos indicados. Confira o Git e preserve trabalhos concorrentes. Continue o escopo autorizado na nota temporária ao fim do estado atual, respeitando as decisões e os bloqueios nela. Ao terminar, atualize o contexto permanente e remova somente a nota resolvida.

Essa instrução de continuação substitui o “aguarde meu pedido” do texto genérico acima somente para a tarefa identificada na nota. A regra permanente no `AGENTS.md` exige acompanhar o limite durante o trabalho e preparar o checkpoint perto de 10% disponíveis; não é um monitor executado em segundo plano. Ao concluir, incorpore os resultados e retire apenas o recado temporário, nunca esta entrada nem as regras permanentes.

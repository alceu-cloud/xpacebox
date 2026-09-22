# Avisos de agendamentos no iPhone (XPACE)

Esta entrega envia Web Push somente quando um **novo registro de agendamento experimental** é criado pelo link público ou pelo CRM (inclusive um reagendamento cadastrado como novo registro). Alterações de presença, matrícula, importações históricas e edição de agendamento existente não geram avisos. O texto na tela bloqueada não mostra dados pessoais do lead. Cada pessoa precisa ativar no próprio iPhone.

## Antes de ativar em produção

1. A migration `20260922215641_xpace_web_push_subscriptions.sql` já foi aplicada e validada no Supabase de produção. Não reaplicar nem executar `supabase db push` às cegas ou `repair`.
2. Gerar uma única dupla VAPID com `node node_modules/web-push/src/cli.js generate-vapid-keys`. Guardar a chave privada apenas no gerenciador de segredos da Vercel. A chave pública pode ser exposta ao navegador.
3. Configurar na Vercel, no ambiente Production: `WEB_PUSH_ENABLED=true`, `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY` e `WEB_PUSH_VAPID_SUBJECT=https://xpacebox.com.br`. Usar o mesmo par de chaves nos redeploys; trocar a chave invalida as inscrições existentes.
4. Publicar a aplicação. A migração deve estar aplicada **antes** de ativar `WEB_PUSH_ENABLED`, para que o cadastro dos aparelhos não falhe.
5. No iPhone (iOS 16.4 ou posterior), abrir o XPACE pela **Tela de Início**, entrar na conta, tocar no sino → **Ativar avisos** e aceitar a permissão. Repetir no aparelho da administradora. Não é necessário App Store nem conta Apple Developer para essa modalidade de Web Push.
6. Criar uma aula experimental de teste e confirmar: aviso na tela do iPhone, toque abrindo a data da Agenda, registro no sino. Testar os dois caminhos (link público e CRM). Confirmar que marcar presença não gera outro aviso.

## Limites conhecidos

- O disparo ocorre após o registro ser salvo e não atrasa a resposta do agendamento. Não há fila persistente/retry: falha temporária do serviço de push pode perder um aviso, mas nunca desfaz a reserva. O sino no app continua mostrando os registros ao atualizar a tela.
- Esta primeira versão aceita apenas endpoints da Apple (`*.push.apple.com`), pois o objetivo é o iPhone. Outros navegadores/aparelhos exigem ampliar a validação do servidor de forma controlada.
- A pessoa que sair da conta desativa os avisos daquele aparelho. Usuários desativados ou removidos da empresa são ignorados no envio.
- Nenhum segredo VAPID deve ser incluído em Git, logs ou capturas de tela.

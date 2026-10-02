# Diretrizes de trabalho do XPACEBOX

Antes de alterar este repositório, leia completamente `docs/contexto/README.md` e `docs/contexto/estado-atual.md`. Leia também a documentação do módulo envolvido. O contexto é um ponto de partida; confirme fatos mutáveis no Git, no código e nas ferramentas autenticadas.

## Início de cada trabalho

1. Confira o caminho absoluto, a raiz Git, `git status --short`, a branch e o remote. O repositório esperado é `alceu-cloud/xpacebox`; produção acompanha `main`.
2. Busque o estado atual do remoto com `git fetch origin`. Compare a branch local com `origin/main` e leia commits posteriores à última conferência. Não use um hash antigo deste documento como destino de atualização.
3. Atualize uma branch limpa apenas quando for um avanço rápido seguro. Em `main`, use `git pull --ff-only origin main`. Em branch de trabalho, avalie a divergência antes de integrar `origin/main`. Não trocar branch, fazer stash, rebase ou descartar alterações automaticamente quando houver trabalho local/concorrente.
4. Se houver alterações do usuário ou outro agente, preserve-as e use uma cópia isolada quando necessário. Não mexa na cópia do amigo sem pedido explícito.
5. Releia as diretrizes e o contexto depois da atualização. Confira se ferramentas GitHub/Supabase estão autenticadas no projeto correto; documentação não transmite autorização nem credenciais entre sessões.

## Comunicação e autorização

- Português simples, claro e objetivo. Faça análise crítica, identificando risco, gargalo e oportunidade de melhoria; não busque validação automática de ideias.
- Implemente o pedido claro dentro do escopo. Perguntas, diagnóstico e revisão não autorizam correções ou disparos externos não solicitados.
- Alceu permite commit e push automáticos das mudanças solicitadas e testadas, salvo instrução posterior de aguardar, não commitar/não publicar ou conflito com trabalho concorrente. A instrução mais recente prevalece.
- Um pedido para guardar contexto não autoriza alterar dados, enviar mensagens ou modificar produção. Não faça commit/push quando o usuário pedir para esperar “publica”.
- Informe o commit ao concluir. Distinga commit local, push confirmado, build/deploy em andamento e produção verificada. Não declare “no ar” apenas por ter feito push.
- Preserve o componente `BuildRevision` e a versão visível da aplicação. Use a revisão derivada do build/Git, nunca um hash escrito manualmente na interface. Não remova o identificador ao redesenhar telas.

## Git e publicação

- Leia o código e use `apply_patch` para edições. Não sobrescreva trabalho alheio.
- Nunca `reset --hard`, checkout destrutivo ou force push sem autorização específica.
- Antes de publicar, confira novamente o remoto e mudanças concorrentes. Publique somente os arquivos relacionados ao pedido; não acrescente credenciais nem artefatos de teste.
- Rode build e testes proporcionais ao risco. Falha de teste/build impede publicação da mudança incompleta em produção.
- Falha ou resultado desconhecido de push exige consultar o remoto antes de repetir.
- Não faça deploy manual extra enquanto a integração Git/Vercel já estiver publicando, salvo necessidade confirmada.

## SaaS e segurança

- XPACEBOX é multiempresa e modular. Preserve separação por `company_id`/`tenant_company_id`, vínculos e módulos autorizados.
- Autenticação e autorização devem ser validadas no servidor/banco, não apenas escondidas na interface. Tenant e autor vêm da sessão validada, não do corpo enviado pelo navegador.
- Não usar `user_metadata` editável para autorizar. Nunca expor `service_role` no cliente.
- Não pedir, imprimir, copiar para documentação ou commitar tokens, senhas, conteúdo de `.env`, chaves privadas ou URLs privadas de webhook.
- Em qualquer alteração de Supabase, usar as skills aplicáveis, conferir documentação atual e histórico remoto. Não executar `supabase db push`, `repair` ou migrations em massa às cegas. Não reaplicar migrations já registradas.
- Não modificar credenciais, ambiente financeiro, sessões, cron ou integrações não colocadas no escopo.
- Use fixtures/testes isolados. Disparo para cliente real exige autorização e destinatário/efeito exatos.

## Regras operacionais específicas

- WhatsApp usa Z-API na nuvem. Não reativar conector local, tarefa Windows, pareamento ou QR antigo.
- Preserve o callback de recebimento do robô de atendimento. Não reenviar `UNKNOWN` automaticamente; ID/aceitação não comprovam entrega.
- Estoque não alimenta o financeiro nesta fase. Baixa não significa venda/recebimento. Preserve ledger, idempotência e ausência de saldo negativo.
- Produtos com grade têm saldo por tamanho; ao ler o QR do modelo, exija escolher o tamanho antes do movimento. Não juntar saldos dos SKUs nem inventar saldo inicial.
- Presença do lead é `COMPARECEU`/`FALTOU`; não matricule automaticamente.
- Preserve padrão visual compacto, identidade por empresa, rolagem no desktop e pull-to-refresh móvel sem perder formulários.
- Navegação: o próprio título superior (CRM, Configurações, Planos e Pagamentos etc.) é clicável e retorna ao passo/tela realmente anterior. Não adicionar flechinhas, botões quadrados ou um "voltar para Config" separado; manter a aparência original do título, com foco de teclado e área de toque acessíveis. Exemplo: Início → Configurações → Planos e Pagamentos; clicar no título do plano volta para Configurações, clicar em Configurações volta para Início. A logo da empresa é o atalho para o início dessa empresa; a logo XPACEBOX abre a central. Reutilize os componentes compartilhados e preserve bloqueios operacionais. No celular, o título deve caber inteiro; esconder overflow não comprova isso. Setas de paginação/calendário não são botões de retorno de tela. Documentação e critérios em `docs/navigation.md`.

## Manutenção do contexto

Ao concluir uma mudança solicitada, atualize `docs/contexto/estado-atual.md` e a documentação do módulo quando houver alteração material. Registre o que foi implementado/testado, migrations aplicadas ou pendentes, limitações e próximo passo. Diferencie comprovação em produção de teste local e relato do usuário.

Inclua essa atualização no mesmo commit da mudança material, antes do push. Operações autorizadas feitas pelas ferramentas em produção também exigem registrar o resultado relevante e a data de conferência, mesmo sem mudar o código. Não trate números de uma conferência antiga como saldos atuais, não copie dados pessoais/segredos e não declare uma validação apenas porque outro documento a menciona. Se não houver mudança material, não gere edição ou commit vazio só para renovar a data.

Não prenda a entrada do contexto a um “último commit” fixo: descubra a revisão atual no Git a cada início e informe o hash na resposta. Não invente estados de entrega/deploy nem mantenha uma pendência resolvida como atual. Se a publicação precisar esperar, deixe isso explícito no retorno ao usuário e preserve o trabalho local.

### Passagem temporária por limite de uso

Durante o trabalho autorizado, consulte periodicamente os limites da conta, especialmente antes de etapas demoradas. Alceu pediu para interromper novas etapas ao chegar perto de 10% disponíveis na janela de cinco horas (90% usados), reservando margem para salvar, verificar e publicar um checkpoint seguro. O limite é compartilhado e não prevê uma quantidade fixa de mensagens; saldo de créditos e percentual da janela são medidas diferentes. Não espere o bloqueio para documentar.

Ao interromper, atualize o contexto permanente e acrescente uma única seção final `Nota temporária — continuação` em `docs/contexto/estado-atual.md`, com data, motivo real, escopo autorizado, decisões, trabalho concluído/testado, ponto exato de parada, arquivos/branch, pendências e próximos passos ordenados. Não alegue que acabou o crédito quando a interrupção teve outro motivo. Não publicar código incompleto como pronto nem colocar segredos na nota.

Quando Alceu disser à próxima conversa para ler o contexto e continuar, execute os próximos passos dessa nota após conferir Git, regras, autenticação e trabalho concorrente. Não é preciso pedir novamente autorização para o mesmo escopo; pagamentos reais, criação de contas/instâncias com custo e outras ativações explicitamente adiadas continuam bloqueadas até autorização específica. A nota não amplia o pedido original.

Ao terminar a continuação, incorpore os resultados relevantes ao contexto permanente e à documentação do módulo; só então remova a nota temporária resolvida no mesmo commit. Se sobrar trabalho, substitua a nota por uma versão atual, sem empilhar recados. Preserve estas regras e a documentação fixa. Não enviar mensagem a outra conversa: a passagem será feita pelo próprio documento, conforme esclarecimento de Alceu.

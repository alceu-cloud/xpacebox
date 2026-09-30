# Integrador de mensagens XPACE — instalação e limites

O XPACEBOX agora tem, na **Loja → Integrador de mensagens**, telas de pontuação operacional, controle de envios e QR Code. Depois da venda, a atendente pode copiar ou solicitar o envio dos links disponíveis de assinatura (Autentique) e da cobrança Pix já emitida (Asaas). Os mesmos links podem ser abertos no histórico de vendas ou na lista de contratos do aluno.

## Antes de usar

- **É uma conexão não oficial do WhatsApp, via biblioteca Baileys.** Os [termos da WhatsApp Business App](https://www.whatsapp.com/legal/WhatsApp-Terms-for-WhatsApp-Business-App) restringem aplicativos que interagem sem consentimento prévio por escrito. Isso pode levar à suspensão do número; Meta Verified não equivale a essa autorização. A pontuação mostrada na Loja mede apenas conexão e erros do XPACEBOX; não é o indicador oficial do WhatsApp.
- Links avulsos de assinatura e cobrança só entram na fila depois que um usuário escolhe **WhatsApp da escola**. Avisos de aula e mensalidades Pix autorizadas podem entrar automaticamente na fila. A autorização da aula experimental não autoriza mensagens financeiras; a venda pergunta isso separadamente.
- As notificações já configuradas no Asaas e na Autentique continuam intactas. Teste com seu próprio cadastro e confira se não há duplicidade antes de enviar a clientes.
- O conector novo só marca **enviado** após confirmação de aceite pelo servidor do WhatsApp para aquela mensagem. Aceite ainda não comprova entrega nem leitura; uma tentativa sem confirmação fica em **Verificar** e nunca é reenviada automaticamente.
- Em 29/09/2026, o envio com JID baseado diretamente no telefone retornava um ID, mas não aparecia na conversa. O envio pelo LID obtido da consulta do próprio WhatsApp foi confirmado ponta a ponta em um número de teste e em um aviso real à professora. Antes de aumentar o volume, continue conferindo as conversas no celular da escola e os estados da fila.

## Instalação no computador da escola

1. Instale Node.js 20.6 ou superior. Deixe a CPU ligada, conectada à internet e configure o Windows para **não suspender automaticamente**. O monitor pode ficar desligado.
2. Copie a pasta `connector` do projeto para o computador e execute `npm ci` nela.
3. Na Loja, abra Integrador de mensagens → QR Code → Preparar conexão. Copie a chave exibida **uma única vez**.
4. Copie `connector/.env.example` para `connector/.env` nesse computador. Preencha `XPACEBOX_URL=https://xpacebox.com.br` e `XPACEBOX_CONNECTOR_TOKEN` com a chave. Não compartilhe a chave e nunca a salve no Git.
5. Rode `npm start` na pasta `connector`. A página da Loja mostrará o QR. No celular, abra WhatsApp → Dispositivos conectados → Conectar dispositivo e leia o código.
6. Faça uma venda de teste em seu próprio cadastro. Confira a cobrança e o contrato; envie um link pelo conector; verifique o WhatsApp e a fila da Loja.

### Logs e recuperação (30/09/2026)

- `npm start` passa a executar `launcher.mjs`, que resolve `.env` e `index.mjs` pela pasta do próprio lançador. Assim, uma tarefa que abre em `System32` não procura a configuração no lugar errado.
- Dois arquivos locais em `%LOCALAPPDATA%\XpaceBox\message-connector-logs`: `launcher.log` (inicialização, dependências e saída do processo) e `connector.log` (conexão, reconexão, API, envio e recibos). Cada arquivo gira ao atingir 2 MiB e mantém três arquivos anteriores. As datas são UTC, com `Z`. Não são gravados chaves, QR, telefones, conteúdo de mensagens ou pilhas completas; erros usam categorias, códigos e arquivo/linha sem o caminho privado.
- Falhas transitórias de conexão tentam reconectar com espera de 5 até 60 segundos. A reconexão é programada **antes** de informar a queda ao site: uma falha de HTTPS não cancela a tentativa. O lançador tenta recuperar até duas vezes um encerramento inesperado rápido, com espera; configuração, dependências ou sintaxe inválidas exigem correção. Uma tarefa do Windows pode complementar a recuperação, mas não pode criar instâncias paralelas.
- Logout, sessão inválida, substituição por outra instância ou proibição exigem revisão manual. A rotina não apaga credenciais, não gira a chave e não faz logout ao parar o processo. O estado de erro não é imediatamente substituído por “offline” pelo próximo heartbeat.
- Publicar o site **não atualiza** `C:\Xpacebox\connector`. No computador da escola, pare somente a tarefa/processo desse conector, atualize a pasta inteira preservando `.env` e a sessão em `%LOCALAPPDATA%\XpaceBox\message-connector`, valide `npm ci` e `npm test`, e use `npm start` ou `node launcher.mjs` na tarefa sob o mesmo usuário. Não copie `.env.example` por cima do `.env` existente. Configure a tarefa para não iniciar uma segunda instância, reiniciar em falha (por exemplo, 1 minuto / 3 tentativas) e não encerrar por limite de duração. Valide manualmente antes de ocultar a janela.
- Se encerrar novamente, examine os últimos eventos dos dois logs. Eles esclarecem a próxima falha, mas não recuperam a causa de um encerramento antigo que não foi registrado. Não é necessário enviar o `.env`, a chave ou arquivos de sessão para suporte.

### Alarme de providências (30/09/2026)

- Na XPACE e na DAWOS, a aba Providências e os cartões de pendências usam destaque vermelho com ícone/texto. O botão de som ao lado das configurações permite silenciar ou ativar um alerta curto de três notas.
- O alerta identifica novas pendências por registro, mesmo quando a quantidade total não mudou. Uma pendência já sinalizada não toca a cada atualização; tocar o som não resolve nem marca o registro como lido. Preferência e histórico de alarmes ficam neste navegador por usuário e empresa.
- Após recarregar ou reabrir a página, o navegador pode exigir uma interação para liberar áudio; o botão indica essa espera. A página precisa estar aberta e visível. O alarme não é uma notificação em segundo plano nem substitui monitoramento do computador.
- Queda do conector só gera som se permanecer no painel por pelo menos um minuto, para evitar alertas de reconexões breves. Erros de envio não aguardam esse minuto. Categorias desativadas nas preferências não geram alarmes.

### Recuperação dos avisos ao professor

- O nome e celular do professor são consultados pelo agendamento/horário, mesmo quando ainda não existe `AVISO_PROFESSOR`. Falta de celular é exibida como “Cadastre o celular do professor”, não como “Professor não informado”. Histórico sem vínculo conserva o nome do agendamento; o sistema não inventa telefone.
- Salvar o cadastro do professor com celular válido recupera somente avisos **ausentes** para aulas futuras agendadas daquele professor, excluindo registros importados da planilha. Não recria avisos enviados, em verificação ou cancelados e não reenvia vídeos/lembretes. A unicidade por agendamento/tipo também protege contra chamadas simultâneas.
- A criação de uma experimental pelo próprio CRM também programa o aviso operacional ao professor, independentemente da autorização do aluno. Essa mudança não libera mensagens ao aluno sem consentimento.
- Em 30/09, Ariel Becker e Esyher tinham professor Jhonney vinculado, mas o cadastro dele estava sem celular: nenhum aviso ao professor foi criado. Preencher e salvar esse cadastro permitirá a recuperação dos avisos ainda dentro do prazo. O conector precisa voltar a funcionar para entregar mensagens da fila.

### Diagnóstico de mensagem ausente

O conector consulta o contato, usa o LID retornado pelo WhatsApp e correlaciona as confirmações **aceita pelo servidor**, **entregue**, **lida** ou **erro** com o envio atual. Os registros não exibem telefone nem conteúdo. Depois de atualizar a pasta `connector` no computador da escola, reinicie o processo sem apagar o `.env` nem as credenciais em `%LOCALAPPDATA%`. Faça **um único teste controlado** com um número autorizado e confira o resultado no PowerShell, no celular da escola e no destinatário. Ausência de confirmação não autoriza reenvio automático: uma mensagem ainda pode chegar depois. Para diagnóstico, `XPACEBOX_PAUSE_SEND=1` mantém a conexão sem consumir a fila; `XPACEBOX_SEND_LIMIT=1` limita a uma tentativa no processo atual. Remova essas variáveis para operar normalmente.

O conector faz conexões **de saída** por HTTPS com o XPACEBOX. Não é necessário abrir porta no roteador nem instalar túnel. Para manter o processo após reinício do Windows, configure uma tarefa de inicialização sob o usuário da escola **somente depois de validar o teste manual**. As credenciais do dispositivo ficam no perfil local do Windows em `%LOCALAPPDATA%\XpaceBox\message-connector`, fora do repositório. Faça cópia segura se precisar recuperar o pareamento. A rotina de autenticação em arquivos da Baileys é adequada ao protótipo, mas a própria biblioteca não a recomenda para produção de maior escala.

Gerar uma nova chave na Loja invalida a anterior. O botão Desconectar solicita ao computador que encerre a sessão; se ele estiver desligado, a solicitação fica pendente até voltar. Para desconexão imediata sem o PC, remova o dispositivo no próprio WhatsApp.

## Segurança e dados

### Pesquisa automática e liberação dos agendamentos antigos (29/09/2026)

- A autorização no agendamento inclui vídeo, lembretes e pesquisa da aula. Não há mais uma segunda caixa de autorização no resultado do lead. Agendamentos novos sem autorização ficam destacados no CRM; o conector bloqueia mensagens para o aluno, inclusive links manuais. O aviso operacional ao professor é independente da autorização do aluno.
- Por solicitação do operador, os agendamentos XPACE já existentes antes de `2026-09-29T22:25:22.138042Z` receberam `whatsapp_legacy_allowed_at`. Essa é uma liberação operacional da escola, **não um consentimento declarado pelo cliente**; `whatsapp_opt_in` e suas datas originais foram preservados. Novos registros têm a liberação nula. Essa exceção não autoriza cobranças, não cria envios retroativos e não deve ser usada para contrariar pedidos de interrupção.
- Ao mudar a presença para **Compareceu**, CRM, agenda e app programam a pesquisa para **duas horas após registrar a presença**, não após o fim previsto da aula. A fila tem unicidade por agendamento/tipo, expiração em 48 horas e valida a presença e a permissão novamente antes de enviar. Uma tentativa ambígua não é repetida automaticamente.
- O CRM mostra **Pesquisa enviada: Sim/Não**, sem edição manual. “Sim” é gravado pelo resultado confirmado do conector ou por recibo de entrega/leitura; não significa que o formulário foi respondido. O computador precisa permanecer ligado e conectado para consumir a fila.
- Horários arquivados não voltam à grade ativa: o app usa os nomes de aula/professor e horários preservados no agendamento, complementando sala, nível e público pelo horário vinculado (inclusive arquivado) da mesma empresa. Nível/público sem vínculo histórico não são inventados; esses campos ainda não possuem snapshot próprio no agendamento.
- A mensagem enviada com o vídeo inclui a sala do horário escolhido nos novos agendamentos públicos e feitos pela agenda. Nenhum vídeo antigo é reenviado e o conector local não precisa de atualização para ler esse texto.
- No app `/xpace/app`, o painel tem **Aulas da semana** e **Aulas da próxima semana**, um abaixo do outro, com semanas de segunda a domingo em São Paulo. Cada um carrega seu próprio período, independentemente da semana navegada na agenda. Ambos abrem os leads, permitem registrar a chamada no CRM e mantêm as cores de presença. Nível e público aparecem nos cards e detalhes do app, além do card do CRM e do cabeçalho do agendamento.
- A tabela de envios avulsos fica apenas para assinatura, pagamento, Pix e teste. Avisos de aula aparecem agrupados; avisos antigos sem agendamento (lead excluído) continuam no banco como histórico, sem duplicar a tela.

- A chave fica como hash no banco e só a versão original é exibida na geração. Rotação revoga o acesso anterior à API.
- As APIs da Loja exigem login e acesso à XPACE; configurar o conector e ver a fila exige gerente ou administrador. O serviço do computador usa uma chave independente, limitada à empresa do conector.
- Os links são buscados novamente no servidor, associados à venda da XPACE. O navegador não pode fornecer URL arbitrária para envio automático.
- A fila registra telefone, corpo da mensagem, estado, data e erro. Esses dados pessoais devem seguir a política de retenção da escola. Ainda não há interface de exclusão/retensão automática.
- Houve teste ponta a ponta no computador real com dois destinatários em 29/09/2026. Ainda faltam testes de reconexão, queda de internet, atraso de confirmação e duplicidade de notificações dos provedores. Não escale o volume nem use para campanhas até essa validação.

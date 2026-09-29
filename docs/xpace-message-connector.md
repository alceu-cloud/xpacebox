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
- Horários arquivados não voltam à grade ativa: o app usa os nomes de aula/professor e horários preservados no agendamento, complementando a sala pelo horário arquivado da mesma empresa.
- A tabela de envios avulsos fica apenas para assinatura, pagamento, Pix e teste. Avisos de aula aparecem agrupados; avisos antigos sem agendamento (lead excluído) continuam no banco como histórico, sem duplicar a tela.

- A chave fica como hash no banco e só a versão original é exibida na geração. Rotação revoga o acesso anterior à API.
- As APIs da Loja exigem login e acesso à XPACE; configurar o conector e ver a fila exige gerente ou administrador. O serviço do computador usa uma chave independente, limitada à empresa do conector.
- Os links são buscados novamente no servidor, associados à venda da XPACE. O navegador não pode fornecer URL arbitrária para envio automático.
- A fila registra telefone, corpo da mensagem, estado, data e erro. Esses dados pessoais devem seguir a política de retenção da escola. Ainda não há interface de exclusão/retensão automática.
- Houve teste ponta a ponta no computador real com dois destinatários em 29/09/2026. Ainda faltam testes de reconexão, queda de internet, atraso de confirmação e duplicidade de notificações dos provedores. Não escale o volume nem use para campanhas até essa validação.

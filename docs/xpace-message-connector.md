# Integrador de mensagens XPACE — instalação e limites

O XPACEBOX agora tem, na **Loja → Integrador de mensagens**, telas de pontuação operacional, controle de envios e QR Code. Depois da venda, a atendente pode copiar ou solicitar o envio dos links disponíveis de assinatura (Autentique) e da cobrança Pix já emitida (Asaas). Os mesmos links podem ser abertos no histórico de vendas ou na lista de contratos do aluno.

## Antes de usar

- **É uma conexão não oficial do WhatsApp, via biblioteca Baileys.** Os [termos da WhatsApp Business App](https://www.whatsapp.com/legal/WhatsApp-Terms-for-WhatsApp-Business-App) restringem aplicativos que interagem sem consentimento prévio por escrito. Isso pode levar à suspensão do número; Meta Verified não equivale a essa autorização. A pontuação mostrada na Loja mede apenas conexão e erros do XPACEBOX; não é o indicador oficial do WhatsApp.
- O conector só envia depois de um usuário autorizado escolher **WhatsApp da escola**. É necessário que o cliente tenha autorizado contato por WhatsApp no cadastro.
- As notificações já configuradas no Asaas e na Autentique continuam intactas. Teste com seu próprio cadastro e confira se não há duplicidade antes de enviar a clientes.
- A tela mostra **enviado ao WhatsApp**, não entregue/lido. Uma tentativa incerta fica em **Verificar** e nunca é reenviada automaticamente.
- Não foi feito pareamento nem teste com o número real. Isso exige acesso ao computador e celular da escola.

## Instalação no computador da escola

1. Instale Node.js 20.6 ou superior. Deixe a CPU ligada, conectada à internet e configure o Windows para **não suspender automaticamente**. O monitor pode ficar desligado.
2. Copie a pasta `connector` do projeto para o computador e execute `npm ci` nela.
3. Na Loja, abra Integrador de mensagens → QR Code → Preparar conexão. Copie a chave exibida **uma única vez**.
4. Copie `connector/.env.example` para `connector/.env` nesse computador. Preencha `XPACEBOX_URL=https://xpacebox.com.br` e `XPACEBOX_CONNECTOR_TOKEN` com a chave. Não compartilhe a chave e nunca a salve no Git.
5. Rode `npm start` na pasta `connector`. A página da Loja mostrará o QR. No celular, abra WhatsApp → Dispositivos conectados → Conectar dispositivo e leia o código.
6. Faça uma venda de teste em seu próprio cadastro. Confira a cobrança e o contrato; envie um link pelo conector; verifique o WhatsApp e a fila da Loja.

O conector faz conexões **de saída** por HTTPS com o XPACEBOX. Não é necessário abrir porta no roteador nem instalar túnel. Para manter o processo após reinício do Windows, configure uma tarefa de inicialização sob o usuário da escola **somente depois de validar o teste manual**. As credenciais do dispositivo ficam no perfil local do Windows em `%LOCALAPPDATA%\XpaceBox\message-connector`, fora do repositório. Faça cópia segura se precisar recuperar o pareamento. A rotina de autenticação em arquivos da Baileys é adequada ao protótipo, mas a própria biblioteca não a recomenda para produção de maior escala.

Gerar uma nova chave na Loja invalida a anterior. O botão Desconectar solicita ao computador que encerre a sessão; se ele estiver desligado, a solicitação fica pendente até voltar. Para desconexão imediata sem o PC, remova o dispositivo no próprio WhatsApp.

## Segurança e dados

- A chave fica como hash no banco e só a versão original é exibida na geração. Rotação revoga o acesso anterior à API.
- As APIs da Loja exigem login e acesso à XPACE; configurar o conector e ver a fila exige gerente ou administrador. O serviço do computador usa uma chave independente, limitada à empresa do conector.
- Os links são buscados novamente no servidor, associados à venda da XPACE. O navegador não pode fornecer URL arbitrária para envio automático.
- A fila registra telefone, corpo da mensagem, estado, data e erro. Esses dados pessoais devem seguir a política de retenção da escola. Ainda não há interface de exclusão/retensão automática.
- Falta um teste ponta a ponta no computador real, inclusive reconexão, queda de internet e duplicidade de notificações dos provedores. Não escale o volume nem use para campanhas até essa validação.

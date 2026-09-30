# Notificações e providências por empresa

DAWOS: painel compacto ao lado da abertura da página inicial. Configuração no
ícone do painel ou Gerenciador → Configurações da empresa → Usuário e notificações.
XPACE: painel da página inicial, com cores e rótulos por assunto. Configurações →
Usuário e notificações. As preferências são do usuário logado naquela empresa,
não mudam suas permissões nem interrompem as mensagens enviadas aos clientes.

Não lidas/Lidas: agendamentos experimentais, recebimentos e contratos assinados
dos últimos 90 dias. Marcar todas como lidas salva cursores por categoria no
servidor, com bloqueio de linha e atualização monotônica; persiste entre aparelhos.
O corte é a última consulta do painel, não inclui avisos novos recebidos depois.
O marcador local antigo da XPACE é migrado uma vez, sem apagar o histórico.

Providências não têm botão de dispensar nem de marcar como lidas. São recalculadas
nos registros reais. Um aviso novo com sucesso elimina a falha ativa anterior sem
apagar as tentativas antigas. Falhas permanecem de um dia para outro enquanto
forem relevantes para a etapa atual. O contador de hoje não inclui lacunas de CRM.

Cobertura atual: agenda comercial e avisos atrasados de amostras; novas falhas do
e-mail inicial de amostra; falhas gerais dos três crons existentes; emissão Pix,
cancelamento de cobrança, assinatura e lembretes, mensagens WhatsApp sem confirmação
e conector sem heartbeat há mais de dois minutos. Os resumos não exibem respostas
brutas do provedor, payloads, destinatários ou segredos. Não é uma garantia de
entrega/leitura nem monitora falhas que impediram o próprio sistema de registrar.

Leads ganhos: somente os criados no sistema. Exclui legacy_import_batch_id ou
legacy_row_number, mesmo que o registro tenha sido editado depois. Conferir
telefone, origem, atendente, motivo de ganho e matrícula/vínculo com contrato;
nas aulas existentes, turma/horário e, a partir da data da aula, confirmação,
presença, resultado de matrícula e professor real quando compareceu. Respostas
negativas são válidas; não exigir aula experimental para venda direta, nem
resultado de uma aula futura. Não muda etapas automaticamente nem inventa dados.

APIs validam sessão, perfil ativo e associação à empresa. Preferências recebem
empresa/usuário do servidor, nunca do corpo enviado pelo navegador. Gestores
acessam falhas financeiras e integrações da empresa; usuários comuns não recebem
esses dados, apenas seu e-mail de agenda e o CRM operacional da própria empresa.
RLS permite ler somente preferências próprias dentro das empresas autorizadas;
escrita do navegador é revogada. Eventos técnicos são server-only. O RPC de
cursores é SECURITY INVOKER, executável somente pelo service_role.

Não existe reenvio em massa neste painel e nenhuma leitura dispara mensagens.
Testes: company-notifications-test.cjs e company-notifications-visual.cjs usam
somente fixtures. Migração específica validada em transação com ROLLBACK antes
de ser aplicada. Não usar db push nem repair para instalar.

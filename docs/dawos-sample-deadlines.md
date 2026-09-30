# DAWOS · prazos e alertas de amostras

Controle: Clientes → Amostras. Cada card tem Reprogramar prazo e Histórico.
Produção, entrega e aprovação guardam separadamente prazo original/conhecido,
previsão atual e data realizada. Cada reprogramação exige motivo, autor e registro
de data/hora. Marcar pronta, entregue ou aprovada/reprovada permite informar a data
real, entre o início da etapa e hoje (São Paulo).

**Reprogramar não perdoa atraso:** a agenda do CRM e os alertas continuam calculados
pelo prazo original da etapa atual até que ela seja concluída. A nova previsão
aparece ao lado e no e-mail. Ao avançar uma etapa, passa a valer o prazo da próxima.

E-mail às 08h de Brasília, todos os dias, uma tentativa por amostra/etapa/dia.
Produção: PPCP e suporte, consultor em cópia. Entrega e aprovação: somente o
consultor. Sem e-mail do responsável essas duas etapas não são enviadas.
Falhas não são reenviadas em massa, nem apagadas pelo histórico de prazos.
SENT no registro significa aceito pelo provedor, não prova leitura pelo usuário.
Na pendência de e-mail da amostra, um gerente autorizado pode usar **Tentar novamente**
para reenviar somente aquele aviso. A tentativa é reservada atomicamente no banco,
tem chave de idempotência no Resend e guarda destinatários, horário, código de erro
ou ID do provedor. O erro original permanece no histórico. Resposta incerta ou
tentativa interrompida bloqueia novo envio até conferência no Resend, evitando
duplicatas. Após aceite salvo, a pendência desaparece; é preciso confirmar o
recebimento separadamente. O teste de Integrações não reenvia avisos antigos.

Credenciais anteriores à chave dedicada são lidas também com a chave Baldussi
antiga já configurada, mantendo a autenticação AES-GCM. Se ambas falharem, é
necessário salvar a chave do Resend pessoalmente em Integrações. Não pedir ou
exibir segredos no chat. Diagnóstico estritamente de leitura, protegido pelo
CRON_SECRET: GET /api/cron/sample-overdue-email?diagnostics=credentials.

Banco: migração aditiva restrita a amostras. RPC server-only, SECURITY INVOKER,
com associação à empresa, responsável/gestor e bloqueio de linha. Estado/prazo
esperados evitam sobrescrever alterações concorrentes. Alteração e evento são
atômicos. Datas originais são protegidas por trigger; escrita direta de navegador
revogada. Histórico tem RLS e somente leitura/inserção pelo servidor.

Legado: prazos presentes na implantação são **prazos conhecidos**, não afirmação
de que eram a primeira promessa. Adiamentos antigos não podem ser reconstruídos.
Exclusão autorizada de uma amostra ainda exclui os eventos vinculados, como os
outros registros dependentes existentes.

Validação: scripts/dawos-samples-test.cjs, dawos-samples-visual.cjs e
dawos-sample-history-db-check.sql. O SQL de teste só roda em transação com ROLLBACK;
usa identidade negativa explícita para não consumir a sequência de produção.

# Grade de aulas, professor e reserva de salas

Implementada em 02/10/2026. Alceu autorizou integrar o trabalho concluído do colega e implantar; a main corrente foi integrada na cópia isolada, preservando navegação, planos e reagendamento. Nenhuma conta real, aula, reserva, mensagem ou cobrança foi criada para testar.

## Fluxos implementados

- Agenda → Grade de aulas, depois de Ocupação. Nova grade recorrente com professor e sala existentes, dias, início, duração e data inicial. Horários já cadastrados podem ser incluídos sem duplicar a turma. Cada data tem presença, professor efetivo, observação e valor excepcional autorizado ao gestor.
- Administrativo → Professores: valor completo por aula, acesso do professor com e-mail/senha inicial, troca de senha e ativação/desativação do vínculo. Valor não definido é `null`; zero precisa ser escolhido explicitamente.
- `/xpace/professor`: login próprio e PWA com somente Grade de aulas, Ocupação e Reserva. Professores confirmam apenas suas aulas; equipe pode corrigir presença e substituição. Nenhum dado de aluno/lead ou salário de outro professor é retornado.
- Ocupação da grade: horários das turmas, aulas por data e reservas, sem dados pessoais de alunos. Aulas canceladas são liberadas no controle por data. QR impresso por sala abre o aplicativo; após autenticação, confirma apenas uma aula elegível do professor naquela sala.
- Configurações → Financeiro → Valor das salas: preço por hora, inicialmente R$ 35,00 em todas as salas existentes. As quatro salas existentes receberam o padrão R$ 35,00/h pela migration; nenhum cadastro novo de sala foi criado.
- Reserva: duração proporcional, preço calculado no banco e congelado no registro, idempotência de tentativa e conflito verificado atomicamente com aulas e locações. O bloqueio também cobre as telas antigas de locação/edição de horários.
- Cancelamento libera a sala e deixa a cobrança pendente da equipe. Gestor informa valor e motivo, com histórico. Não presumir que cancelamento é gratuito.
- Relatórios → Aulas e reservas: aulas efetivamente realizadas, duração ministrada e total por professor para pagamento no mês seguinte; cobrança de salas com período próprio. Nenhum lançamento é integrado ao financeiro, nenhum valor é descontado automaticamente do professor.
- Conferência mensal pelo gestor bloqueia alterações das aulas. Reabrir exige motivo. Não permite conferir quando há aula realizada com valor indefinido.

## Decisões autorizadas e padrões adotados

Alceu confirmou pagamento **por aula inteira**, incluindo os 45 minutos de Alceu. As reservas cobram proporcionalmente ao tempo e a equipe define a cobrança ao cancelar. Professores acessam exatamente as três áreas acima.

Na ausência de resposta, o usuário autorizou escolher padrões e avisar ao final:

1. Presença do professor entre 15 minutos antes do início e 30 minutos depois do fim, validada pelo relógio do banco. Correções posteriores cabem à equipe. QR identifica a sala, não comprova presença física; pode ser fotografado. Repetição não duplica presença.
2. Pagamento atribuído ao professor efetivo daquela data; canceladas não entram automaticamente no total. Gestor pode escolher valor excepcional por aula. Mudança de preço não reescreve aula já confirmada.
3. Conferência mensal manual; a reabertura tem motivo. Cobrança de reserva segue separada, inclusive cancelamentos aguardando decisão.
4. Começar grades a partir da data escolhida, sem importar automaticamente a história da planilha, pagamentos, descontos ou nomes parecidos.
5. Reservas futuras de minutos inteiros, no mesmo dia, até 12 horas e até 366 dias à frente. Valores são arredondados ao centavo mais próximo.

A planilha original foi lida sem alterações, excluindo Cobranças conforme pedido. Professores variam por data; “Horas Mês” na planilha é contagem de aulas marcadas OK, não duração. “Pago” precisa permanecer separado de presença. Nomes parecidos com taxas diferentes não foram unidos automaticamente.

## Segurança e integridade

O perfil confiável é `profiles.platform_role = company_teacher`, com vínculo `xpace_teacher_access` ao professor/empresa. Não usar metadata editável. Esse perfil não recebe `company_members` ativo: os guards existentes negam APIs gerais e as políticas antigas por membership não concedem acesso direto. Alterar um perfil para professor desativa memberships existentes. Vínculo/professor/perfil precisam estar ativos.

Servidor fornece tenant, autor e professor da sessão. Professor não define valor da reserva, salário, professor de outro cadastro ou cobrança de cancelamento. Novas tabelas têm RLS e acesso apenas por servidor; RPCs de mutação são `security invoker`, com `search_path` vazio e execução revogada para public/anon/authenticated.

Datas de presença são snapshots por aula. Alterações na grade recorrente não reescrevem as datas já geradas; para mudar professor de uma ocorrência, use Ajustar/Presença. O histórico de aulas impede exclusão destrutiva dos horários referenciados. Grades e reservas antigas continuam no banco.

## Migration e validação

Aplicada individualmente: `20261002165924_xpace_teaching_and_room_reservations.sql`, com arquivo alinhado à versão confirmada no histórico remoto. RLS/grants, funções invoker, preços das quatro salas e preservação dos triggers antigos foram verificados por leitura. Não houve aplicação em massa/repair ou criação de histórico fictício.

Comandos: `npm run test:xpace-teaching`, `npm run test:xpace-links-teaching:browser`, build Next e TypeScript. Testes cobrem: recorrência/leap year, 45 minutos com pagamento inteiro, substituto e congelamento de valores, ausências/liberação de cota, vínculo e escopo de professor, QR correto/incorreto/janela/idempotência, conferência, salas/aulas/locações/intervalos adjacentes, cancelamento e valor parcial, preço proporcional e replay de reserva.

Navegador com fixtures locais: abas reais, criação de grade de 45 minutos, relatório, professor somente com três áreas, presença própria e reserva R$ 17,50 por 30 minutos, desktop e celulares 320/390 pixels. Capturas são dados fictícios e não comprovam operação em produção. Teste de instalação/QR em aparelho físico e professor real continua para validação operacional; migrations remotas já aplicadas. Após integração, passaram novamente build, TypeScript, suites de aulas/estoque/SaaS/reagendamento/navegação e navegador local.

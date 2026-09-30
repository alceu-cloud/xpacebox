# Relatórios de acompanhamento XPACE

Implementação de 29/09/2026. Acesso pelo botão **RELATÓRIOS** na página inicial da XPACE.

## Ação e conversão

Novo acesso em **Relatórios → Ação e conversão**, também pelo atalho **Ação e conversão** no CRM. O atalho do CRM começa no mês vigente. O filtro de período é compartilhado com os relatórios; os relatórios históricos por aula permanecem inalterados.

- **Conversão por pessoa:** pessoas com experimental não cancelada no período, identificadas por cliente vinculado/convertido ou ID do lead, nunca só por nome/telefone. Duas modalidades não duplicam o total geral. Clientes previamente vinculados ficam separados da aquisição. Comparecimento usa presença no período; matrícula considera todo o histórico disponível, inclusive aula posterior ao filtro. É uma visão atualizada do grupo, não uma fotografia imutável do fechamento do mês.
- **Etapas:** presentes/pessoas agendadas e presentes que matricularam/todos os presentes. Pendências permanecem visíveis na base desta nova visão; não são convertidas em perdas. A regra histórica por resultados preenchidos continua nos demais relatórios. Matrícula e lead ganho aparecem separados, com contador de divergências.
- **Fila comercial:** uma pessoa que compareceu, sem Matriculou em qualquer aula, com ao menos um lead não encerrado como perdido. Mostra última presença, professor real, tempo desde a aula e próxima ação. Próxima ação exige data e responsável ativo autorizado para a XPACE; concluir exige resultado e não encerra lead nem inventa matrícula. O registro é uma atividade CONTATO estruturada, preservando histórico. Leads antigos podem ser abertos diretamente sem depender do limite da lista recente do CRM.
- **Pesquisa:** envio permanece controlado pelo fluxo automático existente. A resposta recebida no Google Forms é registrada pela equipe como positiva/neutra/negativa/sem resposta; não há leitura automática do Forms. Negativa não tratada gera aviso no painel. A equipe pode registrar atendimento, com observação obrigatória. Registrar resposta não marca enviada, não libera WhatsApp e não envia mensagens.
- **Perdas:** pessoas do período cujos leads estão todos perdidos. Categoria ausente com observação é “Só observação · classificar motivo”; sem ambos é “Não informado”. Usa os motivos existentes em Configurações → CRM, sem criar categorias ou reinterpretar históricos silenciosamente.
- **Professores:** pessoas presentes únicas por professor no período, excluindo clientes previamente vinculados. Conversão atribuída apenas à aula com Matriculou registrado; professor real prevalece. Pendentes ficam separados; taxa usa resultados conhecidos. Menos de cinco: baixa amostra, sem ranking. Uma pessoa em dois professores pode entrar nas duas linhas; somá-las não é o total geral e a taxa não demonstra causalidade.

`/api/xpace/conversion` exige acesso à XPACE em GET e POST, valida lead/aula/responsável da empresa no servidor e usa no-store. Próximas ações e respostas são atividades com payload versionado pelo discriminador `kind`; lê-se o último evento por data/ID. Paginação do banco evita truncamento em 1.000; a tela exibe 20 registros por página. Estrutura real, checks e permissões foram conferidos antes da implementação: tabelas com RLS habilitado, sem acesso direto por anon/authenticated, via servidor autorizado. Não necessita migrations e não modifica Asaas/Autentique/conector/planilha.

Testes adicionais locais: `node scripts/xpace-conversion-test.cjs` e, com servidor local 3007, `node scripts/xpace-conversion-visual.cjs`. Dados fictícios e todas as APIs externas interceptadas, sem mensagens reais.
Fonte de referência: `Graficos de Acompanhamento 2026.xlsx`, da aba Comparecimento em diante. O arquivo original não é alterado.

## Apuração de experimentais

Uma linha representa um agendamento. A data da aula define o período. Cancelados ficam fora das taxas. Não se deduplicam pessoas por nome: a identificação usa o lead e, quando existe, o cliente vinculado.

| Resultado | Numerador | Denominador |
| --- | --- | --- |
| Comparecimento geral/mensal | Compareceu | Todos os agendamentos não cancelados |
| Comparecimento com resultado | Compareceu | Compareceu + Faltou |
| Conversão geral | Matriculou | Matriculou + Não matriculou |
| Conversão por modalidade (regra Excel) | Todas as marcações Matriculou | Todos os presentes |
| Conversão dos presentes/professor | Compareceu e Matriculou | Presentes com Matriculou ou Não matriculou |

Pendentes e não informados não são inventados como Não matriculou. As diferentes bases permanecem visíveis. O professor real do agendamento tem prioridade sobre o previsto.

Uma matrícula sem presença participa da conversão geral e da regra histórica por modalidade, mas não da conversão dos presentes. Marcar Matriculou em duas aulas do mesmo lead conta duas ocorrências na série por aulas. Não atribuimos automaticamente a conversão a outro professor; o dashboard por leads ganhos usa outra base.

Faixas preservadas: comparecimento abaixo de 55%, 55% até menos de 60%, e 60% ou mais. Modalidade com menos de 10 presentes: coletar dados; a partir de 10, corte de 50% para avaliar investimento. Professores: amostra abaixo de 5, entre 5 e 9, e 10 ou mais; ações com cortes de 35% e 50% somente a partir de 5 resultados conhecidos. A taxa isolada não demonstra causalidade do professor.

Semanas começam no domingo, como o WEEKNUM padrão da planilha. Uma semana que cruza meses não é contada duas vezes. Os gráficos não incluem barras de Total geral junto com os meses.

## Histórico e transição

Experimentais importadas até agosto são calculadas dos registros do banco. Uma aula de 31/08/2026 possui mês textual `q` no Excel; usamos a data real e mostramos a divergência, sem alterar o cadastro. Setembro reúne normalmente todos os dados disponíveis, identificando o mês de transição. Outubro usa seus próprios agendamentos: não apaga histórico nem zera o estoque de clientes ativos.

Ativos, novos, evasão, faturamento e ticket preenchidos manualmente no Excel são snapshots separados, em `lib/server/xpace-report-history.ts`. Não geram clientes, contratos ou cobranças. Meses sem valor ficam indisponíveis, não como zero. Filtros parciais não recalculam snapshots mensais. Origem e destino históricos não têm período conhecido e não seguem o filtro; seus percentuais usam o total numérico, corrigindo a apresentação com #VALUE! do Excel.

As séries do sistema por contratos e vendas ficam separadas das anotações históricas. Receita mensalizada é estimativa contratual, não caixa recebido; vendas são o valor integral estimado e ticket é valor por venda. Pausas históricas não podem ser reconstruídas apenas do status atual. Ainda é preciso confirmar o conceito do ticket/faturamento antigo e as exclusões de VIP, Cia, Wellhub/TotalPass e movimentos de encerramento antes de emendar as séries. Renovou e Trocou de aula não são classificados como perdas.

## Segurança e validação

`GET /api/xpace/reports` exige acesso à XPACE. Todas as consultas de dados operacionais usam o ID da empresa autorizada no servidor, nunca um ID de empresa enviado pelo navegador. O resumo não devolve nomes de alunos. Detalhes são paginados em 30 registros; consultas gerais são paginadas para não truncar em 1.000 linhas. Respostas usam `Cache-Control: private, no-store`. Nenhuma migration é necessária.

Testes locais:

```powershell
node scripts/xpace-report-metrics-test.cjs
node scripts/xpace-reports-api-test.cjs
node scripts/xpace-trial-checks.cjs
npm run build
# Com servidor LOCAL na porta 3007:
node scripts/xpace-reports-visual.cjs
node scripts/xpace-trial-visual.cjs
```

As verificações de navegador usam dados fictícios e interceptam chamadas externas. Não enviam WhatsApp nem criam clientes em produção. Para conferir visualmente o histórico, selecione março–agosto/2026, compare números, bases e pendências com a planilha e abra **Ver registros** para investigar diferenças.

## Correção do agendamento manual no CRM

A permissão de experimental vem dos settings do horário, com fallback para a turma somente se os settings do horário forem ausentes. A listagem e a criação validam a mesma regra. A lista mostra sala e professor do horário e oculta os horários explicitamente desabilitados. A correção não concede autorização de WhatsApp ao cliente.

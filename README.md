# Xpacebox

Sistema comercial da Xpacecompany para cadastro de clientes e produtos, formacao de preco, orcamentos, CRM e financeiro.

## Continuar em outra conversa

Comece pelo [contexto permanente](docs/contexto/README.md), leia as [diretrizes dos agentes](AGENTS.md) e o [estado atual](docs/contexto/estado-atual.md). Essa é a entrada vigente; os documentos de contexto antigos são históricos, não o estado operacional atual.

Texto para enviar à nova conversa:

> Continue o repositório `alceu-cloud/xpacebox`. Leia https://github.com/alceu-cloud/xpacebox/blob/main/docs/contexto/README.md e os documentos indicados nele. Confira o Git e preserve trabalhos locais antes de atualizar com segurança. Não use um commit fixo, não execute alterações em produção ao iniciar e aguarde meu pedido. Ao concluir mudanças autorizadas, mantenha o contexto atualizado.

A regra de manutenção fica no `AGENTS.md`: mudanças materiais devem atualizar o estado e a documentação do módulo no mesmo commit. O documento orienta a continuação, mas não transfere credenciais nem dispensa conferir o código e o ambiente atual.

## Execucao local

```bash
npm install
npm run dev
```

Use `npm run build` antes de publicar para validar tipos e rotas.

## Publicacao

O repositorio `main` publica automaticamente na Vercel.

```bash
git pull --ff-only origin main
git push
npx vercel ls --yes
```

Site de producao: https://xpacebox.com.br

## Trabalho em dois computadores

Antes de iniciar qualquer alteracao, confira se o seu diretorio esta limpo e baixe o trabalho feito no outro computador:

```bash
git status
git pull --ff-only origin main
```

Se o `git status` mostrar arquivos alterados que voce nao reconhece, nao apague nem sobrescreva nada: confira primeiro com a outra pessoa.

Ao terminar uma alteracao, valide, registre e envie nesta ordem:

```bash
npm run build
git add <arquivos-alterados>
git commit -m "descricao curta da alteracao"
git fetch origin
git pull --ff-only origin main
git push origin main
```

O avanço rápido (`--ff-only`) integra apenas quando seguro. Se falhar por divergência, pare e confira os commits do outro computador antes de integrar: não faça rebase, stash, descarte ou force push automaticamente. Confira as novas diretrizes após atualizar.

## Estrutura principal

- `app/empresa/[slug]/page.tsx`: modulos da empresa.
- `components/clientes/CrmEmpresa.tsx`: carteira, agenda e oportunidades.
- `components/financeiro/FinanceiroEmpresa.tsx`: orcamentos direto e de engenharia.
- `components/gerenciador/GerenciadorEmpresa.tsx`: parametros gerais, produtos e formulas.
- `app/api/crm`: regras do CRM no servidor.
- `lib/server/quote-crm.ts`: sincroniza orcamentos com oportunidades.

## Regras importantes do CRM

- Uma agenda aberta acompanha a oportunidade ativa do cliente.
- Ganho ou perdido agenda um ciclo comercial futuro; a oportunidade nova e criada somente na data programada.
- E permitido haver mais de uma oportunidade aberta para o mesmo cliente, mas o novo ciclo so e agendado quando a ultima for encerrada.
- A agenda pode ser adiada tres vezes. Cada adiamento fica registrado na linha do tempo.
- Tarefa atrasada bloqueia os outros modulos apenas para o representante responsavel. Ele deve registrar o contato ou adiar para o proximo dia util. No quarto adiamento, o atendimento passa a ser obrigatorio.

## Formacao de preco e orcamentos

- Os parametros comerciais e tributarios sao configurados por empresa no Gerenciador.
- A validade do orcamento e configurada em `Parametros de Orcamento`; novos orcamentos gravam a data automaticamente.
- O CRM marca um orcamento como vencido quando a oportunidade ainda esta aberta e a data de validade ja passou.

## Estado atual

Consulte [Estado atual](docs/contexto/estado-atual.md) e os commits posteriores à conferência registrada nele. A revisão vigente deve ser descoberta com `git fetch origin` e `git log`, não por um hash antigo escrito neste README.

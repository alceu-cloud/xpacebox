# Xpacebox

Sistema comercial da Xpacecompany para cadastro de clientes e produtos, formacao de preco, orcamentos, CRM e financeiro.

## Execucao local

```bash
npm install
npm run dev
```

Use `npm run build` antes de publicar para validar tipos e rotas.

## Publicacao

O repositorio `main` publica automaticamente na Vercel.

```bash
git pull --rebase
git push
npx vercel ls --yes
```

Site de producao: https://xpacebox.com.br

## Trabalho em dois computadores

Antes de iniciar qualquer alteracao, confira se o seu diretorio esta limpo e baixe o trabalho feito no outro computador:

```bash
git status
git pull --rebase origin main
```

Se o `git status` mostrar arquivos alterados que voce nao reconhece, nao apague nem sobrescreva nada: confira primeiro com a outra pessoa.

Ao terminar uma alteracao, valide, registre e envie nesta ordem:

```bash
npm run build
git add <arquivos-alterados>
git commit -m "descricao curta da alteracao"
git pull --rebase origin main
git push origin main
```

O `git pull --rebase` antes do `push` evita publicar por cima de uma alteracao que o outro computador acabou de enviar.

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

Ultimo commit funcional antes deste README: `d4d7a99 bloqueia modulos por agenda crm atrasada`.

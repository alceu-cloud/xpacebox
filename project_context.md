# XPACEBOX - CONTEXTO DO PROJETO

## Visao geral

O XPACEBOX e um SaaS comercial para cadastro de empresas, clientes, produtos, formacao de preco, orcamentos e CRM. Usa Next.js, React, TypeScript e Supabase.

## Repositorio

- GitHub: https://github.com/alceu-cloud/xpacebox
- Branch principal de trabalho: `xpacebox-v2`
- Site: https://xpacebox.com.br
- Deploy: Vercel, projeto `pricing-app-1`
- Banco: Supabase

## Regras obrigatorias

- Ler o codigo existente antes de alterar.
- Preservar as integracoes com Supabase.
- Cadastros devem persistir de verdade: incluir, editar, excluir e consultar.
- Nao apagar funcionalidades existentes nem criar solucoes provisiorias.
- Nao fazer commit ou deploy sem avisar o responsavel.
- Nunca expor ou commitar segredos, tokens ou `.env.local`.
- Rodar build e testes relevantes antes de concluir.

## Padrao visual

Tema claro, textos em maiusculas seguindo o padrao existente, identidade XPACEBOX com roxo, rosa e laranja, cards claros, bordas suaves, menus segmentados ovais e fontes legiveis. Respeitar a escala global de fontes e os componentes existentes.

## Modulos existentes

- Login e central
- Empresas e gerenciador
- Clientes e CRM
- Amostras
- Produtos e fichas tecnicas
- Formacao de preco direta e engenharia
- Orcamentos

## Funcionalidades recentes

- CNPJ duplicado bloqueado por empresa.
- CRM com agenda, carteira, funil e filtros de oportunidades ganhas/perdidas por mes, trimestre, semestre e intervalo.
- Aba AMOSTRAS no modulo Clientes, com cadastro, edicao, exclusao, filtros e persistencia no Supabase.
- Orcamento de engenharia aceita varios itens.
- Orcamentos existentes podem ser editados.
- Edicao de orcamento sincroniza a oportunidade relacionada pelo `quote_id` sem trocar o numero do orcamento.
- A quantidade da formacao de preco/ficha tecnica e levada para o orcamento de engenharia.
- O resumo do CRM nao gera texto automatico. Mostra lembrete apenas quando os dados comerciais principais estao vazios.

## Arquivos importantes

- `components/clientes/ClientesEmpresa.tsx`
- `components/clientes/CrmEmpresa.tsx`
- `components/clientes/AmostrasEmpresa.tsx`
- `components/financeiro/FinanceiroEmpresa.tsx`
- `lib/orcamentos.ts`
- `lib/server/quote-crm.ts`
- `lib/pricing/calculations.ts`
- `supabase/migrations/`
- `types/`

## Pendencias conhecidas

- Configuracao de e-mail por empresa e envio de solicitacao de amostra.
- Agenda automatica por data de entrega foi deixada para depois.
- WhatsApp oficial sera retomado quando a conta Meta sair da analise/restricao.
- Continuar testando amostras, filtros do CRM, orcamento de engenharia com varios itens e edicao de orcamento.

## Fluxo para novas tarefas

1. Ler os arquivos relacionados e verificar o estado atual.
2. Identificar se a mudanca exige migration, API, tipos e interface.
3. Implementar seguindo os padroes existentes.
4. Rodar build/testes relevantes.
5. Informar o que foi alterado e o que ainda precisa ser aplicado/testado no Supabase ou Vercel.

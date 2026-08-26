# CONTEXTO PARA NOVA TAREFA CODEX - XPACEBOX

Projeto: XPACEBOX, SaaS para gestao, precificacao, CRM, produtos e orcamentos.
Repositorio local principal: C:\Users\User\xpacebox
GitHub: https://github.com/alceu-cloud/xpacebox
Vercel: projeto pricing-app-1, dominio xpacebox.com.br
Banco: Supabase.

## COMO TRABALHAR COM O ALCEU

- Falar em portugues simples, sem excesso tecnico.
- Implementar direto quando o pedido estiver claro.
- Preservar arquitetura separada por modulo. Nada de gambiarra temporaria.
- Tudo que for cadastro precisa funcionar de verdade no banco: incluir, editar e excluir.
- Antes de publicar, avisar se o Alceu estiver usando o sistema.
- Se passar sem erro e o Alceu liberar, pode commitar e subir para o online.
- Nao reverter alteracoes do usuario.

## PADRAO VISUAL

- Tema claro.
- Textos do sistema em maiusculo, exceto e-mails em minusculo.
- Cores XPACEBOX: roxo, rosa, laranja, azul e verde para status/valores.
- Cards claros, bordas finas, raio discreto.
- Menus em formato de barra oval segmentada.
- Cabecalho da empresa: logo da empresa a esquerda, texto central, logo XPACEBOX a direita.
- Menu lateral de modulos fica recolhido na lateral e aparece ao passar o mouse.
- Tamanho geral foi reduzido por variaveis globais; se precisar ajustar escala, procurar variaveis globais de layout/fonte.

## LOGIN E ACESSOS

- Admin entra na central geral e ve usuarios/empresas.
- Usuario comum entra direto na empresa vinculada.
- Botao Gerenciador aparece apenas para admin e perfil gerente.
- Usuario sem permissao nao deve ver/abrir Gerenciador.

## GERENCIADOR

Abas principais no topo:

- Configuracoes das Embalagens
- Configuracoes dos Fornecedores
- Cadastros de Produtos
- Configuracoes da Empresa
- Cadastros Gerais

Organizacao:

- Configuracoes dos Fornecedores: Fornecedores, Custo de Papel.
- Configuracoes das Embalagens: Tipos de Papelao, Materiais Especificos, Tempos de Producao, Lembretes & Formulas.
- Cadastros de Produtos: Engenharia da Caixa, Cores.
- Configuracoes da Empresa: Parametros de Preco, Metas, Parametros de Orcamento.
- Cadastros Gerais: Condicoes de Pagamento, CFOP, Regime Tributario, Perfil Fiscal, Beneficio Fiscal.

Tudo deve persistir no Supabase.

## CLIENTES

Campos importantes:

- Codigo unico automatico.
- Nome / razao social, fantasia, empresa atendente.
- Comprador, WhatsApp, telefone, e-mail compras, e-mail NF.
- CNPJ, IE, endereco, numero, CEP, bairro.
- Representante: puxar da tabela de usuarios.
- Condicao de pagamento, CFOP, frete.
- Regime tributario, perfil fiscal, beneficio fiscal especifico.
- ICMS do cliente.
- Limite de compra em R$.
- Frequencia de compra, valor medio de compra, ultima compra, proxima compra prevista, proximo contato.

Regras:

- Nao permitir CNPJ duplicado.
- CNPJ busca dados publicos.
- IE usa SINTEGRA_WS_TOKEN no Vercel/Supabase quando houver credito.
- Telefones com mascara: fixo (XX) XXXX-XXXX, celular (XX) XXXXX-XXXX.
- E-mails em minusculo; demais campos em maiusculo.
- Proxima compra prevista = ultima compra + frequencia.

Abas:

- Cadastro
- CRM
- Amostras

## CRM

Objetivo: CRM simples e pratico para vendedor.

Abas:

- Agenda
- Carteira
- Oportunidades
- WhatsApp

Agenda:

- Atrasados
- Hoje
- Amanha
- Proximos 7 dias

Regras:

- Registrar contato grava historico e, se tiver data da proxima acao, atualiza a agenda.
- Nova oportunidade aparece no funil e pode gerar agenda.
- Quando oportunidade for ganha ou perdida, agendar novo contato pela frequencia de compra do cliente, salvo se ja houver nova oportunidade ativa.
- Orcamento gerado cria oportunidade em Orcamento Enviado e agenda proximo contato normalmente para o dia seguinte.
- O funil deve permitir arrastar cards entre etapas e mostrar resumo em R$ por card/coluna.
- Oportunidades ganhas/perdidas precisam de filtro por mes, trimestre, semestre ou periodo digitado.

WhatsApp:

- Planejado com API oficial da Meta.
- Cada empresa devera ter suas proprias credenciais.
- No momento depende da verificacao/liberacao da conta Meta.

## PRODUTOS

Modulo Produtos, nao Gerenciador, e onde ficam as fichas tecnicas.

Ficha tecnica:

- Numero automatico sequencial: FT-0001, FT-0002...
- Caixa principal e acessorios.
- A caixa principal tem campo Preco.
- Acessorios nao tem campo Preco.
- Campos: revisao, empresa, cliente, laudo sim/nao, palete sim/nao, numero de amarrados, referencia/descricao, status, dimensoes, transpasse superior/inferior, largura/comprimento da faca, caixas por largura/comprimento, fornecedor, material, cores 1/2, engenharia, observacoes.
- Material deve ter pre-filtro por fornecedor.
- Engenharia deve filtrar por onda/tipo de papelao do material escolhido.
- Pesquisa/lista deve buscar por cliente e por FT.
- Ao abrir uma FT, primeiro visualizar; depois pode editar/cancelar/salvar.

Menu da caixa:

- Dados da formacao de preco
- Arte
- Historico de preco

Historico:

- Mostrar primeiro cards compactos com preco, origem e data.
- Ao clicar, expande as configuracoes usadas.
- Cada historico deve ter X para excluir.

## FORMACAO DE PRECO

Dois modos:

- Preco Direto: usuario escolhe tudo manualmente.
- Preco Engenharia: busca cliente/produto e puxa dados da FT.

Fluxo:

- Materiais
- Tipo de Caixa
- Configurar Dimensoes
- Lote & Logistica
- Empresa
- Ver Preco

Materiais:

- Fornecedor -> Tipo de Papelao filtrado -> Material especifico filtrado.
- Mostrar material selecionado.
- Mostrar comparativos mais economicos apenas se existirem materiais mais baratos do mesmo tipo; se o selecionado ja for o mais barato, nao mostrar comparativo.
- Comparativos podem mostrar ate 3 alternativas.

Dimensoes:

- Usa formulas da Engenharia da Caixa conforme tipo e onda.
- Calcula largura da chapa, comprimento da chapa, area da chapa e peso da caixa.
- Peso = gramatura * area.
- Area aparece em m2 e tambem em unidade interna: exemplo "377 M2 (UND.INT.)".
- Para maleta: comprimento nao pode ser menor que largura.
- Tabuleiro e corte/vinco geral nao usam altura; altura fica desabilitada/nao usada.
- Tab para campos de dimensoes deve ciclar sem subir para menu.

Lote:

- Quantidade do lote.
- Set-up vindo da tabela de tempos.
- Caixas por hora vindo da tabela de tempos.
- Zerar Set-Up desconsidera set-up em todos os calculos.
- Nao Considerar DC aparece apenas para DAWOS e remove Demais Custos da formula.
- Simular Quantidade substitui a capacidade utilizada em CX/H e recalcula.
- Se nao houver tempo exato, pode usar similar do mesmo tipo. Se nao houver similar, avisar e pedir caixas/hora manualmente; set-up assume 15 minutos.

Empresas:

- DAWOS, CARCAT e GTA.
- Cada uma tem regras de impostos/formulas.
- DAWOS validada por enquanto.
- GTA tem pequena diferenca em MCHora por regime tributario, deixada para depois.

Preco:

- Preco padrao por MC configurada.
- Simulador A: informo preco, vejo margem.
- Simulador B: informo MC%, vejo preco.
- Simulador C: informo MC R$/hora, vejo preco e margem.
- Mostrar custo MP com IPI, custo MP sem nota, margem unitaria, preco liquido, comissao aplicada, comissao a receber, total do pedido.
- Comissao virou dinamica por tabela; campo antigo no gerenciador foi renomeado para Comissao Previa.
- MC% abaixo de 10 nao paga comissao.

## ORCAMENTOS

Financeiro tem:

- Orcamento Direto
- Orcamento Engenharia

PDF:

- Paisagem.
- Com margem.
- Cabecalho com logo e dados da empresa vendedora.
- Dados da empresa vem de Parametros de Orcamento por empresa: nome, endereco, fone, e-mail, site, validade padrao e observacoes tecnicas.
- Cliente, comprador, CNPJ, telefone, e-mail, endereco.
- Numero, emissao, representante.
- Itens com: item, FT ou OD, descricao, medidas, area, qualidade, estrutura, quantidade, valor unitario, IPI, total.
- Para qualidade, mostrar codigo tipo OSRR/OSKK etc, sem entregar formula/segredo.
- IPI: apenas GTA tem IPI; DAWOS e CARCAT devem sair 0.
- Resumo: total produtos, total IPI, total orcamento.
- Frete, entrega, condicao de pagamento, validade, observacoes.

Regras:

- Orcamento direto permite varios itens no mesmo numero.
- Orcamento engenharia tambem precisa permitir varios itens.
- Precisa editar orcamento.
- Depois de gerar, cria oportunidade no CRM em Orcamento Enviado e agenda follow-up.
- Pergunta de "mais item?" deve ser modal bonito, nao alert nativo.

## AMOSTRAS E EMAIL

Pendente/planejado:

- Criar controle de amostras solicitadas, aba Amostras apos CRM.
- Envio automatico por e-mail de solicitacao de amostra.
- Configurar e-mail por empresa em Configuracoes da Empresa: servidor, porta, usuario, senha, remetente etc.

## PENDENCIAS MAIS RECENTES

- Continuar pacote pendente: controle de amostras, filtros de oportunidades, email configuravel/envio, agenda automatica por pedido ganho, varios itens no orcamento engenharia, editar orcamento.
- Garantir trava de CNPJ duplicado.
- Quando mexer no WhatsApp oficial, esperar Meta liberar/verificar conta e depois cadastrar credenciais por empresa.

Se este arquivo estiver desatualizado, perguntar ao Alceu onde parou antes de alterar algo grande.

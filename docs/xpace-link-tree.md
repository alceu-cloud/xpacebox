# Árvore de links

Preparada localmente em 02/10/2026 conforme as referências visuais de Alceu; **sem commit/publicação ou migrations remotas**.

Painel XPACE → Árvore de links, com Links, Aparência e Estatísticas. Permite pesquisa, criação/edição de título e URL, ícone, ligar/desligar por link, reordenar, desligar a página inteira e copiar o endereço para colar no WhatsApp. Copiar não envia mensagens. A edição é restrita a gestores; equipe pode consultar. Professor não acessa este módulo.

Página pública `/links/xpace`, com logo, título, descrição e botões. Logo por upload PNG/JPEG/WebP até 2 MB ou URL HTTPS; validação de assinatura do arquivo e gravação por endpoint de gestor. Aparência da escola ou personalizada, cor, tema claro/escuro e botões clássicos/minimalistas, com prévia ao vivo. Textos são escapados pelo React e destinos aceitam apenas HTTP/HTTPS sem credenciais.

Estatísticas por período: acessos, visitantes, novos/recorrentes, gráfico diário e ranking de cliques. Datas agrupadas em America/Sao_Paulo. Visitante é código aleatório anônimo do navegador, não pessoa identificada; limpar armazenamento ou trocar aparelho muda a identidade. Não registra telefone, nome, IP ou user agent. Prévia não emite eventos. Telemetria não impede abrir os links quando falha.

Eventos são deduplicados pelo UUID; mutação é atômica, tem limite de rajada por navegador e aceita somente página/empresa/link ativos. Histórico de link desligado aparece nos relatórios. Contagem pública não é prova de visitante humano e depende de navegador/conexão/armazenamento disponíveis. Novas tabelas têm RLS, sem acesso direto anon/authenticated; servidor decide escopo por sessão. A página pública não retorna os eventos ou códigos de visitantes.

Pendente: `20261002140248_xpace_link_tree.sql` (tabelas, RPCs, bucket de logos), criada pela CLI, não aplicada. Página padrão é inicializada ao salvar/criar o primeiro link; não foram importados URLs ou resultados dos prints como dados reais.

Validação: `npm run test:xpace-links` cobre protocolos perigosos, limites/tipos, tenant, links/página inativos, deduplicação, rajada, visitantes novos/recorrentes, ordenação atômica e grants. `npm run test:xpace-links-teaching:browser` usa exclusivamente fixtures e backend HTTP local para página pública, prévia/tema, criação/edição/ativação, estatísticas e responsividade. TypeScript/build local também conferidos. Não comprova volume ou funcionamento em produção.

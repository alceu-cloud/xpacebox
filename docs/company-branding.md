# GTA e CARCAT — logos do sistema

Criados com a ferramenta integrada de geração de imagens em 01/10/2026, usando
`public/companies/dawos-logo-nova.png` como referência visual (não como arquivo
a substituir). A escrita segue os nomes já cadastrados: GTA e CARCAT.

- GTA: `public/companies/gta-logo.png`, verde-claro com verde escuro para leitura.
- CARCAT: `public/companies/carcat-logo.png`, cinza-prata com grafite para leitura.
- Ambos: PNG 2172 × 724, fundo realmente transparente, composição horizontal.

Aplicação: cabeçalho da empresa e do Gerenciador, logo padrão dos orçamentos
impressos e enviados por e-mail, cores dos cards na Central. Configurações de
logo personalizado prevalecem; valores antigos vazios usam o novo padrão.
Não foram alterados os logos DAWOS/XPACE, cadastros, tributos ou regras comerciais.

## Prompts usados (ferramenta integrada, sem CLI)

Base comum, com o logo DAWOS como referência de estilo e transparência ativada:

> Use case: logo-brand. Asset type: production company logo for ERP headers and quotations. Image 1 is a STYLE REFERENCE of the owner's DAWOS logo. Create a sibling brand logo in the same visual family: bold geometric uppercase sans-serif wordmark, an abstract stacked corrugated-sheet emblem to the left, widely spaced EMBALAGENS below the brand name. Preserve the clean horizontal composition and balanced optical alignment of the reference, with a modest transparent margin. Actual transparent background; no black or white background rectangle, no checkerboard printed into pixels. Flat crisp colors, no mockup, no 3D, no texture, no shadow, no extra words. Landscape layout roughly 3:1.

Complemento GTA:

> Exact text: "GTA" (G T A), and below "EMBALAGENS". Palette: fresh light green #92CB87 on alternating layers and subtitle; dark forest green #24613F on the wordmark and other layers for contrast. The lettering must remain highly readable at small header sizes.

Complemento CARCAT:

> Exact text: "CARCAT" (C A R C A T), and below "EMBALAGENS". Palette: monochrome neutral gray, graphite #454B52 on wordmark and some layers, medium silver gray #989FA7 on alternating layers and subtitle. The lettering must remain highly readable at small header sizes.

Validação local: `node scripts/company-branding-test.cjs` com APIs, autenticação
e remetente de e-mail simulados; nenhum orçamento real enviado.

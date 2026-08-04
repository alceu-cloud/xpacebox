# XPACEBOX V2 — Arquitetura Oficial

## Visão do produto

A XPACEBOX é uma plataforma SaaS multiempresa e modular.

A DAWOS é a primeira empresa da plataforma, mas a arquitetura deve suportar várias empresas desde o início.

## Princípios obrigatórios

1. Todo dado de negócio deve pertencer a uma empresa por meio de `company_id`.
2. Nenhuma empresa pode acessar dados de outra empresa.
3. A administração da plataforma deve ser separada da administração das empresas.
4. Usuários podem ter acesso a uma ou várias empresas.
5. Cada empresa pode possuir módulos diferentes.
6. Nenhuma senha pode ser armazenada diretamente no código ou no localStorage.
7. A autenticação deve ser feita pelo Supabase Auth.
8. As permissões devem ser validadas no banco e não apenas escondidas na interface.
9. O sistema deve ser modular, organizado e documentado.
10. O Antigravity deve executar a arquitetura definida, sem decidir sozinho a estrutura do sistema.

## Perfis de acesso

### platform_owner

Administrador geral da XPACEBOX.

Pode:

- cadastrar empresas;
- cadastrar usuários;
- vincular usuários a empresas;
- ativar módulos;
- acessar qualquer empresa;
- administrar toda a plataforma.

### company_admin

Administrador de uma empresa específica.

Pode:

- acessar a empresa autorizada;
- administrar recursos e módulos permitidos;
- gerenciar usuários da empresa quando autorizado.

### company_user

Usuário comum.

Pode:

- acessar somente empresas autorizadas;
- utilizar apenas módulos e ações permitidos;
- não acessar a administração geral da plataforma.

## Fluxo de login

### Administrador da plataforma

Login  
→ identificação como `platform_owner`  
→ tela central da XPACEBOX  
→ escolha entre `Usuários` e `Empresas`

### Usuário comum com uma empresa

Login  
→ consulta dos vínculos  
→ entrada direta na empresa autorizada

### Usuário comum com várias empresas

Login  
→ consulta dos vínculos  
→ tela de seleção de empresa  
→ entrada no ambiente escolhido

## Blocos principais

1. Autenticação
2. Administração da plataforma
3. Empresas
4. Usuários e permissões
5. Módulos
6. Ambiente interno de cada empresa
7. Auditoria e histórico

## Banco inicial

### profiles

- id
- name
- email
- platform_role
- active
- created_at
- updated_at

### companies

- id
- name
- slug
- logo_url
- active
- created_at
- updated_at

### company_members

- id
- company_id
- user_id
- role
- active
- created_at
- updated_at

### modules

- id
- code
- name
- description
- active

### company_modules

- id
- company_id
- module_id
- active

## Regra para os módulos

Todo módulo deve possuir:

- nome;
- objetivo;
- permissões;
- tabelas utilizadas;
- dependências;
- versão;
- status;
- documentação.

## Processo de desenvolvimento

IDEIA  
→ ARQUITETURA  
→ BANCO  
→ TELAS  
→ IMPLEMENTAÇÃO  
→ TESTES  
→ PRODUÇÃO

## Primeira versão da XPACEBOX V2

A primeira entrega deverá conter:

- login profissional;
- Supabase Auth;
- administrador da plataforma;
- cadastro de empresas;
- cadastro de usuários;
- vínculo entre usuários e empresas;
- seleção de empresa;
- direcionamento automático;
- permissões;
- dashboard inicial;
- ambiente preparado para módulos.

## Regra final

A XPACEBOX deve ser construída pensando em múltiplas empresas desde o primeiro dia.

A DAWOS é a primeira empresa da plataforma, mas não deve existir código preso exclusivamente à DAWOS.

# SrougiMed - TODO

## Autenticação
- [x] Sistema de login customizado (usuário e senha)
- [x] Tela de login com fundo azul escuro degradê para azul turquesa
- [x] Logo SrougiMed 300px x 200px na tela de login
- [x] Criar usuário admin/admin com nível administrador
- [x] Criar usuário teste/teste com nível usuário padrão
- [x] Proteção de rotas após login

## Gerenciamento de Usuários (Aba Admin)
- [x] Aba Admin visível apenas para administradores
- [x] Backend para criar novos usuários
- [x] Backend para excluir usuários
- [x] Backend para alterar nível de acesso (administrador/usuário padrão)
- [x] Backend para listar todos os usuários
- [x] Interface frontend completa para gerenciamento

## Cadastro de Pacientes
- [x] Botão Buscar com campos: Nome, Código, Nascimento, Cidade
- [x] Busca por qualquer parte do nome
- [x] Busca por código exato
- [x] Busca por data de nascimento
- [x] Busca por cidade
- [x] Paginação com 10 registros por página
- [x] Botão Cadastrar
- [x] Campo Nome (200 caracteres alfanuméricos) *
- [x] Campo Código (10 caracteres numéricos)
- [x] Campo Endereço (200 caracteres alfanuméricos)
- [x] Campo Telefone (10 caracteres numéricos)
- [x] Campo Celular (11 caracteres numéricos)
- [x] Campo Cor da Pele (select com opções pré-cadastradas)
- [x] Campo Cidade (100 caracteres alfanuméricos)
- [x] Campo Estado (100 caracteres alfanuméricos)
- [x] Campo RG (100 caracteres alfanuméricos)
- [x] Campo CPF (100 caracteres alfanuméricos)
- [x] Campo Data de Nascimento (DD/MM/YYYY com cálculo automático de idade)
- [x] Campo Natural de (100 caracteres alfanuméricos)
- [x] Campo Estado Civil (select com opções pré-cadastradas)
- [x] Campo Sexo (select com opções pré-cadastradas)
- [x] Campo E-mail (200 caracteres alfanuméricos)
- [x] Campo Indicado Por (100 caracteres alfanuméricos)
- [x] Campo Data de Cadastro (auto-preenchido com data atual)
- [x] Campo Ocupação (200 caracteres alfanuméricos)
- [x] Campo Info Adicional 1 (200 caracteres alfanuméricos)
- [x] Campo Info Adicional 2 (200 caracteres alfanuméricos)
- [x] Campo Notas (2000 caracteres alfanuméricos)
- [x] Salvar cadastro no banco de dados

## Agenda Telefônica
- [x] Botão Buscar
- [x] Campo Busca por Nome
- [x] Paginação com 10 registros por página
- [x] Botão Cadastrar
- [x] Campo Nome (200 caracteres alfanuméricos) *
- [x] Campo E-mail (200 caracteres alfanuméricos)
- [x] Campo Ocupação (200 caracteres alfanuméricos)
- [x] Campo Categoria (200 caracteres alfanuméricos)
- [x] Campo Telefone (200 caracteres alfanuméricos)
- [x] Campo Observações (2000 caracteres alfanuméricos)
- [x] Salvar cadastro no banco de dados

## Segurança
- [x] Proteção contra XSS (via React e Zod)
- [x] Proteção contra SQL Injection (via Drizzle ORM)
- [x] Validação de todos os inputs (via Zod)
- [x] Sanitização de dados (via bcrypt para senhas)

## Design e Responsividade
- [x] Layout responsivo para celular
- [x] Layout responsivo para desktop
- [x] Interface com abas (Cadastro de Pacientes, Agenda Telefônica, Admin)

## Backend (tRPC Procedures)
- [x] Rotas de autenticação customizada
- [x] Rotas CRUD de pacientes
- [x] Rotas CRUD de agenda telefônica
- [x] Rotas de administração de usuários
- [x] Rotas para opções pré-cadastradas (cores, estados civis, sexos)

## Frontend (Componentes)
- [x] Formulário completo de cadastro de pacientes
- [x] Busca de pacientes com paginação
- [x] Formulário de agenda telefônica
- [x] Painel administrativo completo
- [x] Cálculo automático de idade
- [x] Formatação de data com máscara DD/MM/YYYY


## Exportação de Dados
- [x] Função backend para buscar todos os pacientes
- [x] Geração de arquivo CSV
- [x] Geração de arquivo Excel
- [x] Componente de exportação no painel administrativo
- [x] Teste de funcionalidade de exportação


## Importau00e7u00e3o de Dados
- [x] Função backend para importar pacientes
- [x] Parser para CSV
- [x] Parser para Excel
- [x] Validação de dados importados
- [x] Componente de importação no painel administrativo
- [x] Teste de funcionalidade de importação

## Melhorias de Busca
- [x] Validação de busca com mínimo de 2 caracteres em Cadastro de Pacientes
- [x] Validação de busca com mínimo de 2 caracteres em Agenda Telefônica

## Melhorias de UX em Formulários
- [x] Limpar campo CPF completamente ao pressionar Backspace/Delete (sem seleção prévia)
- [x] Limpar campo Data de Nascimento completamente ao pressionar Backspace/Delete (sem seleção prévia)

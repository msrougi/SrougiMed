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
- [ ] Interface frontend completa para gerenciamento

## Cadastro de Pacientes
- [ ] Botão Buscar com campos: Nome, Código, Nascimento, Cidade
- [ ] Busca por qualquer parte do nome
- [ ] Busca combinada em múltiplos campos
- [ ] Paginação de resultados de busca
- [ ] Botão excluir com popup de confirmação
- [ ] Botão Cadastrar com todos os campos especificados
- [ ] Campo Nome (200 caracteres alfanuméricos)
- [ ] Campo Código (10 caracteres numéricos)
- [ ] Campo Endereço (200 caracteres alfanuméricos)
- [ ] Campo Telefone (10 caracteres numéricos)
- [ ] Campo Celular (11 caracteres numéricos)
- [ ] Campo Cor da pele (select: branca, preta, parda, amarela, indígena)
- [ ] Campo Cidade (100 caracteres alfanuméricos)
- [ ] Campo Estado (100 caracteres alfanuméricos)
- [ ] Campo RG (100 caracteres alfanuméricos)
- [ ] Campo CPF (100 caracteres alfanuméricos)
- [ ] Campo Nascimento com formatação XX/XX/XXXX
- [ ] Cálculo automático de idade a partir da data de nascimento
- [ ] Campo Natural de (100 caracteres alfanuméricos)
- [ ] Campo Estado civil (select: solteiro(a), casado(a), viúvo(a), divorciado(a), separado(a))
- [ ] Campo Sexo (select: masculino, feminino, não informado)
- [ ] Campo E-mail (200 caracteres alfanuméricos)
- [ ] Campo Indicado Por (100 caracteres alfanuméricos)
- [ ] Campo Data Cadastro (pré-preenchido com data atual)
- [ ] Campo Ocupação (200 caracteres alfanuméricos)
- [ ] Campo Info Adicional 1 (200 caracteres alfanuméricos)
- [ ] Campo Info Adicional 2 (200 caracteres alfanuméricos)
- [ ] Botão Notas com popup (2000 caracteres alfanuméricos)
- [ ] Salvar cadastro no banco de dados

## Agenda Telefônica
- [ ] Botão Buscar por Nome
- [ ] Busca por qualquer parte do nome
- [ ] Paginação de resultados
- [ ] Botão excluir com popup de confirmação
- [ ] Botão Cadastrar
- [ ] Campo Nome (200 caracteres alfanuméricos)
- [ ] Campo E-mail (200 caracteres alfanuméricos)
- [ ] Campo Ocupação (200 caracteres alfanuméricos)
- [ ] Campo Categoria (200 caracteres alfanuméricos)
- [ ] Campo Telefone (200 caracteres alfanuméricos)
- [ ] Campo Observações (2000 caracteres alfanuméricos)
- [ ] Salvar cadastro no banco de dados

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

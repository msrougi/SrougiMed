# Paginação e validação funcional — SrougiMed

## Resultado

Pacientes e contatos mostram intervalo e total reais da busca: `1–10 de 237 resultados`, `11–20 de 237 resultados` e, no exemplo, `231–237 de 237 resultados`. A navegação informa `Página 1 de 24`, com Anterior e Próxima. O estado vazio informa `0–0 de 0 resultados`, `Página 0 de 0` e bloqueia ambos os botões.

O servidor aplica os mesmos filtros à contagem e aos registros, ordena por ID e lê as duas consultas na mesma transação de leitura com isolamento REPEATABLE READ. Páginas que deixam de existir são ajustadas ao último intervalo válido. Cada tela usa 10 registros por página; a API limita a 100. As rotas anteriores continuam retornando arrays para abas abertas antes da implantação.

Os filtros digitados só passam a valer ao clicar em Buscar. A navegação mantém os filtros da busca concluída. Erros têm mensagem e nova tentativa, sem confundir falha com zero resultados. Respostas antigas não substituem uma busca mais recente. O retorno dos contatos à primeira página foi corrigido.

## Verificação concluída

- 82 testes aprovados em 12 arquivos; 1 avaliação de desempenho ignorada por solicitação do usuário.
- Testes de componentes React em DOM simulado: intervalos, zero, última página parcial, limites dos botões, ida e volta, alteração de filtros, erro e recuperação.
- Testes reais de SQL e HTTP em MySQL 8.0.46 local isolado, com 46.023 pacientes e 3.201 contatos exclusivamente sintéticos. Três contas de teste geradas: um administrador e dois usuários comuns.
- Login correto/incorreto, sessão sem hash de senha, logout e bloqueio após sair; consulta de pacientes e contatos pelos três perfis; funções administrativas e exportação bloqueadas para usuários comuns.
- Mudanças de perfil são respeitadas mesmo pelo JWT emitido anteriormente. Nenhuma senha fornecida pelo usuário foi usada nas fixtures ou incorporada ao código.
- Cadastro, leitura, edição e exclusão de fixtures locais de paciente e contato; rejeição de CPF duplicado; filtros combinados, acentos/caixa, curingas literais e tentativa de injeção SQL; compatibilidade da busca anterior com offset.
- Contagem de 237 fixtures confirmada em ambas as buscas; última página com sete itens; IDs das páginas 1 e 2 sem repetição; páginas fora do intervalo e zero resultados tratados.
- TypeScript e compilação de produção conferidos antes da publicação.

## Correções de acesso no escopo

As rotas administrativas antigas passaram a exigir o mesmo middleware de administrador. Exclusão e rebaixamento da própria conta administrativa são bloqueados também nos caminhos antigos. O cache da sessão é limpo ao entrar e sair para evitar reaproveitar informações do usuário anterior no mesmo navegador.

O modelo atual compartilha os pacientes e contatos da clínica entre usuários autenticados. Não existe separação dos registros por médico ou proprietário no esquema; esta alteração não cria essa separação.

## Limitações e trabalho adiado

A autenticação segura no navegador de produção não foi concluída. As contas reais não foram validadas nesta rodada; os testes de três perfis citados acima usaram apenas fixtures locais. Não houve gravação, exclusão nem importação no banco real.

A avaliação de desempenho foi pausada pelo usuário. Nenhum tempo local é apresentado como medição do Aiven ou Render. Tempos com rede real, inicialização a frio, carga concorrente e inspeção visual autenticada em dispositivos reais continuam pendentes. O resultado funcional local não equivale a uma auditoria completa de produção.

Esta mudança não precisa de alteração de esquema ou migração de dados.

## Reprodução

Verificações comuns: `pnpm test`, `pnpm check` e `pnpm build`.

Os testes MySQL são opcionais e exigem um banco descartável já preparado com o esquema de `drizzle/schema.ts`, em localhost, cujo nome comece com `srougi_test_`. Definir `SROUGI_TEST_DATABASE_URL` habilita `server/clinic.mysql.test.ts`. O teste recusa hosts remotos e nomes fora desse padrão; ele limpa e recria as fixtures nas tabelas desse banco de teste. As senhas das fixtures são aleatórias. A avaliação de desempenho permanece desabilitada, sendo habilitada somente com `SROUGI_RUN_BENCHMARKS=1`.

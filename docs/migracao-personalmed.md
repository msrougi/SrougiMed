# Preparar o destino para pacientes do PersonalMed

Esta alteração prepara os três pontos aprovados: dados incompletos no legado,
CPFs repetidos preservados como pacientes distintos e campos de contato de até 60 caracteres.
Não importa os 46.133 pacientes nem altera a produção automaticamente.

## Comportamento

- A importação administrativa aceita campos ausentes e marca cada registro com
  `legacyImported = true`. Nome continua obrigatório. Não se inventam documentos,
  datas nem IDs de opções. Lotes de até 1.000 pacientes por chamada.
- A edição desses registros exige apenas o nome. Campos vazios ficam sem valor;
  as opções ausentes não são convertidas em zero. Uma data de cadastro desconhecida
  não recebe automaticamente a data de hoje ao abrir o formulário.
- O CPF original permanece em `cpf`. A unicidade global é substituída por um índice
  comum e por `cpfForNewPatients`, uma coluna calculada com unicidade somente para
  registros não migrados. Ela retorna NULL para registros legados. O formulário/API
  de cadastro normal mantêm as exigências atuais e a consulta de CPF existente.
- A edição de um legado com CPF repetido não bloqueia quando o CPF permanece igual
  (mesmo com outra formatação). Se for alterado para um CPF já cadastrado, a API recusa.
- O marcador de legado não pode ser definido pelas rotas de criação/edição comum.
- `patients.phone` e `patients.mobile` passam para 60 caracteres. Telefone, celular e
  Fax aceitam livremente números, letras e símbolos no formulário e na API, cada um
  em seu próprio campo, com limite de 60. A ampliação não converte, mistura nem limpa
  o conteúdo já armazenado. Excesso causa erro de validação, nunca truncamento automático.
- `phone_book.phone` já comporta 200 caracteres e não precisa dessa ampliação.
- A importação sem código passa a gerar um código sequencial. Código fornecido que
  já existe gera erro; não substitui um paciente. Nenhum registro é mesclado pelo CPF.

## Aplicação em cópia de teste

1. Exportar estrutura e dados do banco efetivamente conectado a srougi.app e criar
   uma cópia isolada. O dump com `cellphone`, `birth_date`, tabelas em português e sem
   tabelas de opções não é esse destino. O preparador recusa essa estrutura.
2. Configurar `DATABASE_URL` para a cópia. Não colocar credenciais em comandos
   compartilhados, commits ou logs. Fazer backup antes de executar alterações.
3. Instalar as dependências e simular:

   ```sh
   pnpm db:prepare-personalmed
   ```

4. Conferir o plano; com as escritas no aplicativo interrompidas, aplicar:

   ```sh
   pnpm db:prepare-personalmed --apply
   ```

5. Publicar o código desta alteração contra a cópia já preparada. A ordem é banco
   primeiro, código depois. O novo código consulta as colunas adicionadas.
6. Testar um paciente sem CPF/nascimento/CEP, dois pacientes com mesmo CPF, edição
   de um desses pacientes e os três campos de contato com 60 caracteres. Confirmar que um cadastro
   novo continua exigindo os campos e recusando CPF existente.

O preparador consulta `information_schema`, valida os nomes e tipos conhecidos e
usa um bloqueio para impedir duas preparações simultâneas. Ele não executa INSERT,
UPDATE ou DELETE de pacientes. Adiciona a nova proteção de CPF antes de remover a
antiga e não reduz telefones que já tenham capacidade superior a 60. Pode ser repetido:
altera somente o que falta e não reduz colunas que já tenham capacidade superior. Uma duplicidade entre registros não migrados bloqueia a
preparação; não transforma esses pacientes automaticamente em legados.

DDL de MySQL tem commit implícito: não há promessa de rollback atômico. Se interrompido,
conferir o erro e executar novamente. Para reverter depois de importar CPFs repetidos,
é necessário resolver essas duplicidades antes de restaurar uma restrição global;
nunca apagar pacientes para forçar a reversão.

## Histórico de migrations do repositório

O `main` contém `0005_unique_patient_cpf.sql` fora do `_journal.json`, e o snapshot
anterior também não acompanha todos os ajustes manuais. Por isso este preparador
é explícito e consulta a estrutura real, funcionando com ou sem o índice manual.
Não executar `db:push` como substituto desses passos: o histórico e os snapshots
precisam ser reconciliados antes de gerar migrations novas com o Drizzle.

## Limites desta entrega

A execução real do DDL depende da cópia correta do destino. Os testes automatizados
cobrem o plano de alteração, as permissões das rotas e a persistência com banco
simulado; não substituem um teste de integração em MySQL com o dump correto.

A importação atual NÃO é um sincronizador incremental. Antes da carga completa é
necessário implementar a correspondência persistente de `Unit + PCod` para `id` e
de `AGENDAFONECODE` para o contato, além de reconciliar cadastros já existentes.
Não reenviar o mesmo lote para tentar identificar novidades: o CPF e o nome não são
chaves seguras de migração. O incremento do backup atualizado usará as chaves de origem.

CEP irregular, cor da pele, indicador ativo/inativo e demais campos
sem equivalente permanecem conforme o mapeamento; esta alteração não inventa decisões
para eles. Nenhum arquivo com dados de pacientes ou credenciais faz parte deste PR.

## Decisão posterior de estado civil

Em 18/10/2026, Marcelo definiu que todos os códigos P e O serão convertidos para
solteiro(a), ID 1 no destino confirmado: 723 P e 42 O no backup de teste.
O planejador offline em `scripts/plan-personalmed.mjs` aplica essa regra e conserva
o código original. Isso não executa a carga na Aiven. Consulte
[planejamento-personalmed.md](planejamento-personalmed.md) para gerar e comparar os planos.

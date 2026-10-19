# Prontuário manual e restauração dos números PersonalMed

O campo mostrado como Código passa a se chamar Prontuário no cadastro, edição, busca, visualização e exportação. Internamente a coluna continua `patients.code`, preservando os IDs e os vínculos do aplicativo.

A origem conferida tem 46.151 registros (46.023 ativos), códigos positivos de 1 a 7 dígitos, máximo 1.244.004 e nenhum código duplicado. O novo limite de entrada é de 1 a 8 dígitos. Zeros à esquerda são normalizados; letras, pontuação, zero e mais de oito dígitos são rejeitados. O usuário informa o número; nenhuma rotina de cadastro ou importação gera uma sequência de prontuários. A restrição única do banco continua ativa. A busca aceita inclusive um prontuário de um dígito.

## Correção dos registros existentes

Na primeira inicialização em produção, antes de abrir a porta HTTP, a aplicação executa `restoreRecordNumbers`. A identidade vem de `srougi_personalmed_links.sourceKey/targetId` e dos campos `Unit`/`PCod` preservados em `original`, nunca de nome, CPF, ordem de linhas ou número gerado.

A correção usa o mesmo bloqueio consultivo do importador e bloqueios de linha. Ela valida todos os números propostos e a ausência de colisões, inclusive com pacientes cadastrados após a migração. Um conflito interrompe o processo; não é escolhido um número alternativo automaticamente.

Para cada número alterado, `srougi_record_number_backups` conserva ID, número anterior, número restaurado e chave de origem. Backup, renumeração, verificação e registro de conclusão pertencem à mesma transação. A atualização ocorre em duas etapas com números temporários fora do espaço numérico, resolvendo ciclos sem remover o índice único. O timestamp de atualização é preservado explicitamente. Não são alterados nomes, documentos, contatos ou demais dados; pacientes já excluídos não são recriados.

A conclusão fica em `srougi_record_number_migrations`, versão `personalmed-record-numbers-20261019-v1`. Inicializações posteriores não reescrevem prontuários que o usuário tenha editado manualmente. Logs mostram somente contagens. Uma falha impede que a nova instância comece a atender com dados parcialmente corrigidos.

Antes de qualquer reversão, conferir alterações manuais posteriores e usar o backup de números; uma reversão não deve sobrescrever edições novas. O cadastro original completo continua preservado no vínculo da importação.

## Validação

TypeScript e build de produção aprovados. A suíte funcional passou com os testes de API, permissões, importação e MySQL local. Sete cenários da restauração foram aprovados em MySQL isolado, incluindo um lote de 46.023 fixtures, ciclos, colisões, reversão após falha, exclusões preservadas e execução repetida sem sobrescrever uma edição manual. Os oito testes do importador também passaram, confirmando que as novas importações preservam o número de origem.

As fixtures são exclusivamente sintéticas. Nenhum paciente real foi criado ou apagado para testar.

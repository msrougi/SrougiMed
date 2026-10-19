# Estado do importador — 19/10/2026

Este código é uma preparação e não uma importação concluída.

## Fonte validada

- 46.133 pacientes no backup de 01/10/2026.
- 46.005 ATIVO=T elegíveis; 128 ATIVO=F excluídos.
- O plano integral foi regenerado com mapeamento versão 12.
- Regras de CEP e DDD mantêm as pendências e os valores originais.

## Implementação preparada

O vínculo persistente usa a chave PersonalMed Unit+PCod, o ID gerado no app,
SHA-256 da origem, versão de mapeamento, valores originais e decisões. Não há
fusão por nome ou CPF. A mesma fonte não duplica cadastros. Alterações na origem
bloqueiam a carga para revisão; ausência não apaga o destino. Uma falha reverte
pacientes e vínculos na mesma transação.

A rotina de limpeza exige uma impressão digital exata dos quatro pacientes e
um contato de teste, obtida por leitura prévia. Antes da exclusão, copia os dados
para tabelas de backup e confere as contagens. Usuários não são alterados.

## Validação realizada

15 testes locais aprovados (9 mapeamento + 6 importador). Os seis testes de
persistência usam um adaptador de banco simulado, não um servidor MySQL real.
Eles cobrem repetição, alteração, registro ausente, falha/reversão, alvo excluído
e inclusão de datas na impressão digital. Isso ainda não valida o SQL na Aiven.

## Bloqueios antes de produção

1. Completar o envio autenticado dos arquivos (não foi confirmado).
2. Recuperar e conferir os dados de dbo.AGFONE; há metadados de 3.200 linhas,
   mas os contatos ainda não foram extraídos neste ambiente.
3. Validar backup, carga e segunda execução em MySQL isolado real.
4. Serializar gravações do aplicativo com a trava do importador durante a carga.
5. Conferir opções/colunas e impressão digital atual dos registros de teste.
6. Somente então habilitar a execução real e conferir contagens no destino.

A opção --apply está bloqueada explicitamente enquanto essas verificações não
forem concluídas. O script nunca executa por inicialização do app ou build normal.

As sessões foram recuperadas, mas a proteção de entrega de credenciais do
navegador impediu a retomada do envio. Uma tentativa de reutilizar a aba foi
rejeitada pela revisão automática. A recuperação recomendada por nova página e
reinício da conexão também ficou indisponível. Não houve importação nem exclusão.

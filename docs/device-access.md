# Acesso por computador

A pedido do responsável, o login `bia` fica restrito a computadores. A comparação ignora maiúsculas/minúsculas e espaços nas extremidades. A regra usa o login da conta, não o nome de exibição. Se esse login for renomeado, atualizar a configuração em `shared/deviceAccess.ts`.

A validação ocorre antes da criação do cookie de login e no procedimento base de todas as rotas tRPC. Assim, requisições feitas por sessões já existentes também são bloqueadas. Logout e troca de conta continuam possíveis. O cliente limpa o cache e apresenta a orientação de acesso por computador ao receber a recusa. As outras contas preservam a política anterior.

A identificação combina User-Agent, Client Hints e uma dica do navegador que também reconhece iPadOS com identificação de Mac. Uma dica `desktop` não anula um User-Agent móvel. Trata-se de controle por identificação fornecida pelo navegador, não de atestação de hardware; um cliente que falsifique todos esses sinais pode se apresentar como computador.

Não há alteração de senha ou migração de banco para essa regra. Testes cobrem Android, iPhone, iPad, Windows/Mac, sessões existentes, emissão de cookie, saída e contas não restritas. A versão compilada foi conferida por HTTP em MySQL local com contas fictícias.

Atualização: Rose voltou a ter acesso pelo celular; somente Bia mantém a restrição de dispositivo.

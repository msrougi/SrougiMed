# ChatMed

O ChatMed oferece um canal coletivo e conversas individuais entre usuários do mesmo grupo. O administrador define um único grupo no cadastro/edição de cada usuário. Grupos vazios deixam o chat sem equipe; não há associação automática de usuários existentes.

## Configuração

1. Entrar como administrador e abrir Admin → Gerenciar Usuários.
2. Criar ou editar um usuário e preencher “Grupo de chat”.
3. Usar o mesmo nome nos demais integrantes. As sugestões mostram grupos já utilizados.
4. Salvar. O nome é normalizado para minúsculas, com espaços consecutivos removidos. O limite é 60 caracteres.

Mudar ou limpar o grupo altera o acesso daquele usuário. As conversas do grupo anterior ficam armazenadas, mas indisponíveis enquanto ele não pertencer novamente àquele grupo. Quem entra em um grupo pode consultar o histórico do canal coletivo. As conversas individuais exigem que os dois participantes ainda pertençam ao grupo correspondente. Um administrador só lê uma conversa individual se for participante dela.

## Uso

- Ícone flutuante ChatMed com contador de não lidas.
- A lista apresenta primeiro o canal do grupo e depois os colegas.
- Cada item abre o histórico; mensagens anteriores são carregadas por botão.
- Texto de até 4.000 caracteres, com nome do remetente, data e horário.
- Enter envia; Shift+Enter insere nova linha.
- Envio pendente desabilita o compositor. Falhas conservam o texto e permitem tentar novamente.
- Tentativas repetidas usam um UUID para evitar duplicação de mensagem.
- A leitura é individual, por conversa, e só avança quando a conversa está visível no fim do histórico.
- Painel lateral no computador e janela de tela inteira no celular; cores acompanham o tema atual.
- Atualização por consulta periódica: até 5 segundos com a janela aberta, 20 segundos com ela fechada. Abas em segundo plano não fazem atualização contínua. Mensagens ficam guardadas para leitura posterior.

Esta versão não inclui anexos, notificações push, confirmação de leitura por destinatário, edição/exclusão de mensagens ou indicação de presença online.

## Banco e implantação

`prepareChatMed` executa antes da aplicação atender em produção. Sob bloqueio consultivo, adiciona `users.chatGroup` se ausente e cria três tabelas InnoDB:

- `chatmed_conversations`: escopo de grupo e par ordenado de participantes; par zero representa o canal coletivo.
- `chatmed_messages`: texto, remetente, nome no momento do envio, horário e chave de idempotência.
- `chatmed_reads`: último ID lido por usuário e conversa.

A preparação é aditiva e repetível. Não agrupa usuários, não muda senhas, não altera pacientes e não remove tabelas. Uma reversão do código pode deixar essas estruturas preservadas. Desenvolvimento local precisa executar a preparação contra seu banco local antes do uso, ou reproduzir as tabelas descritas no schema.

## Controle de acesso

Todas as rotas exigem sessão. Cada operação consulta novamente a associação do usuário no banco, sem confiar no grupo do JWT ou em um identificador de conversa enviado pelo navegador. As conversas individuais são resolvidas pelo grupo e pelo par que inclui o usuário autenticado.

As linhas dos participantes são bloqueadas em ordem de ID durante operações de chat. Assim, uma alteração administrativa de grupo se serializa com envios e leituras em andamento. Consulta de leitura valida que a mensagem pertence à conversa autorizada. Os cursores de leitura só avançam. Queries são parametrizadas e mensagens são renderizadas como texto, sem interpretação de HTML.

## Verificação

Testes de contrato, permissões e interface usam dados fictícios. A suíte MySQL é opt-in com `SROUGI_CHAT_TEST_DATABASE_URL` e rejeita host remoto ou banco sem prefixo `srougi_test_chat`. Ela verifica preparação repetível, canal coletivo, privacidade individual, separação de grupos, leitura individual, reenvio concorrente idempotente, revogação por mudança de grupo/remoção de conta e histórico paginado/incremental.

Não usar os testes com contas ou dados de produção.

# IPs dos acessos novos

Em produção, `[access-ip]` registra o login bem-sucedido de qualquer conta e a primeira chamada autenticada de sessões já abertas. Para a mesma conta e origem, chamadas repetidas geram no máximo um registro a cada cinco minutos por instância. Uma mudança de rede ou novo login gera registro imediatamente. Não registra visitantes anônimos ou tentativas de senha inválida.

Campos: `at` (UTC), `event`, `userId`, `login`, `verifiedIp` e `candidates` com IPs dos cabeçalhos Cloudflare/True-Client-IP/X-Forwarded-For e do socket. Apenas IPs válidos e listas limitadas são gravados. Não inclui senha, cookie, token, e-mail, dados de pacientes, URL ou texto de mensagens.

Pesquisar `access-ip` nos Application logs do serviço SrougiMed no Render. Comparar os horários e os candidatos da Gislene com um acesso conhecido feito no escritório. `verifiedIp: null` significa que o proxy ainda não foi validado; candidatos podem ser influenciados pelo cliente e não devem ser usados para conceder acesso automaticamente. O IP do socket pode pertencer à infraestrutura do servidor.

Os logs ficam sujeitos à retenção do plano do Render (o painel consultado oferece sete dias). Não há histórico retroativo nem gravação adicional no banco nesta alteração. Para conservação por mais tempo, configurar um destino de logs ou armazenamento dedicado posteriormente. O controle em memória de repetição é limitado a 2.000 origens por instância e pode reiniciar nos deploys.

Essa coleta é independente da política de IP e do segundo fator. Não habilita bloqueios ou muda permissões. A captura ocorre no uso real da aplicação: uma pessoa já logada pode usar uma busca ou abrir outra seção, sem precisar sair e entrar novamente.

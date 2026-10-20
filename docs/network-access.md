# Acesso pela rede do escritório e código por e-mail

Status de entrega: implementação preparada, política de rede **desativada por padrão**. O IP público do escritório, os e-mails individuais e a entrega real de e-mail ainda precisam ser confirmados. Não existe IP de escritório configurado no código.

## Regras ao ativar

- `bia`: computador e rede do escritório obrigatórios; fora dela, acesso negado.
- `rose`, `gislene`, `rosani`: senha na rede do escritório; fora dela, senha e código por e-mail individual. Celular permitido.
- Demais contas: comportamento anterior preservado.

As contas são identificadas pelo login exato, sem diferenciar maiúsculas/minúsculas e espaços nas pontas. A regra também verifica sessões existentes em todas as chamadas tRPC: uma sessão sem confirmação que sair da rede precisa entrar novamente. A confirmação vale por até 12 horas, vinculada ao IP, navegador, senha e e-mail atuais.

O código tem seis dígitos, expira em cinco minutos, é armazenado somente como HMAC e só pode ser usado uma vez. Cinco erros invalidam o desafio. Há intervalo mínimo de 60 segundos e limite de cinco envios por conta em 15 minutos. Novo envio invalida o anterior. Falha de entrega não gera sessão.

## Confirmar antes da ativação

1. Autenticar no Render e confirmar o IP em acessos feitos por uma pessoa fisicamente no escritório. Um login válido das quatro contas registra `[access-network]` com horário e candidatos de cabeçalhos. Esses valores são diagnósticos, não prova de origem. Não usar o IP do servidor, da Aiven ou da Cloudflare como IP do escritório. Conferir também se há saída IPv6 diferente do IPv4 fixo; esta versão admite um único IP de saída.
2. Validar na infraestrutura real que o cabeçalho escolhido é sobrescrito por um proxy confiável e não pode ser forjado, inclusive pelo hostname público direto do Render. Não confiar no primeiro `X-Forwarded-For`. Se a infraestrutura não oferecer essa garantia, ajustar o caminho de proxy antes de habilitar a regra.
3. Confirmar os logins exatos e o e-mail individual de Rose, Gislene e Rosani no cadastro. Os códigos devem chegar a caixas individuais sob controle delas.
4. Configurar um remetente verificado no Resend (adaptador atual) e testar entrega real e recuperação de acesso com uma conta autorizada. Nenhum e-mail real foi enviado pelos testes automatizados.
5. Definir no ambiente do Render, sem versionar segredos:

   - `OFFICE_PUBLIC_IP`: IP público verificado do escritório.
   - `OFFICE_CLIENT_IP_HEADER`: `true-client-ip` ou `cf-connecting-ip`, somente após validação do proxy.
   - `OFFICE_IP_HEADER_VERIFIED=true`: declaração operacional de que a validação foi feita; não realiza validação automaticamente.
   - `RESEND_API_KEY` e `AUTH_EMAIL_FROM`: credencial e remetente verificado.
   - `JWT_SECRET`: segredo de sessão já utilizado pela aplicação.
   - `OFFICE_ACCESS_POLICY_ENABLED=true`: habilitar **por último**.

Com a regra ativa, configuração incompleta ou contas/e-mails ausentes impedem a nova instância de iniciar. A criação idempotente da tabela `srougi_login_codes` é aditiva, sem alterar usuários, senhas ou pacientes. Para reverter a restrição de rede, definir `OFFICE_ACCESS_POLICY_ENABLED=false` e publicar novamente; Bia continua com a restrição de dispositivo independente.

## Validação feita sem dados reais

Testes de decisão de rede, normalização de IP, rejeição de cabeçalho não confirmado, prova de sessão, emissão de cookie apenas após a segunda etapa e testes com MySQL local isolado: uso único, concorrência, expiração, tentativas, reenvio, mudança de IP/senha e falha simulada de entrega. O transporte de e-mail usa HTTPS com limite de dez segundos e chave de idempotência por desafio.

Pendências para validar em produção: IP e cabeçalho confiável, entrega de e-mail, logins reais, troca de rede durante sessão e restrição de Bia em computador fora do escritório. Nenhuma alteração de firewall da Aiven é necessária: o acesso ao banco é feito pela aplicação no Render, não pelos navegadores.

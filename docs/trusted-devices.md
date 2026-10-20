# Segundo fator e dispositivos confiáveis

Implementado com ativação separada: `SECOND_FACTOR_ENABLED=true` habilita código por e-mail para todas as contas, em qualquer rede. Substitui a decisão antiga por IP; a restrição de celular de Bia permanece independente. Sem essa variável, o comportamento anterior é preservado. Não foi ativado nesta entrega: remetente/entrega e e-mails individuais precisam ser verificados no ambiente real.

Após senha e código corretos, a opção “Confiar neste dispositivo por 30 dias” vem marcada por padrão. O aviso orienta desmarcar em computador público/compartilhado. O servidor exige a escolha explícita no pedido; omissão não lembra dispositivo. Essa opção aparece somente no modo 2FA geral. Login e senha continuam obrigatórios ao entrar; lembrar dispensa somente o código. Não indica presença na rede do escritório.

O cookie exclusivo do navegador tem Secure, HttpOnly, SameSite=Strict, Path=/ e prefixo __Host-. Contém identificador e segredo aleatório; o banco guarda somente HMAC do segredo. Prazo fixo de 30 dias, sem renovação automática a cada uso. Vinculado ao usuário, hash atual da senha, e-mail e user-agent. Limpar cookies, outro navegador, expiração, alteração de senha/e-mail ou revogação invalidam a confiança. Logout mantém a confiança para a próxima entrada. Token lembrado não autoriza troca de conta sem senha.

Gerenciamento de Usuários > Revogar dispositivos pede confirmação e revoga todos os navegadores lembrados da conta. Sessões originadas dessa confiança também são recusadas na próxima chamada. Sessão com código e sem lembrar exige código novamente após até 12 horas; a sessão normal mantém duração própria e não é estendida a 30 dias. Conta excluída perde autenticação pelo fluxo existente. Não há controle de “conta desativada” separado da exclusão no esquema atual.

Preparação de banco aditiva/idempotente: srougi_trusted_devices; não alterar pacientes, mensagens, senhas ou usuários. Falhas na consulta de confiança não liberam acesso.

## Ativação operacional
1. Confirmar um e-mail individual correto em todas as contas, inclusive administradores/testes, em Editar usuário.
2. Configurar o provedor de e-mail (Resend ou Cloudflare), AUTH_EMAIL_FROM (remetente verificado) e JWT_SECRET no Render; validar envio e recebimento real com uma conta autorizada. Para Cloudflare e configuração privada dos e-mails, seguir docs/cloudflare-2fa.md.
3. Ativar SECOND_FACTOR_ENABLED=true por último. A inicialização recusa contas sem e-mail válido e remetente ausente; não exige IP fixo ou cabeçalho de IP para este modo.
4. Validar primeiro login com código, reentrada com senha sem código, opção desmarcada, navegador novo, revogação e troca de senha. Não são testes de carga nem testes destrutivos.
5. Recuperação operacional: SECOND_FACTOR_ENABLED=false restaura o modo anterior; conferir OFFICE_ACCESS_POLICY_ENABLED antes, pois a antiga regra de rede volta a valer se ainda estiver habilitada.

Testes automatizados usam somente bancos locais isolados e e-mail simulado. Entrega real de e-mail e deploy ao vivo não foram verificados por esses testes.

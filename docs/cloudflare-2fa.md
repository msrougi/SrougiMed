# 2FA por e-mail com Cloudflare

O aplicativo no Render gera e valida os códigos; Cloudflare Email Service entrega as mensagens por REST. Não requer Worker nem alteração dos serviços Render/Aiven. O provedor anterior (Resend) continua sendo o padrão enquanto AUTH_EMAIL_PROVIDER não for alterado.

## Configuração privada no Render
- AUTH_EMAIL_PROVIDER=cloudflare
- AUTH_EMAIL_FROM: endereço de remetente em domínio verificado (ex.: acesso@seu-dominio).
- AUTH_CLOUDFLARE_ACCOUNT_ID: ID da conta (32 caracteres hexadecimais).
- AUTH_CLOUDFLARE_API_TOKEN: segredo com Email Sending: Edit e Email Routing Addresses Read, limitado à conta escolhida.
- AUTH_EMAIL_ALLOWED_RECIPIENTS: e-mails autorizados, separados por vírgulas. Não colocar aqui endereço que ainda não foi verificado na Cloudflare.
- AUTH_LOGIN_EMAILS_JSON: opcional, objeto com exatamente as chaves gislene, rosani, rose e os e-mails individuais informados pelo responsável, somente na configuração privada.
- JWT_SECRET: segredo de sessão existente.
- SECOND_FACTOR_ENABLED=true somente após a entrega real e todos os e-mails das contas terem sido validados.

AUTH_LOGIN_EMAILS_JSON sincroniza somente o campo email dos três logins exatos, sem diferenciar caixa/espaços nas pontas. Exige exatamente um usuário por login; atualiza em transação. Não altera senha, papel, pacientes ou grupos. É repetível. Remover essa variável após conferir os e-mails no cadastro, para não sobrepor futuras alterações manuais. A mudança de e-mail invalida confiança anterior conforme a regra existente. Endereços pessoais e credenciais não devem ser publicados no repositório.

## Preparação Cloudflare
1. Em Compute > Email Service, confirmar o domínio remetente e seguir os registros de autenticação apresentados. Conferir registros existentes antes de alterar DNS; não substituir MX de uma caixa existente sem avaliar o impacto.
2. Em Email Routing > Destination Addresses, adicionar os e-mails individuais e aguardar confirmação de cada destinatária.
3. Criar token restrito à conta, com as duas permissões acima. Guardá-lo somente no Render.
4. Configurar as variáveis com SECOND_FACTOR_ENABLED=false, conferir os cadastros e validar a entrega real de código em uma conta autorizada antes de ativar para todas.
5. Para um teste real controlado, habilitar em ambiente de homologação com apenas as contas de teste/cadastros preparados; os testes automatizados de CI nunca enviam e-mail real. Não há endpoint público de disparo de teste.
6. O modo geral exige e-mail válido e permitido para todas as contas existentes, incluindo administradores e testes. Três endereços não bastam se houver outras contas que devam continuar acessando. A ausência impede inicialização quando o modo geral for ligado.

## Envio gratuito e falhas
O caminho Cloudflare aceita somente destinatários na lista privada. Antes de cada envio, consulta a API de endereços e exige verificação confirmada. Não tenta destinatário arbitrário nem escolhe provedor alternativo automaticamente. A verificação, o envio e a leitura da resposta compartilham limite de 10 segundos; falha, rejeição ou situação incerta invalidam o desafio e não criam sessão. Não há repetição automática de envio. O usuário solicita novo código com os limites existentes. Entregue ou enfileirado para o destinatário correto é aceito pela API; enfileiramento não confirma chegada na caixa.

Segundo a documentação Cloudflare consultada em 20/10/2026, envios a destinatários verificados são gratuitos em todos os planos; destinatários arbitrários exigem Workers Paid. A aplicação restringe este adaptador à modalidade verificada. Não ativa plano pago.

Referências oficiais:
- https://developers.cloudflare.com/email-service/platform/pricing/
- https://developers.cloudflare.com/email-service/api/send-emails/rest-api/
- https://developers.cloudflare.com/api/resources/email_routing/subresources/addresses/methods/list/

## Estado da entrega
Adaptador, validação de configuração e sincronização de e-mails preparados. Nenhum token real, verificação de domínio, confirmação de destinatárias, mudança no painel ou e-mail real faz parte dos testes automatizados. Confirmar deploy e entrega no ambiente antes de considerar 2FA ativo. A opção de 30 dias e a revogação continuam no fluxo existente.

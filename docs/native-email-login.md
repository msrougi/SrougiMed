# Confirmação por e-mail dentro do SrougiMed

Com NATIVE_EMAIL_LOGIN=true, todas as contas, inclusive Bia, usam senha e código por e-mail do próprio SrougiMed. Não há dependência do Cloudflare One Client nem restrição de computador nesse modo. Configurar o remetente, conferir as contas e testar a entrega real do código antes de ativar.

## Experiência

Depois de validar usuário e senha, o sistema mostra “Confirme seu acesso” e “Enviaremos um código de acesso para fi*****@example.invalid”, com o botão “Enviar código”. O e-mail vem exclusivamente do cadastro; não há campo para alterá-lo nessa etapa. Após aceitação pelo provedor, a tela permite digitar o código de seis dígitos e informa a validade de cinco minutos. Há botão de reenvio após um minuto e opção de confiar no dispositivo por 30 dias, inicialmente marcada. O usuário continua precisando de senha ao entrar novamente.

O estado entre a senha e o envio fica em cookie HttpOnly/Secure/SameSite=Strict, host-only, válido por cinco minutos, vinculado à conta/senha/e-mail e ao navegador. Esse cookie não autentica consultas. O endpoint de envio não aceita destinatário nem ID de usuário; relê a conta preparada. Não há envio antes do clique. A tela só informa envio após aceitação pelo provedor, que não garante chegada à caixa de entrada.

O mecanismo existente mantém hash do código no banco, uso único, cinco tentativas, intervalo mínimo de um minuto e no máximo cinco solicitações em 15 minutos por conta. Código expirado, senha/e-mail alterados, outra conta/navegador ou falha de envio não concedem sessão. O reenvio invalida o código anterior. A confirmação inicial também expira em cinco minutos; após isso é preciso entrar novamente com senha.

## Contas e acesso da Bia

Todos precisam de endereço válido e exclusivo, exceto o par admin/msrougi cujo compartilhamento continua dependendo de CF_ACCESS_SHARED_OWNER_EMAIL. Senhas, papéis e sessões continuam separados.

A dispensa antiga da Bia e as opções BIA_DEVICE_ACCESS_ENABLED e CF_ACCESS_BIA_USER_ID são ignoradas no modo nativo. Nenhuma delas pode dispensar o segundo fator nem redirecionar Bia para a Cloudflare.

Bia precisa de e-mail válido no cadastro, como as demais contas. Não há alteração de senha nem migração de dados. Sessões sem comprovação válida do segundo fator são recusadas.

## Envio

O adaptador já suporta Resend ou Cloudflare Email Service. Para evitar confirmação prévia de cada destinatário, pode-se configurar Resend com um domínio remetente verificado. Não incluir chave de API em código, commits ou mensagens. Informar a chave diretamente nas variáveis privadas do Render.

O envio gratuito por Cloudflare Email Service continua restrito aos endereços previamente verificados; não confundir esse produto com One-time PIN do Cloudflare Access. A seleção do adaptador deve corresponder à configuração efetivamente concluída.

## Ativação com Resend

1. Verificar no Resend um domínio controlado pela organização e configurar os registros DNS indicados. Um remetente proposto é acesso@srougi.app, somente após verificação desse domínio.
2. Criar uma chave de envio restrita ao domínio e cadastrá-la diretamente no Render. Não usar o domínio de testes do provedor para a equipe real.
3. Conferir os e-mails em Admin. Manter AUTH_LOGIN_EMAILS_JSON removida, pois as contas já estão cadastradas.
4. Após configurar o provedor, salvar estas variáveis no mesmo deploy, com valores reais para remetente/chave:

```dotenv
CF_ACCESS_ENABLED=false
NATIVE_EMAIL_LOGIN=true
SECOND_FACTOR_ENABLED=true
BIA_DEVICE_ACCESS_ENABLED=false
SROUGI_PUBLIC_ORIGIN=https://srougi.app
OFFICE_ACCESS_POLICY_ENABLED=false
AUTH_EMAIL_PROVIDER=resend
AUTH_EMAIL_FROM=REMETENTE_DO_DOMINIO_VERIFICADO
RESEND_API_KEY=CHAVE_PRIVADA_DE_ENVIO
```

Remover SECOND_FACTOR_BIA_USER_ID e CF_ACCESS_BIA_USER_ID como limpeza operacional; valores antigos são ignorados no modo nativo. Preservar DATABASE_URL, JWT_SECRET e a configuração privada do endereço compartilhado. A inicialização recusa a combinação NATIVE_EMAIL_LOGIN=true com CF_ACCESS_ENABLED=true ou SECOND_FACTOR_ENABLED diferente de true. Sem remetente/chave válidos não ativar o modo nativo.

5. O hostname inteiro não deve estar protegido por Access. A política antiga da Bia em `/auth/cloudflare` pode ser desvinculada após a publicação; esse callback não participa do login nativo.
6. Aguardar Live e testar em aba anônima: entrega e código da Resend para uma conta comum e Bia; recusa sem código; administração e logout. Não afirmar produção validada só com CI.

## Reversão

Não restaurar a dispensa de segundo fator da Bia. Uma reversão para autenticação Cloudflare exige nova autorização, restauração e validação das políticas e configuração compatível no servidor. Novas sessões podem exigir login novamente.

## Limites

A confirmação por código sem confiança mantém validade de 12 horas no mecanismo interno, dentro do cookie de sessão de até sete dias. Com confiança, o registro tem validade fixa de 30 dias, sem renovação ao usar; alterações da conta invalidam a confiança. O token confiável é específico por conta/navegador e somente o hash do segredo é armazenado. O administrador pode revogar esses registros pelo recurso existente.

Os testes locais/CI usam dados fictícios e banco MySQL isolado; não enviam e-mails reais. Entrega, domínio/chave de envio, variáveis de produção e teste real permanecem etapas operacionais obrigatórias.

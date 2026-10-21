# Confirmação por e-mail dentro do SrougiMed

Modo optativo. Publicar o código não substitui automaticamente o Cloudflare Access em uso. A troca só deve ocorrer após configurar o remetente, conferir as contas e testar a entrega real do código.

## Experiência

Depois de validar usuário e senha, o sistema mostra “Confirme seu acesso” e “Enviaremos um código de acesso para fi*****@example.invalid”, com o botão “Enviar código”. O e-mail vem exclusivamente do cadastro; não há campo para alterá-lo nessa etapa. Após aceitação pelo provedor, a tela permite digitar o código de seis dígitos e informa a validade de cinco minutos. Há botão de reenvio após um minuto e opção de confiar no dispositivo por 30 dias, inicialmente marcada. O usuário continua precisando de senha ao entrar novamente.

O estado entre a senha e o envio fica em cookie HttpOnly/Secure/SameSite=Strict, host-only, válido por cinco minutos, vinculado à conta/senha/e-mail e ao navegador. Esse cookie não autentica consultas. O endpoint de envio não aceita destinatário nem ID de usuário; relê a conta preparada. Não há envio antes do clique. A tela só informa envio após aceitação pelo provedor, que não garante chegada à caixa de entrada.

O mecanismo existente mantém hash do código no banco, uso único, cinco tentativas, intervalo mínimo de um minuto e no máximo cinco solicitações em 15 minutos por conta. Código expirado, senha/e-mail alterados, outra conta/navegador ou falha de envio não concedem sessão. O reenvio invalida o código anterior. A confirmação inicial também expira em cinco minutos; após isso é preciso entrar novamente com senha.

## Contas e exceção da Bia

Todos precisam de endereço válido e exclusivo, exceto o par admin/msrougi cujo compartilhamento continua dependendo de CF_ACCESS_SHARED_OWNER_EMAIL. Senhas, papéis e sessões continuam separados.

A conta Bia pode ficar sem código, vinculada a SECOND_FACTOR_BIA_USER_ID e exigindo simultaneamente login `bia` e papel `user`. CF_ACCESS_BIA_USER_ID é aceito como compatibilidade na transição, mas configurar a variável específica é preferível. A sessão dessa conta é vinculada à senha/e-mail atuais. O bloqueio existente a celular permanece. Isso não identifica um computador específico; esse controle depende de configuração posterior do dispositivo.

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
SECOND_FACTOR_BIA_USER_ID=9
OFFICE_ACCESS_POLICY_ENABLED=false
AUTH_EMAIL_PROVIDER=resend
AUTH_EMAIL_FROM=REMETENTE_DO_DOMINIO_VERIFICADO
RESEND_API_KEY=CHAVE_PRIVADA_DE_ENVIO
```

Preservar DATABASE_URL, JWT_SECRET e a configuração privada do endereço compartilhado. Não há troca de senhas nesta alteração. A inicialização recusa a combinação NATIVE_EMAIL_LOGIN=true com CF_ACCESS_ENABLED=true ou SECOND_FACTOR_ENABLED diferente de true. Sem remetente/chave válidos não ativar o modo nativo.

5. O hostname inteiro não deve estar protegido por Access. A aplicação atual limitada a /auth/cloudflare pode permanecer para reversão: o modo nativo não redireciona para ela.
6. Aguardar Live e testar em aba anônima: senha correta, máscara correta, entrega real, código errado/expirado, confirmação correta, confiança de dispositivo, conta comum sem administração e Bia em desktop/celular. Não afirmar envio/produção validada só com CI.

## Reversão

No mesmo deploy: NATIVE_EMAIL_LOGIN=false, SECOND_FACTOR_ENABLED=false e CF_ACCESS_ENABLED=true, preservando as variáveis e a política já configuradas do Cloudflare Access. Novas sessões podem exigir login novamente. Não remover a política anterior antes de confirmar o novo envio em produção.

## Limites

A confirmação por código sem confiança mantém validade de 12 horas no mecanismo interno, dentro do cookie de sessão de até sete dias. Com confiança, o registro tem validade fixa de 30 dias, sem renovação ao usar; alterações da conta invalidam a confiança. O token confiável é específico por conta/navegador e somente o hash do segredo é armazenado. O administrador pode revogar esses registros pelo recurso existente.

Os testes locais/CI usam dados fictícios e banco MySQL isolado; não enviam e-mails reais. Entrega, domínio/chave de envio, variáveis de produção e teste real permanecem etapas operacionais obrigatórias.

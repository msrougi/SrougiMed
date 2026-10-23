# Cloudflare Access no SrougiMed

Preparado no código, desativado por padrão. Não ativar só por publicar o código: é necessário configurar a aplicação Cloudflare, conferir contas/e-mails, configurar o Render e testar o PIN real.

## Postura somente para a Bia, mantendo o 2FA nativo

O modo `BIA_DEVICE_ACCESS_ENABLED=true` funciona junto com `NATIVE_EMAIL_LOGIN=true` e `SECOND_FACTOR_ENABLED=true`, enquanto `CF_ACCESS_ENABLED` permanece `false`. As outras contas continuam recebendo o código da Resend dentro do SrougiMed. Somente a conta Bia, identificada simultaneamente por ID, login `bia` e papel `user`, segue para `/auth/cloudflare` depois de confirmar a senha.

Nesse caminho, a política Cloudflare deve conter `Include: Email` para o endereço exclusivo da Bia e `Require: Device posture — Serial number list` para a lista que contém apenas o computador autorizado. One-time PIN permanece como método de login da aplicação. O e-mail da Bia não deve constar em outra política Allow que dispense a postura. Não ativar “Authenticate with Cloudflare One Client”, pois o PIN é o segundo fator desejado.

Variáveis no Render:

```dotenv
CF_ACCESS_ENABLED=false
CF_ACCESS_LOGIN_FLOW=false
NATIVE_EMAIL_LOGIN=true
SECOND_FACTOR_ENABLED=true
BIA_DEVICE_ACCESS_ENABLED=true
CF_ACCESS_BIA_USER_ID=ID_REAL_DA_CONTA_BIA
CF_ACCESS_TEAM_DOMAIN=https://nome-da-equipe.cloudflareaccess.com
CF_ACCESS_AUD=tag-AUD-da-aplicacao-de-64-caracteres-hexadecimais
SROUGI_PUBLIC_ORIGIN=https://srougi.app
```

`SECOND_FACTOR_BIA_USER_ID` deve ser removida nesse modo. A inicialização falha se a antiga dispensa de senha estiver ativa ao mesmo tempo. O callback exige senha recente, assertion assinada da Cloudflare, e-mail exato e o mesmo navegador; somente então emite a sessão local. O equipamento é verificado pela política Access antes da emissão dessa assertion.

## Fluxo seletivo: exceção temporária da Bia

Com CF_ACCESS_ENABLED=true e CF_ACCESS_LOGIN_FLOW=true:

1. A página inicial fica pública; o usuário informa login e senha do SrougiMed.
2. Depois de validar a senha, somente a conta Bia explicitamente cadastrada em CF_ACCESS_BIA_USER_ID pode entrar sem PIN. A exceção exige simultaneamente o ID, login `bia` e papel `user`. A restrição existente a desktop permanece; ela não identifica um computador específico, nem impede simulação de navegador desktop.
3. Todos os demais usuários recebem um cookie intermediário de cinco minutos, HttpOnly, Secure, SameSite=Lax e host-only. Ele não é uma sessão e não autoriza nenhuma consulta de dados.
4. O navegador segue para /auth/cloudflare, único caminho protegido pela aplicação Cloudflare Access. A Cloudflare pede e-mail/PIN ou reutiliza uma sessão externa ainda válida.
5. O servidor valida assinatura RS256/JWKS, emissor, audiência, expiração, emissão, subject e e-mail da assertion. O e-mail precisa pertencer à conta que acabou de confirmar a senha. Por padrão, deve ser exclusivo; a única exceção autorizada é o par admin/msrougi descrito abaixo.
6. Só então cria a sessão do app. A validade é o menor prazo entre sete dias e a expiração da assertion. Todas as chamadas tRPC de contas autenticadas revalidam a sessão assinada, o vínculo à senha/e-mail atuais e o navegador. Contas com 2FA também revalidam a exclusividade do e-mail. Sessões anteriores à ativação não são aceitas.

Não há bypass por parâmetro, nome digitado, cabeçalho de e-mail, IP, papel administrador ou cookie intermediário. Não criar regra Bypass geral na Cloudflare. As páginas/assets públicos não contêm dados de pacientes. A API tRPC continua exigindo autenticação/autorização; outros caminhos /api/ (incluindo OAuth legado) são recusados nesse modo. A URL direta Render não substitui a confirmação Cloudflare: o callback continua exigindo a assertion válida. Uma sessão de app já emitida continua sendo credencial válida na origem até expirar ou até alteração da conta.

## Associação conta/e-mail

O campo E-mail em Admin > Gerenciar Usuários > Editar é a associação usada. Uma conta por endereço por padrão. As contas admin e msrougi podem compartilhar exclusivamente o endereço configurado em CF_ACCESS_SHARED_OWNER_EMAIL; a consulta exige exatamente esse par de logins/IDs distintos, e qualquer terceira conta causa recusa. Senhas, sessões e permissões continuam separadas entre admin e msrougi; confirmar o e-mail não promove a conta comum a administrador. O mesmo endereço precisa constar na política Allow da Cloudflare. Os nomes do usuário e da pessoa não precisam coincidir com o endereço.

A variável privada AUTH_LOGIN_EMAILS_JSON mantém as chaves obrigatórias gislene, rosani e rose e admite as chaves opcionais miguel, msrougi e admin. Os valores são endereços individuais, nunca senhas. A sincronização valida logins únicos e colisões de endereço antes de atualizar, em uma transação. Não insere contas nem altera senhas/papéis/grupos. Remover a variável depois de aplicá-la, para não sobrescrever edições futuras. Não publicar os endereços pessoais no repositório.

A inicialização recusa e-mails ausentes/duplicados das contas que exigem 2FA, exceto o par explicitamente autorizado. A exceção Bia exige que a conta configurada exista com ID/login/papel corretos; não deixar login sem uso habilitado sem e-mail. Editar o e-mail de uma conta invalida sua sessão do app e exige ajustar a política Cloudflare.

## Ativação seletiva, nesta ordem

1. Cadastrar todos os e-mails individuais, inclusive msrougi/admin; conferir o ID real de Bia. Manter CF_ACCESS_ENABLED=false.
2. Em Zero Trust > Integrations > Identity providers, configurar One-time PIN.
3. Criar/editar a aplicação Self-hosted: hostname público srougi.app e caminho **auth/cloudflare**. NÃO proteger o hostname inteiro para este fluxo. Qualquer aplicação abrangente existente para o mesmo hostname também precisa ser revista antes da ativação, para não continuar bloqueando a Bia na borda.
4. Criar política Allow somente para os e-mails exatos das contas com 2FA. Selecionar One-time PIN como método de login. Configurar duração da aplicação/política/global conforme desejado, até um mês; não habilitar MFA adicional sem um provedor compatível.
5. No Render, configurar Health Check Path=/healthz e as variáveis privadas:

```dotenv
CF_ACCESS_ENABLED=false
CF_ACCESS_LOGIN_FLOW=true
CF_ACCESS_TEAM_DOMAIN=https://nome-da-equipe.cloudflareaccess.com
CF_ACCESS_AUD=tag-AUD-da-aplicacao-de-64-caracteres-hexadecimais
SROUGI_PUBLIC_ORIGIN=https://srougi.app
CF_ACCESS_BIA_USER_ID=ID_REAL_DA_CONTA_BIA
CF_ACCESS_SHARED_OWNER_EMAIL=endereco-privado-do-titular@example.invalid
SECOND_FACTOR_ENABLED=false
OFFICE_ACCESS_POLICY_ENABLED=false
```

Preservar JWT_SECRET. Team Domain/AUD não são tokens administrativos. O app não precisa de token API Cloudflare nem de Email Sending/Resend para validar o acesso.

6. Depois de conferir contas, política e publicação, habilitar CF_ACCESS_ENABLED=true e publicar. Testar senha errada, PIN real, e-mail incorreto/duplicado, Bia desktop/celular, sessões antigas, administração e URL direta Render antes de considerar concluído.
7. Para remover a dispensa da Bia, primeiro cadastrar e-mail exclusivo e incluí-lo na política, depois remover CF_ACCESS_BIA_USER_ID e publicar. Para limitar a um equipamento específico, será necessária configuração adicional no dispositivo; o bloqueio mobile atual não oferece essa garantia.

## Revogação e duração

Sair do app remove a sessão local e o cookie intermediário, mas não encerra automaticamente a sessão externa Cloudflare. Para trocar o e-mail da Cloudflare, usar https://srougi.app/cdn-cgi/access/logout e voltar ao login do app.

No fluxo seletivo, a Cloudflare protege a etapa de confirmação, não cada consulta. Remover um e-mail/revogar na Cloudflare impede novas confirmações, mas não encerra por si só uma sessão local já emitida. Para bloqueio local imediato, alterar senha/e-mail ou excluir a conta conforme a ação administrativa pretendida. O botão interno de revogar dispositivos não afirma revogar essas sessões. Revogação de dispositivo/sessão individual no modo seletivo não está implementada.

## Modo global anterior

CF_ACCESS_ENABLED=true com CF_ACCESS_LOGIN_FLOW diferente de true preserva a barreira global anterior. Nesse modo a aplicação Cloudflare protege todos os caminhos, todos precisam de e-mail/PIN e não existe dispensa da Bia. O servidor exige assertion em todas as requisições, exceto GET/HEAD /healthz (resposta fixa sem dados). Não misturar política global com instruções do fluxo seletivo.

## Validação e limites

Testes isolados cobrem assinatura, identidade/conta, senha antes da confirmação, rejeição do cookie intermediário como sessão, expiração, mudança de senha/e-mail, troca de navegador, tentativa de usar outra conta/papel, manutenção do bloqueio mobile e isolamento de permissões. Testes MySQL usam apenas banco local de teste. Não enviam PIN real nem alteram dados de produção/painéis/DNS. A ativação e a entrega real do PIN ainda precisam ser verificadas no ambiente publicado.

Referências:
https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/
https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/
https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/

## Alternativa com interface própria

O fluxo optativo de confirmação dentro do app, com envio pelo provedor configurado, está em [native-email-login.md](native-email-login.md). Não ativar os dois mecanismos simultaneamente. Publicar a alternativa não altera por si só as variáveis de produção.

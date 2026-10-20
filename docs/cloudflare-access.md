# Cloudflare Access no SrougiMed

Modo preparado, desativado até configuração operacional e teste real. CF_ACCESS_ENABLED=true passa o segundo fator de e-mail ao Cloudflare Access. O envio próprio de códigos e a confiança interna de 30 dias não são usados nesse modo. Usuário e senha do SrougiMed continuam obrigatórios, e os papéis/grupos/permissões do app continuam no banco.

## Comportamento
- Cloudflare Access pede e-mail e PIN diretamente, conforme política. Não exige a verificação prévia de destinatário do Email Service. Não precisa das credenciais Resend/Cloudflare Email Sending.
- O Render valida RS256, assinatura via JWKS do domínio da equipe, emissor, audiência, expiração, emissão, subject e e-mail do token recebido em Cf-Access-Jwt-Assertion. Não confia em e-mail de cabeçalho avulso nem no cookie CF_Authorization como substituto dessa assertion.
- Chaves públicas são mantidas em cache com renovação; não há busca de chaves em cada chamada. A validação de identidade é reutilizada somente dentro da mesma requisição.
- O e-mail confirmado deve corresponder ao cadastro do usuário e pertencer a uma única conta no banco. A conferência vale no login e em chamadas tRPC de sessões abertas, inclusive de administradores.
- O login do app vincula a sessão à identidade Cloudflare e ao estado atual da senha/e-mail. Sessões antigas precisam de novo login. Senha incorreta, conta excluída, troca de identidade ou alteração de senha/e-mail não mantêm acesso por sessão antiga.
- A duração da sessão Cloudflare é configurada no painel (até um mês); o cookie de sessão do app continua com sua duração própria. Mudar senha invalida a sessão do app; não revoga automaticamente a sessão Cloudflare.
- O modo desktop de Bia permanece independente.
- Todos os caminhos do servidor (páginas, arquivos estáticos, API e callback OAuth) passam pelo verificador. A única exceção é GET/HEAD /healthz, resposta fixa “ok” sem dados.
- A URL direta do Render não libera o app sem assertion válida. Portar um token Cloudflare válido ainda representa uma credencial válida até sua expiração: o gate local não consulta revogação em tempo real da Cloudflare.

## Configuração privada no Render
CF_ACCESS_ENABLED=false inicialmente.
CF_ACCESS_TEAM_DOMAIN=https://nome-da-equipe.cloudflareaccess.com
CF_ACCESS_AUD=tag-AUD-da-aplicacao (64 caracteres hexadecimais)
JWT_SECRET=segredo de sessão existente

O domínio da equipe e o AUD não são tokens de API. Nenhum token administrativo Cloudflare é necessário no app para validar assinaturas. A sincronização privada AUTH_LOGIN_EMAILS_JSON existente pode aplicar os e-mails autorizados de gislene, rosani e rose; não publique endereços pessoais no repositório. Todas as demais contas também precisam de e-mail individual válido, único e permitido na política Access. Crie/edite o e-mail do cadastro antes de permitir a nova conta na Cloudflare. A inicialização com o modo ativo recusa e-mails ausentes, inválidos ou duplicados.

## Ativação, nesta ordem
1. Conferir e-mails de todas as contas que continuarão usando o app, inclusive administradores e testes. Usar endereços individuais. Não vincular duas contas ao mesmo e-mail.
2. No Cloudflare Zero Trust, configurar Integrations > Identity providers > One-time PIN.
3. Em Access controls > Applications, criar aplicação Self-hosted para srougi.app em todos os caminhos, incluindo qualquer hostname alternativo que permanecer em uso. Conferir se o DNS está passando pela Cloudflare.
4. Criar política Allow por e-mails exatos autorizados. Não usar liberação de qualquer e-mail, qualquer domínio inteiro ou regra Bypass geral.
5. Configurar durações global, da aplicação e da política para até um mês conforme combinado; revisar a precedência das durações. Não habilitar o segundo fator interno do app em paralelo.
6. Copiar Team Domain e AUD para as variáveis do Render, mantendo CF_ACCESS_ENABLED=false.
7. Alterar o Health Check Path do Render para /healthz antes da ativação.
8. Desativar SECOND_FACTOR_ENABLED e OFFICE_ACCESS_POLICY_ENABLED; quando os cadastros/políticas estiverem conferidos, habilitar CF_ACCESS_ENABLED=true e publicar. O código dá precedência a Access mesmo se as flags antigas ficarem ligadas, mas limpá-las evita comportamento inesperado numa reversão.
9. Testar: e-mail permitido recebe PIN; e-mail não autorizado não entra; senha do app continua exigida; identidade de Rose não entra em outra conta; usuário comum não ganha papel admin; conta Bia mantém regra desktop; URL direta Render sem assertion é negada e /healthz responde.
10. Conferir o funcionamento do aplicativo instalado, renovação/expiração de sessão e troca de conta em um navegador real. Não considere produção validada apenas pelo CI.

## Troca de conta e revogação
Sair do SrougiMed encerra a sessão do app, mas não a sessão Cloudflare, permitindo reentrada com senha enquanto a sessão externa estiver válida. Para trocar o e-mail da barreira Access, sair pelo endereço https://srougi.app/cdn-cgi/access/logout e autenticar com o outro e-mail.
No modo Access, “Revogar dispositivos” do mecanismo interno retorna uma orientação, sem afirmar que revogou a Cloudflare. Revogações e remoções da política devem ser feitas no painel Zero Trust. Para bloquear imediatamente a conta dentro do app, excluir a conta ou alterar seu e-mail/senha, conforme a ação administrativa pretendida; isso não substitui revogação das credenciais Cloudflare.

## Testes e limites
Testes com chaves RSA locais e JWTs fictícios cobrem assinatura/algoritmo, claims, isolamento entre e-mails/contas, proteção HTTP de origem, endpoint de saúde, sessão vinculada, rejeição de sessão antiga e manutenção de papéis. Testes MySQL usam somente banco local isolado. Não geram PIN real nem alteram painéis, DNS ou dados de produção.
Sem acesso ao painel nesta execução, domínio/equipe, AUD, política, plano, cadastros reais, publicação e entrega real do PIN permanecem pendentes. Não há restrição por localização de rede neste modo.

Referências:
https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/
https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/
https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/

# Avisos do ChatMed

Recursos: som curto (após interação com a página), contador e destaque do botão, número no título da aba e badge do aplicativo quando suportado. Em ChatMed → Avisos do ChatMed, cada usuário pode ligar/desligar o som, ativar/desativar notificações neste aparelho e testar o aviso.

As opções ficam no sininho junto ao título ChatMed. Som na página e push externo são independentes: o áudio é liberado no gesto do clique, sem bloquear o cadastro de push. Após a permissão, o cadastro tem orçamento total de 20 segundos, com limites por etapa e indicação da etapa atual. Instalação/ativação do service worker, conexão ao serviço push e salvamento têm timeout; o botão é liberado após falha para permitir nova tentativa. Uma operação atrasada não pode marcar o cadastro como confirmado na interface. A permissão já concedida não é solicitada de novo. Falha de rede/serviço push ainda pode impedir a ativação e deve ser validada no aparelho real.

Notificações externas dependem de autorização explícita no navegador. No iPhone/iPad, abrir o SrougiMed adicionado à Tela de Início. Modo Foco, volume, permissões do sistema, conectividade e execução em segundo plano podem impedir som/vibração/entrega. Fechar a janela não é o mesmo que encerrar/forçar a parada do navegador. Não prometer entrega em tempo real ou alertas críticos garantidos.

O service worker só trata notificações: não intercepta requisições, não cria cache offline nem guarda dados de pacientes. O aviso contém apenas o nome do aplicativo, texto genérico e ID técnico da mensagem; nunca remetente, grupo, conteúdo, anexos ou dados clínicos. Clicar abre o ChatMed no próprio domínio e exige login normal se a sessão expirou.

## Servidor e privacidade

Preparação aditiva e repetível das tabelas `chatmed_push_subscriptions`, `chatmed_push_events` e `chatmed_push_deliveries`, junto da preparação existente do ChatMed. Não altera cadastros nem mensagens antigas. A criação de uma mensagem/arquivo e seu evento ocorre na mesma transação; reenvio idempotente não gera outro evento. Respostas da SofIA no grupo também geram eventos; histórico particular da assistente não é enviado por push.

O servidor verifica grupo atual, destinatário da conversa particular, remetente, leitura e impressão da conta antes de enviar. Assinaturas exigem sessão autenticada e ficam vinculadas à conta e à validade da sessão/2FA; confiança revogada também impede envio. Logout remove assinaturas ligadas à sessão. A reentrada reconecta apenas aparelhos com preferência de push previamente ativada e permissão concedida. Um endpoint só pertence a uma conta por vez. Limite de oito aparelhos por conta.

Endpoints HTTPS são restritos aos serviços oficiais de push de Google, Mozilla, Apple e Microsoft, impedindo uso como cliente HTTP arbitrário. Chaves de assinatura são derivadas no servidor com HMAC SHA-256 e separação de domínio a partir de JWT_SECRET; somente a chave pública VAPID é entregue ao cliente. Não é necessário cadastrar chaves em serviços pagos ou usar Cloudflare. Não imprimir endpoints, chaves ou respostas dos provedores. Rotacionar JWT_SECRET também muda VAPID e exige reinscrição dos aparelhos.

Um despachante a cada cinco segundos usa trava MySQL compartilhada entre instâncias. Registra entregas aceitas para evitar duplicação ao repetir tentativas; falhas temporárias têm até três tentativas e endpoints 404/410 são removidos. Eventos expiram em 15 minutos, e o TTL no serviço push é cinco minutos. Não se trata de fila de entrega garantida: confirmação do provedor não comprova exibição ao usuário. Contadores e histórico permanecem a fonte de verdade.

## Validação de produção

1. Após o deploy, atualizar o SrougiMed e abrir ChatMed → Avisos do ChatMed → Ativar avisos neste aparelho. A permissão deve ser concedida pelo próprio usuário.
2. Executar Testar aviso, conferir volume e permissões do Windows/macOS/celular.
3. Com duas contas do mesmo grupo, enviar mensagem particular e de grupo; conferir contador, destaque, som e aviso genérico em outra aba/programa e com a janela fechada.
4. Conferir silêncio ao desligar som, ausência de alertas para a própria mensagem, conversa já lida, outro grupo, conta desconectada ou confiança revogada.
5. Em iPhone/iPad, repetir pelo ícone da Tela de Início. Não afirmar que o celular foi validado apenas pelos testes automatizados.

Não há suporte a luzes/sinalizadores físicos nesta alteração; isso exige integração de hardware separada.

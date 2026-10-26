# SofIA no ChatMed

A SofIA é uma assistente de consultas, somente leitura, integrada ao ChatMed.
Cada usuário possui uma conversa particular e o canal do grupo pode acioná-la com
`@SofIA`. O histórico particular é filtrado pelo ID da sessão; respostas no canal
ficam visíveis aos integrantes daquele grupo.

## Privacidade e fluxo

1. O servidor reconhece localmente pedidos de alteração, agendamento e orientação
   médica e os recusa sem chamar IA.
2. Nomes, cidades, documentos, telefones, e-mails e qualquer outra palavra que
   possa representar um valor são substituídos por tokens opacos antes da chamada.
3. O Gemini recebe somente a pergunta anonimizada, o plano anterior também
   anonimizado e o vocabulário fixo de consulta. A requisição usa `store: false`.
4. A resposta do Gemini é um plano JSON estrito. O servidor rejeita campos,
   operadores, limites ou tokens fora da lista permitida.
5. O servidor transforma o plano em SQL parametrizado; o modelo nunca recebe
   credenciais, não se conecta ao MySQL e não produz SQL executável.
6. Os resultados são formatados e gravados diretamente pelo servidor no ChatMed.
   Dados e resultados de pacientes não voltam ao Gemini.

## Limites funcionais

- Consultas de pacientes: nome, prontuário, CPF, endereço, bairro, cidade, estado,
  e-mail, telefone, celular, Fax, profissão, indicação, nascimento e cadastro.
- Consultas da agenda: nome, e-mail, telefone, categoria, profissão e data de cadastro.
- Filtros combinados, alternativas, presença/ausência, mês atual, contagem, listagem,
  ordenação e continuação da pergunta anterior.
- Máximo de 50 itens por resposta. A contagem total continua correta quando a lista
  é limitada.
- Não cria, edita ou exclui cadastros; não agenda; não fornece diagnóstico,
  tratamento ou outra orientação médica.

## Configuração

- `GEMINI_API_KEY`: obrigatória e mantida apenas como segredo do Render.
- `GEMINI_MODEL`: opcional; padrão `gemini-3.8-flash`.
- `SOFIA_ENABLED=false`: desativa explicitamente as chamadas. Na ausência dessa
  variável, a funcionalidade fica habilitada e exige a chave.

As tabelas `sofia_private_messages` e `sofia_contexts` são criadas de forma aditiva
e repetível antes de o servidor de produção aceitar requisições. Nenhuma credencial
deve ser colocada em código, commit, relatório ou log.

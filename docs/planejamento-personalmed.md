# Planejar a conversão dos pacientes do PersonalMed

O comando abaixo lê a extração JSONL de `dbo.Clini_01` e cria uma simulação local.
Não usa DATABASE_URL, não se conecta à Aiven e não importa pacientes.

```sh
node scripts/plan-personalmed.mjs /caminho/extraido/pacientes.jsonl /caminho/privado/plano-inicial
```

O diretório de saída deve ser novo. Ele contém:

- `patients-plan.jsonl`: chave `personalmed:Clini_01:Unit:PCod`, hash dos valores
  originais, campos propostos, pendências e a linha original completa.
- `summary.json`: apenas contagens, sem valores de pacientes.

Esses arquivos contêm dados pessoais; devem ficar fora do repositório e dos logs
de compilação. A saída recebe permissões restritas. Um erro remove o diretório
incompleto; um diretório já existente não é sobrescrito.

## Regras desta simulação

O original completo fica preservado. Não há truncamento, fusão por nome/CPF,
atribuição de IDs do destino nem preenchimento de documentos ausentes.

As datas SQL Server são convertidas em DD/MM/AAAA sem conversão de fuso horário.
Data ausente continua nula. Estado civil S/C/V/D corresponde a 1/2/3/4.
Por decisão explícita de Marcelo em 18/10/2026, P e O também correspondem a
1 (solteiro/a): 723 registros P e 42 O no backup de teste. O código original
continua preservado no plano. Sexo M/F corresponde a 1/2. Cor da pele só recebe ID
quando o texto corresponde literalmente ao rótulo do destino, sem distinguir
maiúsculas/minúsculas. Por decisão explícita de Marcelo em 18/10/2026,
BRANCO, BCA., BCA e BRC também correspondem a branca (ID 1), conservando o original.
São 24.229 registros adicionais no backup de teste. Demais abreviações e variantes
continuam pendentes. Esta decisão elevou a versão do mapeamento para 3.
Na aprovação seguinte, PRETO (7) e NEGRA (5) passam a preta (ID 2), e PARDO (3)
a parda (ID 3). São mais 15 registros (versão 4).
O texto original continua preservado em todos eles.
Os IDs são os conferidos
na Aiven em 18/10/2026 e precisam ser validados novamente antes da carga.

Por decisão explícita de Marcelo em 18/10/2026, CEP com exatamente oito dígitos,
após remover apenas pontos, hífens e espaços, é proposto como oito dígitos.
Isso padroniza mais 2.344 registros do backup de teste, além dos 27.277 que já
tinham oito dígitos com ou sem hífen padrão. Os 8.189 restantes ficam pendentes;
o valor original permanece na linha completa. Não se completam zeros nem se
truncam dígitos. Ausência de CEP continua ausente (8.323 pacientes).
A padronização não consulta os Correios nem comprova que o CEP existe.
A regra de CEP foi introduzida na versão 2. A versão atual é 13, após a recuperação
do Fax; planos antigos precisam ser regenerados antes da comparação.
DDD e celular são combinados quando ambos existem; não se inventa DDD nem o nono
dígito. DDD sem número fica sinalizado e preservado no original.

Por decisão de Marcelo em 18/10/2026, somente ATIVO=T entra na carga.
ATIVO=F fica excluído; valores desconhecidos bloqueiam a linha para revisão.
No backup atual são 46.005 ativos e 128 inativos. Não se cria campo de status no app.
Informações adicionais 1/2 não são usadas para esconder campos sem correspondência.

## Comparar o backup atualizado

Depois de extrair o backup novo com os mesmos campos:

```sh
node scripts/plan-personalmed.mjs /caminho/extraido/atualizado.jsonl /caminho/privado/plano-atualizado /caminho/privado/plano-inicial/patients-plan.jsonl
```

O plano distingue chaves novas, iguais, alteradas e ausentes no novo snapshot.
Compara todos os campos originais, sem depender de datas de alteração. Uma chave
ausente não é excluída. Uma chave alterada não sobrescreve nenhum paciente.
O plano anterior é validado pela chave, versão e hash dos valores originais.

Essas contagens comparam arquivos, **não confirmam o que foi importado na Aiven**.
Ainda é necessário implementar o vínculo persistente entre chave antiga e ID novo,
reconciliar os quatro pacientes existentes e definir a política de conflitos com
edições no aplicativo antes de executar uma carga incremental real.

Este comando trata pacientes. A extração e conversão real de `dbo.AGFONE` para
`phone_book` são uma etapa separada, ainda pendente.

## Verificação

```sh
node --test scripts/plan-personalmed.test.mjs
```

Testes com dados sintéticos cobrem categorias pendentes, datas, CEP, capacidade,
preservação do original, chaves distintas com CPF igual, comparação entre arquivos,
rejeição de duplicidades e remoção de saídas incompletas. Dados reais não entram
nos testes nem no repositório.

## Valores de cor da pele sem classificação

Marcelo aprovou em 18/10/2026 que os 235 valores restantes, sem correspondência
confirmada, fiquem com skinColorId nulo e com o original preservado. A versão 5
registra essa escolha em decisions como leave_blank_preserve_original, em vez de
continuar sinalizando esses casos como uma decisão pendente. O resumo informa
a quantidade em approvedDecisions. Não se infere cor da pele de outros campos.
Registros sem valor na origem continuam nulos e não são contados nesses 235.

## Bairro

Marcelo aprovou em 18/10/2026 a criação de Bairro em Cadastro de Pacientes → Contato.
`patients.district` é VARCHAR(100) NULL; criação/edição/importação aceitam o campo
opcional, sem tornar dados antigos obrigatórios. A versão 6 do planejador associa
`Clini_01.District` diretamente a `district` (9.008 valores no backup de teste).
Não há concatenação com endereço nem uso dos campos de informações adicionais.
O preparador adiciona a coluna após cópia de segurança, antes de publicar o aplicativo.

## Fax recuperado no aplicativo

Em 25/10/2026, Marcelo reviu a decisão anterior e determinou recuperar o campo FAX.
A versão 13 associa FAX a um campo próprio `patients.fax`, sem concatenar ou alterar
telefone, celular, observações ou outras informações. Nos pacientes já importados,
o preenchimento usa exclusivamente o vínculo `srougi_personalmed_links.targetId` e
o valor preservado em `original.FAX`; não cruza nome, CPF ou posição de linha. A
recuperação é registrada uma única vez em `srougi_data_migrations`, não sobrescreve
um Fax já preenchido e mantém `updatedAt` inalterado.

## Filiação

Marcelo aprovou em 18/10/2026 Nome da mãe e Nome do pai na seção Dados Pessoais.
Os campos opcionais motherName/fatherName usam VARCHAR(200) NULL e são aceitos na
criação, edição, consulta e importação. A versão 8 associa Mother → motherName
(817 valores) e Father → fatherName (366 valores). Ausências continuam nulas.
Os nomes originais não são concatenados às observações nem usados para deduplicar.
O preparador cria as colunas com backup antes da publicação do novo aplicativo.

## Responsável

Marcelo aprovou em 18/10/2026 Nome do responsável e Telefone do responsável na
seção Contato. Os campos opcionais responsibleName/responsiblePhone aceitam
respectivamente 200/40 caracteres e NULL. A versão 9 associa RESPONSAVEL_NOME
(690 preenchidos) e RESPONSAVEL_FONE (36) sem alterar a grafia ou completar DDD.
São dados distintos da filiação e dos telefones do próprio paciente.
A importação de CSV/Excel reconhece seus cabeçalhos antes de Nome/Telefone genéricos.
As colunas são preparadas com backup antes de ativar o novo aplicativo.

## Complementos do RG ignorados no aplicativo

Marcelo recusou em 18/10/2026 a criação de órgão expedidor, UF do RG e data de
emissão. A versão 10 ignora IDDispatcherOrgan (2.638 preenchidos), IDUF (2.485)
e IDEmission (25) no mapeamento do aplicativo. Os valores originais completos
continuam preservados, com a decisão ignore_in_app_preserve_original. O RG
principal continua mapeado de ID para rg; esta escolha não descarta o documento.
Nenhuma coluna ou campo desses três complementos é criado.

## CNS e tipo sanguíneo ignorados no aplicativo

Em 18/10/2026, Marcelo recusou a inclusão de CNS (5 preenchidos) e BloodType
(6 preenchidos). A versão 11 não cria campos nem transfere esses valores para
outros campos do aplicativo. O original completo permanece preservado com a
decisão ignore_in_app_preserve_original, sem deixar uma decisão pendente.

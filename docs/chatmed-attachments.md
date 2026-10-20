# ChatMed: emojis e anexos

- Seletor de 16 emojis, inseridos no texto na posição do cursor, dentro do limite de 4.000 caracteres.
- Um arquivo por mensagem, até 5 MiB, com legenda opcional.
- Imagens PNG/JPG/JPEG/GIF/WebP, PDF, Word DOC/DOCX, Excel XLS/XLSX, PowerPoint PPT/PPTX, OpenDocument ODT/ODS/ODP e texto UTF-8 TXT/CSV/RTF.
- Histórico mostra nome/tamanho, botão de download e visualização de imagens sob demanda. PDF/Office são baixados; não são executados ou renderizados no servidor.
- Erro no envio preserva texto/arquivo para nova tentativa. Identificador de envio e SHA-256 impedem duplicar ou substituir um anexo num reenvio.

## Armazenamento e acesso

Tabela aditiva InnoDB chatmed_attachments, com um BLOB limitado por mensagem. Preparação idempotente no startup, sob o lock de esquema já usado pelo ChatMed. Conteúdo e mensagem são gravados na mesma transação. Sem dependência de filesystem efêmero do Render ou URL pública. Os arquivos ocupam espaço do banco Aiven e fazem parte de seus backups; observar capacidade conforme uso.

Download autenticado via tRPC verifica novamente o grupo e a conversa no banco, sem atalho para administradores. Apenas os dois participantes da conversa privada, ou membros atuais do canal, podem obter bytes. Mudança de grupo revoga também o download. Metadados são retornados no histórico; bytes só são transferidos quando pedidos. Resposta de download com Cache-Control private, no-store. Preview usa Blob URL local ao navegador, revogado ao fechar; sem links públicos permanentes.

Validação no cliente e servidor: extensão permitida, tamanho, base64 canônico e assinatura básica de formato/contêiner; MIME escolhido no servidor. Isso não equivale a antivírus ou inspeção completa de conteúdo Office/PDF. SVG, HTML, executáveis e extensões explícitas de macro não são aceitos. Documentos não são abertos automaticamente.

## Validação e publicação

Testes adicionados para formatos/limites, autorização anônima, persistência e isolamento MySQL, revogação por grupo, reenvio concorrente, emojis e seleção/remoção/envio de PDF na interface. Não declarar testes aprovados até executar o workflow ou ambiente isolado. Usar apenas fixtures sintéticas, sem arquivos de pacientes.

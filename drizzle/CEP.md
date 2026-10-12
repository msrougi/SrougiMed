# CEP no cadastro de pacientes

O formulário usa `zipCode` e o banco armazena `patients.zip_code` (VARCHAR(10), opcional). O campo aparece em Contato, ao lado do endereço no desktop e abaixo dele no celular. CEPs como 01234-567 mantêm os zeros iniciais.

Aplique as migrações antes de publicar esta versão do aplicativo. Se o histórico Drizzle já está em uso, execute `pnpm exec drizzle-kit migrate` com DATABASE_URL configurada. Para um banco existente sem histórico Drizzle, aplique somente `0005_patient_zip_code.sql` se a coluna ainda não existir; não execute todas as migrações sobre tabelas existentes.

O arquivo 0004_plain_betty_ross.sql foi recuperado a partir da diferença entre os snapshots 0003/0004, pois constava no journal mas estava ausente no repositório. Ele preserva a mudança já registrada de telefone/celular para VARCHAR(20).

Para a migração do PersonalMed, a correspondência do CEP é dbo.Clini_01.Zip → patients.zip_code. Este commit não importa pacientes nem acessa o banco de produção.

import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as bcrypt from "bcryptjs";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("DATABASE_URL não está definida");
  process.exit(1);
}

const connection = await mysql.createConnection(DATABASE_URL);
const db = drizzle(connection);

console.log("Populando dados iniciais...");

// Popular cores de pele
const skinColorsData = [
  { name: "branca" },
  { name: "preta" },
  { name: "parda" },
  { name: "amarela" },
  { name: "indígena" },
];

for (const color of skinColorsData) {
  await connection.execute(
    "INSERT IGNORE INTO skin_colors (name) VALUES (?)",
    [color.name]
  );
}
console.log("✓ Cores de pele inseridas");

// Popular estados civis
const maritalStatusesData = [
  { name: "solteiro(a)" },
  { name: "casado(a)" },
  { name: "viúvo(a)" },
  { name: "divorciado(a)" },
  { name: "separado(a)" },
];

for (const status of maritalStatusesData) {
  await connection.execute(
    "INSERT IGNORE INTO marital_statuses (name) VALUES (?)",
    [status.name]
  );
}
console.log("✓ Estados civis inseridos");

// Popular sexos
const gendersData = [
  { name: "masculino" },
  { name: "feminino" },
  { name: "não informado" },
];

for (const gender of gendersData) {
  await connection.execute(
    "INSERT IGNORE INTO genders (name) VALUES (?)",
    [gender.name]
  );
}
console.log("✓ Sexos inseridos");

// Criar usuários padrão (admin e teste)
console.log("Criando usuários padrão...");

// Hash das senhas
const adminPassword = await bcrypt.hash("admin", 10);
const testePassword = await bcrypt.hash("teste", 10);

// Inserir usuário admin
try {
  await connection.execute(
    `INSERT INTO users (openId, username, password, name, role, createdAt, updatedAt, lastSignedIn) 
     VALUES (?, ?, ?, ?, ?, NOW(), NOW(), NOW())
     ON DUPLICATE KEY UPDATE password = VALUES(password), role = VALUES(role)`,
    ["admin-openid", "admin", adminPassword, "Administrador", "admin"]
  );
  console.log("✓ Usuário admin criado");
} catch (error) {
  console.error("Erro ao criar usuário admin:", error);
}

// Inserir usuário teste
try {
  await connection.execute(
    `INSERT INTO users (openId, username, password, name, role, createdAt, updatedAt, lastSignedIn) 
     VALUES (?, ?, ?, ?, ?, NOW(), NOW(), NOW())
     ON DUPLICATE KEY UPDATE password = VALUES(password), role = VALUES(role)`,
    ["teste-openid", "teste", testePassword, "Usuário Teste", "user"]
  );
  console.log("✓ Usuário teste criado");
} catch (error) {
  console.error("Erro ao criar usuário teste:", error);
}

await connection.end();
console.log("\n✅ Dados iniciais populados com sucesso!");

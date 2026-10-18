import "dotenv/config";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { pathToFileURL } from "node:url";

type Column = { name: string; type: string; nullable: string; generated: string };
type Index = { name: string; unique: boolean; columns: string[] };
export type Structure = { columns: Column[]; indexes: Index[]; tables: string[] };

// This is intentionally separate from the historical Drizzle journal: main has
// a manual CPF migration which is not registered there. Introspection handles
// installations with or without that index, without replaying old migrations.
export function migrationPlan(structure: Structure): string[] {
  const columns = new Map(structure.columns.map(c => [c.name, c]));
  const required = ["id", "name", "code", "address", "cep", "phone", "mobile", "cpf",
    "city", "state", "birthDate", "maritalStatusId", "genderId", "skinColorId", "createdAt", "updatedAt"];
  const missing = required.filter(name => !columns.has(name));
  const tables = ["patients", "phone_book", "genders", "marital_statuses", "skin_colors"];
  if (missing.length || tables.some(t => !structure.tables.includes(t))) {
    throw new Error("Estrutura incompatível com o aplicativo atual. Não aplicar ao dump antigo ou a um banco sem as tabelas de opções.");
  }
  const plan: string[] = [];
  const district = columns.get("district");
  if (!district) plan.push("ALTER TABLE `patients` ADD COLUMN `district` varchar(100) NULL AFTER `address`");
  else {
    const size = /^varchar\((\d+)\)$/i.exec(district.type);
    if (!size || Number(size[1]) < 100 || district.nullable !== "YES") {
      throw new Error("district existe com definição inesperada; revisar antes de alterar.");
    }
  }
  for (const field of ["motherName", "fatherName"]) {
    const column = columns.get(field);
    if (!column) plan.push(`ALTER TABLE \`patients\` ADD COLUMN \`${field}\` varchar(200) NULL`);
    else {
      const size = /^varchar\((\d+)\)$/i.exec(column.type);
      if (!size || Number(size[1]) < 200 || column.nullable !== "YES") {
        throw new Error(`${field} existe com definição inesperada; revisar antes de alterar.`);
      }
    }
  }
  const legacy = columns.get("legacyImported");
  if (legacy && (!/^tinyint\(1\)$/i.test(legacy.type) || legacy.nullable !== "NO")) {
    throw new Error("legacyImported já existe com definição inesperada.");
  }
  if (!legacy) plan.push("ALTER TABLE `patients` ADD COLUMN `legacyImported` boolean NOT NULL DEFAULT false");
  for (const field of ["phone", "mobile"]) {
    const column = columns.get(field)!;
    const size = /^varchar\((\d+)\)$/i.exec(column.type);
    if (!size || column.nullable !== "YES") throw new Error(`Definição inesperada em ${field}; revisar antes de alterar.`);
    if (Number(size[1]) < 40) plan.push(`ALTER TABLE \`patients\` MODIFY COLUMN \`${field}\` varchar(40) NULL`);
  }
  // Optional patient fields are nullable in the actual application schema.
  for (const field of ["cpf", "cep", "address", "city", "state", "birthDate", "maritalStatusId", "genderId"]) {
    if (columns.get(field)!.nullable !== "YES") throw new Error(`${field} deve aceitar NULL; estrutura diferente da esperada.`);
  }
  const generated = columns.get("cpfForNewPatients");
  if (generated && (!generated.generated.includes("legacyImported") || !generated.generated.toLowerCase().includes("nullif"))) {
    throw new Error("cpfForNewPatients existe com expressão inesperada.");
  }
  if (!generated) plan.push("ALTER TABLE `patients` ADD COLUMN `cpfForNewPatients` varchar(100) GENERATED ALWAYS AS (CASE WHEN `legacyImported` = 0 THEN NULLIF(TRIM(`cpf`), '') ELSE NULL END) STORED");
  const guard = structure.indexes.find(i => i.name === "patients_new_cpf_unique");
  if (guard && (!guard.unique || guard.columns.join() !== "cpfForNewPatients")) throw new Error("Índice patients_new_cpf_unique incompatível.");
  if (!guard) plan.push("ALTER TABLE `patients` ADD UNIQUE INDEX `patients_new_cpf_unique` (`cpfForNewPatients`)");
  const cpfIndex = structure.indexes.find(i => i.name === "patients_cpf_idx");
  if (cpfIndex && (cpfIndex.unique || cpfIndex.columns.join() !== "cpf")) throw new Error("Índice patients_cpf_idx incompatível.");
  if (!cpfIndex) plan.push("ALTER TABLE `patients` ADD INDEX `patients_cpf_idx` (`cpf`)");
  // Add the replacement guard before removing the old one. Never drop rows.
  for (const index of structure.indexes) {
    if (index.unique && index.columns.join() === "cpf") {
      if (!/^[a-zA-Z0-9_]+$/.test(index.name)) throw new Error("Nome de índice inesperado.");
      plan.push(`ALTER TABLE \`patients\` DROP INDEX \`${index.name}\``);
    }
  }
  return plan;
}

async function inspect(db: mysql.Connection): Promise<Structure> {
  const [columns] = await db.query<RowDataPacket[]>(`SELECT COLUMN_NAME AS name, COLUMN_TYPE AS type,
    IS_NULLABLE AS nullable, GENERATION_EXPRESSION AS generationExpression FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'patients'`);
  const [indexes] = await db.query<RowDataPacket[]>(`SELECT INDEX_NAME AS name, NON_UNIQUE AS nonUnique,
    COLUMN_NAME AS col FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'patients' ORDER BY INDEX_NAME, SEQ_IN_INDEX`);
  const grouped = new Map<string, Index>();
  for (const row of indexes) {
    const index: Index = grouped.get(row.name) ?? { name: row.name, unique: row.nonUnique === 0, columns: [] };
    index.columns.push(row.col); grouped.set(row.name, index);
  }
  const [tables] = await db.query<RowDataPacket[]>("SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()");
  return { columns: columns.map(c => ({ ...c, generated: c.generationExpression ?? c.generated ?? "" })) as Column[], indexes: Array.from(grouped.values()), tables: tables.map(t => t.name) };
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("Defina DATABASE_URL para uma cópia do banco atual.");
  if (process.argv.slice(2).some(arg => arg !== "--apply")) throw new Error("Única opção aceita: --apply. Sem ela, apenas simula.");
  const db = await mysql.createConnection(process.env.DATABASE_URL);
  let locked = false;
  try {
    const [lock] = await db.query<RowDataPacket[]>("SELECT GET_LOCK(CONCAT(DATABASE(), ':personalmed'), 0) AS acquired");
    if (lock[0].acquired !== 1) throw new Error("Outra preparação já está em andamento.");
    locked = true;
    const structure = await inspect(db);
    const plan = migrationPlan(structure);
    const legacyFilter = structure.columns.some(c => c.name === "legacyImported") ? "AND legacyImported = 0" : "";
    const [duplicates] = await db.query<RowDataPacket[]>(`SELECT COUNT(*) AS groupsCount FROM
      (SELECT TRIM(cpf) FROM patients WHERE NULLIF(TRIM(cpf), '') IS NOT NULL ${legacyFilter}
      GROUP BY TRIM(cpf) HAVING COUNT(*) > 1) AS conflicts`);
    if (Number(duplicates[0].groupsCount)) throw new Error("Há CPFs repetidos entre cadastros não migrados; revisar antes da preparação. Nenhum registro foi modificado.");
    console.log(plan.length ? plan.join(";\n") + ";" : "Estrutura já preparada.");
    if (!process.argv.includes("--apply")) { console.log("SIMULAÇÃO: nenhum comando foi aplicado."); return; }
    // MySQL DDL commits implicitly. Re-running safely resumes after interruption.
    for (const statement of plan) await db.query(statement);
    if (migrationPlan(await inspect(db)).length) throw new Error("Verificação final não confirmou a estrutura.");
    console.log("Estrutura preparada e verificada; nenhum paciente foi importado.");
  } finally {
    if (locked) await db.query("SELECT RELEASE_LOCK(CONCAT(DATABASE(), ':personalmed'))");
    await db.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}

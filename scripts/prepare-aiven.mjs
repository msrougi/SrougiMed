// Explicit one-time Render build command: node --import tsx scripts/prepare-aiven.mjs
// Uses the already reviewed migration plan with verified TLS and a patient backup.
import { pathToFileURL } from 'node:url';
import { connectionConfig } from './inspect-aiven.mjs';
import { migrationPlan } from './prepare-personalmed.ts';

const identifier = name => {
  if (!/^[a-zA-Z0-9_]+$/.test(name)) throw new Error('UNEXPECTED_IDENTIFIER');
  return '`' + name + '`';
};

export async function structure(db) {
  const [columns] = await db.query(`SELECT COLUMN_NAME AS name, COLUMN_TYPE AS type,
    IS_NULLABLE AS nullable, GENERATION_EXPRESSION AS generated FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'patients'`);
  const [rows] = await db.query(`SELECT INDEX_NAME AS name, NON_UNIQUE AS nonUnique,
    COLUMN_NAME AS col FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'patients' ORDER BY INDEX_NAME, SEQ_IN_INDEX`);
  const indexes = new Map();
  for (const row of rows) {
    const index = indexes.get(row.name) ?? { name: row.name, unique: row.nonUnique === 0, columns: [] };
    index.columns.push(row.col); indexes.set(row.name, index);
  }
  const [tables] = await db.query('SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()');
  return { columns, indexes: [...indexes.values()], tables: tables.map(t => t.name) };
}

export async function prepare(db, emit, now = Date.now()) {
  const [locks] = await db.query("SELECT GET_LOCK(CONCAT(DATABASE(), ':personalmed'), 0) AS acquired");
  if (Number(locks[0].acquired) !== 1) throw new Error('MIGRATION_BUSY');
  try {
    const before = await structure(db);
    const plan = migrationPlan(before);
    if (!plan.length) { emit('already-prepared', {}); return; }
    const legacyFilter = before.columns.some(c => c.name === 'legacyImported') ? 'AND legacyImported = 0' : '';
    const [duplicates] = await db.query(`SELECT COUNT(*) AS count FROM
      (SELECT TRIM(cpf) FROM patients WHERE NULLIF(TRIM(cpf), '') IS NOT NULL ${legacyFilter}
      GROUP BY TRIM(cpf) HAVING COUNT(*) > 1) AS conflicts`);
    if (Number(duplicates[0].count)) throw new Error('EXISTING_PATIENT_CPF_CONFLICTS');

    const backup = '__srougi_patients_before_' + now;
    const columns = before.columns.filter(c => !c.generated).map(c => identifier(c.name)).join(', ');
    await db.query(`CREATE TABLE ${identifier(backup)} LIKE patients`);
    // The backup is stored in the same Aiven DB; no patient data enters build logs.
    await db.query(`INSERT INTO ${identifier(backup)} (${columns}) SELECT ${columns} FROM patients`);
    const [counts] = await db.query(`SELECT (SELECT COUNT(*) FROM patients) AS sourceCount,
      (SELECT COUNT(*) FROM ${identifier(backup)}) AS backupCount`);
    if (Number(counts[0].sourceCount) !== Number(counts[0].backupCount)) throw new Error('BACKUP_COUNT_MISMATCH');
    emit('backup', { table: backup, rows: counts[0].backupCount });
    for (const statement of plan) {
      await db.query(statement);
      emit('ddl-applied', { statement });
    }
    if (migrationPlan(await structure(db)).length) throw new Error('FINAL_STRUCTURE_MISMATCH');
    const [after] = await db.query('SELECT COUNT(*) AS count FROM patients');
    if (Number(after[0].count) !== Number(counts[0].sourceCount)) throw new Error('PATIENT_COUNT_CHANGED');
    emit('prepared', { patients: after[0].count, imported: 0 });
  } finally {
    await db.query("SELECT RELEASE_LOCK(CONCAT(DATABASE(), ':personalmed'))");
  }
}

async function main() {
  let db;
  try {
    const mysql = (await import('mysql2/promise')).default;
    db = await mysql.createConnection(connectionConfig(process.env.DATABASE_URL));
    await prepare(db, (kind, value) => console.log('[srougi-prepare]', kind, JSON.stringify(value)));
  } catch (error) {
    const known = ['DATABASE_URL_MISSING', 'UNEXPECTED_DATABASE_TARGET', 'MIGRATION_BUSY',
      'EXISTING_PATIENT_CPF_CONFLICTS', 'BACKUP_COUNT_MISMATCH', 'FINAL_STRUCTURE_MISMATCH', 'PATIENT_COUNT_CHANGED'];
    console.error('[srougi-prepare] failed', known.includes(error.message) ? error.message : (error.code || 'PREPARATION_FAILED'));
    process.exitCode = 1;
  } finally { if (db) await db.end(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

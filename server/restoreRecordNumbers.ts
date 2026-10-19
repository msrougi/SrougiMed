import type { Connection } from "mysql2/promise";
import { recordNumberSchema } from "../shared/recordNumber";

export const RECORD_NUMBER_MIGRATION = "personalmed-record-numbers-20261019-v1";
type Database = Pick<Connection, "query" | "beginTransaction" | "commit" | "rollback">;

export class RecordNumberMigrationError extends Error {
  constructor(public code: string) { super(code); }
}

// One-time migration. Original-to-target identity comes exclusively from the
// import ledger, never from names, CPFs, row order or the generated old code.
export async function restoreRecordNumbers(db: Database) {
  const [lock] = await db.query<any[]>("SELECT GET_LOCK('srougi_personalmed_import', 30) AS ok");
  if (Number(lock[0].ok) !== 1) throw new RecordNumberMigrationError("RECORD_NUMBER_MIGRATION_BUSY");
  try {
    await db.query(`CREATE TABLE IF NOT EXISTS srougi_record_number_migrations (
      id VARCHAR(80) PRIMARY KEY, changedCount INT NOT NULL, linkedCount INT NOT NULL,
      missingCount INT NOT NULL, completedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB`);
    await db.query(`CREATE TABLE IF NOT EXISTS srougi_record_number_backups (
      migrationId VARCHAR(80) NOT NULL, patientId INT NOT NULL,
      oldCode VARCHAR(10) NOT NULL, newCode VARCHAR(8) NOT NULL,
      sourceKey VARCHAR(100) NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (migrationId, patientId)
    ) ENGINE=InnoDB`);
    await db.beginTransaction();
    try {
      const [done] = await db.query<any[]>("SELECT id FROM srougi_record_number_migrations WHERE id=? FOR UPDATE", [RECORD_NUMBER_MIGRATION]);
      if (done.length) { await db.commit(); return { alreadyApplied: true, changedCount: 0 }; }
      const [patients] = await db.query<any[]>("SELECT id, code, legacyImported FROM patients ORDER BY id FOR UPDATE");
      const [tables] = await db.query<any[]>("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='srougi_personalmed_links'");
      if (!tables.length && patients.some(p => p.legacyImported)) throw new RecordNumberMigrationError("RECORD_NUMBER_SOURCE_LEDGER_MISSING");
      const [links] = tables.length ? await db.query<any[]>(`SELECT sourceKey, targetId,
        JSON_UNQUOTE(JSON_EXTRACT(original,'$.Unit')) AS sourceUnit,
        JSON_UNQUOTE(JSON_EXTRACT(original,'$.PCod')) AS sourceCode
        FROM srougi_personalmed_links WHERE entity='patient' AND targetId IS NOT NULL AND disposition='include' FOR UPDATE`) : [[]];
      const byId = new Map<number, { code: string; key: string }>();
      for (const link of links) {
        const parsed = recordNumberSchema.safeParse(String(link.sourceCode));
        if (!parsed.success || !/^\d+$/.test(String(link.sourceUnit)) || link.sourceKey !== `personalmed:Clini_01:${link.sourceUnit}:${link.sourceCode}` || byId.has(Number(link.targetId))) {
          throw new RecordNumberMigrationError("RECORD_NUMBER_SOURCE_IDENTITY_INVALID");
        }
        byId.set(Number(link.targetId), { code: parsed.data, key: link.sourceKey });
      }
      const owners = new Map<string, number>();
      const changes: Array<[string, number, string, string, string | null]> = [];
      let linkedCount = 0;
      for (const patient of patients) {
        const original = byId.get(Number(patient.id));
        if (original && !patient.legacyImported) throw new RecordNumberMigrationError("RECORD_NUMBER_TARGET_NOT_LEGACY");
        const parsed = recordNumberSchema.safeParse(original?.code ?? String(patient.code).replace(/^0+(?=\d)/, ""));
        if (!parsed.success) throw new RecordNumberMigrationError(`RECORD_NUMBER_INVALID_PATIENT_${patient.id}`);
        const code = parsed.data;
        if (owners.has(code)) throw new RecordNumberMigrationError(`RECORD_NUMBER_CONFLICT_${code}_PATIENTS_${owners.get(code)}_${patient.id}`);
        owners.set(code, Number(patient.id));
        if (original) linkedCount++;
        if (patient.code !== code) changes.push([RECORD_NUMBER_MIGRATION, patient.id, patient.code, code, original?.key ?? null]);
      }
      const missingCount = byId.size - linkedCount; // Deleted patients stay deleted.
      for (let start = 0; start < changes.length; start += 1000) {
        await db.query("INSERT INTO srougi_record_number_backups (migrationId,patientId,oldCode,newCode,sourceKey) VALUES ?", [changes.slice(start, start + 1000)]);
      }
      if (changes.length) {
        // Temporary values are outside the numeric namespace. This permits
        // cycles/swaps without ever dropping the unique code constraint.
        await db.query(`UPDATE patients p JOIN srougi_record_number_backups b ON p.id=b.patientId
          SET p.code=CONCAT('~',LOWER(CONV(p.id,10,36))), p.updatedAt=p.updatedAt WHERE b.migrationId=?`, [RECORD_NUMBER_MIGRATION]);
        await db.query(`UPDATE patients p JOIN srougi_record_number_backups b ON p.id=b.patientId
          SET p.code=b.newCode, p.updatedAt=p.updatedAt WHERE b.migrationId=?`, [RECORD_NUMBER_MIGRATION]);
        const [bad] = await db.query<any[]>(`SELECT COUNT(*) AS n FROM patients p JOIN srougi_record_number_backups b ON p.id=b.patientId
          WHERE b.migrationId=? AND p.code<>b.newCode`, [RECORD_NUMBER_MIGRATION]);
        if (Number(bad[0].n)) throw new RecordNumberMigrationError("RECORD_NUMBER_VERIFICATION_FAILED");
      }
      await db.query("INSERT INTO srougi_record_number_migrations (id,changedCount,linkedCount,missingCount) VALUES (?,?,?,?)", [RECORD_NUMBER_MIGRATION, changes.length, linkedCount, missingCount]);
      await db.commit();
      return { alreadyApplied: false, changedCount: changes.length, linkedCount, missingCount };
    } catch (error) { await db.rollback(); throw error; }
  } finally { await db.query("SELECT RELEASE_LOCK('srougi_personalmed_import')"); }
}

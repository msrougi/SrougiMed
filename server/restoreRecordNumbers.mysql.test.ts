import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mysql, { type Connection } from "mysql2/promise";
import { restoreRecordNumbers, RECORD_NUMBER_MIGRATION } from "./restoreRecordNumbers";

const url = process.env.SROUGI_TEST_DATABASE_URL;
if (url) {
  const parsed = new URL(url);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) || !/^\/srougi_test_[a-z0-9_]+$/.test(parsed.pathname)) throw new Error("Use only a disposable localhost test database");
}
describe.skipIf(!url)("restauração dos prontuários em MySQL isolado", () => {
  let db: Connection;
  beforeAll(async () => {
    const parsed = new URL(url!); const database = parsed.pathname.slice(1) + "_records";
    parsed.pathname = "/";
    db = await mysql.createConnection(parsed.toString());
    await db.query(`CREATE DATABASE IF NOT EXISTS \`${database}\``);
    await db.query(`USE \`${database}\``);
    await db.query(`CREATE TABLE IF NOT EXISTS patients (id INT PRIMARY KEY, code VARCHAR(10) NOT NULL UNIQUE,
      legacyImported BOOLEAN NOT NULL, name VARCHAR(200), notes TEXT,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB`);
    await db.query(`CREATE TABLE IF NOT EXISTS srougi_personalmed_links (sourceKey VARCHAR(100) PRIMARY KEY,
      entity VARCHAR(20), targetId INT, original LONGTEXT, disposition VARCHAR(30)) ENGINE=InnoDB`);
  });
  beforeEach(async () => {
    for (const table of ["srougi_record_number_backups", "srougi_record_number_migrations"]) {
      await db.query(`CREATE TABLE IF NOT EXISTS \`${table}\` (placeholder INT)`);
      await db.query(`DROP TABLE \`${table}\``);
    }
    await db.query("DELETE FROM srougi_personalmed_links");
    await db.query("DELETE FROM patients");
  });
  afterAll(async () => { await db?.end(); });
  const patient = (id: number, code: string, legacy = true) => db.query("INSERT INTO patients(id,code,legacyImported,name,notes,updatedAt) VALUES (?,?,?,'Fixture','Observação preservada','2020-01-01 00:00:00')", [id, code, legacy]);
  const link = (id: number, code: number, unit = 0) => db.query("INSERT INTO srougi_personalmed_links(sourceKey,entity,targetId,original,disposition) VALUES (?,'patient',?,?,'include')", [`personalmed:Clini_01:${unit}:${code}`, id, JSON.stringify({ Unit: unit, PCod: code })]);

  it("restaura o número antigo, mantém o ID e os demais dados e preserva excluídos", async () => {
    await patient(10, "000045510"); await link(10, 48612); await link(99, 22222);
    const [before] = await db.query<any[]>("SELECT * FROM patients");
    await expect(restoreRecordNumbers(db)).resolves.toMatchObject({ changedCount: 1, linkedCount: 1, missingCount: 1 });
    const [after] = await db.query<any[]>("SELECT * FROM patients");
    expect(after).toEqual([{ ...before[0], code: "48612" }]);
    const [backup] = await db.query<any[]>("SELECT patientId,oldCode,newCode FROM srougi_record_number_backups");
    expect(backup).toEqual([{ patientId: 10, oldCode: "000045510", newCode: "48612" }]);
  });
  it("resolve ciclos de números sem remover a restrição de unicidade", async () => {
    await patient(1, "1"); await patient(2, "2"); await link(1, 2); await link(2, 1);
    await restoreRecordNumbers(db);
    const [rows] = await db.query<any[]>("SELECT id,code FROM patients ORDER BY id");
    expect(rows).toEqual([{ id: 1, code: "2" }, { id: 2, code: "1" }]);
  });
  it("não sobrescreve alterações manuais em inicializações futuras", async () => {
    await patient(1, "000000001"); await link(1, 48612); await restoreRecordNumbers(db);
    await db.query("UPDATE patients SET code='9999' WHERE id=1");
    await expect(restoreRecordNumbers(db)).resolves.toMatchObject({ alreadyApplied: true });
    const [rows] = await db.query<any[]>("SELECT code FROM patients WHERE id=1");
    expect(rows[0].code).toBe("9999");
  });
  it("bloqueia colisão com paciente sem vínculo antes de alterar os números", async () => {
    await patient(1, "000000001"); await link(1, 48612); await patient(2, "000048612", false);
    await expect(restoreRecordNumbers(db)).rejects.toThrow("RECORD_NUMBER_CONFLICT");
    const [rows] = await db.query<any[]>("SELECT code FROM patients ORDER BY id");
    expect(rows.map(x => x.code)).toEqual(["000000001", "000048612"]);
    const [markers] = await db.query<any[]>("SELECT * FROM srougi_record_number_migrations");
    expect(markers).toEqual([]);
  });
  it("reverte tudo se houver falha depois dos números temporários", async () => {
    await patient(1, "000000001"); await link(1, 48612);
    const proxy = {
      beginTransaction: () => db.beginTransaction(), commit: () => db.commit(), rollback: () => db.rollback(),
      query: ((sql: any, params: any) => {
        if (typeof sql === "string" && sql.includes("SET p.code=b.newCode")) throw new Error("simulated failure");
        return db.query(sql, params);
      }) as Connection["query"],
    };
    await expect(restoreRecordNumbers(proxy)).rejects.toThrow("simulated failure");
    const [rows] = await db.query<any[]>("SELECT code FROM patients"); expect(rows[0].code).toBe("000000001");
    const [backups] = await db.query<any[]>("SELECT * FROM srougi_record_number_backups"); expect(backups).toEqual([]);
  });
  it("restaura um lote completo de 46.023 prontuários pelo vínculo de origem", async () => {
    const total = 46023;
    for (let start = 1; start <= total; start += 1000) {
      const patients = [], links = [];
      for (let id = start; id <= Math.min(total, start + 999); id++) {
        const sourceCode = id === 45510 ? 48612 : id + 2000;
        patients.push([id, String(id).padStart(9, "0"), true, "Fixture", "Preservado", "2020-01-01 00:00:00"]);
        links.push([`personalmed:Clini_01:0:${sourceCode}`, "patient", id, JSON.stringify({ Unit: 0, PCod: sourceCode }), "include"]);
      }
      await db.query("INSERT INTO patients(id,code,legacyImported,name,notes,updatedAt) VALUES ?", [patients]);
      await db.query("INSERT INTO srougi_personalmed_links(sourceKey,entity,targetId,original,disposition) VALUES ?", [links]);
    }
    await expect(restoreRecordNumbers(db)).resolves.toMatchObject({ changedCount: total, linkedCount: total });
    const [bad] = await db.query<any[]>("SELECT COUNT(*) AS n FROM patients p JOIN srougi_personalmed_links l ON p.id=l.targetId WHERE p.code<>JSON_UNQUOTE(JSON_EXTRACT(l.original,'$.PCod')) OR p.notes<>'Preservado' OR p.updatedAt<>'2020-01-01 00:00:00'");
    expect(Number(bad[0].n)).toBe(0);
    const [sample] = await db.query<any[]>("SELECT code FROM patients WHERE id=45510");
    expect(sample[0].code).toBe("48612");
  }, 60000);
  it("normaliza apenas zeros à esquerda de cadastros sem vínculo", async () => {
    await patient(1, "000001234", false);
    await expect(restoreRecordNumbers(db)).resolves.toMatchObject({ changedCount: 1, linkedCount: 0 });
    const [rows] = await db.query<any[]>("SELECT code FROM patients"); expect(rows[0].code).toBe("1234");
  });
});

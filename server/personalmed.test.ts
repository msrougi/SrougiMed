import { describe, expect, it } from "vitest";
import { migrationPlan, type Structure } from "../scripts/prepare-personalmed";
import { patientImportSchema, cpfChanged } from "../shared/patientImport";

function currentStructure(): Structure {
  const fields = ["id", "name", "code", "address", "cep", "phone", "mobile", "cpf", "city", "state",
    "birthDate", "maritalStatusId", "genderId", "skinColorId", "createdAt", "updatedAt"];
  return {
    columns: fields.map(name => ({ name, type: ["phone", "mobile"].includes(name) ? "varchar(20)" : "varchar(100)", nullable: "YES", generated: "" })),
    indexes: [{ name: "patients_cpf_unique", unique: true, columns: ["cpf"] }],
    tables: ["patients", "phone_book", "genders", "marital_statuses", "skin_colors"],
  };
}

describe("Preparação da estrutura para PersonalMed", () => {
  it("recusa o dump antigo antes de gerar alterações", () => {
    const structure = currentStructure();
    structure.columns = structure.columns.filter(c => c.name !== "mobile");
    expect(() => migrationPlan(structure)).toThrow("incompatível");
  });
  it("protege novos CPFs antes de remover a restrição que bloqueia o legado", () => {
    const plan = migrationPlan(currentStructure());
    const add = plan.findIndex(s => s.includes("ADD UNIQUE INDEX"));
    const drop = plan.findIndex(s => s.includes("DROP INDEX"));
    expect(add).toBeGreaterThan(-1);
    expect(drop).toBeGreaterThan(add);
    expect(plan.filter(s => s.includes("MODIFY COLUMN") && s.includes("varchar(60)")).length).toBe(2);
    expect(plan.some(s => /DELETE|UPDATE|TRUNCATE/.test(s))).toBe(false);
  });
  it("não depende da existência da migração manual de CPF", () => {
    const structure = currentStructure(); structure.indexes = [];
    expect(migrationPlan(structure).some(s => s.includes("DROP INDEX"))).toBe(false);
  });
  it("pode ser repetido e nunca reduz campos já maiores", () => {
    const structure = currentStructure();
    structure.columns.forEach(c => { if (["phone", "mobile"].includes(c.name)) c.type = "varchar(80)"; });
    structure.columns.push({ name: "legacyImported", type: "tinyint(1)", nullable: "NO", generated: "" },
      { name: "district", type: "varchar(100)", nullable: "YES", generated: "" },
      { name: "motherName", type: "varchar(200)", nullable: "YES", generated: "" },
      { name: "fatherName", type: "varchar(200)", nullable: "YES", generated: "" },
      { name: "responsibleName", type: "varchar(200)", nullable: "YES", generated: "" },
      { name: "responsiblePhone", type: "varchar(40)", nullable: "YES", generated: "" },
      { name: "cpfForNewPatients", type: "varchar(100)", nullable: "YES", generated: "case when legacyImported = 0 then nullif(trim(cpf), '') else null end" });
    structure.indexes = [{ name: "patients_new_cpf_unique", unique: true, columns: ["cpfForNewPatients"] },
      { name: "patients_cpf_idx", unique: false, columns: ["cpf"] }];
    expect(migrationPlan(structure)).toEqual([]);
  });
  it("recusa índices inesperados sem removê-los", () => {
    const structure = currentStructure();
    structure.indexes.push({ name: "patients_new_cpf_unique", unique: false, columns: ["name"] });
    expect(() => migrationPlan(structure)).toThrow("incompatível");
  });
  it("adiciona bairro opcional e recusa um campo existente incompatível", () => {
    const structure = currentStructure();
    expect(migrationPlan(structure)).toContain("ALTER TABLE `patients` ADD COLUMN `district` varchar(100) NULL AFTER `address`");
    structure.columns.push({ name: "district", type: "varchar(20)", nullable: "YES", generated: "" });
    expect(() => migrationPlan(structure)).toThrow("district existe");
  });
});

describe("Dados incompletos e CPFs do legado", () => {
  it("aceita somente nome e mantém ausências explícitas", () => {
    expect(patientImportSchema.parse({ name: "Paciente de teste", cpf: null, genderId: null })).toEqual({
      name: "Paciente de teste", cpf: null, genderId: null,
    });
    expect(patientImportSchema.safeParse({ name: " " }).success).toBe(false);
    expect(patientImportSchema.safeParse({ name: "Teste", genderId: 0 }).success).toBe(false);
  });
  it("preserva texto livre nos três campos de contato e recusa excesso sem truncar", () => {
    const phone = "(11) 1111-1111 / (11) 2222-2222 ramal 12";
    expect(patientImportSchema.parse({ name: "Teste", phone }).phone).toBe(phone);
    const freeText = "ramal A/B +55 (11) 99999-9999 #recepção";
    expect(patientImportSchema.parse({ name: "Teste", phone: freeText, mobile: freeText, fax: freeText })).toMatchObject({
      phone: freeText, mobile: freeText, fax: freeText,
    });
    for (const field of ["phone", "mobile", "fax"] as const) {
      expect(patientImportSchema.safeParse({ name: "Teste", [field]: "x".repeat(61) }).success).toBe(false);
    }
  });
  it("cliente não pode definir o marcador de migração", () => {
    expect(patientImportSchema.parse({ name: "Teste", legacyImported: true })).not.toHaveProperty("legacyImported");
  });
  it("permite manter CPF legado repetido sem confundir mudança de formatação", () => {
    expect(cpfChanged("123.456.789-00", "12345678900")).toBe(false);
    expect(cpfChanged("12345678900", "12345678901")).toBe(true);
  });
});

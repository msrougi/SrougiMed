import {describe,expect,it,vi} from "vitest";
import {preparePatientContactFields} from "./preparePatientContactFields";

function fake(columns:Array<{name:string;dataType:string;columnType:string;nullable:string}>){
  const calls:string[]=[];
  const db={query:vi.fn(async(sql:string)=>{calls.push(sql);if(sql.includes("GET_LOCK"))return [[{ok:1}]];if(sql.includes("information_schema.COLUMNS"))return [columns];return [{}];})};
  return {db:db as any,calls};
}

describe("capacidade dos campos de contato do paciente",()=>{
  it("amplia telefone e celular sem executar UPDATE, DELETE ou TRUNCATE",async()=>{
    const {db,calls}=fake([
      {name:"phone",dataType:"varchar",columnType:"varchar(40)",nullable:"YES"},
      {name:"mobile",dataType:"varchar",columnType:"varchar(20)",nullable:"YES"},
      {name:"fax",dataType:"text",columnType:"text",nullable:"YES"},
    ]);
    await expect(preparePatientContactFields(db)).resolves.toEqual({widened:["phone","mobile"]});
    expect(calls.filter(sql=>sql.startsWith("ALTER TABLE"))).toEqual([
      "ALTER TABLE patients MODIFY COLUMN `phone` VARCHAR(60) NULL",
      "ALTER TABLE patients MODIFY COLUMN `mobile` VARCHAR(60) NULL",
    ]);
    expect(calls.some(sql=>/^(UPDATE|DELETE|TRUNCATE)\b/i.test(sql))).toBe(false);
    expect(calls.at(-1)).toContain("RELEASE_LOCK");
  });
  it("é repetível e nunca reduz campos maiores nem converte Fax TEXT",async()=>{
    const {db,calls}=fake([
      {name:"phone",dataType:"varchar",columnType:"varchar(80)",nullable:"YES"},
      {name:"mobile",dataType:"varchar",columnType:"varchar(60)",nullable:"YES"},
      {name:"fax",dataType:"text",columnType:"text",nullable:"YES"},
    ]);
    await expect(preparePatientContactFields(db)).resolves.toEqual({widened:[]});
    expect(calls.some(sql=>sql.startsWith("ALTER TABLE"))).toBe(false);
  });
  it("recusa estrutura incompleta antes de alterar qualquer coluna",async()=>{
    const {db,calls}=fake([
      {name:"phone",dataType:"varchar",columnType:"varchar(40)",nullable:"YES"},
      {name:"mobile",dataType:"varchar",columnType:"varchar(40)",nullable:"YES"},
    ]);
    await expect(preparePatientContactFields(db)).rejects.toThrow("PATIENT_CONTACT_FIELD_MISSING_FAX");
    expect(calls.some(sql=>sql.startsWith("ALTER TABLE"))).toBe(false);
  });
});

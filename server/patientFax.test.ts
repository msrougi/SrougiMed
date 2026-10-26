import {describe,expect,it,vi} from "vitest";
import {preparePatientFax} from "./preparePatientFax";
import {patientImportSchema} from "../shared/patientImport";
import {parseCSV} from "../client/src/lib/importUtils";
import {patientsToCSV} from "../client/src/lib/exportUtils";

function fake(options:{column?:{dataType:string;nullable:string};done?:boolean}={}){
  const calls:string[]=[];
  const db={
    beginTransaction:vi.fn(async()=>{}),commit:vi.fn(async()=>{}),rollback:vi.fn(async()=>{}),
    query:vi.fn(async(sql:string)=>{
      calls.push(sql);
      if(sql.includes("GET_LOCK"))return [[{ok:1}]];
      if(sql.includes("information_schema.COLUMNS"))return [[...(options.column?[options.column]:[])]];
      if(sql.startsWith("ALTER TABLE") || sql.startsWith("CREATE TABLE"))return [{}];
      if(sql.startsWith("SELECT name FROM srougi_data_migrations"))return [[...(options.done?[{name:"recover_personalmed_fax_v1"}]:[])]];
      if(sql.includes("information_schema.TABLES"))return [[{name:"srougi_personalmed_links"}]];
      if(sql.startsWith("SELECT COUNT(*)") && sql.includes("NULLIF(TRIM(p.fax)"))return [[{total:0}]];
      if(sql.startsWith("SELECT COUNT(*)"))return [[{total:2}]];
      if(sql.startsWith("UPDATE patients"))return [{affectedRows:2}];
      return [{}];
    }),
  };
  return {db:db as any,calls};
}

describe("recuperação do Fax do PersonalMed",()=>{
  it("cria a coluna e recupera pelo targetId uma única vez sem tocar updatedAt",async()=>{
    const {db,calls}=fake();
    await expect(preparePatientFax(db)).resolves.toEqual({alreadyApplied:false,sourceRows:2,recovered:2});
    const update=calls.find(sql=>sql.startsWith("UPDATE patients"))!;
    expect(update).toContain("l.targetId=p.id");expect(update).toContain("original,'$.FAX'");expect(update).toContain("JSON_TYPE");expect(update).toContain("p.updatedAt=p.updatedAt");
    expect(update).not.toMatch(/name|cpf/i);expect(db.commit).toHaveBeenCalledOnce();
  });
  it("não repete o preenchimento depois do marcador",async()=>{
    const {db,calls}=fake({column:{dataType:"text",nullable:"YES"},done:true});
    await expect(preparePatientFax(db)).resolves.toEqual({alreadyApplied:true,sourceRows:0,recovered:0});
    expect(calls.some(sql=>sql.startsWith("UPDATE patients"))).toBe(false);
  });
  it("aceita, importa e exporta Fax em campo separado",()=>{
    expect(patientImportSchema.parse({name:"Teste",fax:"11 3333-4444"}).fax).toBe("11 3333-4444");
    expect(parseCSV("Nome,Fax,Telefone\nTeste,11 3333-4444,11 1111-2222")).toEqual([{name:"Teste",fax:"11 3333-4444",phone:"11 1111-2222"}]);
    const csv=patientsToCSV([{id:1,name:"Teste",fax:"11 3333-4444",phone:"11 1111-2222"}]);
    expect(csv).toContain("Telefone,Celular,Fax");expect(csv).toContain("11 1111-2222,,11 3333-4444");
  });
});


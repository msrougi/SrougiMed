import type { Connection, RowDataPacket } from "mysql2/promise";

const FIELDS = ["phone", "mobile", "fax"] as const;
type Column = RowDataPacket & { name:string; dataType:string; columnType:string; nullable:"YES"|"NO" };
export type PatientContactFieldsResult = { widened:Array<"phone"|"mobile"|"fax"> };

// Additive and idempotent: only enlarges VARCHAR columns and never rewrites rows.
// Fax may already be TEXT, which is deliberately left untouched.
export async function preparePatientContactFields(db:Pick<Connection,"query">):Promise<PatientContactFieldsResult> {
  const [lock]=await db.query<RowDataPacket[]>("SELECT GET_LOCK('srougi_patient_contact_fields_v1',30) AS ok");
  if(Number(lock[0]?.ok)!==1)throw new Error("PATIENT_CONTACT_FIELDS_BUSY");
  const widened:PatientContactFieldsResult["widened"]=[];
  try{
    const [rows]=await db.query<Column[]>(`SELECT COLUMN_NAME AS name,DATA_TYPE AS dataType,
      COLUMN_TYPE AS columnType,IS_NULLABLE AS nullable FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='patients'
        AND COLUMN_NAME IN ('phone','mobile','fax')`);
    const columns=new Map(rows.map(row=>[row.name,row]));
    // Validate the complete shape before issuing any DDL.
    for(const field of FIELDS){
      const column=columns.get(field);
      if(!column)throw new Error(`PATIENT_CONTACT_FIELD_MISSING_${field.toUpperCase()}`);
      if(column.nullable!=="YES")throw new Error(`PATIENT_CONTACT_FIELD_NOT_NULLABLE_${field.toUpperCase()}`);
      if(column.dataType.toLowerCase()==="varchar"){
        if(!/^varchar\((\d+)\)$/i.test(column.columnType))throw new Error(`PATIENT_CONTACT_FIELD_INVALID_${field.toUpperCase()}`);
      }else if(!["text","mediumtext","longtext"].includes(column.dataType.toLowerCase())){
        throw new Error(`PATIENT_CONTACT_FIELD_INVALID_${field.toUpperCase()}`);
      }
    }
    for(const field of FIELDS){
      const column=columns.get(field)!;
      if(column.dataType.toLowerCase()!=="varchar")continue;
      const size=Number(/^varchar\((\d+)\)$/i.exec(column.columnType)![1]);
      if(size<60){await db.query(`ALTER TABLE patients MODIFY COLUMN \`${field}\` VARCHAR(60) NULL`);widened.push(field);}
    }
    return {widened};
  }finally{await db.query("SELECT RELEASE_LOCK('srougi_patient_contact_fields_v1')");}
}

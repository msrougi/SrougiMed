import type { PoolConnection,ResultSetHeader,RowDataPacket } from "mysql2/promise";

const MIGRATION="recover_personalmed_fax_v1";

// Additive and repeatable. The source/target link created by the original import
// is authoritative, so names, CPFs and row positions are never used for matching.
export async function preparePatientFax(db:Pick<PoolConnection,"query"|"beginTransaction"|"commit"|"rollback">){
  const [lock]=await db.query<RowDataPacket[]>("SELECT GET_LOCK('srougi_patient_fax_v1',30) AS ok");
  if(Number(lock[0]?.ok)!==1)throw new Error("PATIENT_FAX_SCHEMA_BUSY");
  try{
    const [columns]=await db.query<RowDataPacket[]>(`SELECT DATA_TYPE AS dataType,IS_NULLABLE AS nullable
      FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='patients' AND COLUMN_NAME='fax'`);
    if(!columns.length)await db.query("ALTER TABLE patients ADD COLUMN fax TEXT NULL AFTER mobile");
    else if(!["text","mediumtext","longtext"].includes(String(columns[0].dataType).toLowerCase()) || columns[0].nullable!=="YES")throw new Error("PATIENT_FAX_COLUMN_INCOMPATIBLE");
    await db.query(`CREATE TABLE IF NOT EXISTS srougi_data_migrations (
      name VARCHAR(100) CHARACTER SET ascii NOT NULL PRIMARY KEY,
      details JSON NOT NULL, completedAt TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`);
    const [done]=await db.query<RowDataPacket[]>("SELECT name FROM srougi_data_migrations WHERE name=?",[MIGRATION]);
    if(done.length)return {alreadyApplied:true,sourceRows:0,recovered:0};
    const [tables]=await db.query<RowDataPacket[]>("SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='srougi_personalmed_links'");
    if(!tables.length)throw new Error("PATIENT_FAX_SOURCE_LINKS_MISSING");
    const sourceValue=`NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(l.original,'$.FAX'))),'')`;
    const sourceFilter=`l.entity='patient' AND l.targetId IS NOT NULL AND JSON_TYPE(JSON_EXTRACT(l.original,'$.FAX')) IN ('STRING','INTEGER','DOUBLE') AND ${sourceValue} IS NOT NULL`;
    const [source]=await db.query<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM srougi_personalmed_links l JOIN patients p ON p.id=l.targetId WHERE ${sourceFilter}`);
    await db.beginTransaction();
    try{
      const [result]=await db.query<ResultSetHeader>(`UPDATE patients p JOIN srougi_personalmed_links l ON l.targetId=p.id
        SET p.fax=${sourceValue},p.updatedAt=p.updatedAt
        WHERE ${sourceFilter} AND NULLIF(TRIM(p.fax),'') IS NULL`);
      const [remaining]=await db.query<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM srougi_personalmed_links l JOIN patients p ON p.id=l.targetId
        WHERE ${sourceFilter} AND NULLIF(TRIM(p.fax),'') IS NULL`);
      if(Number(remaining[0]?.total)!==0)throw new Error("PATIENT_FAX_RECOVERY_INCOMPLETE");
      const details={sourceRows:Number(source[0]?.total||0),recovered:Number(result.affectedRows||0)};
      await db.query("INSERT INTO srougi_data_migrations(name,details) VALUES(?,?)",[MIGRATION,JSON.stringify(details)]);
      await db.commit();return {alreadyApplied:false,...details};
    }catch(error){await db.rollback();throw error;}
  }finally{await db.query("SELECT RELEASE_LOCK('srougi_patient_fax_v1')");}
}


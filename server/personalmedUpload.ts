// Private staging of immutable, explicitly authorized migration inputs.
// No access to patients, contacts, users or downloadable source data.
import { createHash } from "node:crypto";
import mysql from "mysql2/promise";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { connectionConfig } from "../scripts/inspect-aiven.mjs";
import { sourceFiles, chunkSize } from "../shared/personalmedUpload";
const key = z.enum(["backup", "patients", "backup_updated"]);
async function connect() {
 const db = await mysql.createConnection(connectionConfig(process.env.DATABASE_URL));
 await db.query(`CREATE TABLE IF NOT EXISTS srougi_personalmed_upload_chunks (
 fileKey VARCHAR(16) NOT NULL, part INT UNSIGNED NOT NULL, digest CHAR(64) NOT NULL,
 payload MEDIUMBLOB NOT NULL, PRIMARY KEY(fileKey, part)) ENGINE=InnoDB`);
 await db.query(`CREATE TABLE IF NOT EXISTS srougi_personalmed_uploads (
 fileKey VARCHAR(16) PRIMARY KEY, digest CHAR(64) NOT NULL, bytes INT UNSIGNED NOT NULL,
 uploadedBy INT NOT NULL, completedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB`);
 return db;
}
export const migrationUpload = router({
 status: protectedProcedure.query(async () => {
 const db = await connect();
 try {
 const [parts]:any = await db.query("SELECT fileKey,SUM(OCTET_LENGTH(payload)) AS bytes FROM srougi_personalmed_upload_chunks GROUP BY fileKey");
 const [completed]:any = await db.query("SELECT fileKey,digest,bytes FROM srougi_personalmed_uploads");
 return (Object.keys(sourceFiles) as (keyof typeof sourceFiles)[]).map(key => ({
 key, bytes: Number(parts.find((row:any) => row.fileKey === key)?.bytes ?? 0),
 verified: completed.some((row:any) => row.fileKey === key && row.digest === sourceFiles[key].sha256 && row.bytes === sourceFiles[key].bytes)
 }));
 } finally { await db.end(); }
 }),
 put: protectedProcedure.input(z.object({key,part:z.number().int().min(0).max(1023),
 data:z.string().max(Math.ceil(chunkSize/3)*4).regex(/^[A-Za-z0-9+/]+={0,2}$/)}))
 .mutation(async ({input}) => {
 const spec = sourceFiles[input.key];
 const start = input.part * chunkSize;
 const bytes = Buffer.from(input.data,"base64");
 if (start >= spec.bytes || bytes.length !== Math.min(chunkSize,spec.bytes-start) || bytes.toString("base64") !== input.data) throw new Error("Parte inválida");
 const digest=createHash("sha256").update(bytes).digest("hex");
 const db=await connect();
 try {
 // Completed uploads are immutable; same chunks can be retried safely.
 const [existing]:any=await db.query("SELECT digest FROM srougi_personalmed_upload_chunks WHERE fileKey=? AND part=?",[input.key,input.part]);
 if(existing.length){if(existing[0].digest!==digest)throw new Error("Parte diferente da já recebida");return {received:true};}
 const [done]:any=await db.query("SELECT fileKey FROM srougi_personalmed_uploads WHERE fileKey=?",[input.key]);
 if(done.length)throw new Error("Arquivo já concluído");
 await db.query("INSERT INTO srougi_personalmed_upload_chunks (fileKey,part,digest,payload) VALUES (?,?,?,?)",[input.key,input.part,digest,bytes]);
 return {received:true};
 }finally{await db.end();}
 }),
 finish: protectedProcedure.input(z.object({key})).mutation(async({input,ctx})=>{
 const db=await connect();
 try {
 const [rows]:any=await db.query("SELECT part,payload FROM srougi_personalmed_upload_chunks WHERE fileKey=? ORDER BY part",[input.key]);
 const hash=createHash("sha256");let bytes=0;
 for(let i=0;i<rows.length;i++){if(rows[i].part!==i)throw new Error("Faltam partes");hash.update(rows[i].payload);bytes+=rows[i].payload.length;}
 const spec=sourceFiles[input.key];
 if(bytes!==spec.bytes||hash.digest("hex")!==spec.sha256)throw new Error("Arquivo não corresponde ao backup autorizado");
 await db.query("INSERT IGNORE INTO srougi_personalmed_uploads (fileKey,digest,bytes,uploadedBy) VALUES (?,?,?,?)",[input.key,spec.sha256,bytes,ctx.user.id]);
 return {verified:true,bytes};
 }finally{await db.end();}
 })
});

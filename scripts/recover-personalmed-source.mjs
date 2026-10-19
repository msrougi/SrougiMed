// Operator-only extraction into private staging. Never inserts into app patients/phone_book.
import mysql from 'mysql2/promise';
import {connectionConfig} from './inspect-aiven.mjs';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
const sourceHash='8cc126daf6f501b22ff8808498deab9c84af0701d5ff5cd1d20608d67004ccbc';
const backupHash='29bd06ab34e5caf4a9589de72e52bd37482f9943cb4b56d52b1dabee9d48bc16';
const sha=data=>createHash('sha256').update(data).digest('hex');
const emit=(stage,data)=>console.log('[personalmed-extract]',stage,JSON.stringify(data));
const identifier=name=>'['+name.replaceAll(']',']]')+']';
const literal=value=>"N'"+value.replaceAll("'","''")+"'";
const command=(cmd,args,cwd)=>new Promise((resolve,reject)=>{
 const child=spawn(cmd,args,{cwd,env:{PATH:process.env.PATH,HOME:process.env.HOME},stdio:'ignore'});
 const timer=setTimeout(()=>child.kill('SIGKILL'),180000);
 child.on('error',()=>{clearTimeout(timer);reject(new Error('RECOVERY_TOOL_UNAVAILABLE'));});
 child.on('close',code=>{clearTimeout(timer);code===0?resolve():reject(new Error('RECOVERY_TOOL_FAILED'));});
});
export async function recoverPersonalMed(root,password){
 let db,tds;
 try{
 db=await mysql.createConnection(connectionConfig(process.env.DATABASE_URL));
 const [metadata]=await db.query("SELECT digest,bytes FROM srougi_personalmed_uploads WHERE fileKey='backup_updated'");
 if(metadata.length!==1||metadata[0].digest!==sourceHash||metadata[0].bytes!==33286227)throw new Error('UPDATED_SOURCE_NOT_VERIFIED');
 const [chunks]=await db.query("SELECT part,payload FROM srougi_personalmed_upload_chunks WHERE fileKey='backup_updated' ORDER BY part");
 if(chunks.length!==127||chunks.some((r,i)=>r.part!==i))throw new Error('UPDATED_SOURCE_INCOMPLETE');
 const zipped=Buffer.concat(chunks.map(r=>r.payload));if(zipped.length!==33286227||sha(zipped)!==sourceHash)throw new Error('UPDATED_SOURCE_HASH_CHANGED');
 const zipFile=join(root,'source.zip'),bakFile=join(root,'source.bak');
 await writeFile(zipFile,zipped,{mode:0o600});
 await command('python3',['-c',"import zipfile,sys,hashlib; z=zipfile.ZipFile(sys.argv[1]); assert z.namelist()==['backuppmsql.bak']; b=z.read('backuppmsql.bak'); assert len(b)==194363392 and hashlib.sha256(b).hexdigest()=='"+backupHash+"'; open(sys.argv[2],'wb').write(b)",zipFile,bakFile],root);
 emit('source',{archiveVerified:true,backupVerified:true});
 const clientDir=join(root,'client');await (await import('node:fs/promises')).mkdir(clientDir,{mode:0o700});
 await writeFile(join(clientDir,'package.json'),'{"private":true}',{mode:0o600});
 await command('npm',['install','--ignore-scripts','--no-audit','--no-fund','--save-exact','tedious@18.6.1'],clientDir);
 const require=createRequire(join(clientDir,'package.json'));const {Connection,Request}=require('tedious');
 tds=new Connection({server:'127.0.0.1',authentication:{type:'default',options:{userName:'sa',password}},options:{port:15433,encrypt:false,trustServerCertificate:false,useUTC:true,connectTimeout:15000,requestTimeout:300000}});
 tds.on('error',()=>{});
 await new Promise((resolve,reject)=>tds.connect(error=>error?reject(new Error('SQLSERVER_CONNECT_FAILED')):resolve()));
 const sql=query=>new Promise((resolve,reject)=>{
 const rows=[];const request=new Request(query,error=>error?reject(new Error('SQLSERVER_QUERY_FAILED')):resolve(rows));
 request.on('row',columns=>rows.push(Object.fromEntries(columns.map(c=>[c.metadata.colName,c.value]))));tds.execSql(request);
 });
 const header=await sql('RESTORE HEADERONLY FROM DISK='+literal(bakFile));
 if(header.length!==1||header[0].BackupType!==1)throw new Error('EXPECTED_SINGLE_FULL_BACKUP');
 await sql('RESTORE VERIFYONLY FROM DISK='+literal(bakFile));
 const files=await sql('RESTORE FILELISTONLY FROM DISK='+literal(bakFile));
 if(!files.length||files.some(file=>!['D','L'].includes(file.Type)))throw new Error('UNSUPPORTED_BACKUP_FILES');
 const moves=files.map((file,i)=>'MOVE '+literal(file.LogicalName)+' TO '+literal(join(root,'data',`source_${i}.${file.Type==='L'?'ldf':'mdf'}`))).join(',');
 await sql('RESTORE DATABASE [PersonalMedMigration] FROM DISK='+literal(bakFile)+' WITH '+moves+',RECOVERY');
 const integrity=await sql('DBCC CHECKDB([PersonalMedMigration]) WITH NO_INFOMSGS,ALL_ERRORMSGS');if(integrity.length)throw new Error('SQLSERVER_INTEGRITY_ERRORS');
 const source={};
 for(const table of ['Clini_01','AGFONE']){
 const columns=await sql(`USE [PersonalMedMigration]; SELECT c.name,t.name AS [type] FROM sys.columns c JOIN sys.types t ON c.user_type_id=t.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.${table}') ORDER BY c.column_id`);
 if(!columns.length)throw new Error('SOURCE_TABLE_MISSING');
 const binary=new Set(['binary','varbinary','image','timestamp','rowversion']);
 const dates=new Set(['date','datetime','datetime2','smalldatetime','time','datetimeoffset']);
 const exactNumbers=new Set(['bigint','decimal','numeric','money','smallmoney']);
 const supported=new Set([...binary,...dates,...exactNumbers,'bit','int','smallint','tinyint','varchar','nvarchar','char','nchar','text','ntext','uniqueidentifier','float','real']);
 if(columns.some(c=>!supported.has(c.type)))throw new Error('UNSUPPORTED_SOURCE_TYPE');
 const select=columns.map(c=>{const col=identifier(c.name);return binary.has(c.type)?`CONVERT(varchar(max),${col},2) AS ${col}`:dates.has(c.type)?`CONVERT(varchar(40),${col},126) AS ${col}`:exactNumbers.has(c.type)?`CONVERT(varchar(100),${col}) AS ${col}`:col;}).join(',');
 const order=table==='Clini_01'?'[Unit],[PCod]':'[AGENDAFONECODE]';
 const rows=await sql(`USE [PersonalMedMigration]; SELECT ${select} FROM dbo.${identifier(table)} ORDER BY ${order} FOR JSON PATH,INCLUDE_NULL_VALUES`);
 const data=JSON.parse(rows.map(row=>Object.values(row)[0]).join(''));
 if(!Array.isArray(data)||!data.length)throw new Error('SOURCE_TABLE_EMPTY');
 for(const row of data)for(const col of columns)if(binary.has(col.type)&&row[col.name]!==null)row[col.name]={$binary_hex:String(row[col.name]).toLowerCase()};
 source[table]=data;
 }
 const {planPatient}=await import('./plan-personalmed.mjs');
 const patients=source.Clini_01.map(raw=>{const plan=planPatient(raw);return {key:plan.key,raw};});
 const contacts=source.AGFONE.map(raw=>{if(!Number.isSafeInteger(raw.AGENDAFONECODE))throw new Error('INVALID_CONTACT_KEY');return {key:'personalmed:AGFONE:'+raw.AGENDAFONECODE,raw};});
 for(const rows of [patients,contacts])if(new Set(rows.map(r=>r.key)).size!==rows.length)throw new Error('DUPLICATE_SOURCE_KEY');
 await db.query(`CREATE TABLE IF NOT EXISTS srougi_personalmed_extracted (sourceHash CHAR(64) NOT NULL,entity VARCHAR(20) NOT NULL,sourceKey VARCHAR(100) NOT NULL,rawHash CHAR(64) NOT NULL,payload LONGTEXT NOT NULL,PRIMARY KEY(sourceHash,entity,sourceKey)) ENGINE=InnoDB`);
 await db.query(`CREATE TABLE IF NOT EXISTS srougi_personalmed_extract_runs (sourceHash CHAR(64) PRIMARY KEY,patients INT NOT NULL,contacts INT NOT NULL,activePatients INT NOT NULL,inactivePatients INT NOT NULL,unknownStatus INT NOT NULL,backupFinishedLocal VARCHAR(40) NULL,completedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB`);
 const [existing]=await db.query('SELECT sourceHash FROM srougi_personalmed_extract_runs WHERE sourceHash=?',[sourceHash]);
 if(existing.length){emit('already-extracted',{sourceHash});return;}
 const [packet]=await db.query('SELECT @@max_allowed_packet AS maxPacket');const cap=Math.min(262144,Number(packet[0].maxPacket)/4);
 const counts={patients:patients.length,contacts:contacts.length,activePatients:source.Clini_01.filter(r=>String(r.ATIVO).trim().toUpperCase()==='T').length,inactivePatients:source.Clini_01.filter(r=>String(r.ATIVO).trim().toUpperCase()==='F').length};
 const unknownStatus=counts.patients-counts.activePatients-counts.inactivePatients;
 const backupFinishedLocal=header[0].BackupFinishDate instanceof Date?header[0].BackupFinishDate.toISOString().slice(0,19):null;
 await db.beginTransaction();
 try{
 for(const [entity,rows] of [['patient',patients],['contact',contacts]]){
 let batch=[],bytes=0;
 const flush=async()=>{if(!batch.length)return;await db.query('INSERT INTO srougi_personalmed_extracted (sourceHash,entity,sourceKey,rawHash,payload) VALUES '+batch.map(()=>'(?,?,?,?,?)').join(','),batch.flat());batch=[];bytes=0;};
 for(const row of rows){const payload=JSON.stringify(row.raw),length=Buffer.byteLength(payload);if(length>cap)throw new Error('SOURCE_ROW_TOO_LARGE');if(bytes+length>cap)await flush();batch.push([sourceHash,entity,row.key,sha(payload),payload]);bytes+=length;}
 await flush();
 }
 await db.query('INSERT INTO srougi_personalmed_extract_runs (sourceHash,patients,contacts,activePatients,inactivePatients,unknownStatus,backupFinishedLocal) VALUES (?,?,?,?,?,?,?)',[sourceHash,counts.patients,counts.contacts,counts.activePatients,counts.inactivePatients,unknownStatus,backupFinishedLocal]);
 await db.commit();
 }catch(error){await db.rollback();throw error;}
 emit('completed',{...counts,unknownStatus,backupFinishedLocal,integrityChecked:true,appRowsWritten:0});
 }finally{tds?.close();await db?.end();}
}

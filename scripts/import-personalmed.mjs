// Explicit operator command, never run by normal app startup/build.
import mysql from 'mysql2/promise';
import { gunzipSync } from 'node:zlib';
import { connectionConfig } from './inspect-aiven.mjs';
import { planPatient, fingerprint, mappingVersion } from './plan-personalmed.mjs';
const approvedWarnings=new Set(['cep_review','ddd_without_number']);
export async function loadStaged(db,key){
 const [meta]=await db.query('SELECT digest,bytes FROM srougi_personalmed_uploads WHERE fileKey=?',[key]);
 if(meta.length!==1)throw new Error('SOURCE_NOT_VERIFIED');
 const [chunks]=await db.query('SELECT part,payload FROM srougi_personalmed_upload_chunks WHERE fileKey=? ORDER BY part',[key]);
 if(chunks.some((r,i)=>r.part!==i))throw new Error('SOURCE_PART_MISSING');
 const bytes=Buffer.concat(chunks.map(r=>r.payload));
 const {createHash}=await import('node:crypto');
 if(bytes.length!==meta[0].bytes||createHash('sha256').update(bytes).digest('hex')!==meta[0].digest)throw new Error('SOURCE_HASH_CHANGED');
 return bytes;
}
export function makePlan(rawRows){
 const seen=new Set();const result=[];
 for(const raw of rawRows){const plan=planPatient(raw);if(seen.has(plan.key))throw new Error('DUPLICATE_SOURCE_KEY');seen.add(plan.key);
 if(plan.importDisposition==='review_status'||plan.issues.some(i=>!approvedWarnings.has(i.reason)))throw new Error('UNRESOLVED_MAPPING_ISSUE');result.push(plan);}
 if(!result.length)throw new Error('EMPTY_SOURCE');return result;
}
export async function prepareLedger(db){
 await db.query(`CREATE TABLE IF NOT EXISTS srougi_personalmed_links (
 sourceKey VARCHAR(100) PRIMARY KEY, entity VARCHAR(20) NOT NULL, targetId INT NULL,
 sourceHash CHAR(64) NOT NULL, mappedHash CHAR(64) NOT NULL, mappingVersion INT NOT NULL,
 disposition VARCHAR(30) NOT NULL, original LONGTEXT NOT NULL, decisions LONGTEXT NOT NULL,
 createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY target_entity(entity,targetId)) ENGINE=InnoDB`);
 await db.query(`CREATE TABLE IF NOT EXISTS srougi_personalmed_runs (
 id BIGINT AUTO_INCREMENT PRIMARY KEY, sourceHash CHAR(64) NOT NULL,
 summary JSON NOT NULL, completedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB`);
}
export async function destinationFingerprint(db){
 const [patients]=await db.query('SELECT * FROM patients ORDER BY id');
 const [contacts]=await db.query('SELECT * FROM phone_book ORDER BY id');
 return {patients:patients.length,contacts:contacts.length,hash:fingerprint(JSON.parse(JSON.stringify({patients,contacts})))};
}
export function makeContactPlan(rows){
 const seen=new Set();const fields={NAME:['name',200],EMAIL:['email',200],OCCUPATION:['occupation',200],CATEGORIA:['category',200],FONE:['phone',200],OBSERVATION:['observations',65535]};
 return rows.map(raw=>{
 if(!Number.isSafeInteger(raw.AGENDAFONECODE)||raw.AGENDAFONECODE<=0)throw new Error('INVALID_CONTACT_KEY');
 const key='personalmed:AGFONE:'+raw.AGENDAFONECODE;if(seen.has(key))throw new Error('DUPLICATE_CONTACT_KEY');seen.add(key);
 const contact={};for(const [source,[target,max]]of Object.entries(fields)){
 if(!Object.hasOwn(raw,source))throw new Error('INCOMPLETE_CONTACT_ROW');const value=raw[source];
 if(value!==null&&typeof value!=='string')throw new Error('INVALID_CONTACT_TEXT');
 if(value!==null&&(target==='observations'?Buffer.byteLength(value,'utf8'):[...value].length)>max)throw new Error('CONTACT_EXCEEDS_CAPACITY');
 contact[target]=value?.trim()?value:null;
 }
 if(!contact.name)throw new Error('CONTACT_NAME_REQUIRED');
 return {key,contact,raw,sourceHash:fingerprint(raw),decisions:[{action:'preserve_contact_status_in_original',status:raw.ATIVO}]};
 });
}
export async function importPlan(db,plans,{cleanupHash,contacts=[]}={}){
 const [locked]=await db.query("SELECT GET_LOCK('srougi_personalmed_import',0) AS ok");
 if(locked[0].ok!==1)throw new Error('IMPORT_ALREADY_RUNNING');
 try{
 await prepareLedger(db);
 // DDL outside the transaction; no live data touched until all prerequisites pass.
 if(cleanupHash){await db.query('CREATE TABLE IF NOT EXISTS __srougi_test_patients_20261018 LIKE patients');await db.query('CREATE TABLE IF NOT EXISTS __srougi_test_contacts_20261018 LIKE phone_book');}
 await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
 await db.beginTransaction();
 try{
 // Complete indexed range locks also block application writes that do not use GET_LOCK.
 await db.query('SELECT id FROM patients ORDER BY id FOR UPDATE');
 await db.query('SELECT id FROM phone_book ORDER BY id FOR UPDATE');
 const [links]=await db.query("SELECT sourceKey,targetId,sourceHash,mappedHash,disposition FROM srougi_personalmed_links WHERE entity='patient'");
 const previous=new Map(links.map(r=>[r.sourceKey,r]));
 const summary={inserted:0,unchanged:0,excludedInactive:0,conflicts:0,deletedTestPatients:0,deletedTestContacts:0};
 for(const plan of plans){const old=previous.get(plan.key);if(old&&(old.sourceHash!==plan.sourceHash||old.mappedHash!==fingerprint(plan.patient)||old.disposition!==plan.importDisposition))summary.conflicts++;}
 if(summary.conflicts)throw new Error('SOURCE_CHANGED_REQUIRES_REVIEW');
 if(cleanupHash&&links.length===0){
 await db.query('SELECT id FROM patients FOR UPDATE');await db.query('SELECT id FROM phone_book FOR UPDATE');
 const state=await destinationFingerprint(db);
 if(state.hash!==cleanupHash||state.patients!==4||state.contacts!==1)throw new Error('TEST_DATA_CHANGED');
 const [columns]=await db.query("SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='patients' AND EXTRA NOT LIKE '%STORED GENERATED%' AND EXTRA NOT LIKE '%VIRTUAL GENERATED%' ORDER BY ORDINAL_POSITION");
 const names=columns.map(r=>'`'+r.name+'`').join(',');
 await db.query(`INSERT INTO __srougi_test_patients_20261018 (${names}) SELECT ${names} FROM patients`);
 await db.query('INSERT INTO __srougi_test_contacts_20261018 SELECT * FROM phone_book');
 const [bp]=await db.query('SELECT COUNT(*) AS n FROM __srougi_test_patients_20261018');const [bc]=await db.query('SELECT COUNT(*) AS n FROM __srougi_test_contacts_20261018');
 if(bp[0].n!==4||bc[0].n!==1)throw new Error('TEST_BACKUP_NOT_EXACT');
 await db.query('DELETE FROM patients');await db.query('DELETE FROM phone_book');summary.deletedTestPatients=4;summary.deletedTestContacts=1;
 }
 // No concurrent patient/contact mutations may run while the advisory lock is held.
 const [maxRows]=await db.query('SELECT COALESCE(MAX(CAST(code AS UNSIGNED)),0) AS n FROM patients');let next=Number(maxRows[0].n)+1;
 const fields=Object.keys(plans.find(p=>p.importDisposition==='include')?.patient??{});
 if(!fields.length)throw new Error('NO_ACTIVE_PATIENTS');
 for(let start=0;start<plans.length;start+=100){
 const batch=plans.slice(start,start+100);const fresh=[];const ledger=[];
 for(const p of batch){const old=previous.get(p.key);
 if(old){if(old.targetId){const [target]=await db.query('SELECT id FROM patients WHERE id=?',[old.targetId]);if(target.length!==1)throw new Error('IMPORTED_TARGET_MISSING');}summary.unchanged++;continue;}
 if(p.importDisposition==='exclude_inactive'){summary.excludedInactive++;ledger.push({p,id:null});continue;}
 const code=String(next++).padStart(9,'0');if(code.length>10)throw new Error('PATIENT_CODE_EXHAUSTED');fresh.push({p,code});
 }
 if(fresh.length){
 const cols=['code',...fields];
 await db.query('INSERT INTO patients ('+cols.map(f=>'`'+f+'`').join(',')+') VALUES '+fresh.map(()=> '('+cols.map(()=>'?').join(',')+')').join(','),fresh.flatMap(({p,code})=>[code,...fields.map(f=>p.patient[f]??null)]));
 const [targets]=await db.query('SELECT id,code FROM patients WHERE code IN ('+fresh.map(()=>'?').join(',')+')',fresh.map(r=>r.code));
 const ids=new Map(targets.map(r=>[r.code,r.id]));
 for(const {p,code}of fresh){if(!ids.has(code))throw new Error('INSERTED_TARGET_MISSING');ledger.push({p,id:ids.get(code)});summary.inserted++;}
 }
 if(ledger.length)await db.query('INSERT INTO srougi_personalmed_links (sourceKey,entity,targetId,sourceHash,mappedHash,mappingVersion,disposition,original,decisions) VALUES '+ledger.map(()=>'(?,?,?,?,?,?,?,?,?)').join(','),ledger.flatMap(({p,id})=>[p.key,'patient',id,p.sourceHash,fingerprint(p.patient),mappingVersion,p.importDisposition,JSON.stringify(p.raw),JSON.stringify({issues:p.issues,decisions:p.decisions})]));
 }
 if(contacts.length){
 const [priorContacts]=await db.query("SELECT sourceKey,targetId,sourceHash,mappedHash,disposition FROM srougi_personalmed_links WHERE entity='contact'");
 const prior=new Map(priorContacts.map(p=>[p.sourceKey,p]));
 const [maximum]=await db.query('SELECT COALESCE(MAX(id),0) AS n FROM phone_book');let nextContact=Number(maximum[0].n)+1;
 summary.insertedContacts=0;summary.unchangedContacts=0;
 for(let start=0;start<contacts.length;start+=100){
 const fresh=[];
 for(const p of contacts.slice(start,start+100)){
 const old=prior.get(p.key);if(old){
 if(old.sourceHash!==p.sourceHash||old.mappedHash!==fingerprint(p.contact))throw new Error('CONTACT_SOURCE_CHANGED_REQUIRES_REVIEW');
 const [target]=await db.query('SELECT id FROM phone_book WHERE id=?',[old.targetId]);if(target.length!==1)throw new Error('IMPORTED_CONTACT_MISSING');
 summary.unchangedContacts++;continue;
 }
 if(nextContact>2147483647)throw new Error('CONTACT_ID_EXHAUSTED');fresh.push({p,id:nextContact++});
 }
 if(fresh.length){
 const fields=['name','email','occupation','category','phone','observations'];
 await db.query('INSERT INTO phone_book (`id`,'+fields.map(f=>'`'+f+'`').join(',')+') VALUES '+fresh.map(()=>'(?,?,?,?,?,?,?)').join(','),fresh.flatMap(({p,id})=>[id,...fields.map(f=>p.contact[f])]));
 await db.query('INSERT INTO srougi_personalmed_links (sourceKey,entity,targetId,sourceHash,mappedHash,mappingVersion,disposition,original,decisions) VALUES '+fresh.map(()=>'(?,?,?,?,?,?,?,?,?)').join(','),fresh.flatMap(({p,id})=>[p.key,'contact',id,p.sourceHash,fingerprint(p.contact),mappingVersion,'include',JSON.stringify(p.raw),JSON.stringify(p.decisions)]));
 summary.insertedContacts+=fresh.length;
 }
 }
 }
 await db.query('INSERT INTO srougi_personalmed_runs (sourceHash,summary) VALUES (?,?)',[fingerprint(plans.map(p=>[p.key,p.sourceHash])),JSON.stringify(summary)]);
 await db.commit();return summary;
 }catch(e){await db.rollback();throw e;}
 }finally{await db.query("SELECT RELEASE_LOCK('srougi_personalmed_import')");}
}
async function main(){let db;try{
 db=await mysql.createConnection(connectionConfig(process.env.DATABASE_URL));
 const file=await loadStaged(db,'patients');const raw=gunzipSync(file).toString('utf8').split('\n').filter(Boolean).map(s=>JSON.parse(s));
 const plans=makePlan(raw);const counts={source:plans.length,active:plans.filter(p=>p.importDisposition==='include').length,inactive:plans.filter(p=>p.importDisposition==='exclude_inactive').length};
 const destination=await destinationFingerprint(db);
 console.log('[personalmed-preflight]',JSON.stringify({mappingVersion,...counts,destination}));
 if(process.argv.includes('--apply')){
 // Closed until a real isolated MySQL rehearsal, contact extraction and write guard exist.
 throw new Error('REAL_IMPORT_PENDING_ISOLATED_MYSQL_VALIDATION');
 /*
 const cleanupHash=process.argv.find(s=>s.startsWith('--cleanup-hash='))?.split('=')[1];
 if(!cleanupHash)throw new Error('CLEANUP_FINGERPRINT_REQUIRED');
 console.log('[personalmed-import]',JSON.stringify(await importPlan(db,plans,{cleanupHash})));
 */
 }
 }catch(e){console.error('[personalmed-import] failed',/^[A-Z_]+$/.test(e.message)?e.message:'IMPORT_FAILED');process.exitCode=1;}finally{await db?.end();}}
if(process.argv[1]&&import.meta.url===(await import('node:url')).pathToFileURL(process.argv[1]).href)await main();

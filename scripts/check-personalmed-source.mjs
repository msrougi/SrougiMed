// Opt-in, read-only check. No patient/contact rows or credentials are logged.
import mysql from 'mysql2/promise';
import {connectionConfig} from './inspect-aiven.mjs';
import './migration-preflight.mjs';
let db;
try {
 db=await mysql.createConnection(connectionConfig(process.env.DATABASE_URL));
 await db.query('SET TRANSACTION READ ONLY');await db.beginTransaction();
 const [files]=await db.query('SELECT fileKey,bytes,digest,completedAt FROM srougi_personalmed_uploads ORDER BY fileKey');
 console.log('[personalmed-source-check]',JSON.stringify(files));
 const [patients]=await db.query('SELECT COUNT(*) AS n FROM patients');
 const [contacts]=await db.query('SELECT COUNT(*) AS n FROM phone_book');
 console.log('[personalmed-destination-count]',JSON.stringify({patients:patients[0].n,contacts:contacts[0].n}));
} catch(e) { console.error('[personalmed-source-check] failed',/^[A-Z0-9_]+$/.test(e.code??'')?e.code:'CHECK_FAILED');process.exitCode=1; }
finally {if(db){await db.rollback();await db.end();}}

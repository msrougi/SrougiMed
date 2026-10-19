import test from 'node:test';
import assert from 'node:assert/strict';
import {makePlan,importPlan,destinationFingerprint,loadStaged} from './import-personalmed.mjs';
import {fingerprint} from './plan-personalmed.mjs';
const row=(extra={})=>({Unit:0,PCod:1,Name:'Teste sintético',Address:null,District:null,Phone:null,City:null,State:null,ID:null,Clini_01_CPF:null,HomeBorn:null,EMail:null,IndicatedBy:null,Occupation:null,Observation:null,Mother:null,Father:null,RESPONSAVEL_NOME:null,RESPONSAVEL_FONE:null,ATIVO:'T',Zip:null,BirthDate:null,DATA_CRIACAO:null,CivilStatus:null,Sex:null,Race:null,DDDCellular:null,Cellular:null,...extra});
class FakeDB{
 patients=[];contacts=[];links=[];runs=[];calls=[];commits=0;rollbacks=0;nextId=50;fail=false;
 async beginTransaction(){this.before=structuredClone({patients:this.patients,contacts:this.contacts,links:this.links,runs:this.runs});}
 async commit(){this.commits++;}
 async rollback(){Object.assign(this,this.before);this.rollbacks++;}
 async query(sql,args=[]){this.calls.push(sql);
 if(sql.startsWith('CREATE TABLE'))return [[]];
 if(sql.includes('GET_LOCK'))return [[{ok:1}]];
 if(sql.includes('RELEASE_LOCK'))return [[{ok:1}]];
 if(sql.startsWith('SELECT sourceKey'))return [structuredClone(this.links)];
 if(sql==='SELECT * FROM patients ORDER BY id')return [this.patients];
 if(sql==='SELECT * FROM phone_book ORDER BY id')return [this.contacts];
 if(sql.startsWith('SELECT COALESCE(MAX'))return [[{n:Math.max(0,...this.patients.map(p=>+p.code))}]];
 if(sql.startsWith('SELECT id FROM patients WHERE id='))return [this.patients.filter(p=>p.id===args[0]).map(p=>({id:p.id}))];
 if(sql.startsWith('INSERT INTO patients')){if(this.fail)throw new Error('SIMULATED_FAILURE');const columns=sql.slice(sql.indexOf('(')+1,sql.indexOf(')')).split(',').map(s=>s.replaceAll('`',''));for(let i=0;i<args.length;i+=columns.length)this.patients.push({id:this.nextId++,...Object.fromEntries(columns.map((c,j)=>[c,args[i+j]]))});return [{}];}
 if(sql.startsWith('SELECT id,code FROM patients WHERE code IN'))return [this.patients.filter(p=>args.includes(p.code)).map(p=>({id:p.id,code:p.code}))];
 if(sql.startsWith('INSERT INTO srougi_personalmed_links')){for(let i=0;i<args.length;i+=9)this.links.push(Object.fromEntries(['sourceKey','entity','targetId','sourceHash','mappedHash','mappingVersion','disposition','original','decisions'].map((k,j)=>[k,args[i+j]])));return [{}];}
 if(sql.startsWith('INSERT INTO srougi_personalmed_runs')){this.runs.push(args);return [{}];}
 throw new Error('UNEXPECTED_TEST_QUERY');
 }
}
test('source validation rejects duplicate keys, missing names and unknown status before writes',()=>{
 assert.throws(()=>makePlan([row(),row()]),/DUPLICATE_SOURCE_KEY/);
 assert.throws(()=>makePlan([row({Name:' '})]),/UNRESOLVED_MAPPING_ISSUE/);
 assert.throws(()=>makePlan([row({ATIVO:'?'})]),/UNRESOLVED_MAPPING_ISSUE/);
 const p=makePlan([row({Zip:'incompleto'})]);assert.equal(p[0].patient.cep,null);assert.equal(p[0].raw.Zip,'incompleto');
});
test('same source twice creates no duplicates, retains CPF repeats and excludes inactive',async()=>{
 const db=new FakeDB();const plans=makePlan([row({Clini_01_CPF:'123'}),row({PCod:2,Clini_01_CPF:'123'}),row({PCod:3,ATIVO:'F'})]);
 assert.equal((await importPlan(db,plans)).inserted,2);assert.equal(db.patients.length,2);assert.equal(db.links.length,3);
 assert.notEqual(db.patients[0].id,1);assert.notEqual(db.patients[0].code,db.patients[1].code);assert.equal(db.patients[0].cpf,db.patients[1].cpf);
 assert.equal(db.links.find(r=>r.sourceKey.endsWith(':3')).targetId,null);
 const again=await importPlan(db,plans);assert.equal(again.inserted,0);assert.equal(again.unchanged,3);assert.equal(db.patients.length,2);
});
test('changed source blocks without overwriting edits, absent source does not delete',async()=>{
 const db=new FakeDB();const p=makePlan([row(),row({PCod:2})]);await importPlan(db,p);db.patients[0].name='Editado no app';
 await assert.rejects(importPlan(db,makePlan([row({Name:'Alterado na origem'})])),/SOURCE_CHANGED_REQUIRES_REVIEW/);
 assert.equal(db.patients[0].name,'Editado no app');await importPlan(db,[p[0]]);assert.equal(db.patients.length,2);
});
test('failure rolls back target and crosswalk; retry succeeds',async()=>{
 const db=new FakeDB();db.fail=true;await assert.rejects(importPlan(db,makePlan([row()])),/SIMULATED_FAILURE/);
 assert.equal(db.patients.length,0);assert.equal(db.links.length,0);assert.equal(db.rollbacks,1);
 db.fail=false;await importPlan(db,makePlan([row()]));assert.equal(db.patients.length,1);assert.equal(db.links.length,1);
});
test('missing imported target cannot silently recreate it',async()=>{
 const db=new FakeDB();const p=makePlan([row()]);await importPlan(db,p);db.patients=[];
 await assert.rejects(importPlan(db,p),/IMPORTED_TARGET_MISSING/);assert.equal(db.patients.length,0);
});
test('test-data fingerprint includes timestamp values',async()=>{
 const db=new FakeDB();db.patients=[{id:1,createdAt:new Date('2026-01-01T00:00:00Z')}];const a=await destinationFingerprint(db);
 db.patients[0].createdAt=new Date('2026-01-02T00:00:00Z');assert.notEqual(a.hash,(await destinationFingerprint(db)).hash);
});

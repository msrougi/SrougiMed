import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepare } from './prepare-aiven.mjs';

const fields = ['id','name','code','address','cep','phone','mobile','cpf','city','state','birthDate','maritalStatusId','genderId','skinColorId','createdAt','updatedAt'];
function mockDb(conflicts = 0) {
  let done = false;
  const queries = [];
  return { queries, query: async sql => {
    queries.push(sql);
    if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
    if (sql.includes('information_schema.COLUMNS')) return [[...fields.map(name => ({name, type:['phone','mobile'].includes(name) ? (done ? 'varchar(40)' : 'varchar(20)') : 'varchar(100)', nullable:'YES', generated:''})),
      ...(done ? [{name:'motherName',type:'varchar(200)',nullable:'YES',generated:''},{name:'fatherName',type:'varchar(200)',nullable:'YES',generated:''},{name:'district',type:'varchar(100)',nullable:'YES',generated:''},{name:'legacyImported',type:'tinyint(1)',nullable:'NO',generated:''},{name:'cpfForNewPatients',type:'varchar(100)',nullable:'YES',generated:'case when legacyImported = 0 then nullif(trim(cpf), \'\') else null end'}] : [])]];
    if (sql.includes('information_schema.STATISTICS')) return [done ? [{name:'patients_new_cpf_unique',nonUnique:0,col:'cpfForNewPatients'},{name:'patients_cpf_idx',nonUnique:1,col:'cpf'}] : [{name:'patients_cpf_unique',nonUnique:0,col:'cpf'}]];
    if (sql.includes('information_schema.TABLES')) return [[...['patients','phone_book','genders','marital_statuses','skin_colors'].map(name=>({name}))]];
    if (sql.includes('AS conflicts')) return [[{count:conflicts}]];
    if (sql.includes('AS sourceCount')) return [[{sourceCount:4,backupCount:4}]];
    if (sql.startsWith('SELECT COUNT')) return [[{count:4}]];
    if (sql.includes('DROP INDEX')) done = true;
    return [[]];
  }};
}
test('creates the patient backup before DDL and verifies the final structure', async () => {
  const db = mockDb(); const output=[];
  await prepare(db,(kind,value)=>output.push({kind,value}),123);
  assert.ok(db.queries.findIndex(q=>q.startsWith('INSERT INTO')) < db.queries.findIndex(q=>q.startsWith('ALTER TABLE')));
  assert.deepEqual(output.at(-1),{kind:'prepared',value:{patients:4,imported:0}});
  assert.ok(db.queries.at(-1).includes('RELEASE_LOCK'));
  assert.ok(!db.queries.some(q => /AS generated\b/i.test(q)));
  assert.ok(!db.queries.some(q=>/^UPDATE|^DELETE|^TRUNCATE/.test(q)));
});
test('existing CPF conflicts stop the operation before backup or DDL', async () => {
  const db = mockDb(1);
  await assert.rejects(()=>prepare(db,()=>{},123),/CONFLICTS/);
  assert.ok(!db.queries.some(q=>/^(CREATE|INSERT|ALTER)/.test(q)));
  assert.ok(db.queries.at(-1).includes('RELEASE_LOCK'));
  assert.ok(!db.queries.some(q => /AS generated\b/i.test(q)));
});

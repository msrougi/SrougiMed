import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPlan, planPatient, fingerprint } from './plan-personalmed.mjs';

const row = (changes = {}) => ({
  Unit: 0, PCod: 123, Name: 'Paciente sintético', Address: null, Phone: null,
  City: null, State: null, ID: null, Clini_01_CPF: null, HomeBorn: null,
  EMail: null, IndicatedBy: null, Occupation: null, Observation: null,
  Zip: null, BirthDate: null, DATA_CRIACAO: null, CivilStatus: null,
  Sex: null, Race: null, DDDCellular: null, Cellular: null, ...changes,
});

test('maps approved P/O to single, preserves raw values and flags unknown skin colors', () => {
  for (const code of ['P', 'O']) {
    const raw = row({ CivilStatus: code, Race: 'BR', District: 'Centro', ATIVO: 'F' });
    const plan = planPatient(raw);
    assert.deepEqual(plan.raw, raw);
    assert.equal(plan.patient.maritalStatusId, 1);
    assert.equal(plan.patient.skinColorId, null);
    assert.deepEqual(plan.unassignedFields, ['District', 'ATIVO']);
    assert.equal(plan.issues.filter(x => x.reason === 'category_review').length, 1);
    assert.equal(plan.raw.CivilStatus, code);
    assert.equal(plan.patient.registrationDate, null);
  }
});

test('converts unambiguous dates/options/CEPs; never invents a DDD or birth date', () => {
  const plan = planPatient(row({ Zip: '01234-567', BirthDate: '2000-02-29T00:00:00',
    CivilStatus: 'C', Sex: 'M', Race: 'BRANCA', Cellular: '99999-9999' }));
  assert.equal(plan.patient.cep, '01234567');
  assert.equal(plan.patient.birthDate, '29/02/2000');
  assert.equal(plan.patient.maritalStatusId, 2);
  assert.equal(plan.patient.genderId, 1);
  assert.equal(plan.patient.skinColorId, 1);
  assert.equal(plan.patient.mobile, '99999-9999');
  assert.equal(plan.issues.length, 0);
  const invalid = planPatient(row({ Zip: '1234567890', BirthDate: '2001-02-29T00:00:00' }));
  assert.equal(invalid.patient.cep, null);
  assert.equal(invalid.patient.birthDate, null);
  assert.equal(invalid.raw.Zip, '1234567890');
  assert.equal(invalid.issues.length, 2);
});

test('approved CEP punctuation normalization preserves digits, incomplete values and raw original', () => {
  for (const value of ['01234.567', '01.234-567', '01.234.567', '01 234 567', '01234-567', '01234567']) {
    const plan = planPatient(row({ Zip: value }));
    assert.equal(plan.patient.cep, '01234567');
    assert.equal(plan.raw.Zip, value);
    assert.equal(plan.issues.length, 0);
  }
  for (const value of ['01234', '0123456', '012345678', '01234,567', "01234'567", 'CEP01234567', '-']) {
    const plan = planPatient(row({ Zip: value }));
    assert.equal(plan.patient.cep, null);
    assert.equal(plan.raw.Zip, value);
    assert.equal(plan.issues[0].reason, 'cep_review');
  }
});

test('maps only the approved white variants and retains unapproved categories for review', () => {
  for (const value of ['BRANCO', 'BCA.', 'BCA', 'BRC', 'bca.', ' brc ']) {
    const plan = planPatient(row({ Race: value }));
    assert.equal(plan.patient.skinColorId, 1);
    assert.equal(plan.raw.Race, value);
    assert.equal(plan.issues.length, 0);
  }
  for (const value of ['BR', 'BCA;', 'NEGRO', 'OUTRO']) {
    const plan = planPatient(row({ Race: value }));
    assert.equal(plan.patient.skinColorId, null);
    assert.equal(plan.raw.Race, value);
    assert.equal(plan.issues[0].reason, 'category_review');
  }
});

test('does not truncate long phones, merge by CPF, or discard punctuation', () => {
  const a = planPatient(row({ Phone: '1'.repeat(40), Clini_01_CPF: '000.000.000-00', Observation: 'A ` B \\ C' }));
  const b = planPatient(row({ PCod: 124, Clini_01_CPF: '000.000.000-00', Phone: '1'.repeat(41) }));
  assert.notEqual(a.key, b.key);
  assert.equal(a.patient.phone.length, 40);
  assert.equal(a.patient.notes, 'A ` B \\ C');
  assert.equal(b.patient.phone, null);
  assert.equal(b.raw.Phone.length, 41);
  assert.equal(b.issues[0].reason, 'exceeds_capacity');
  assert.equal(fingerprint({ a: 1, b: 2 }), fingerprint({ b: 2, a: 1 }));
});

test('snapshot comparison finds new, unchanged, changed and absent keys, without deleting anything', async () => {
  const root = await mkdtemp(join(tmpdir(), 'personalmed-plan-'));
  try {
    const input = join(root, 'input.jsonl');
    await writeFile(input, [row(), row({ PCod: 124 }), row({ PCod: 125 })].map(JSON.stringify).join('\n'));
    await createPlan({ input, output: join(root, 'first') });
    await writeFile(input, [row(), row({ PCod: 124, Phone: '2222' }), row({ PCod: 126 })].map(JSON.stringify).join('\n'));
    const summary = await createPlan({ input, output: join(root, 'second'), previous: join(root, 'first/patients-plan.jsonl') });
    assert.deepEqual([summary.newInSnapshot, summary.unchangedInSnapshot, summary.changedInSnapshot, summary.absentFromSnapshot], [1, 1, 1, 1]);
    assert.equal(summary.databaseWritten, false);
    const output = (await readFile(join(root, 'second/patients-plan.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
    assert.deepEqual(output.map(r => r.snapshotStatus), ['unchanged', 'changed', 'new']);
    await assert.rejects(createPlan({ input, output: join(root, 'second') }), { code: 'EEXIST' });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('invalid/duplicate/empty input removes incomplete outputs; incomplete source is rejected', async () => {
  assert.throws(() => planPatient({ Unit: 0, PCod: 1 }), /INCOMPLETE_SOURCE_ROW/);
  const root = await mkdtemp(join(tmpdir(), 'personalmed-plan-'));
  try {
    for (const [data, reason] of [[JSON.stringify(row()) + '\n' + JSON.stringify(row()), 'DUPLICATE_SOURCE_KEY'], ['invalid', 'INVALID_JSON_LINE'], ['', 'EMPTY_SNAPSHOT']]) {
      const input = join(root, 'input.jsonl');
      const output = join(root, 'output');
      await writeFile(input, data);
      await assert.rejects(createPlan({ input, output }), new RegExp(reason));
      await assert.rejects(access(output), { code: 'ENOENT' });
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});


test('maps approved PRETO/NEGRA/PARDO while retaining each original', () => {
  for (const [value, id] of [['PRETO', 2], ['NEGRA', 2], ['PARDO', 3], [' negra ', 2]]) {
    const plan = planPatient(row({ Race: value }));
    assert.equal(plan.patient.skinColorId, id);
    assert.equal(plan.raw.Race, value);
    assert.equal(plan.issues.length, 0);
  }
});

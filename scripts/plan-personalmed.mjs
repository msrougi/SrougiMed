// Offline planning only. Never connects to or writes to an application database.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, rm } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const mappingVersion = 5;
const direct = {
  Name: ['name', 200], Address: ['address', 200], Phone: ['phone', 40],
  City: ['city', 100], State: ['state', 100], ID: ['rg', 100],
  Clini_01_CPF: ['cpf', 100], HomeBorn: ['birthPlace', 100], EMail: ['email', 200],
  IndicatedBy: ['referredBy', 100], Occupation: ['occupation', 200],
  Observation: ['notes', 65535],
};
const special = ['Unit', 'PCod', 'Zip', 'BirthDate', 'DATA_CRIACAO', 'CivilStatus',
  'Sex', 'Race', 'DDDCellular', 'Cellular'];
const consumed = new Set([...Object.keys(direct), ...special]);
const present = value => value !== null && value !== undefined && String(value).trim() !== '';
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
export const fingerprint = row => createHash('sha256').update(JSON.stringify(canonical(row))).digest('hex');

export function sourceKey(row) {
  if (!Number.isSafeInteger(row.Unit) || !Number.isSafeInteger(row.PCod) || row.PCod <= 0) {
    throw new Error('INVALID_SOURCE_KEY');
  }
  return `personalmed:Clini_01:${row.Unit}:${row.PCod}`;
}

function dateOnly(value) {
  if (!present(value)) return null;
  // SQL Server extraction uses YYYY-MM-DDTHH:mm:ss (or a separating space).
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?)?$/.exec(String(value));
  if (!m) return undefined;
  const [, y, month, day] = m;
  const date = new Date(`${y}-${month}-${day}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== `${y}-${month}-${day}`) return undefined;
  return `${day}/${month}/${y}`;
}

export function planPatient(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('INVALID_SOURCE_ROW');
  for (const field of [...Object.keys(direct), ...special]) {
    if (!Object.hasOwn(raw, field)) throw new Error('INCOMPLETE_SOURCE_ROW');
  }
  const key = sourceKey(raw);
  const patient = { legacyImported: true };
  const issues = [];
  const decisions = [];
  function put(target, value, max, source) {
    if (!present(value)) { patient[target] = null; return; }
    if (typeof value !== 'string') throw new Error('INVALID_SOURCE_TEXT');
    // MySQL VARCHAR limits count characters, while TEXT limits bytes.
    const size = target === 'notes' ? Buffer.byteLength(value, 'utf8') : [...value].length;
    if (size > max) {
      patient[target] = null;
      issues.push({ field: source, target, reason: 'exceeds_capacity' });
    } else patient[target] = value;
  }
  for (const [source, [target, max]] of Object.entries(direct)) put(target, raw[source], max, source);
  if (!patient.name?.trim()) issues.push({ field: 'Name', target: 'name', reason: 'name_required' });
  const cep = present(raw.Zip) ? String(raw.Zip).trim() : null;
  // Approved: remove dots, hyphens and whitespace only, retaining exactly 8 digits.
  // Other characters and incomplete/excess digits need review; never pad/truncate.
  const cepDigits = cep?.replace(/[.\-\s]/g, '');
  patient.cep = cep && /^[0-9.\-\s]+$/.test(cep) && /^[0-9]{8}$/.test(cepDigits) ? cepDigits : null;
  if (cep && !patient.cep) issues.push({ field: 'Zip', target: 'cep', reason: 'cep_review' });
  for (const [source, target] of [['BirthDate', 'birthDate'], ['DATA_CRIACAO', 'registrationDate']]) {
    const date = dateOnly(raw[source]);
    patient[target] = date ?? null;
    if (date === undefined) issues.push({ field: source, target, reason: 'invalid_date' });
  }
  const category = (source, target, options) => {
    const value = present(raw[source]) ? String(raw[source]).trim().toLocaleLowerCase('pt-BR') : null;
    patient[target] = value === null ? null : options[value] ?? null;
    if (value !== null && patient[target] === null) {
      if (source === 'Race') {
        decisions.push({ field: source, target, action: 'leave_blank_preserve_original' });
      } else issues.push({ field: source, target, reason: 'category_review' });
    }
  };
  category('CivilStatus', 'maritalStatusId', { s: 1, p: 1, o: 1, c: 2, v: 3, d: 4 });
  category('Sex', 'genderId', { m: 1, f: 2 });
  // P/O -> single explicitly approved on 2026-10-18, alongside source S.
  // Approved variants receive IDs; other skin-color values remain unclassified,
  // with their original text retained, as explicitly approved on 2026-10-18.
  category('Race', 'skinColorId', {
    branca: 1, branco: 1, 'bca.': 1, bca: 1, brc: 1,
    preta: 2, preto: 2, negra: 2, parda: 3, pardo: 3, amarela: 4, indígena: 5,
  });
  const cell = present(raw.Cellular) ? raw.Cellular : null;
  const ddd = present(raw.DDDCellular) ? raw.DDDCellular : null;
  put('mobile', cell ? (ddd ? `${ddd} ${cell}` : cell) : null, 40, 'DDDCellular+Cellular');
  if (ddd && !cell) issues.push({ field: 'DDDCellular', target: 'mobile', reason: 'ddd_without_number' });
  patient.additionalInfo1 = null;
  patient.additionalInfo2 = null;
  const unassignedFields = Object.keys(raw).filter(field => !consumed.has(field) && present(raw[field]));
  return { mappingVersion, key, sourceHash: fingerprint(raw), patient, issues, decisions, unassignedFields, raw };
}

async function* lines(path) {
  const input = createReadStream(path, { encoding: 'utf8' });
  const reader = createInterface({ input, crlfDelay: Infinity });
  try {
    for await (const line of reader) if (line.trim()) {
      let row;
      try { row = JSON.parse(line); } catch { throw new Error('INVALID_JSON_LINE'); }
      yield row;
    }
  } finally { reader.close(); input.destroy(); }
}

export async function createPlan({ input, output, previous }) {
  const prior = new Map();
  if (previous) for await (const row of lines(previous)) {
    if (row.mappingVersion !== mappingVersion || !row.raw || sourceKey(row.raw) !== row.key || fingerprint(row.raw) !== row.sourceHash || prior.has(row.key)) {
      throw new Error('INVALID_PREVIOUS_PLAN');
    }
    prior.set(row.key, row.sourceHash);
  }
  // Refuse an existing directory, including on a failed/incomplete earlier run.
  await mkdir(output, { mode: 0o700 });
  let out;
  try {
    out = await open(join(output, 'patients-plan.jsonl'), 'wx', 0o600);
    const seen = new Set();
    const summary = { mappingVersion, rows: 0, newInSnapshot: 0, unchangedInSnapshot: 0,
      changedInSnapshot: 0, absentFromSnapshot: 0, rowsWithReview: 0, reasons: {}, approvedDecisions: {}, unassignedFields: {},
      previousSnapshotProvided: Boolean(previous), databaseWritten: false };
    for await (const raw of lines(input)) {
      const row = planPatient(raw);
      if (seen.has(row.key)) throw new Error('DUPLICATE_SOURCE_KEY');
      seen.add(row.key);
      row.snapshotStatus = !prior.has(row.key) ? 'new' : prior.get(row.key) === row.sourceHash ? 'unchanged' : 'changed';
      summary[`${row.snapshotStatus}InSnapshot`]++;
      summary.rows++;
      if (row.issues.length) summary.rowsWithReview++;
      for (const issue of row.issues) {
        const key = `${issue.field}:${issue.reason}`;
        summary.reasons[key] = (summary.reasons[key] ?? 0) + 1;
      }
      for (const decision of row.decisions) {
        const key = `${decision.field}:${decision.action}`;
        summary.approvedDecisions[key] = (summary.approvedDecisions[key] ?? 0) + 1;
      }
      for (const field of row.unassignedFields) summary.unassignedFields[field] = (summary.unassignedFields[field] ?? 0) + 1;
      await out.writeFile(`${JSON.stringify(row)}\n`);
    }
    if (!summary.rows) throw new Error('EMPTY_SNAPSHOT');
    summary.absentFromSnapshot = [...prior.keys()].filter(key => !seen.has(key)).length;
    await out.close(); out = null;
    const file = await open(join(output, 'summary.json'), 'wx', 0o600);
    try { await file.writeFile(JSON.stringify(summary, null, 2) + '\n'); } finally { await file.close(); }
    return summary;
  } catch (error) {
    if (out) await out.close();
    await rm(output, { recursive: true, force: true });
    throw error;
  }
}

async function main() {
  try {
    const args = process.argv.slice(2);
    if (args.length < 2 || args.length > 3) throw new Error('USAGE_INPUT_OUTPUT_OPTIONAL_PREVIOUS_PLAN');
    const [input, output, previous] = args.map(path => resolve(path));
    const summary = await createPlan({ input, output, previous });
    // Aggregate metadata only; never source keys, patient values, raw errors or URI.
    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    const known = /^(INVALID_|INCOMPLETE_|DUPLICATE_|EMPTY_|USAGE_)/.test(error.message);
    console.error('[personalmed-plan]', known ? error.message : 'PLAN_FAILED');
    process.exitCode = 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

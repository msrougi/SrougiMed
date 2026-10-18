import { test } from 'node:test';
import assert from 'node:assert/strict';
import { X509Certificate } from 'node:crypto';
import { connectionConfig, publicCA, inspect } from './inspect-aiven.mjs';

test('requires the confirmed Aiven destination and verified TLS', () => {
  assert.throws(() => connectionConfig(), /MISSING/);
  assert.throws(() => connectionConfig('mysql://test:secret@localhost/defaultdb'), /UNEXPECTED/);
  const cfg = connectionConfig('mysql://test:secret@mysql-252a22d-digify-6b5d.l.aivencloud.com:12150/defaultdb');
  assert.equal(cfg.ssl.rejectUnauthorized, true);
  assert.equal(cfg.ssl.verifyIdentity, true);
  assert.equal(new X509Certificate(publicCA).ca, true);
});

test('queries only metadata/counts/lookups and ends the read-only transaction', async () => {
  const statements = []; const output = []; let rolledBack = false;
  const db = {
    beginTransaction: async () => {}, rollback: async () => { rolledBack = true; },
    query: async ({ sql }) => {
      statements.push(sql);
      if (sql.includes("TABLE_TYPE = 'BASE TABLE'")) return [[{ name: 'patients' }, { name: 'users' }]];
      if (sql.startsWith('SELECT COUNT')) return [[{ rowsCount: 2 }]];
      return [[]];
    },
  };
  await inspect(db, (kind, value) => output.push({ kind, value }));
  assert.equal(rolledBack, true);
  assert.equal(statements.filter(sql => sql.startsWith('SELECT COUNT')).length, 2);
  assert.ok(statements.every(sql => !/\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE)\b/i.test(sql)));
  assert.ok(!statements.some(sql => /SELECT\s+\*|SELECT\s+(?:name|password|cpf)/i.test(sql)));
  assert.ok(!JSON.stringify(output).includes('secret'));
});

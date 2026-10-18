// Opt-in diagnostic for the authenticated Render build environment.
// Emits only schema metadata, row counts and predefined lookup options.
// Never emits the connection URI, credentials or patient/contact/user rows.
import { X509Certificate } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const expectedHost = 'mysql-252a22d-digify-6b5d.l.aivencloud.com';
const tables = ['patients', 'phone_book', 'users', 'skin_colors', 'genders', 'marital_statuses'];
// Public project CA downloaded from the service's Aiven Console. Not a private key.
export const publicCA = `-----BEGIN CERTIFICATE-----
MIIERDCCAqygAwIBAgIUH1EDxmF9xXCd2pCZBlseDORajYUwDQYJKoZIhvcNAQEM
BQAwOjE4MDYGA1UEAwwvZGM3MzI0OGItMzBlYi00YTVjLWE0YzItOTg4ZWNkYzVl
YTc5IFByb2plY3QgQ0EwHhcNMjYxMDE4MTIxMjUzWhcNMzYxMDE1MTIxMjUzWjA6
MTgwNgYDVQQDDC9kYzczMjQ4Yi0zMGViLTRhNWMtYTRjMi05ODhlY2RjNWVhNzkg
UHJvamVjdCBDQTCCAaIwDQYJKoZIhvcNAQEBBQADggGPADCCAYoCggGBAMhthrMK
Zo6no1h0U0aWO88lYlHYw6gGGk2PqyoFuBCEppbt3QLJdYVjwl4/aJpMBA+UxufR
Zt1vzNrmlDarxAZqIc7WDTawxqIqS03oqJdpj2yFre11TsSCvJI2bZBVNPr9eFE/
Wz6DB6MFE55oyAeZZaI6Ege4WAPLJOc9jQYdlkPRQnQ7QkYptEgW2iIzJOyxylDO
Foss3bQL3lHZla9DWRnJq2drQZjs6+sD+stbUo97zQmgO6KJxBaeGaKb7lB8w3sM
jWNo0OZewHj4baC/Eg71evUrjGuNa3YFLuCb0HK1UzcGa/BrqyXnSHvOe6SldHI6
HjBiygSOzNShf+rKdebFCU5iZIKRjBLT/ORR+qeNNvjPM5EC94//mvIgNVuM2vZT
hh4Ga533Ew4tgYu1ZPJhTis9Lhu6ndswEXWiel1np3573DLg23HWMpfCcxy+TiY3
NkX8B4NoVE2fbdX0aQcD0B2vHgAIPsdBbpb/IqVArUNMqsS0/evuSIeluQIDAQAB
o0IwQDAdBgNVHQ4EFgQUwYTWlEL63DgJ2xr/NXgBoN9NrH0wEgYDVR0TAQH/BAgw
BgEB/wIBADALBgNVHQ8EBAMCAQYwDQYJKoZIhvcNAQEMBQADggGBABhbH7IKP2LJ
3W5/mDAYmqqe54Gmdx8b/3bV71YMOhNzWfHWOFdLURYSbCPpQNJbsxtRXUcc9vHS
FFnB2hXJukODTOT1z4ORmFQJMpRudLUOofgLuM+CMJgTVcpfajvSTj2miu5wB8Nl
GOpzDFklgFluuXV4sGlZCc32GRM5d+Dx18uXzv0bu3NE6ZFnwV1CtRlQ4namT/Oc
54tN7K37zAljtwKYEgh5zdwHV/jM6SSvyidomvjNYGauV58S+EjcJS7Hau1zA2KU
XfgNWGqae5AghlUQFc3AVpmnvFHjWtq3yFu/mtcPbpU8NGF6OW1iYWsV44OFcqed
BCwOwgJ02D32mgXWNvils7hBYJRGbr4+qwfHwysr93xtSmYRRjwVOcr09kYb6LwV
7wssQ9uiTBQ8+sOyxVtIxXmVtSUuu3g/U/1+RGzhZP4QWIWbPJOsQhU6eL4gYdqs
/S6yzuT/M4lfqTaz5C8r3lquGLiE8kuRjnuItS7vY85lHtnTXKjuTg==
-----END CERTIFICATE-----
`;

export function connectionConfig(uri) {
  if (!uri) throw new Error('DATABASE_URL_MISSING');
  const url = new URL(uri);
  if (url.protocol !== 'mysql:' || url.hostname !== expectedHost || url.pathname !== '/defaultdb') {
    throw new Error('UNEXPECTED_DATABASE_TARGET');
  }
  new X509Certificate(publicCA);
  return {
    host: url.hostname, port: Number(url.port || 3306),
    user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
    database: 'defaultdb', connectTimeout: 10000,
    ssl: { ca: publicCA, rejectUnauthorized: true, verifyIdentity: true },
    multipleStatements: false,
  };
}

export async function inspect(db, emit) {
  const query = async (sql, params = []) => (await db.query({ sql, timeout: 15000 }, params))[0];
  await query('SET TRANSACTION READ ONLY');
  await db.beginTransaction();
  try {
    emit('database', await query('SELECT DATABASE() AS databaseName, VERSION() AS version'));
    const present = await query(`SELECT TABLE_NAME AS name FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME`);
    emit('tables', present);
    emit('columns', await query(`SELECT TABLE_NAME AS tableName, COLUMN_NAME AS name,
      COLUMN_TYPE AS type, IS_NULLABLE AS nullable, EXTRA AS extra
      FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME IN (?, ?, ?, ?, ?, ?) ORDER BY TABLE_NAME, ORDINAL_POSITION`, tables));
    emit('indexes', await query(`SELECT TABLE_NAME AS tableName, INDEX_NAME AS name,
      NON_UNIQUE AS nonUnique, COLUMN_NAME AS columnName FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (?, ?, ?, ?, ?, ?)
      ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`, tables));
    for (const table of tables) {
      if (!present.some(row => row.name === table)) continue;
      emit('count', { table, rows: (await query('SELECT COUNT(*) AS rowsCount FROM `' + table + '`'))[0].rowsCount });
      if (['skin_colors', 'genders', 'marital_statuses'].includes(table)) {
        emit('options', { table, rows: await query('SELECT id, name FROM `' + table + '` ORDER BY id LIMIT 200') });
      }
    }
  } finally {
    await db.rollback();
  }
}

async function main() {
  let db;
  try {
    const config = connectionConfig(process.env.DATABASE_URL);
    const mysql = (await import('mysql2/promise')).default;
    db = await mysql.createConnection(config);
    await inspect(db, (kind, value) => console.log('[srougi-inspect]', kind, JSON.stringify(value)));
  } catch (error) {
    // No raw exception: SQL client errors can contain sensitive connection data.
    const known = ['DATABASE_URL_MISSING', 'UNEXPECTED_DATABASE_TARGET'];
    console.error('[srougi-inspect] failed', known.includes(error.message) ? error.message : (error.code || 'INSPECTION_FAILED'));
    process.exitCode = 1;
  } finally {
    if (db) await db.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

import { describe, it, expect } from 'vitest';
import { ReadOnlyBindings } from '../../edge/panel/read-only-bindings.js';

describe('ReadOnlyBindings', () => {
  const calls = [];
  const db = {
    prepare: (sql) => {
      calls.push(['prepare', sql]);
      return { sql };
    },
    batch: async (statements) => {
      calls.push(['batch', statements.length]);
      return [];
    },
    exec: () => calls.push(['exec']),
  };
  const bucket = {
    get: async (key) => `object at ${key}`,
    put: async () => calls.push(['put']),
    delete: async () => calls.push(['delete']),
  };

  it('prepares a SELECT, a WITH that reads and a batch of them, with the database underneath', async () => {
    calls.length = 0;
    const database = ReadOnlyBindings.database(db);
    const first = database.prepare('SELECT 1');
    const second = database.prepare('  with t AS (SELECT 1) SELECT * FROM t');
    await database.batch([first, second]);
    expect(calls).toStrictEqual([
      ['prepare', 'SELECT 1'],
      ['prepare', '  with t AS (SELECT 1) SELECT * FROM t'],
      ['batch', 2],
    ]);
  });

  it('refuses any statement that writes, before the database sees it, and offers nothing but prepare and batch', () => {
    calls.length = 0;
    const database = ReadOnlyBindings.database(db);
    const refused = [
      'INSERT INTO recording VALUES (1)',
      'UPDATE recording SET bytes = 0',
      'DELETE FROM recording',
      'WITH old AS (SELECT code FROM recording) DELETE FROM recording_click',
      'SELECT 1; DROP TABLE recording',
      'REPLACE INTO daily_view SELECT 1',
      'PRAGMA table_info(recording)',
      'SELECT 1 FROM recording WHERE 0; ATTACH DATABASE x AS y',
      'CREATE TABLE x (y)',
    ].map((sql) => {
      try {
        database.prepare(sql);
        return 'prepared';
      } catch (error) {
        return error.message;
      }
    });
    expect([refused, calls, Object.keys(database).sort()]).toStrictEqual([
      Array(9).fill('the panel only reads'),
      [],
      ['batch', 'prepare'],
    ]);
  });

  it('gives a bucket that only gets', async () => {
    calls.length = 0;
    const reports = ReadOnlyBindings.bucket(bucket);
    expect([Object.keys(reports), await reports.get('recordings/a'), calls]).toStrictEqual([
      ['get'],
      'object at recordings/a',
      [],
    ]);
  });
});

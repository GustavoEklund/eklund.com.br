import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { DailyCeiling } from '../../edge/src/daily-ceiling.js';
import { EdgeWorker } from '../support/edge-worker.js';
import { PageReports } from '../support/page-reports.js';

describe('DailyCeiling, against D1 in workerd', () => {
  const worker = new EdgeWorker();
  let database;

  beforeAll(() => worker.start(), EdgeWorker.START_TIMEOUT_MS);
  afterAll(() => worker.stop());
  beforeEach(async () => {
    await worker.reset();
    database = await worker.database();
  });

  it('lets rows in while the day stays at or under 40,000, counting only that day', async () => {
    await database
      .prepare('INSERT INTO daily_writes (day, rows) VALUES (?1, ?2), (?3, ?4)')
      .bind('2026-10-29', 39_990, '2026-10-28', 40_000)
      .run();
    const ceiling = new DailyCeiling(database);
    expect([
      await ceiling.allows('2026-10-29', 10),
      await ceiling.allows('2026-10-29', 11),
      await ceiling.allows('2026-10-30', 40_000),
      await ceiling.allows('2026-10-30', 40_001),
    ]).toStrictEqual([true, false, true, false]);
  });

  it('lets the bytes of recordings in while the day stays at or under 250 MB, and counts nothing for a report', async () => {
    await database
      .prepare('INSERT INTO daily_writes (day, rows, bytes) VALUES (?1, ?2, ?3)')
      .bind('2026-10-29', 10, 249_999_000)
      .run();
    const ceiling = new DailyCeiling(database);
    expect([
      await ceiling.allows('2026-10-29', 3, 1_000),
      await ceiling.allows('2026-10-29', 3, 1_001),
      await ceiling.allows('2026-10-29', 3),
      await ceiling.allows('2026-10-30', 3, 250_000_000),
    ]).toStrictEqual([true, false, true, true]);
  });

  it('counts the seconds to the next midnight in UTC', () => {
    expect([
      DailyCeiling.secondsLeft(Date.parse('2026-10-29T02:30:00Z')),
      DailyCeiling.secondsLeft(Date.parse('2026-10-29T23:59:59.500Z')),
      DailyCeiling.secondsLeft(Date.parse('2026-10-29T00:00:00Z')),
    ]).toStrictEqual([77_400, 1, 86_400]);
  });
});

describe('the ceiling of a day, through the whole Worker in workerd', () => {
  const worker = new EdgeWorker();

  beforeAll(() => worker.start(), EdgeWorker.START_TIMEOUT_MS);
  afterAll(() => worker.stop());
  beforeEach(() => worker.reset());

  it('counts what each stored report wrote, and answers 429 with nothing stored once a report would pass the ceiling', async () => {
    const day = new Date().toISOString().slice(0, 10);
    const first = await worker.send(PageReports.complete());
    const counted = await worker.rows('SELECT rows FROM daily_writes');
    await (
      await worker.database()
    )
      .prepare('UPDATE daily_writes SET rows = ?1 WHERE day = ?2')
      .bind(39_991, day)
      .run();
    const refused = await worker.send(PageReports.with((report) => (report.seq = 2)));
    expect([
      first.status,
      counted,
      refused.status,
      await worker.rows('SELECT day, rows FROM daily_writes'),
      await worker.rows('SELECT count(*) AS visits FROM page_view'),
    ]).toStrictEqual([204, [{ rows: 10 }], 429, [{ day, rows: 39_991 }], [{ visits: 1 }]]);
  });
});

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Retention } from '../../edge/src/retention.js';
import { EdgeWorker } from '../support/edge-worker.js';

/** The run of 29 October 2026: totals for the 27th to the 29th, rows kept from 29 September 2025, errors from 31 July 2026. */
const NOW = new Date('2026-10-29T06:17:00Z');

describe('Retention.run, against D1 in workerd', () => {
  const worker = new EdgeWorker();
  let database;

  /** One load, with the dimensions a phone in Brazil on the home page would have unless `changes` says otherwise. */
  const view = (id, day, changes = {}) => {
    const row = {
      id,
      day,
      first_seen: 0,
      last_seen: 0,
      host: 'eklund.com.br',
      page: '/',
      version: '1.2.0',
      language: 'pt-BR',
      referrer: null,
      country: 'BR',
      device: 'phone',
      browser: 'chrome',
      browser_version: 130,
      viewport: '360-413',
      pixel_ratio: '3+',
      memory: '4',
      cores: '5-8',
      round_trip: '100-299',
      save_data: 0,
      color_scheme: 'dark',
      reduced_motion: 0,
      navigation: 'navigate',
      visible_ms: 1_000,
      ...changes,
    };
    const columns = Object.keys(row);
    return database
      .prepare(
        `INSERT INTO page_view (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
      )
      .bind(...Object.values(row));
  };
  const vital = (viewId, value, rating) =>
    database.prepare("INSERT INTO vital VALUES (?, 'LCP', ?, ?, '{}')").bind(viewId, value, rating);
  const event = (viewId, position, name, detail) =>
    database
      .prepare('INSERT INTO event VALUES (?, 0, ?, ?, ?, NULL, 0)')
      .bind(viewId, position, name, detail);
  const error = (viewId) =>
    database
      .prepare(
        "INSERT INTO error VALUES (?, 0, 0, 'error', 'TypeError: x', '/assets/main.js', 1, 2, 0)",
      )
      .bind(viewId);
  const oldTotal = (day) =>
    database
      .prepare(
        "INSERT INTO daily_view VALUES (?, 'eklund.com.br', '/', '1.1.0', 'pt-BR', 'phone', 'chrome', 'BR', '', 1, 1)",
      )
      .bind(day);

  beforeAll(() => worker.start(), EdgeWorker.START_TIMEOUT_MS);
  afterAll(() => worker.stop());
  beforeEach(async () => {
    await worker.reset();
    database = await worker.database();
    await database.batch([
      view('a', '2026-10-28', { referrer: 'www.google.com', visible_ms: 5_000 }),
      view('b', '2026-10-28', { visible_ms: 3_000 }),
      view('g', '2026-10-28', { visible_ms: 2_000 }),
      view('h', '2026-10-28', { visible_ms: 4_000 }),
      view('c', '2026-10-28', {
        page: '/en/',
        language: 'en-US',
        device: 'desktop',
        browser: 'firefox',
        country: null,
      }),
      view('d', '2026-07-30'),
      view('e', '2025-09-28'),
      view('f', '2025-09-29'),
      vital('a', 1_000, 'good'),
      vital('g', 2_000, 'good'),
      vital('b', 3_000, 'needs-improvement'),
      vital('h', 4_500, 'poor'),
      vital('c', 2_500, 'good'),
      vital('e', 9_000, 'poor'),
      event('a', 0, 'section', 'carga'),
      event('a', 1, 'hue', null),
      event('b', 0, 'section', 'carga'),
      event('e', 0, 'section', 'perfil'),
      error('a'),
      error('b'),
      error('d'),
      error('e'),
      oldTotal('2024-09-28'),
      oldTotal('2024-09-29'),
    ]);
  });

  it('adds up each day: views, visibility, percentiles and ratings of each metric, events and errors', async () => {
    await new Retention(database).run(NOW);
    expect([
      await worker.rows(
        "SELECT * FROM daily_view WHERE day = '2026-10-28' ORDER BY page, referrer",
      ),
      await worker.rows('SELECT * FROM daily_vital ORDER BY page'),
      await worker.rows('SELECT * FROM daily_event ORDER BY name'),
      await worker.rows('SELECT * FROM daily_error'),
    ]).toStrictEqual([
      [
        {
          day: '2026-10-28',
          host: 'eklund.com.br',
          page: '/',
          version: '1.2.0',
          language: 'pt-BR',
          device: 'phone',
          browser: 'chrome',
          country: 'BR',
          referrer: '',
          views: 3,
          visible_ms: 9_000,
        },
        {
          day: '2026-10-28',
          host: 'eklund.com.br',
          page: '/',
          version: '1.2.0',
          language: 'pt-BR',
          device: 'phone',
          browser: 'chrome',
          country: 'BR',
          referrer: 'www.google.com',
          views: 1,
          visible_ms: 5_000,
        },
        {
          day: '2026-10-28',
          host: 'eklund.com.br',
          page: '/en/',
          version: '1.2.0',
          language: 'en-US',
          device: 'desktop',
          browser: 'firefox',
          country: '',
          referrer: '',
          views: 1,
          visible_ms: 1_000,
        },
      ],
      [
        {
          day: '2026-10-28',
          page: '/',
          version: '1.2.0',
          device: 'phone',
          name: 'LCP',
          total: 4,
          p50: 2_000,
          p75: 3_000,
          p95: 4_500,
          good: 2,
          needs_improvement: 1,
          poor: 1,
        },
        {
          day: '2026-10-28',
          page: '/en/',
          version: '1.2.0',
          device: 'desktop',
          name: 'LCP',
          total: 1,
          p50: 2_500,
          p75: 2_500,
          p95: 2_500,
          good: 1,
          needs_improvement: 0,
          poor: 0,
        },
      ],
      [
        { day: '2026-10-28', page: '/', version: '1.2.0', name: 'hue', detail: '', total: 1 },
        {
          day: '2026-10-28',
          page: '/',
          version: '1.2.0',
          name: 'section',
          detail: 'carga',
          total: 2,
        },
      ],
      [
        {
          day: '2026-10-28',
          version: '1.2.0',
          kind: 'error',
          source: '/assets/main.js',
          message: 'TypeError: x',
          total: 2,
        },
      ],
    ]);
  });

  it('deletes rows older than 13 months, errors older than 90 days and totals older than 25 months', async () => {
    await new Retention(database).run(NOW);
    expect([
      await worker.rows('SELECT id, day FROM page_view ORDER BY id'),
      await worker.rows('SELECT view_id FROM vital ORDER BY view_id'),
      await worker.rows('SELECT view_id FROM event ORDER BY view_id, position'),
      await worker.rows('SELECT view_id FROM error ORDER BY view_id'),
      await worker.rows("SELECT day FROM daily_view WHERE day < '2026-01-01'"),
    ]).toStrictEqual([
      [
        { id: 'a', day: '2026-10-28' },
        { id: 'b', day: '2026-10-28' },
        { id: 'c', day: '2026-10-28' },
        { id: 'd', day: '2026-07-30' },
        { id: 'f', day: '2025-09-29' },
        { id: 'g', day: '2026-10-28' },
        { id: 'h', day: '2026-10-28' },
      ],
      [{ view_id: 'a' }, { view_id: 'b' }, { view_id: 'c' }, { view_id: 'g' }, { view_id: 'h' }],
      [{ view_id: 'a' }, { view_id: 'a' }, { view_id: 'b' }],
      [{ view_id: 'a' }, { view_id: 'b' }],
      [{ day: '2024-09-29' }],
    ]);
  });

  it('runs from the daily Cron Trigger, and running twice changes nothing', async () => {
    const outcomes = [await worker.scheduled(NOW), await worker.scheduled(NOW)];
    expect([
      outcomes,
      await worker.rows(
        "SELECT page, views FROM daily_view WHERE day = '2026-10-28' ORDER BY page, views",
      ),
    ]).toStrictEqual([
      [
        { outcome: 'ok', noRetry: false },
        { outcome: 'ok', noRetry: false },
      ],
      [
        { page: '/', views: 1 },
        { page: '/', views: 3 },
        { page: '/en/', views: 1 },
      ],
    ]);
  });
});

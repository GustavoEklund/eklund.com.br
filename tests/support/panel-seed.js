import { Calendar } from '../../edge/src/calendar.js';
import { RecordingStore } from '../../edge/src/recording-store.js';
import { Retention } from '../../edge/src/retention.js';
import { SessionChunks } from './session-chunks.js';

const DAY_MS = 86_400_000;
const FORM_FACTORS = ['mobile', 'desktop'];
const LAB_PAGES = ['/', '/en/'];

/**
 * Four weeks of the collector's data for the panel, the same on every run: page loads with their vitals, events and errors
 * on two releases, the daily totals the retention would write for them, the nightly lab, CrUX, search, certificates, the
 * uptime monitor, and two recordings with their chunks in R2 and their clicks.
 */
export class PanelSeed {
  /** The last day of the four weeks, unless the seed is given another. */
  static TODAY = '2026-11-09';
  static DAYS = 28;
  static RECORDING = SessionChunks.CODE;
  static SHORT = SessionChunks.OTHER;

  #db;
  #bucket;
  #today;
  #state = 7;

  constructor({ db, bucket, today = PanelSeed.TODAY }) {
    this.#db = db;
    this.#bucket = bucket;
    this.#today = today;
  }

  /** The days of the seed, the first one first. */
  get days() {
    return Array.from({ length: PanelSeed.DAYS }, (_, index) =>
      Calendar.daysBefore(this.#today, PanelSeed.DAYS - 1 - index),
    );
  }

  async run() {
    await this.#visits();
    await this.#lab();
    await this.#uptime();
    await this.#recordings();
  }

  /** A number from 0 to 1, pseudo-random from a fixed start, so the sequence is the same on every run. */
  #random() {
    this.#state = (this.#state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return this.#state / 2_147_483_648;
  }

  async #visits() {
    const views = [];
    const vitals = [];
    const events = [];
    const errors = [];
    this.days.forEach((day, index) => {
      const version = index < 14 ? '1.1.0' : '1.2.0';
      const count = 3 + Math.floor(this.#random() * 6);
      for (let load = 0; load < count; load += 1) {
        const id = `${day}-${load}`;
        const english = this.#random() < 0.3;
        const device = ['phone', 'phone', 'desktop', 'tablet'][Math.floor(this.#random() * 4)];
        views.push({
          id,
          day,
          first_seen: Date.parse(`${day}T12:00:00Z`) + load * 60_000,
          last_seen: Date.parse(`${day}T12:00:00Z`) + load * 60_000 + 30_000,
          host: 'eklund.com.br',
          page: english ? '/en/' : '/',
          version,
          language: english ? 'en-US' : 'pt-BR',
          referrer: this.#random() < 0.4 ? 'www.google.com' : null,
          country: ['BR', 'BR', 'BR', 'US', 'PT'][Math.floor(this.#random() * 5)],
          device,
          browser: this.#random() < 0.7 ? 'chrome' : 'firefox',
          viewport: device === 'desktop' ? '1280-1535' : '360-413',
          pixel_ratio: '2',
          memory: '8+',
          cores: '5-8',
          round_trip: '0-99',
          save_data: 0,
          color_scheme: 'dark',
          reduced_motion: 0,
          navigation: 'navigate',
          visible_ms: 20_000,
        });
        // The later release loads faster: its LCP is about 400 ms shorter.
        const lcp = Math.round(1_600 + this.#random() * 1_600 - (version === '1.2.0' ? 400 : 0));
        const inp = Math.round(40 + this.#random() * 180);
        const cls = Math.round(this.#random() * 120) / 1_000;
        vitals.push(
          {
            view_id: id,
            name: 'LCP',
            value: lcp,
            rating: lcp <= 2_500 ? 'good' : lcp <= 4_000 ? 'needs-improvement' : 'poor',
            attribution: JSON.stringify({ target: english ? '#hero>h1' : '#hero>p.lead' }),
          },
          {
            view_id: id,
            name: 'INP',
            value: inp,
            rating: inp <= 200 ? 'good' : 'needs-improvement',
            attribution: JSON.stringify({ interactionTarget: 'button.theme-toggle' }),
          },
          {
            view_id: id,
            name: 'CLS',
            value: cls,
            rating: cls <= 0.1 ? 'good' : 'needs-improvement',
            attribution: JSON.stringify({ largestShiftTarget: 'section#status' }),
          },
          {
            view_id: id,
            name: 'TTFB',
            value: Math.round(80 + this.#random() * 300),
            rating: 'good',
            attribution: '{}',
          },
        );
        events.push({
          view_id: id,
          seq: 0,
          position: 0,
          name: 'section',
          detail: ['status', 'perfil', 'carga'][load % 3],
          value: null,
          at_ms: 2_000,
        });
        if (load === 0 && index % 5 === 0)
          errors.push({
            view_id: id,
            seq: 0,
            position: 0,
            kind: 'error',
            message: "TypeError: Cannot read properties of null (reading 'width')",
            source: '/js/globe/globe.js',
            line: 120,
            column_number: 14,
            at_ms: 1_500,
          });
      }
    });
    await this.#insert('page_view', views);
    await this.#insert('vital', vitals);
    await this.#insert('event', events);
    await this.#insert('error', errors);
    await this.#totals(['daily_view', 'daily_vital', 'daily_event', 'daily_error']);
  }

  async #lab() {
    const runs = [];
    this.days.forEach((day, index) =>
      LAB_PAGES.forEach((page) =>
        FORM_FACTORS.forEach((formFactor) => {
          // The mobile LCP of the home page drops by 600 ms halfway through the four weeks.
          const base = (formFactor === 'mobile' ? 2_400 : 900) - (index >= 14 ? 600 : 0);
          for (let run = 0; run < 5; run += 1)
            runs.push({
              day,
              page,
              form_factor: formFactor,
              run,
              median: run === 2 ? 1 : 0,
              score:
                Math.round((formFactor === 'mobile' ? 82 : 92) + (index >= 14 ? 6 : 0) - run) / 100,
              lcp_ms: base + Math.round(this.#random() * 120) + (run - 2) * 20,
              fcp_ms: base * 0.6,
              cls: 0,
              tbt_ms: formFactor === 'mobile' ? 150 + run * 10 : 20,
              speed_index_ms: base * 0.9,
              ttfb_ms: 60,
              report:
                run === 2 ? `lab/${day}/${page === '/' ? 'home' : 'en'}-${formFactor}.json` : null,
            });
        }),
      ),
    );
    await this.#insert('lab_run', runs);
    const last = this.#today;
    await this.#insert(
      'crux_reading',
      ['LCP', 'INP', 'CLS'].map((metric) => ({
        day: last,
        scope: 'origin',
        form_factor: 'phone',
        metric,
        p75: { LCP: 2_100, INP: 150, CLS: 0.02 }[metric],
        good: 0.81,
        needs_improvement: 0.14,
        poor: 0.05,
      })),
    );
    await this.#insert('search_row', [
      {
        engine: 'google',
        day: last,
        page: 'https://eklund.com.br/',
        query: 'gustavo eklund',
        country: 'bra',
        device: 'DESKTOP',
        clicks: 12,
        impressions: 40,
        position: 1.2,
      },
      {
        engine: 'google',
        day: last,
        page: 'https://eklund.com.br/en/',
        query: 'eklund go developer',
        country: 'usa',
        device: 'MOBILE',
        clicks: 2,
        impressions: 25,
        position: 6.5,
      },
      {
        engine: 'bing',
        day: last,
        page: '',
        query: '',
        country: '',
        device: '',
        clicks: 1,
        impressions: 9,
        position: null,
      },
      {
        engine: 'bing',
        day: last,
        page: '',
        query: 'gustavo eklund',
        country: '',
        device: '',
        clicks: 1,
        impressions: 9,
        position: 2,
      },
    ]);
    await this.#insert(
      'certificate',
      ['eklund.com.br', 'gustavo.eklund.com.br'].map((host) => ({
        day: last,
        host,
        valid_to: Date.parse(`${last}T00:00:00Z`) + 61 * DAY_MS,
        issuer: "Let's Encrypt R11",
        problem: null,
      })),
    );
  }

  async #uptime() {
    const targets = ['https://eklund.com.br/', 'https://eklund.com.br/en/'];
    await this.#insert(
      'daily_uptime',
      this.days.flatMap((day, index) =>
        targets.map((target) => ({
          day,
          target,
          checks: 288,
          failures: index === 20 && target === targets[0] ? 3 : 0,
          p50_ms: 180,
          p95_ms: 420,
        })),
      ),
    );
    await this.#insert(
      'uptime_target',
      targets.map((target) => ({ target, failures: 0, failing_since: null, issue: null })),
    );
  }

  async #recordings() {
    const day = this.#today;
    const started = Date.parse(`${day}T14:00:00Z`);
    const recordings = [
      {
        code: PanelSeed.RECORDING,
        chunks: 2,
        clicks: [
          ['status', '1280-1535', 0.25, 0.5],
          ['status', '1280-1535', 0.27, 0.52],
          ['hero', '1280-1535', 0.5, 0.8],
        ],
      },
      { code: PanelSeed.SHORT, chunks: 1, clicks: [['contato', '360-413', 0.9, 0.1]] },
    ];
    for (const [index, { code, chunks, clicks }] of recordings.entries()) {
      const begin = started + index * 600_000;
      const parts = Array.from({ length: chunks }, (_, seq) =>
        PanelSeed.chunk(code, seq, begin, seq === chunks - 1 ? clicks : []),
      );
      const bodies = await Promise.all(parts.map((part) => SessionChunks.gzip(part)));
      await this.#insert('recording', [
        {
          code,
          day,
          started_at: begin,
          last_at: begin + (chunks - 1) * 10_000 + 10,
          host: 'eklund.com.br',
          page: index === 0 ? '/' : '/en/',
          version: '1.2.0',
          language: index === 0 ? 'pt-BR' : 'en-US',
          first_event_ms: begin,
          last_event_ms: begin + (chunks > 1 ? (chunks - 1) * 10_000 : 10),
          chunks,
          last_seq: chunks - 1,
          bytes: bodies.reduce((sum, body) => sum + body.byteLength, 0),
          clicks: clicks.length,
        },
      ]);
      await this.#insert(
        'recording_click',
        clicks.map(([region, viewport, x, y], position) => ({
          code,
          seq: chunks - 1,
          position,
          region,
          viewport,
          x,
          y,
          at_ms: 4_000,
        })),
      );
      for (const [seq, body] of bodies.entries())
        await this.#bucket.put(RecordingStore.key(day, code, seq), body);
    }
  }

  /**
   * A chunk of rrweb events: the first holds the meta and a full snapshot of a small page, the next ones a mouse move each
   * ten seconds later.
   */
  static chunk(code, seq, begin, clicks) {
    const at = begin + seq * 10_000;
    const events =
      seq === 0
        ? [
            {
              type: 4,
              data: { href: 'https://eklund.com.br/', width: 1280, height: 800 },
              timestamp: at,
            },
            {
              type: 2,
              data: {
                node: {
                  type: 0,
                  id: 1,
                  childNodes: [
                    { type: 1, id: 2, name: 'html', publicId: '', systemId: '' },
                    {
                      type: 2,
                      id: 3,
                      tagName: 'html',
                      attributes: { lang: 'pt-BR' },
                      childNodes: [
                        { type: 2, id: 4, tagName: 'head', attributes: {}, childNodes: [] },
                        {
                          type: 2,
                          id: 5,
                          tagName: 'body',
                          attributes: {},
                          childNodes: [
                            {
                              type: 2,
                              id: 6,
                              tagName: 'h1',
                              attributes: {},
                              childNodes: [{ type: 3, id: 7, textContent: 'Gustavo Eklund' }],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
                initialOffset: { left: 0, top: 0 },
              },
              timestamp: at + 10,
            },
          ]
        : [
            {
              type: 3,
              data: { source: 1, positions: [{ x: 640, y: 300, id: 6, timeOffset: 0 }] },
              timestamp: at,
            },
          ];
    return {
      v: 1,
      code,
      seq,
      version: '1.2.0',
      page: '/',
      language: 'pt-BR',
      events,
      clicks: clicks.map(([region, viewport, x, y]) => ({ region, viewport, x, y, at: 4_000 })),
    };
  }

  /** The daily totals of every day of the seed, as the retention writes them. */
  async #totals(tables) {
    const totals = Retention.totals((column) => `${column} BETWEEN ?1 AND ?2`);
    await this.#db.batch(
      tables.map((table) =>
        this.#db
          .prepare(`INSERT OR REPLACE INTO ${table} ${totals[table]}`)
          .bind(this.days[0], this.#today),
      ),
    );
  }

  async #insert(table, rows) {
    for (let start = 0; start < rows.length; start += 50)
      await this.#db.batch(
        rows.slice(start, start + 50).map((row) =>
          this.#db
            .prepare(
              `INSERT INTO ${table} (${Object.keys(row).join(', ')}) VALUES (${Object.keys(row)
                .map(() => '?')
                .join(', ')})`,
            )
            .bind(...Object.values(row)),
        ),
      );
  }
}

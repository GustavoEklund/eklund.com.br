/**
 * Writes a lab batch into D1: one statement for each kind of row, each reading the whole list from one JSON parameter, so a
 * batch of hundreds of rows stays within D1's limits on bound parameters and on queries. The job may send the same night
 * again; a row of the same key is replaced, never doubled.
 */
export class LabStore {
  #db;

  constructor(db) {
    this.#db = db;
  }

  async save({ runs, field, search, certificates }) {
    const statements = [
      [
        runs,
        `INSERT INTO lab_run (day, page, form_factor, run, median, score, lcp_ms, fcp_ms, cls, tbt_ms, speed_index_ms, ttfb_ms,
           report)
         SELECT value->>'day', value->>'page', value->>'formFactor', value->>'run', value->>'median', value->>'score',
           value->>'lcp', value->>'fcp', value->>'cls', value->>'tbt', value->>'speedIndex', value->>'ttfb', value->>'report'
         FROM json_each(?1) WHERE true
         ON CONFLICT (day, page, form_factor, run) DO UPDATE SET
           median = excluded.median, score = excluded.score, lcp_ms = excluded.lcp_ms, fcp_ms = excluded.fcp_ms,
           cls = excluded.cls, tbt_ms = excluded.tbt_ms, speed_index_ms = excluded.speed_index_ms,
           ttfb_ms = excluded.ttfb_ms, report = excluded.report`,
      ],
      [
        field,
        `INSERT INTO crux_reading (day, scope, form_factor, metric, p75, good, needs_improvement, poor)
         SELECT value->>'day', value->>'scope', value->>'formFactor', value->>'metric', value->>'p75', value->>'good',
           value->>'needsImprovement', value->>'poor'
         FROM json_each(?1) WHERE true
         ON CONFLICT (day, scope, form_factor, metric) DO UPDATE SET
           p75 = excluded.p75, good = excluded.good, needs_improvement = excluded.needs_improvement, poor = excluded.poor`,
      ],
      [
        search,
        `INSERT INTO search_row (engine, day, page, query, country, device, clicks, impressions, position)
         SELECT value->>'engine', value->>'day', value->>'page', value->>'query', value->>'country', value->>'device',
           value->>'clicks', value->>'impressions', value->>'position'
         FROM json_each(?1) WHERE true
         ON CONFLICT (engine, day, page, query, country, device) DO UPDATE SET
           clicks = excluded.clicks, impressions = excluded.impressions, position = excluded.position`,
      ],
      [
        certificates,
        `INSERT INTO certificate (day, host, valid_to, issuer, problem)
         SELECT value->>'day', value->>'host', value->>'validTo', value->>'issuer', value->>'problem'
         FROM json_each(?1) WHERE true
         ON CONFLICT (day, host) DO UPDATE SET
           valid_to = excluded.valid_to, issuer = excluded.issuer, problem = excluded.problem`,
      ],
    ]
      .filter(([rows]) => rows.length > 0)
      .map(([rows, sql]) => this.#db.prepare(sql).bind(JSON.stringify(rows)));
    if (statements.length) await this.#db.batch(statements);
  }
}

/**
 * Writes a page report into D1. One report is one batch, and a batch is one transaction: the report is stored whole or not at
 * all. A page may report the same load again as it goes on (`seq` grows); the visit keeps its first values, and the
 * metrics keep their last. The same batch adds the report's rows to the count of the day that DailyCeiling reads.
 */
export class ReportStore {
  #db;

  constructor(db) {
    this.#db = db;
  }

  /**
   * The rows D1 counts as written for a report: its visit and the visit's entry in the index by day, the count of the day,
   * and its vitals, events and errors.
   */
  static rowsOf(report) {
    return 3 + report.vitals.length + report.events.length + report.errors.length;
  }

  async save(report, { receivedAt, day, host, country, agent }) {
    const { device } = report;
    await this.#db.batch([
      this.#db
        .prepare(
          `INSERT INTO daily_writes (day, rows) VALUES (?1, ?2)
           ON CONFLICT (day) DO UPDATE SET rows = daily_writes.rows + excluded.rows`,
        )
        .bind(day, ReportStore.rowsOf(report)),
      this.#db
        .prepare(
          `INSERT INTO page_view (id, day, first_seen, last_seen, host, page, version, language, referrer, country, device,
             browser, browser_version, viewport, pixel_ratio, memory, cores, round_trip, save_data, color_scheme,
             reduced_motion, navigation, visible_ms)
           VALUES (?1, ?2, ?3, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22)
           ON CONFLICT (id) DO UPDATE SET
             last_seen = excluded.last_seen,
             visible_ms = max(page_view.visible_ms, excluded.visible_ms)`,
        )
        .bind(
          report.view,
          day,
          receivedAt,
          host,
          report.page,
          report.version,
          report.language,
          report.referrer,
          country,
          agent.device,
          agent.browser,
          agent.version,
          device.viewport,
          device.pixelRatio,
          device.memory,
          device.cores,
          device.roundTrip,
          Number(device.saveData),
          device.colorScheme,
          Number(device.reducedMotion),
          report.navigation,
          report.visible,
        ),
      ...report.vitals.map((vital) =>
        this.#db
          .prepare(
            `INSERT INTO vital (view_id, name, value, rating, attribution) VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT (view_id, name) DO UPDATE SET
               value = excluded.value, rating = excluded.rating, attribution = excluded.attribution`,
          )
          .bind(
            report.view,
            vital.name,
            vital.value,
            vital.rating,
            JSON.stringify(vital.attribution),
          ),
      ),
      ...report.events.map((event, position) =>
        this.#db
          .prepare(
            `INSERT OR IGNORE INTO event (view_id, seq, position, name, detail, value, at_ms)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
          )
          .bind(report.view, report.seq, position, event.name, event.detail, event.value, event.at),
      ),
      ...report.errors.map((error, position) =>
        this.#db
          .prepare(
            `INSERT OR IGNORE INTO error (view_id, seq, position, kind, message, source, line, column_number, at_ms)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
          )
          .bind(
            report.view,
            report.seq,
            position,
            error.kind,
            error.message,
            error.source,
            error.line,
            error.column,
            error.at,
          ),
      ),
    ]);
  }
}

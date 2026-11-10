import { Calendar } from './calendar.js';

const PREFIX = 'recordings/';
/** How many keys R2 deletes in one call. */
const DELETE_BATCH = 1_000;
/** How many days before the first one kept the retention looks for chunks, in case a daily run was missed. */
const MISSED_DAYS = 7;

/**
 * Keeps the session recordings (0010): each chunk of events in R2, gzip as it came, at recordings/<day>/<code>/<seq>, where
 * <day> is the day the recording started; and in D1 a row for each recording and one for each click of the heat map. One
 * chunk is one batch in D1, written before the chunk goes to R2, so a recording in R2 always has its row, and deleting it by
 * its code finds every chunk. The same batch adds the chunk's rows and bytes to the count of the day that DailyCeiling reads.
 */
export class RecordingStore {
  /** Recordings and their clicks are kept this many days. */
  static DAYS = 30;
  static PREFIX = PREFIX;

  #db;
  #bucket;

  constructor({ db, bucket }) {
    this.#db = db;
    this.#bucket = bucket;
  }

  /** Where a chunk lives in R2. */
  static key(day, code, seq) {
    return `${PREFIX}${day}/${code}/${String(seq).padStart(3, '0')}`;
  }

  /** The rows D1 counts as written for a chunk: the recording and its entry in the index by day, the count of the day, the clicks. */
  static rowsOf(chunk) {
    return 3 + chunk.clicks.length;
  }

  /** `body` is the chunk as gzip, which is how R2 keeps it. */
  async save(chunk, body, { receivedAt, day, host }) {
    const [, recording] = await this.#db.batch([
      this.#db
        .prepare(
          `INSERT INTO daily_writes (day, rows, bytes) VALUES (?1, ?2, ?3)
           ON CONFLICT (day) DO UPDATE SET rows = daily_writes.rows + excluded.rows, bytes = daily_writes.bytes + excluded.bytes`,
        )
        .bind(day, RecordingStore.rowsOf(chunk), body.byteLength),
      this.#db
        .prepare(
          `INSERT INTO recording (code, day, started_at, last_at, host, page, version, language, first_event_ms,
             last_event_ms, chunks, last_seq, bytes, clicks)
           VALUES (?1, ?2, ?3, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 1, ?10, ?11, ?12)
           ON CONFLICT (code) DO UPDATE SET
             last_at = excluded.last_at,
             first_event_ms = min(recording.first_event_ms, excluded.first_event_ms),
             last_event_ms = max(recording.last_event_ms, excluded.last_event_ms),
             chunks = recording.chunks + 1,
             last_seq = max(recording.last_seq, excluded.last_seq),
             bytes = recording.bytes + excluded.bytes,
             clicks = recording.clicks + excluded.clicks
           RETURNING day`,
        )
        .bind(
          chunk.code,
          day,
          receivedAt,
          host,
          chunk.page,
          chunk.version,
          chunk.language,
          chunk.first ?? receivedAt,
          chunk.last ?? receivedAt,
          chunk.seq,
          body.byteLength,
          chunk.clicks.length,
        ),
      ...chunk.clicks.map((click, position) =>
        this.#db
          .prepare(
            `INSERT OR IGNORE INTO recording_click (code, seq, position, region, viewport, x, y, at_ms)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
          )
          .bind(
            chunk.code,
            chunk.seq,
            position,
            click.region,
            click.viewport,
            click.x,
            click.y,
            click.at,
          ),
      ),
    ]);
    await this.#bucket.put(
      RecordingStore.key(recording.results[0].day, chunk.code, chunk.seq),
      body,
      { httpMetadata: { contentType: 'application/json', contentEncoding: 'gzip' } },
    );
  }

  /** Deletes the recordings of these codes, their chunks and their clicks. A code that names nothing deletes nothing. */
  async delete(codes) {
    const marks = codes.map((_, index) => `?${index + 1}`).join(', ');
    const { results } = await this.#db
      .prepare(`SELECT code, day, last_seq FROM recording WHERE code IN (${marks})`)
      .bind(...codes)
      .all();
    await this.#deleteObjects(
      results.flatMap(({ code, day, last_seq: lastSeq }) =>
        Array.from({ length: lastSeq + 1 }, (_, seq) => RecordingStore.key(day, code, seq)),
      ),
    );
    await this.#db.batch([
      this.#db.prepare(`DELETE FROM recording_click WHERE code IN (${marks})`).bind(...codes),
      this.#db.prepare(`DELETE FROM recording WHERE code IN (${marks})`).bind(...codes),
    ]);
  }

  /**
   * Deletes what is past its 30 days on `today`: the chunks of the days before the first one kept, a week of them in case a
   * run was missed, whatever D1 says, and the rows of those recordings and their clicks.
   */
  async expire(today) {
    const first = Calendar.daysBefore(today, RecordingStore.DAYS);
    for (let back = 1; back <= MISSED_DAYS; back++) {
      const prefix = `${PREFIX}${Calendar.daysBefore(first, back)}/`;
      let cursor;
      do {
        const listed = await this.#bucket.list({ prefix, cursor });
        await this.#deleteObjects(listed.objects.map(({ key }) => key));
        cursor = listed.truncated ? listed.cursor : undefined;
      } while (cursor);
    }
    await this.#db.batch([
      this.#db
        .prepare(
          'DELETE FROM recording_click WHERE code IN (SELECT code FROM recording WHERE day < ?1)',
        )
        .bind(first),
      this.#db.prepare('DELETE FROM recording WHERE day < ?1').bind(first),
    ]);
  }

  async #deleteObjects(keys) {
    for (let start = 0; start < keys.length; start += DELETE_BATCH)
      await this.#bucket.delete(keys.slice(start, start + DELETE_BATCH));
  }
}

/** What a statement of the panel may start with, and the words that would change something even inside a WITH. */
const READS = /^\s*(?:SELECT|WITH)\b/i;
const WRITES =
  /\b(?:INSERT|UPDATE|DELETE|REPLACE|UPSERT|CREATE|DROP|ALTER|ATTACH|DETACH|PRAGMA|VACUUM|REINDEX)\b/i;

/**
 * The panel binds the collector's D1 and R2, which Cloudflare gives it with every right, so it reaches them only through
 * these: a database that prepares one SELECT at a time and nothing else, and a bucket that can only get an object. A write
 * throws before it reaches the binding.
 */
export class ReadOnlyBindings {
  /** `db` as ReadingQueries uses it: `prepare(sql)` and `batch(statements)`. */
  static database(db) {
    return {
      prepare(sql) {
        if (!READS.test(sql) || WRITES.test(sql) || sql.includes(';'))
          throw new Error('the panel only reads');
        return db.prepare(sql);
      },
      batch(statements) {
        return db.batch(statements);
      },
    };
  }

  /** `bucket` with only `get(key)`. */
  static bucket(bucket) {
    return {
      get(key) {
        return bucket.get(key);
      },
    };
  }
}

-- Session recordings and the clicks of the heat map, only for visitors who consented (docs/decisions/0010, docs/privacy.md).
-- A recording is one page load, named by a random code made in the page for it alone, so two recordings of the same person
-- cannot be linked. Its chunks of events live in R2 under recordings/<day>/<code>/<seq>; these rows say what each recording
-- is and where its clicks landed. Both live 30 days, and a request with the code deletes them at once.

CREATE TABLE recording (
  code TEXT PRIMARY KEY,
  day TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  last_at INTEGER NOT NULL,
  host TEXT NOT NULL,
  page TEXT NOT NULL,
  version TEXT NOT NULL,
  language TEXT NOT NULL,
  first_event_ms INTEGER NOT NULL,
  last_event_ms INTEGER NOT NULL,
  chunks INTEGER NOT NULL,
  last_seq INTEGER NOT NULL,
  bytes INTEGER NOT NULL,
  clicks INTEGER NOT NULL
) STRICT;

CREATE INDEX recording_by_day ON recording (day);

-- Where a click landed: the part of the page, the range of the window's width, and the position inside that part, from 0 to 1.
CREATE TABLE recording_click (
  code TEXT NOT NULL,
  seq INTEGER NOT NULL,
  position INTEGER NOT NULL,
  region TEXT NOT NULL,
  viewport TEXT NOT NULL,
  x REAL NOT NULL,
  y REAL NOT NULL,
  at_ms INTEGER NOT NULL,
  PRIMARY KEY (code, seq, position)
) STRICT;

-- The bytes of recordings stored each day, which DailyCeiling holds below what R2's free storage can keep for 30 days.
ALTER TABLE daily_writes ADD COLUMN bytes INTEGER NOT NULL DEFAULT 0;

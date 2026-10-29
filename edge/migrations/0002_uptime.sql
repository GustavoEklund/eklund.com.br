-- The checks of the uptime monitor, every five minutes for each page: kept 90 days, and their daily totals 25 months. Nothing
-- here is about a visitor.

CREATE TABLE uptime_check (
  checked_at INTEGER NOT NULL,
  day TEXT NOT NULL,
  target TEXT NOT NULL,
  status INTEGER,
  duration_ms INTEGER NOT NULL,
  problem TEXT,
  PRIMARY KEY (target, checked_at)
) STRICT;

CREATE INDEX uptime_check_by_day ON uptime_check (day);

-- Where each page stands: how many checks in a row failed, since when, and the open issue.
CREATE TABLE uptime_target (
  target TEXT PRIMARY KEY,
  failures INTEGER NOT NULL,
  failing_since INTEGER,
  issue INTEGER
) STRICT;

CREATE TABLE daily_uptime (
  day TEXT NOT NULL,
  target TEXT NOT NULL,
  checks INTEGER NOT NULL,
  failures INTEGER NOT NULL,
  p50_ms INTEGER NOT NULL,
  p95_ms INTEGER NOT NULL,
  PRIMARY KEY (day, target)
) STRICT;

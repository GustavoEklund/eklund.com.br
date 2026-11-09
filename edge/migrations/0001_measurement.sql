-- What the collector keeps (docs/decisions/0009 and 0010, docs/privacy.md): no IP address, no User-Agent string and nothing
-- that links one page load to another. page_view.id is made at random in the page's memory for one load and never stored on
-- the device. The rows live 13 months (errors 90 days) and their daily totals 25 months; the Worker's Cron Trigger deletes
-- them after that.

CREATE TABLE page_view (
  id TEXT PRIMARY KEY,
  day TEXT NOT NULL,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  host TEXT NOT NULL,
  page TEXT NOT NULL,
  version TEXT NOT NULL,
  language TEXT NOT NULL,
  referrer TEXT,
  country TEXT,
  device TEXT NOT NULL,
  browser TEXT NOT NULL,
  browser_version INTEGER,
  viewport TEXT NOT NULL,
  pixel_ratio TEXT NOT NULL,
  memory TEXT NOT NULL,
  cores TEXT NOT NULL,
  round_trip TEXT NOT NULL,
  save_data INTEGER NOT NULL,
  color_scheme TEXT NOT NULL,
  reduced_motion INTEGER NOT NULL,
  navigation TEXT NOT NULL,
  visible_ms INTEGER NOT NULL
) STRICT;

CREATE INDEX page_view_by_day ON page_view (day);

CREATE TABLE vital (
  view_id TEXT NOT NULL,
  name TEXT NOT NULL,
  value REAL NOT NULL,
  rating TEXT NOT NULL,
  attribution TEXT NOT NULL,
  PRIMARY KEY (view_id, name)
) STRICT;

CREATE TABLE event (
  view_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  detail TEXT,
  value REAL,
  at_ms INTEGER NOT NULL,
  PRIMARY KEY (view_id, seq, position)
) STRICT;

CREATE TABLE error (
  view_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  position INTEGER NOT NULL,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  source TEXT NOT NULL,
  line INTEGER NOT NULL,
  column_number INTEGER NOT NULL,
  at_ms INTEGER NOT NULL,
  PRIMARY KEY (view_id, seq, position)
) STRICT;

CREATE TABLE daily_view (
  day TEXT NOT NULL,
  host TEXT NOT NULL,
  page TEXT NOT NULL,
  version TEXT NOT NULL,
  language TEXT NOT NULL,
  device TEXT NOT NULL,
  browser TEXT NOT NULL,
  country TEXT NOT NULL,
  referrer TEXT NOT NULL,
  views INTEGER NOT NULL,
  visible_ms INTEGER NOT NULL,
  PRIMARY KEY (day, host, page, version, language, device, browser, country, referrer)
) STRICT;

CREATE TABLE daily_vital (
  day TEXT NOT NULL,
  page TEXT NOT NULL,
  version TEXT NOT NULL,
  device TEXT NOT NULL,
  name TEXT NOT NULL,
  total INTEGER NOT NULL,
  p50 REAL NOT NULL,
  p75 REAL NOT NULL,
  p95 REAL NOT NULL,
  good INTEGER NOT NULL,
  needs_improvement INTEGER NOT NULL,
  poor INTEGER NOT NULL,
  PRIMARY KEY (day, page, version, device, name)
) STRICT;

CREATE TABLE daily_event (
  day TEXT NOT NULL,
  page TEXT NOT NULL,
  version TEXT NOT NULL,
  name TEXT NOT NULL,
  detail TEXT NOT NULL,
  total INTEGER NOT NULL,
  PRIMARY KEY (day, page, version, name, detail)
) STRICT;

CREATE TABLE daily_error (
  day TEXT NOT NULL,
  version TEXT NOT NULL,
  kind TEXT NOT NULL,
  source TEXT NOT NULL,
  message TEXT NOT NULL,
  total INTEGER NOT NULL,
  PRIMARY KEY (day, version, kind, source, message)
) STRICT;

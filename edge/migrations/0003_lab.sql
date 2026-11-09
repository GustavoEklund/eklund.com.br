-- What the nightly lab job sends (tools/lab-run.mjs): PageSpeed Insights runs, CrUX readings, the rows of Google Search Console
-- and Bing Webmaster Tools, and the certificates of the site. Nothing here is about a visitor, and nothing is deleted: the
-- series is what tells one release from the next (docs/privacy.md).

-- Each PageSpeed Insights run, five a night for each page and form factor. The median run, by score, names its full report in R2.
CREATE TABLE lab_run (
  day TEXT NOT NULL,
  page TEXT NOT NULL,
  form_factor TEXT NOT NULL,
  run INTEGER NOT NULL,
  median INTEGER NOT NULL,
  score REAL NOT NULL,
  lcp_ms REAL NOT NULL,
  fcp_ms REAL NOT NULL,
  cls REAL NOT NULL,
  tbt_ms REAL NOT NULL,
  speed_index_ms REAL NOT NULL,
  ttfb_ms REAL NOT NULL,
  report TEXT,
  PRIMARY KEY (day, page, form_factor, run)
) STRICT;

-- The 75th percentile and the share of good, needs-improvement and poor loads that CrUX reports for the last 28 days, for the
-- origin and each page that has enough visits.
CREATE TABLE crux_reading (
  day TEXT NOT NULL,
  scope TEXT NOT NULL,
  form_factor TEXT NOT NULL,
  metric TEXT NOT NULL,
  p75 REAL NOT NULL,
  good REAL NOT NULL,
  needs_improvement REAL NOT NULL,
  poor REAL NOT NULL,
  PRIMARY KEY (day, scope, form_factor, metric)
) STRICT;

-- Clicks and impressions as each search engine aggregates them. Google gives a row for each page, query, country and device;
-- Bing gives one for each query, and its totals of the day have an empty query.
CREATE TABLE search_row (
  engine TEXT NOT NULL,
  day TEXT NOT NULL,
  page TEXT NOT NULL,
  query TEXT NOT NULL,
  country TEXT NOT NULL,
  device TEXT NOT NULL,
  clicks INTEGER NOT NULL,
  impressions INTEGER NOT NULL,
  position REAL,
  PRIMARY KEY (engine, day, page, query, country, device)
) STRICT;

CREATE TABLE certificate (
  day TEXT NOT NULL,
  host TEXT NOT NULL,
  valid_to INTEGER NOT NULL,
  issuer TEXT NOT NULL,
  PRIMARY KEY (day, host)
) STRICT;

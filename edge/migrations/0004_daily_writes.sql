-- How many rows the collector wrote each day, so that it stops below the free plan's daily quota of D1 writes and leaves
-- room for the uptime monitor, the lab job and the retention. One row per day; the retention keeps the last three.
CREATE TABLE daily_writes (
  day TEXT PRIMARY KEY,
  rows INTEGER NOT NULL
) STRICT;

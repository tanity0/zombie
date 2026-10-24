CREATE TABLE IF NOT EXISTS ghost_records (
  record_id TEXT PRIMARY KEY,
  anon_id TEXT NOT NULL,
  slot TEXT NOT NULL,
  epoch INTEGER NOT NULL,
  knobs_v INTEGER NOT NULL DEFAULT 0,
  profile_json TEXT NOT NULL,
  perf REAL,
  build_version TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (anon_id, slot, epoch)
);

CREATE INDEX IF NOT EXISTS ghost_records_slot_epoch_random
  ON ghost_records(slot, epoch);
CREATE INDEX IF NOT EXISTS ghost_records_slot_epoch_perf
  ON ghost_records(slot, epoch, perf DESC);
CREATE INDEX IF NOT EXISTS ghost_records_updated_at
  ON ghost_records(updated_at);

CREATE TABLE IF NOT EXISTS ghost_stats (
  anon_id TEXT NOT NULL,
  slot TEXT NOT NULL,
  epoch INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (anon_id, slot, epoch)
);

CREATE TABLE IF NOT EXISTS ghost_feedback_events (
  event_id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_anon_id TEXT NOT NULL,
  slot TEXT NOT NULL,
  epoch INTEGER NOT NULL,
  actor_name TEXT NOT NULL,
  liked INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  acked_at INTEGER
);

CREATE INDEX IF NOT EXISTS ghost_feedback_inbox
  ON ghost_feedback_events(owner_anon_id, acked_at, event_id);

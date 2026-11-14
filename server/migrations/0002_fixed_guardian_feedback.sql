CREATE TABLE IF NOT EXISTS fixed_ghost_stats (
  guardian_id TEXT NOT NULL,
  slot TEXT NOT NULL,
  epoch INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guardian_id, slot, epoch)
);

CREATE TABLE IF NOT EXISTS ghost_feedback_receipts (
  client_event_id TEXT PRIMARY KEY,
  actor_anon_id TEXT NOT NULL,
  target_key TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS ghost_feedback_receipts_created
  ON ghost_feedback_receipts(created_at);

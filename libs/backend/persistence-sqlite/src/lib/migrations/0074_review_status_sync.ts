// Static SQL only. Never interpolate values into this migration.
export const sql = `
CREATE TABLE review_status_sync (
  attempt_id TEXT PRIMARY KEY REFERENCES review_attempts(attempt_id),
  machine_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending', 'success', 'failure', 'error')),
  description TEXT NOT NULL,
  external_id TEXT,
  sync_pending INTEGER NOT NULL DEFAULT 1 CHECK (sync_pending IN (0, 1)),
  retry_at INTEGER,
  error_summary TEXT,
  synced_state TEXT,
  synced_description TEXT,
  updated_at INTEGER NOT NULL
);
CREATE INDEX review_status_sync_retry ON review_status_sync(sync_pending, retry_at);
`;

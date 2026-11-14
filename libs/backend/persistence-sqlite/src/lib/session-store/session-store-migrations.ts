import type { Migration } from '../migrations';

// Migrations for sessions.sqlite only. Its ledger is separate from
// ptah.sqlite's, so versions start at 1 again.
//
// sessions: one row per session for every project and host. workspace_key is
// normalizeWorkspaceRoot(workspace_path), NULL for a projectless session.
// summary_json is the lean listing entry, detail_json the full record without
// bulk agent output (that lives in per-session files).
//
// session_migration_sources: one row per legacy workspace store copied in, so
// the copy-forward migration can be run again safely and leaves a receipt.
//
// SECURITY: SQL MUST stay static. No template interpolation.
const S0001_SESSIONS = `
CREATE TABLE IF NOT EXISTS sessions (
  session_id     TEXT    PRIMARY KEY,
  workspace_key  TEXT,
  workspace_path TEXT,
  host           TEXT    NOT NULL,
  name           TEXT    NOT NULL,
  created_at     INTEGER NOT NULL,
  last_active_at INTEGER NOT NULL,
  is_child       INTEGER NOT NULL DEFAULT 0,
  summary_json   TEXT    NOT NULL,
  detail_json    TEXT    NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_host_workspace
  ON sessions (host, workspace_key, last_active_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_host_recent
  ON sessions (host, last_active_at DESC);

CREATE TABLE IF NOT EXISTS session_migration_sources (
  host               TEXT    NOT NULL,
  source_path        TEXT    NOT NULL,
  source_fingerprint TEXT    NOT NULL,
  sessions_copied    INTEGER NOT NULL,
  migrated_at        INTEGER NOT NULL,
  PRIMARY KEY (host, source_path, source_fingerprint)
);
`;

const S0002_SESSION_STATS = `
CREATE TABLE session_usage_turns (
  session_id TEXT NOT NULL,
  producer TEXT NOT NULL,
  run_id TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  event_key TEXT NOT NULL,
  occurred_at_ms INTEGER NOT NULL,
  provider_id TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cache_read_tokens INTEGER NOT NULL,
  cache_write_tokens INTEGER NOT NULL,
  known_cost_micro_usd INTEGER,
  cost_authority TEXT NOT NULL,
  source TEXT NOT NULL,
  pricing_version TEXT,
  revision INTEGER NOT NULL,
  workspace_key TEXT,
  host TEXT,
  PRIMARY KEY (session_id, producer, event_key, model_id)
);
CREATE INDEX idx_session_usage_turns_time ON session_usage_turns (occurred_at_ms, provider_id, model_id);
CREATE INDEX idx_session_usage_turns_session_time ON session_usage_turns (session_id, occurred_at_ms);
CREATE INDEX idx_session_usage_workspace_time ON session_usage_turns (workspace_key, occurred_at_ms);
CREATE INDEX idx_sessions_workspace_key ON sessions (workspace_key, session_id);
CREATE TABLE session_stats (
  session_id TEXT PRIMARY KEY,
  host TEXT NOT NULL,
  workspace_key TEXT,
  provider_id TEXT NOT NULL,
  started_at_ms INTEGER NOT NULL,
  last_usage_at_ms INTEGER NOT NULL,
  finalized_at_ms INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cache_read_tokens INTEGER NOT NULL,
  cache_write_tokens INTEGER NOT NULL,
  known_cost_micro_usd INTEGER,
  has_unpriced INTEGER NOT NULL,
  source TEXT NOT NULL,
  pricing_version TEXT,
  revision INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);
CREATE INDEX idx_session_stats_workspace_time ON session_stats (workspace_key, last_usage_at_ms);
CREATE TABLE session_usage_coverage (
  workspace_key TEXT PRIMARY KEY,
  first_captured_at_ms INTEGER NOT NULL,
  last_captured_at_ms INTEGER NOT NULL
);
`;

const S0003_SESSION_FINALIZATION = `
ALTER TABLE session_stats ADD COLUMN finalize_revision INTEGER;
ALTER TABLE session_stats ADD COLUMN finalize_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE session_stats ADD COLUMN finalize_retry_at_ms INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_session_stats_finalization ON session_stats (status, finalize_retry_at_ms, last_usage_at_ms);
`;

// host_run_leases: one heartbeat per running host process (Electron or CLI),
// beside the session records it vouches for, so every host sharing this file
// can tell a live writer of a `running` CLI reference from a dead one.
const S0004_HOST_RUN_LEASES = `
CREATE TABLE IF NOT EXISTS host_run_leases (
  host_run_id  TEXT    PRIMARY KEY,
  pid          INTEGER NOT NULL,
  heartbeat_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_host_run_leases_heartbeat
  ON host_run_leases (heartbeat_at);
`;

const S0005_USAGE_DIMENSIONS = `
ALTER TABLE session_usage_turns ADD COLUMN phase_kind TEXT;
ALTER TABLE session_usage_turns ADD COLUMN executor_type TEXT;
`;

const S0006_USAGE_COVERAGE = `
CREATE TABLE session_usage_turns_new (
  session_id TEXT NOT NULL, producer TEXT NOT NULL, run_id TEXT NOT NULL,
  native_thread_id TEXT, turn_id TEXT NOT NULL, model_id TEXT NOT NULL,
  event_key TEXT NOT NULL, occurred_at_ms INTEGER NOT NULL, provider_id TEXT NOT NULL,
  input_tokens INTEGER, output_tokens INTEGER, cache_read_tokens INTEGER,
  cache_write_tokens INTEGER, known_cost_micro_usd INTEGER,
  cost_authority TEXT NOT NULL, source TEXT NOT NULL, pricing_version TEXT,
  revision INTEGER NOT NULL, workspace_key TEXT, host TEXT,
  phase_kind TEXT, executor_type TEXT, repository_id TEXT, worktree_path TEXT, missing_reason TEXT,
  billable INTEGER NOT NULL DEFAULT 1 CHECK (billable IN (0,1)),
  coverage_start_ms INTEGER, coverage_end_ms INTEGER,
  PRIMARY KEY (session_id,event_key,model_id)
);
INSERT OR IGNORE INTO session_usage_turns_new
 (session_id,producer,run_id,turn_id,model_id,event_key,occurred_at_ms,provider_id,
  input_tokens,output_tokens,cache_read_tokens,cache_write_tokens,known_cost_micro_usd,
  cost_authority,source,pricing_version,revision,workspace_key,host,phase_kind,executor_type)
 SELECT t.session_id,t.producer,t.run_id,t.turn_id,t.model_id,t.event_key,t.occurred_at_ms,t.provider_id,
   t.input_tokens,t.output_tokens,t.cache_read_tokens,t.cache_write_tokens,t.known_cost_micro_usd,
   t.cost_authority,t.source,t.pricing_version,t.revision,t.workspace_key,t.host,t.phase_kind,t.executor_type
 FROM session_usage_turns AS t
 WHERE t.producer = (SELECT owner.producer FROM session_usage_turns AS owner
   WHERE owner.session_id = t.session_id AND owner.event_key = t.event_key
   ORDER BY CASE owner.producer WHEN 'sdk-owner' THEN 0 WHEN 'codex-checkpoint' THEN 1
     WHEN 'cli-lane' THEN 2 ELSE 3 END, owner.revision DESC, owner.rowid DESC LIMIT 1)
 ORDER BY CASE t.producer WHEN 'sdk-owner' THEN 0 WHEN 'codex-checkpoint' THEN 1
   WHEN 'cli-lane' THEN 2 ELSE 3 END, t.revision DESC, t.rowid DESC;
DROP TABLE session_usage_turns;
ALTER TABLE session_usage_turns_new RENAME TO session_usage_turns;
CREATE INDEX idx_session_usage_turns_time ON session_usage_turns (occurred_at_ms,provider_id,model_id);
CREATE INDEX idx_session_usage_turns_session_time ON session_usage_turns (session_id,occurred_at_ms);
CREATE INDEX idx_session_usage_workspace_time ON session_usage_turns (workspace_key,occurred_at_ms);
CREATE INDEX idx_session_usage_repository_time ON session_usage_turns (repository_id,occurred_at_ms);
CREATE INDEX idx_session_usage_billable_session ON session_usage_turns (session_id,billable,occurred_at_ms);
CREATE INDEX idx_session_usage_native_thread ON session_usage_turns (native_thread_id,occurred_at_ms);
ALTER TABLE session_stats ADD COLUMN repository_id TEXT;
ALTER TABLE session_stats ADD COLUMN worktree_path TEXT;
ALTER TABLE session_stats ADD COLUMN missing_reason TEXT;
-- The old key included producer. Recompute aggregates after selecting one owner
-- for each event so completed sessions cannot retain totals from discarded rows.
UPDATE session_stats SET
  input_tokens = COALESCE((SELECT SUM(input_tokens) FROM session_usage_turns WHERE session_id = session_stats.session_id AND billable = 1), 0),
  output_tokens = COALESCE((SELECT SUM(output_tokens) FROM session_usage_turns WHERE session_id = session_stats.session_id AND billable = 1), 0),
  cache_read_tokens = COALESCE((SELECT SUM(cache_read_tokens) FROM session_usage_turns WHERE session_id = session_stats.session_id AND billable = 1), 0),
  cache_write_tokens = COALESCE((SELECT SUM(cache_write_tokens) FROM session_usage_turns WHERE session_id = session_stats.session_id AND billable = 1), 0),
  known_cost_micro_usd = (SELECT SUM(known_cost_micro_usd) FROM session_usage_turns WHERE session_id = session_stats.session_id AND billable = 1),
  has_unpriced = COALESCE((SELECT MAX(known_cost_micro_usd IS NULL OR input_tokens IS NULL OR output_tokens IS NULL OR cache_read_tokens IS NULL OR cache_write_tokens IS NULL)
    FROM session_usage_turns WHERE session_id = session_stats.session_id AND billable = 1), 0);
CREATE INDEX idx_session_stats_repository_time ON session_stats (repository_id,last_usage_at_ms);
`;

const S0007_USAGE_SOURCE_CURSOR = `
CREATE TABLE usage_source_cursor (
  source_id TEXT NOT NULL, source_path TEXT NOT NULL, fingerprint TEXT NOT NULL,
  mtime_ms INTEGER NOT NULL, byte_offset INTEGER NOT NULL CHECK (byte_offset >= 0),
  last_event_key TEXT, updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY (source_id,source_path)
);
CREATE INDEX idx_usage_source_cursor_updated ON usage_source_cursor (updated_at_ms);
`;

export const SESSION_STORE_MIGRATIONS: readonly Migration[] = [
  { version: 1, name: 'S0001_sessions', sql: S0001_SESSIONS },
  { version: 2, name: 'S0002_session_stats', sql: S0002_SESSION_STATS },
  { version: 3, name: 'S0003_session_finalization', sql: S0003_SESSION_FINALIZATION },
  { version: 4, name: 'S0004_host_run_leases', sql: S0004_HOST_RUN_LEASES },
  { version: 5, name: 'S0005_usage_dimensions', sql: S0005_USAGE_DIMENSIONS },
  { version: 6, name: 'S0006_usage_coverage', sql: S0006_USAGE_COVERAGE },
  { version: 7, name: 'S0007_usage_source_cursor', sql: S0007_USAGE_SOURCE_CURSOR },
];

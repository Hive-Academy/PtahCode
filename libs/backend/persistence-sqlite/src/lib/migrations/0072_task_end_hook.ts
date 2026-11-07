// Migration 0072 — task-end hook journal, runs, steps and per-repository state
// (TASK_2026_886). Static SQL only. SECURITY: no template interpolation.
// task_end_steps has no free-text message column: the displayed sentence is
// looked up from TASK_END_REASON_MESSAGES at read time, so no engine text,
// path or error message can reach a stored row.
export const sql = `
CREATE TABLE IF NOT EXISTS task_end_repo_state (
  repo_id TEXT PRIMARY KEY,
  baseline_at INTEGER NOT NULL,
  main_root TEXT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS task_end_journal (
  repo_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  last_status TEXT NOT NULL CHECK (last_status IN ('backlog', 'in_progress', 'in_review', 'blocked', 'done', 'cancelled')),
  episode INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (repo_id, task_id)
);

CREATE TABLE IF NOT EXISTS task_end_transitions (
  transition_id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  episode INTEGER NOT NULL,
  from_status TEXT NULL,
  to_status TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('write', 'watcher', 'reindex', 'startup-reconcile', 'baseline')),
  seen_root TEXT NOT NULL,
  observed_at INTEGER NOT NULL,
  no_run_reason TEXT NULL CHECK (no_run_reason IS NULL OR no_run_reason IN ('baseline', 'hook-disabled'))
);
CREATE INDEX IF NOT EXISTS idx_task_end_transitions_task_episode
  ON task_end_transitions (repo_id, task_id, episode);

CREATE TABLE IF NOT EXISTS task_end_runs (
  run_id TEXT PRIMARY KEY,
  transition_id TEXT NOT NULL UNIQUE REFERENCES task_end_transitions(transition_id),
  repo_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  episode INTEGER NOT NULL,
  source TEXT NOT NULL,
  from_status TEXT NULL,
  to_status TEXT NOT NULL,
  seen_root TEXT NOT NULL,
  main_root TEXT NULL,
  state TEXT NOT NULL CHECK (state IN ('settling', 'queued', 'running', 'completed', 'cancelled', 'skipped')),
  reason TEXT NULL,
  queue_seq INTEGER NOT NULL,
  settle_until INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  started_at INTEGER NULL,
  ended_at INTEGER NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (repo_id, task_id, episode)
);
CREATE INDEX IF NOT EXISTS idx_task_end_runs_state_queue
  ON task_end_runs (state, queue_seq);
CREATE INDEX IF NOT EXISTS idx_task_end_runs_task_created
  ON task_end_runs (repo_id, task_id, created_at DESC);

CREATE TABLE IF NOT EXISTS task_end_steps (
  run_id TEXT NOT NULL REFERENCES task_end_runs(run_id),
  step TEXT NOT NULL CHECK (step IN ('close-curate', 'harvest', 'dispose', 'index')),
  subject TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending', 'running', 'succeeded', 'skipped', 'deferred', 'blocked', 'failed')),
  reason TEXT NULL,
  extra_json TEXT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  requested_at INTEGER NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (run_id, step, subject)
);
CREATE INDEX IF NOT EXISTS idx_task_end_steps_step_state
  ON task_end_steps (step, state);
`;

// Task close-out run and step journal (TASK_2026_898).
export const sql = `
CREATE TABLE IF NOT EXISTS task_close_out_runs (
  run_id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  pr_number INTEGER NOT NULL CHECK (pr_number > 0),
  pr_url TEXT NOT NULL,
  main_root TEXT NOT NULL,
  worktree_path TEXT NOT NULL,
  branch TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (repo_id, task_id, pr_number)
);
CREATE TABLE IF NOT EXISTS task_close_out_steps (
  run_id TEXT NOT NULL REFERENCES task_close_out_runs(run_id),
  step TEXT NOT NULL CHECK (step IN ('memory', 'learning', 'worktree', 'branch')),
  state TEXT NOT NULL CHECK (state IN ('pending', 'running', 'ok', 'failed', 'refused', 'skipped')),
  reason TEXT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (run_id, step)
);
`;

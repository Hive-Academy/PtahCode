// Migration 0076 — cron job creator and run session (TASK_2026_2272_7f01, issue #1400).
// Agents can now create scheduled jobs through MCP tools, so a job records who
// created it: 'user' (UI / RPC) or 'session' (an agent session, with its id).
// A run records the SDK session id that executed it, so the UI can link to it.
// Existing rows read as created by the user, with no run session.
// The migration runner applies these bare ALTERs exactly once in its transaction.
// SECURITY: SQL MUST stay static. No template interpolation.
export const sql = `
ALTER TABLE scheduled_jobs ADD COLUMN created_by_kind TEXT NOT NULL DEFAULT 'user'
  CHECK (created_by_kind IN ('user', 'session'));
ALTER TABLE scheduled_jobs ADD COLUMN created_by_session_id TEXT;
ALTER TABLE job_runs ADD COLUMN session_id TEXT;
`;

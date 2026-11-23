// Migration 0077 — code symbol index: per-file fingerprints, root validation and
// a model-qualified text hash per symbol row (TASK_2026_2312_c3ef).
// code_symbol_files holds one record per analyzed file (also a file with zero
// symbols), so a later full run skips a file whose stat fingerprint and embedder
// model did not change. code_index_roots records when a complete run validated a
// root. code_symbols.text_hash (sha256 of model id + symbol text) lets a writer
// reuse a vector that another row or root already holds. Existing rows keep a
// NULL text_hash until their file is written again.
// The migration runner applies these statements exactly once in its transaction.
// SECURITY: SQL MUST stay static. No template interpolation.
export const sql = `
CREATE TABLE IF NOT EXISTS code_symbol_files (
  workspace_root TEXT NOT NULL,
  file_path      TEXT NOT NULL,
  fingerprint    TEXT NOT NULL,
  updated_at     INTEGER NOT NULL,
  PRIMARY KEY (workspace_root, file_path)
);
CREATE TABLE IF NOT EXISTS code_index_roots (
  workspace_root TEXT PRIMARY KEY,
  validated_at   INTEGER NOT NULL
);
ALTER TABLE code_symbols ADD COLUMN text_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_code_symbols_text_hash ON code_symbols(text_hash);
`;

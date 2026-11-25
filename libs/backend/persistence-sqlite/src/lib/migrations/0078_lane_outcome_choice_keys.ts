// Migration 0078 — lane outcome choice keys (TASK_2026_2328_5bd6, PLAN §2.3).
// Lane outcomes record model/effort selection, provenance, disposition,
// native reported session values, and System One routing proposal facts.
// Existing rows keep NULL: no stored row is rewritten.
// The migration runner applies these bare ALTERs exactly once in its transaction.
// SECURITY: SQL MUST stay static. No template interpolation.
export const sql = `
ALTER TABLE lane_outcome_records ADD COLUMN model_source TEXT;
ALTER TABLE lane_outcome_records ADD COLUMN resolved_model TEXT;
ALTER TABLE lane_outcome_records ADD COLUMN resolved_model_provenance TEXT;
ALTER TABLE lane_outcome_records ADD COLUMN requested_effort TEXT;
ALTER TABLE lane_outcome_records ADD COLUMN effort TEXT;
ALTER TABLE lane_outcome_records ADD COLUMN effort_source TEXT;
ALTER TABLE lane_outcome_records ADD COLUMN effort_provenance TEXT;
ALTER TABLE lane_outcome_records ADD COLUMN effort_disposition TEXT;
ALTER TABLE lane_outcome_records ADD COLUMN resolved_effort TEXT;
ALTER TABLE lane_outcome_records ADD COLUMN resolved_effort_provenance TEXT;
ALTER TABLE lane_outcome_records ADD COLUMN routed_model TEXT;
ALTER TABLE lane_outcome_records ADD COLUMN routed_effort TEXT;
ALTER TABLE lane_outcome_records ADD COLUMN decision_model TEXT;
ALTER TABLE lane_outcome_records ADD COLUMN proposal_confidence REAL;
`;

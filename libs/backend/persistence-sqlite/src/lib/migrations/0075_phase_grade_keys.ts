// Migration 0075 — phase grade keys (TASK_2026_1175_2690, decision P4-10).
// Lane outcomes record the phase kind of the lane. Task grades record the
// phase kind and the executor kind of the attributed lane.
// Existing rows keep NULL: no stored row is rewritten. Old role grades stay
// readable through the role-to-phase alias table at read time.
// The migration runner applies these bare ALTERs exactly once in its transaction.
// SECURITY: SQL MUST stay static. No template interpolation.
export const sql = `
ALTER TABLE lane_outcome_records ADD COLUMN phase_kind TEXT;
ALTER TABLE skill_task_grades ADD COLUMN phase_kind TEXT;
ALTER TABLE skill_task_grades ADD COLUMN executor_kind TEXT;
`;

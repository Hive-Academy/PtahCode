/** Stage rows the orchestrator creates and the stage runners write lane use into; one source so names cannot drift. */
export const TRIAGE_STAGE = { name: 'triage', ordinal: 1 } as const;
export const VERIFICATION_STAGE = { name: 'verification', ordinal: 3 } as const;

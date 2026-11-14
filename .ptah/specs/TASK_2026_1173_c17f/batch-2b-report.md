# Batch 2b report

## Files changed

- `libs/frontend/machines-ui/src/lib/services/transcript-event-validators.ts`: validate either SDK `taskId` with no native payload, or native Codex metadata with no `taskId` and a required `agentId`.
- `libs/frontend/machines-ui/src/lib/services/transcript-event-validators.spec.ts`: add native variant coverage and adapt the generic required-field table to the discriminated union.

## Tests added

- SDK accepted; SDK missing `taskId` rejected.
- Native accepted; missing `agentThreadId`, invalid `kind`, negative or fractional `cycleOrdinal`, and non-Codex `provider` rejected.

## Verify results

- `npx jest --config libs/frontend/machines-ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/machines-ui/src/lib/services/transcript-event-validators.spec.ts`: exit 0; 1 suite, 189 tests passed.
- `npx tsc --noEmit --project libs/frontend/machines-ui/tsconfig.lib.json`: exit 0; no output.
- `npx eslint libs/frontend/machines-ui/src/lib/services/transcript-event-validators.ts libs/frontend/machines-ui/src/lib/services/transcript-event-validators.spec.ts`: exit 0; only two `@nx/enforce-module-boundaries` warnings that no cached ProjectGraph was available and the rule was skipped.
- `ptah_get_diagnostics` after edits: no diagnostics in changed files. Its separate compiler context reported eight BigInt target errors in unchanged sibling files; the requested project `tsc` command passed.

## Decisions

- Kept common `agent_status` fields in the event table and added a small variant check because the per-field table cannot express the relation between `taskId`, `agentId`, and `native`. This follows the shared type and worker-protocol union rule. Reversible within the validator.
- Excluded `agentId` and `native` from the spec's generic required-field matrix for `agent_status` because each is required only in the native branch. Dedicated tests cover their branch behavior. Reversible within the spec.

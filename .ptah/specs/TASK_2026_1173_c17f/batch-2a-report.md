# Batch 2a report

## Files changed

- `libs/shared/src/lib/types/execution/stream-background.ts`: split `AgentStatusEvent` into SDK and native Codex variants while retaining the existing base fields and flat union membership.
- `libs/worker-protocol/src/lib/frames.ts`: validate either SDK status with `taskId` and no `native`, or native Codex status with required `agentId`, no `taskId`, and the complete native metadata.
- `libs/worker-protocol/src/lib/frames.spec.ts`: added protocol regression cases.

## Exported types and barrel

`SdkAgentStatusEvent`, `NativeCodexAgentStatus`, `NativeCodexAgentStatusEvent`, and `AgentStatusEvent` are exported from `stream-background.ts`. `libs/shared/src/lib/types/execution/index.ts` already has `export * from './stream-background'`, so no barrel edit was needed.

## Tests added

SDK status accepted with `taskId` and rejected without it. Native status accepted with complete metadata and rejected when `agentThreadId` is missing, `kind` is invalid, or `cycleOrdinal` is negative or fractional.

## Verification

- `npx jest --config libs/worker-protocol/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/worker-protocol/src/lib/frames.spec.ts`: exit 0; 1 suite passed, 50 tests passed.
- `npx tsc --noEmit --project libs/shared/tsconfig.lib.json`: exit 0, no diagnostics.
- `npx tsc --noEmit --project libs/worker-protocol/tsconfig.lib.json`: exit 0, no diagnostics.
- `npx eslint libs/shared/src/lib/types/execution/stream-background.ts libs/worker-protocol/src/lib/frames.ts libs/worker-protocol/src/lib/frames.spec.ts`: exit 0; three warnings that `@nx/enforce-module-boundaries` was skipped because no cached ProjectGraph was available.
- Scoped `ptah_get_diagnostics` was requested after edits, but its TypeScript check remained running past the tool's 45-second timeout and returned unavailable. The two explicit TypeScript project checks above passed.

## Decisions

- Used a union of two flat Zod schemas, with `z.undefined().optional()` on the opposite variant's discriminant field. This follows the exact SDK/native contract and rejects mixed payloads. Reversible by changing only the `agent_status` schema.
- Reused the existing execution barrel because its wildcard export already exposes the new type names. No barrel edit was necessary.

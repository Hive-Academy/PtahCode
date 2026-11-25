# Batch 1 report: usage contracts and shared request field

**Tasks completed**: 1.1, 1.2, 1.3, 1.4

## Files

- CREATED `libs/backend/review-contracts/src/lib/review-usage.schema.ts`: `REVIEW_STAGE_USAGE_RUNS_MAX = 16`, the strict `ReviewUsageTotalSchema` and the `ReviewUsageTotal` type. Token counts are `int().nonnegative().safe().nullable()`, `costUsd` is `finite().nonnegative().nullable()`, the two partial flags are booleans, and `runs` is `int().nonnegative().safe()` with no small cap (F8).
- MODIFIED `libs/backend/review-contracts/src/index.ts`: exports the new schema file.
- MODIFIED `libs/backend/review-contracts/src/lib/review-run.schema.ts`: adds `usage: ReviewUsageTotalSchema.nullable().optional()` to `StageRecordSchema` and `ReviewRunSchema`, each with a JSDoc line.
- MODIFIED `libs/backend/review-contracts/src/lib/review-lanes.schema.ts`: adds `defaultModelBlocked: z.boolean().optional()` to `ReviewLaneListingEntrySchema`.
- MODIFIED `libs/shared/src/lib/types/agent-process.types.ts`: adds `readonly usageWorkspaceRoot?: string` to `SpawnAgentRequest`, with the JSDoc the plan specifies. It is not added to `AgentProcessInfo`, and `workspaceKey` is not reused.
- MODIFIED `libs/backend/review-contracts/src/lib/review-contracts.spec.ts`: new `review usage totals` describe block:
  - checks the constant;
  - accepts known, unknown (null) and large (`runs: 10000`) totals;
  - rejects `costUsd: -1`, an infinite cost, non-integer, negative and unsafe tokens, a non-integer `runs`, unknown keys and a missing flag;
  - parses old stage and run payloads without `usage`;
  - parses stage and run usage, and also null;
  - rejects a run or stage whose usage is malformed.
- MODIFIED `libs/backend/review-contracts/src/lib/review-lanes.schema.spec.ts`: `defaultModelBlocked` may be absent, `true` or `false`, and a non-boolean is rejected.

## Checks

- `npx jest --config libs/backend/review-contracts/jest.config.ts --runInBand --coverage=false --runTestsByPath <both specs>`: 2 suites passed, 37 tests passed.
- `npx tsc --noEmit --project` with `libs/backend/review-contracts/tsconfig.lib.json`, `.../tsconfig.spec.json`, `libs/shared/tsconfig.lib.json` and `libs/backend/review-core/tsconfig.lib.json`: all exit 0. Review-core still typechecks. Its `.extend({ defaultModelBlocked })` in `review-lane-list.ts` redeclares the same optional boolean, which zod allows.
- `npx eslint <7 changed files>`: exit 0 with no errors. Without a cached project graph, `@nx/enforce-module-boundaries` was skipped (warning only). The orchestrator's `npm run verify -- -t lint` run covers that rule.
- I did not run `npm run verify` or `nx`, as the brief instructed. The batch's two verify commands are left to the orchestrator.

## Deviations

None. One note: `review-lane-list.ts` in review-core now re-adds a `defaultModelBlocked` field that the base entry schema already carries. I left it alone because it is outside this batch's write set. A later batch may drop the redundant `.extend`.

## Backend implementation — `TASK_2026_2310_rvlns`, batch B1

**Tasks completed**: B1 contracts (additive), plan component 1, B1 parts only.

**Files** (all under `D:\projects\PtahCode\.claude-worktrees\review-lane-pool\libs\backend\review-contracts\src`):

- CREATED `lib\review-lanes.schema.ts`:
  - `REVIEW_LANE_POOL_MAX = 12` (:5) and `REVIEW_LANE_CATALOG_MAX = 500` (:7).
  - `ReviewLaneIdSchema` (:10), using the AS1 regex `^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`. Values are trimmed and 1-128 long.
  - `ReviewModelIdSchema` (:19), using the AS2 regex `^[A-Za-z0-9][A-Za-z0-9._:/@+[\]-]{0,199}$`. Values are trimmed and 1-200 long.
  - `ReviewLaneEntrySchema` (:28), strict. `model: null` means the lane default.
  - `ReviewLaneRoleSchema` (:37), built from triage, `LensSchema.options` and verifier.
  - `ReviewLanePinsSchema` (:41), strict, with every role optional.
  - `duplicatePoolEntryIndex(pool)` (:57). It returns the index of the second entry with the same lane and model, or null. Models are compared exactly, and null equals null.
  - `ReviewLaneSettingsSchema` (:68), strict. The pool is capped at `REVIEW_LANE_POOL_MAX`. A `superRefine` raises a duplicate at path `['pool', index]` with the message `Duplicate review lane entry`.
  - `EMPTY_REVIEW_LANE_SETTINGS` (:85).
  - `ReviewLaneCatalogSchema` (:91).
  - `ReviewLaneLimitStateSchema`, `ReviewLaneListingEntrySchema` and `ReviewLaneListingSchema`. Lanes are capped at 100 and `blockedModels` at 2*12+12.
  - `ReviewLaneFallbackReasonSchema` and `ReviewLaneFallbackSchema`.
  - Exported `type` aliases for each schema. The file imports only zod and `review-config.schema.ts`, so there is no import cycle.
- CREATED `lib\review-lanes.schema.spec.ts`, with 20 tests:
  - lane and model id accept/reject cases, including a 48-character `ptah-cli:pc-<uuid>` and the AS2 shapes `provider/model`, `:free`, `[1m]`, `@` and `+`;
  - a settings round trip that keeps pool order;
  - every role pinnable;
  - an unknown role key, unknown keys and a missing `pins` key are rejected;
  - empty or over-long lane and model are rejected, both in the pool and in pins;
  - a duplicate is rejected with its path;
  - a pool of 12 passes and a pool of 13 fails;
  - `duplicatePoolEntryIndex` cases;
  - the listing and catalog bounds (500 passes, 501 fails);
  - an old `StageRecord` without the new keys still parses;
  - lane, model and fallback fields round-trip and accept null;
  - the fallback reason, source and list-size bounds.
- MODIFIED `lib\review-run.schema.ts`:
  - :3-8 imports the lane schemas.
  - :67-70 adds three fields to `StageRecordSchema`, each additive and optional:
    - `lane: ReviewLaneIdSchema.nullable().optional()`
    - `model: ReviewModelIdSchema.nullable().optional()`
    - `fallback: z.array(ReviewLaneFallbackSchema).max(REVIEW_LANE_POOL_MAX + 1).nullable().optional()`
- MODIFIED `index.ts`:3 — `export * from './lib/review-lanes.schema';`

**Stack observed**: zod 4.6.7 (root `package.json`:150). Strict-object pattern from `review-config.schema.ts`. Spec style from `review-contracts.spec.ts`, which imports from `../index`.

**Verification** (logs in `.ptah/tmp/b1-*.log` in the worktree):

- `npx jest --config libs/backend/review-contracts/jest.config.ts --runInBand --coverage=false --runTestsByPath <review-lanes.schema.spec.ts> <review-contracts.spec.ts>`: 2 suites and 25 tests passed. That is 20 new tests plus the 5 existing ones.
- `npx tsc --noEmit --project libs/backend/review-contracts/tsconfig.lib.json`: exit 0.
- `npx tsc --noEmit --project libs/backend/review-contracts/tsconfig.spec.json`: exit 0.
- `npx eslint` on the 4 changed files: exit 0. There were warnings only, and they say `@nx/enforce-module-boundaries` was skipped because no cached ProjectGraph exists outside nx. The new file imports only zod and a sibling, so the rule has nothing to check there.
- Not run, per the brief: the plan's verify row asks for nx lint and typecheck of review-core, rpc-handlers, review-runs-ui and ptah-electron. The coordinator should run them.
  - Expected impact is none: every addition is a new export or an optional field.
  - A grep of `libs/backend/review-core/src` found no symbol that collides with the new export names. A workspace-wide grep timed out and was stopped, so the other consumer projects were not checked for name collisions.

**Plan deviations**:

- `EMPTY_REVIEW_LANE_SETTINGS` is typed `Readonly<ReviewLaneSettings>`. The plan gave only the value. The readonly type stops a consumer from changing the shared constant, and it needs no cast.
- I added `ReviewLaneLimitStateSchema` and `ReviewLaneListingEntrySchema` as named exports. The plan writes the lane row inline inside `ReviewLaneListingSchema`. The shape is the same; naming them gives the B2 and B3 producers a type to use. The listing row `id` uses `ReviewLaneIdSchema`.
- No RPC schema changes (left to B4, as instructed). D5 is respected: nothing touches `OperatorSettingsSchema`. D14 does not affect the contracts.

**Out-of-scope observations**: none.

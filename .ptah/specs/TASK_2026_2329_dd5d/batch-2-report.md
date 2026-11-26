# TASK_2026_2329_dd5d — Batch 2 Report (Decision Model Skill Review: System One + Structured + Timeouts + Schema)

**Worktree**: `/home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de`

**Status**: PASS — All targeted unit tests, TypeScript checks, and ESLint checks succeeded with 0 errors.

## Changed Files

1. `libs/backend/agent-sdk/src/lib/lane-routing/structured-decision.adapter.ts`
   - Raised `STRUCTURED_DECISION_MAX_TURNS` from `1` to `3` so `outputFormat: { type: 'json_schema' }` does not hit `error_max_turns` on a text preamble or schema retry.
   - Updated `readStructured()` to keep `msg.structured_output` as primary when present and fall back to extracting a valid JSON object from `msg.result` (raw JSON, fenced ```` ```json ... ``` ```` block, or first balanced `{ ... }` object with string/escape awareness) before throwing `StructuredDecisionError('bad-output', ...)`.
2. `libs/backend/agent-sdk/src/lib/lane-routing/structured-decision.adapter.spec.ts`
   - Updated `maxTurns` assertion to `3` and added unit tests covering raw JSON, fenced JSON, balanced object in prose, primary `structured_output` precedence, and `bad-output` rejection for non-object/invalid text.
3. `libs/backend/lane-routing/src/lib/decision-model/decision-model.config.ts`
   - Added `getConfiguredTimeoutMs(): number | null` reading `ptah.agentOrchestration.decisionModelTimeoutMs` with the same validation/rounding/clamping (`DECISION_MODEL_TIMEOUT_MIN_MS..DECISION_MODEL_TIMEOUT_MAX_MS`) as `decision-model.target.ts`.
4. `libs/backend/lane-routing/src/lib/decision-model/decision-model.config.spec.ts`
   - Added unit tests for `getConfiguredTimeoutMs()` (unset, invalid values, rounding, and min/max clamping).
5. `libs/backend/lane-routing/src/lib/decision-model/decision-caller.ts`
   - Added `getConfiguredTimeoutMs(): number | null` delegating to `this.deps.config.getConfiguredTimeoutMs?.() ?? null`.
   - Extended `dispatchFor(caller, budget?)` with optional `maxTimeoutMs?: number`; for `structured`, clamps `Math.floor(Math.min(cap, ceiling))` and attaches `timeoutMs` onto the returned `StructuredDispatch`.
6. `libs/backend/lane-routing/src/lib/decision-model/decision-caller.spec.ts`
   - Added unit tests verifying `getConfiguredTimeoutMs()` (including mock configs without the method) and `maxTimeoutMs` override/clamping on structured dispatches.
7. `libs/backend/lane-routing/src/lib/pipeline/model-refine.ts`
   - Added optional `readonly timeoutMs?: number` to the `structured` variant of `ModelDispatch`.
8. `libs/backend/lane-routing/src/lib/pipeline/model-call.ts`
   - Updated `callStructured()` to compute `deadlineMs = dispatch.timeoutMs !== undefined ? dispatch.timeoutMs + DECISION_RETURN_MARGIN_MS : STRUCTURED_DEADLINE_MS` for `raceDeadline()`.
9. `libs/backend/lane-routing/src/lib/pipeline/model-call.spec.ts`
   - Added unit test verifying `callStructured()` honors `dispatch.timeoutMs` plus `DECISION_RETURN_MARGIN_MS`.
10. `libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.ts`
    - Enabled System One (`dispatch.kind === 'system-one'`) by removing the pre-inference skip and adding `validateSystemOneItems()` (maps valid `c1..cN` choices to `install` verdicts with concise evidence-grounded reasons and confidence when available, leaves `none` and `low-confidence` unresolved for Normal, records invalid choices in `itemRejections`, and returns `invalid-output` when all answers are rejected).
    - Raised `DECISION_RPC_CAP_MS` to `42_000`, added `SKILL_DECISION_STRUCTURED_TIMEOUT_MS = 20_000`, tightened `deadlineAt` after `openCaller()` resolves using `opened.target.timeoutMs` (System One) or `getConfiguredTimeoutMs() ?? 20_000` (structured), rescheduled the abort timer, and passed `maxTimeoutMs` to `dispatchFor()`.
    - Replaced `DECISION_SCHEMA.properties.items` with the concrete object schema and added `c1..cN` alias fallback resolution in `matchingCandidates()`.
    - Replaced naive `/\bdeprecated\b/i` check with `hasSkillDeprecationNotice()` matching `SkillJudgeService`.
    - Fixed `timeout()` classification to return `fail('timed-out')` when a deadline expires (preserving `pairAttempted` only when submitted) and classified `outcome.requestCause === 'deadline'` / expired pre-dispatch as `'timed-out'`.
11. `libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.spec.ts`
    - Updated existing tests for concrete schema, 42s RPC cap, 20s structured default budget, `timed-out` classification on elapsed RPC cap, and deprecation notice fixture; added unit tests for System One installs/unresolved/invalid/timeout, configured `decisionModelTimeoutMs`, `c1..cN` alias resolution, and deprecation parity.
12. `libs/backend/lane-routing/src/lib/di/register.ts`
    - Wired `readPrefillTokensPerSecond: () => workspace.getConfiguration<unknown>('ptah', 'agentOrchestration.decisionModelPrefillTokensPerSecond')` in the `LANE_ROUTING_TOKENS.DECISION_CALLER` factory.

## Verification Commands & Results

All commands executed in `/home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de`.

| Check | Command | Exit Code | Result |
| --- | --- | --- | --- |
| Jest (`agent-sdk`) | `npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-sdk/src/lib/lane-routing/structured-decision.adapter.spec.ts` | `0` | 1 suite passed, 14/14 tests passed |
| Jest (`lane-routing`) | `npx jest --config libs/backend/lane-routing/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.spec.ts libs/backend/lane-routing/src/lib/decision-model/decision-caller.spec.ts libs/backend/lane-routing/src/lib/pipeline/model-call.spec.ts libs/backend/lane-routing/src/lib/decision-model/decision-model.config.spec.ts` | `0` | 4 suites passed, 95/95 tests passed |
| TypeScript (`agent-sdk` + `lane-routing`) | `npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.lib.json && npx tsc --noEmit --project libs/backend/lane-routing/tsconfig.lib.json` | `0` | Clean (0 errors) |
| ESLint (all 12 changed files) | `npx eslint libs/backend/agent-sdk/src/lib/lane-routing/structured-decision.adapter.ts libs/backend/agent-sdk/src/lib/lane-routing/structured-decision.adapter.spec.ts libs/backend/lane-routing/src/lib/decision-model/decision-model.config.ts libs/backend/lane-routing/src/lib/decision-model/decision-model.config.spec.ts libs/backend/lane-routing/src/lib/decision-model/decision-caller.ts libs/backend/lane-routing/src/lib/decision-model/decision-caller.spec.ts libs/backend/lane-routing/src/lib/pipeline/model-refine.ts libs/backend/lane-routing/src/lib/pipeline/model-call.ts libs/backend/lane-routing/src/lib/pipeline/model-call.spec.ts libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.ts libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.spec.ts libs/backend/lane-routing/src/lib/di/register.ts` | `0` | 0 errors (1 pre-existing/file-length `max-lines` warning in `decision-model.config.ts`: 707/700 lines) |

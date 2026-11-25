# Batch G3 Fix Round 2 Report

- **Task**: `TASK_2026_2326_5d16`
- **Branch**: `fix/route-decide-predictability`
- **Status**: Complete

## Item 1: Finding 1 rest — Prevent synchronous adapter setup from starving lane tool proofs

- **Changes**:
  - `libs/backend/lane-routing/src/lib/pipeline/gather.ts:190-197`, `libs/backend/lane-routing/src/lib/pipeline/gather.ts:613-619`: After awaiting `rowsPromise`, when `phaseDefs !== undefined`, `gatherRouteCall` awaits `provisionalLanesPromise` and yields `READY_TOOL_PROOF_MICROTASK_TURNS` (6) microtask turns via `flushReadyToolProofTurns()` before invoking `readLimits`, `listModels`, and `loadMatrix`. This lets ready provisional-lane tool-proof reactions invoke `source.tools` and lets `withinBudget` observe immediately settled proofs (and clear its timers) before any synchronous setup in `matrix.load`, `limits`, or `listing` can advance the clock past the deadline. Because only microtask turns are yielded, slow or hanging tool reads / phase definitions never delay the adapters, and fake-timer tests do not hang.
- **Regression test**:
  - `libs/backend/lane-routing/src/lib/pipeline/gather.spec.ts:556-630` (`retains a ready browser tool proof and lane eligibility when matrix.load synchronously advances the injected clock past the deadline`): Uses an explicit `['browser']` phase, ready rows (`Promise.resolve([lane('codex')])`), an injected monotonic clock with 10 ms remaining, a `matrix.load` adapter that advances the clock by 20 ms synchronously before returning, and an immediately resolving browser-capable tool reader. Asserts `tools` runs before `matrix.load`, the `codex` proof `['ptah_browser_navigate']` is retained, no tool timeout reason is emitted, `matrix-file` is recorded missing from the synchronous overrun, and `constrainPhase` keeps `codex` eligible without `capability-unknown`.

## Item 2: Finding 3 rest — Dense diagnostic regression through production token check (`countTokensPiecewise`)

- **Changes**:
  - Spec-only addition in `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/route-tool-handlers.spec.ts:5-19`, `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/route-tool-handlers.spec.ts:471-557` (`route-tool-handlers.ts` untouched).
- **Regression test**:
  - `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/route-tool-handlers.spec.ts:471-557` (`returns a non-error result under countTokensPiecewise for ten distinct rules with 32 unknown 200-char exclude selectors each`): Runs a real `RouteDecideService` gate-0.1 call with 10 phases and 10 distinct rules (each carrying 32 token-dense unknown 200-char exclude selectors) through `handleRouteToolCall` (which enforces `returnedWhole` via `countTokensPiecewise`). Asserts `reply.isError === false`, `reply.text.length <= ROUTE_DECIDE_RESULT_BUDGET.chars`, `countTokensPiecewise(reply.text, MAX_TOKENS) <= MAX_TOKENS`, valid `GateResultSchema`, 10 roster rows, bounded omission marker in `reasons`, and no untruncated 200-char selector leaked into the response.

## Item 3: New defect — Preserve diagnostic identity across truncation and count collisions in omission marker

- **Changes**:
  - `libs/backend/lane-routing/src/lib/pipeline/phase-plan.ts:513-528`: Removed premature 48-character selector truncation from `resolveRuleExclusions` (along with the now-unused `DIAGNOSTIC_SELECTOR_SNIPPET_MAX_CHARS` import and local `truncateSnippet` helper) so `plan.ruleDiagnostics` preserves the full sanitized selector identity into assembly.
  - `libs/backend/lane-routing/src/lib/reasons/compile-reasons.ts:160-175`: Exported `AggregateDiagnostic` (`{ identity, display }`) and `AggregateDiagnosticInput = string | AggregateDiagnostic`, widening `GateReasonInput.extraReasons` while staying 100% compatible with `readonly string[]` from `assemble-gate.ts`.
  - `libs/backend/lane-routing/src/lib/reasons/compile-reasons.ts:760-873`: Added `formatAggregateDiagnosticDisplay` (truncates exclude selector snippets to `DIAGNOSTIC_SELECTOR_SNIPPET_MAX_CHARS = 48` and caps lines to `DIAGNOSTIC_LINE_MAX_CHARS = 240`) and `toAggregateDiagnostic`, and updated `boundAggregateDiagnostics` to:
    1. Deduplicate by original `identity` first (so identical entries across multiple phases are counted once).
    2. Deduplicate distinct identities by bounded `display`, tracking `displayCollisions`.
    3. Pack unique display lines within `AGGREGATE_DIAGNOSTIC_MAX_CHARS` (4,000), reserving exact space for `omittedDiagnosticsLine(displayCollisions + remainingDisplaysAfter)`.
    4. Emit `omittedDiagnosticsLine(displayCollisions + cappedCount)` whenever distinct entries are hidden by display collision, the character cap, or both.
- **Regression tests**:
  - `libs/backend/lane-routing/src/lib/pipeline/phase-plan.spec.ts:1293-1337`: Updated to assert `phase-plan` preserves the full sanitized selector identity in `ruleDiagnostics` while capping ambiguous match samples and computing exclusion counterfactuals.
  - `libs/backend/lane-routing/src/lib/reasons/compile-reasons.spec.ts:1256-1303`: Asserts 32 unknown exclude selectors sharing the same 45-char prefix with different suffixes (repeated across 2 phases) emit 1 bounded display line plus `'and 31 more diagnostic entries omitted'`, and verifies combined collision + character-cap accounting stays `<= 4000` chars with `emitted + omitted === totalDistinct`.
  - `libs/backend/lane-routing/src/lib/pipeline/assemble-gate.spec.ts:965-1028`: End-to-end `planRoutePhases` + `assembleGateResult` regression with 32 unknown exclude selectors sharing the same 45-char prefix across 2 phases -> asserts valid `GateResultSchema`, 1 bounded display line, and `'and 31 more diagnostic entries omitted'`.

## Checks

1. `npx jest --config libs/backend/lane-routing/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/lane-routing/src/lib/pipeline/gather.spec.ts libs/backend/lane-routing/src/lib/pipeline/phase-plan.spec.ts libs/backend/lane-routing/src/lib/reasons/compile-reasons.spec.ts libs/backend/lane-routing/src/lib/pipeline/assemble-gate.spec.ts`
   - **Result**: PASS (`Test Suites: 4 passed, 4 total`, `Tests: 128 passed, 128 total`). Log: `.ptah/tmp/g3-r2-jest-lane-routing.log`.
2. `npx jest --config libs/backend/vscode-lm-tools/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/route-tool-handlers.spec.ts`
   - **Result**: PASS (`Test Suites: 1 passed, 1 total`, `Tests: 21 passed, 21 total`). Log: `.ptah/tmp/g3-r2-jest-vscode-lm-tools.log`.
3. `npx tsc --noEmit --project libs/backend/lane-routing/tsconfig.lib.json`
   - **Result**: PASS (exit 0, 0 errors). Log: `.ptah/tmp/g3-r2-tsc-lane-routing.log`.
4. `npx eslint libs/backend/lane-routing/src/lib/pipeline/gather.ts libs/backend/lane-routing/src/lib/pipeline/gather.spec.ts libs/backend/lane-routing/src/lib/pipeline/phase-plan.ts libs/backend/lane-routing/src/lib/pipeline/phase-plan.spec.ts libs/backend/lane-routing/src/lib/reasons/compile-reasons.ts libs/backend/lane-routing/src/lib/reasons/compile-reasons.spec.ts libs/backend/lane-routing/src/lib/pipeline/assemble-gate.spec.ts libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/route-tool-handlers.spec.ts`
   - **Result**: PASS (exit 0, 0 errors; 2 pre-existing `max-lines` warnings on `gather.ts` and `compile-reasons.ts`). Re-verified `route-tool-handlers.spec.ts` after final edit (exit 0, 0 errors, 0 warnings). Logs: `.ptah/tmp/g3-r2-eslint.log`, `.ptah/tmp/g3-r2-eslint-rth.log`.
5. `ptah_get_diagnostics` (scoped to the 8 changed files):
   - **Result**: Unavailable (`TypeScript check still running after 45s` on both attempts); verified via direct `tsc --noEmit` and Jest `ts-jest` compilation above.

## Decisions

1. **Preserve full sanitized exclude selector string in `PhasePlan.ruleDiagnostics` and split identity vs bounded display in `compile-reasons.ts`**
   - *Options*: (a) Change `PhasePlan.ruleDiagnostics` to structured `{ identity, display }[]` and update `assemble-gate.ts`; (b) Preserve full sanitized selector strings in `phase-plan.ts`, support both `string` and `{ identity, display }` (`AggregateDiagnosticInput`) in `compileGateReasons`, and apply selector-snippet + line truncation during `boundAggregateDiagnostics`.
   - *Evidence*: `assemble-gate.ts` is outside the round-2 write set and collects `plan.ruleDiagnostics: readonly string[]` directly into `extraReasons`. Option (b) requires zero edits to `assemble-gate.ts`, preserves clean strings in `PhasePlan.ruleDiagnostics`, carries exact selector identity across phases, and handles both rule-exclude snippet collisions and general 240-char line collisions uniformly.
   - *Reversible*: Yes.

2. **Use bounded microtask flushing (`flushReadyToolProofTurns`) instead of macrotask (`setTimeout`/`setImmediate`) before invoking `limits`/`listing`/`matrix`**
   - *Options*: (a) Yield a macrotask (`setTimeout(0)` / `setImmediate`); (b) Await `provisionalLanesPromise` and yield 6 microtask turns (`Promise.resolve()`).
   - *Evidence*: `gather.spec.ts` uses `jest.useFakeTimers()`, under which macrotask timers block unless advanced. Six microtask turns deterministically drain ready `phasePromise` -> `pool.lanes.then` -> `readOneCandidateTools` -> `withinBudget` invocation and immediate-settlement observation without touching timers or blocking on slow/hanging tool reads.
   - *Reversible*: Yes.

## Not Done

- None. All three items, regression tests, and mandatory checks are complete.

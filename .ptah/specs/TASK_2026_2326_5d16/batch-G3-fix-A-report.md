# Batch G3 Review Fix Report — Part A (Findings 1, 6, 7)

## Summary
Fixed findings 1, 6, and 7 from `code-logic-review-G3.md` within the authorized write set (`gather.ts`, `gather.spec.ts`, `route-deadline.ts`, `route-deadline.spec.ts`, `candidate-tools.ts`). All 23 unit/regression tests in `gather.spec.ts` and `route-deadline.spec.ts`, `tsc --noEmit`, `eslint` (0 errors), and scoped `ptah_get_diagnostics` (0 errors, 0 warnings) passed.

## Finding 1 (Serious) — Tool-capability reads decoupled from slow matrix / limits / model-list / role joins
- **What changed**:
  - `libs/backend/lane-routing/src/lib/pipeline/gather.ts:141-213`: Started `startPhaseDefinitions(...)` per unique `PhaseKind` (lines 611-667) so explicit-capability phases resolve immediately and sibling phase kinds do not block one another. Built `provisionalLanesPromise` directly from `rowsPromise` via `toLaneCandidate(row, null, null)` and launched `readCandidateToolsIncremental(...)` immediately in parallel with `rows`, `roles`, `limits`, `listModels`, and `loadMatrix`. Final `lanes` still join `limits.map` and `limits.evidence` separately at lines 211-213.
  - `libs/backend/lane-routing/src/lib/pipeline/candidate-tools.ts:191-321`: Added `readCandidateToolsIncremental` and `readPhaseToolsIncremental` so each candidate proof starts as soon as both its phase requirements and its candidate identity are known:
    - `child-session` and built-in phase subagent (`phase.role === undefined || isRetiredRole(phase.role)`) start immediately on phase resolution (independent of `rows`, `roles`, `limits`, `listing`, and `matrix`).
    - Lane candidates start as soon as `rows` and that phase's requirements resolve (independent of `roles`, `limits`, `listing`, and `matrix`).
    - Custom role subagents start as soon as `roles` and that phase's requirements resolve (independent of `rows`, `limits`, `listing`, and `matrix`).
    - Results are assembled in deterministic `candidatesForPhase` order (lanes, child-session, subagent).
- **Existing expectations**: All existing `gather.spec.ts` expectations stayed green, including line 411 (`look` omits `requiredCapabilities` and its `visual-review` definition hangs until deadline, so `look`'s requirements truly do not resolve before cutoff).
- **Tests pinning it**:
  - `libs/backend/lane-routing/src/lib/pipeline/gather.spec.ts:477-554`: Explicit `requiredCapabilities: ['browser']` phase + fast `rows` + hanging `matrix`, `limitEvidence`, `listing`, and `roles` + fast browser-capable `tools` reader -> retains `['ptah_browser_navigate']` for `codex` and `['ptah_browser_screenshot']` for `subagent:visual-review`, joins degraded `limitState: 'unknown'` separately, and `constrainPhase` keeps `codex` eligible (not `capability-unknown`).
  - `libs/backend/lane-routing/src/lib/pipeline/gather.spec.ts:556-612`: Verifies `child-session` and custom-role (`subagent:design-specialist`) tool proofs start and are retained independently of hanging `rows` and a hanging sibling phase definition (`visual-review`).

## Finding 6 (Moderate) — Monotonic deadline rechecked across invocation, settlement, and sync throws
- **What changed**:
  - `libs/backend/lane-routing/src/lib/pipeline/route-deadline.ts:40-149`: Added `isExpired(deadline)` and updated `withinBudget`:
    - Rechecks the monotonic deadline after `task(controller.signal)` throws synchronously (lines 69-76): if past cutoff, aborts `controller`, invokes `onLateError`, and returns `{ kind: 'deadline' }`.
    - Rechecks `remainingAfterStart = deadline.remainingMs()` immediately after `task` returns a promise (lines 78-90): if `NaN` or `<= 0`, attaches a rejection observer to `Promise.resolve(promise)` before calling `controller.abort()` (preventing unhandled rejections on already-rejected or later-rejecting losing promises) and returns `{ kind: 'deadline' }`.
    - Schedules `setTimeout` using the fresh `remainingAfterStart` rather than the stale pre-invocation value (line 141).
    - Rechecks `expired || isExpired(deadline)` in both fulfillment and rejection handlers (lines 119-135) and in the non-finite branch (lines 92-108), aborting and classifying post-cutoff settlements as `{ kind: 'deadline' }` while calling `onLateError` on post-cutoff rejections.
- **Tests pinning it**:
  - `libs/backend/lane-routing/src/lib/pipeline/route-deadline.spec.ts:26-40`: Advancing injected clock past cutoff during synchronous setup before returning an already-resolved promise -> `{ kind: 'deadline' }`, aborted.
  - `libs/backend/lane-routing/src/lib/pipeline/route-deadline.spec.ts:42-65`: Same for an already-rejected promise -> `{ kind: 'deadline' }`, aborted, `onLateError` observed with no unhandled rejection.
  - `libs/backend/lane-routing/src/lib/pipeline/route-deadline.spec.ts:67-93`: Pending losing promise after setup overrun -> aborted and late rejection observed.
  - `libs/backend/lane-routing/src/lib/pipeline/route-deadline.spec.ts:95-132`: Synchronous throw after cutoff -> `{ kind: 'deadline' }` + abort; before cutoff -> `{ kind: 'error', error }` without abort.
  - `libs/backend/lane-routing/src/lib/pipeline/route-deadline.spec.ts:134-192`: Fresh post-setup timer delay (`remainingAfterStart`) and pre-timer monotonic cutoff recheck on both fulfillment and rejection.

## Finding 7 (Moderate) — Bounded, sanitized aggregate reasons for phase definition fallback and non-timeout tool-port failures
- **What changed**:
  - `libs/backend/lane-routing/src/lib/pipeline/candidate-tools.ts:16-68,128-189,266-320`:
    - Added `sanitizeGatherReason` mirroring `routing-rules-setting.ts`'s `sanitizeDiagnostic` (strips `<= 0x1f`, `0x7f..0x9f`, `U+2028`, `U+2029`, and `';'`, collapses whitespace, trims, caps at 160 chars with `...`) and `formatToolUnavailableReason` (caps phase label to 64 chars so the cause suffix is preserved).
    - Classified per-candidate tool outcomes into known list (including `[]`, no failure) vs `timeout`, `error` (rejection), and `unavailable` (`null` return or unregistered `source.tools`).
    - Extended `CandidateToolsDetailedResult` with `reasons: readonly string[]` emitting exactly one bounded, sanitized aggregate reason per affected phase (`tool evidence unavailable for phase <id> (<causes>)`), preserving `tool evidence unavailable for phase <id> (timeout)` for timeout-only phases.
  - `libs/backend/lane-routing/src/lib/pipeline/gather.ts:227-233,582-764`:
    - Emits one bounded, sanitized aggregate reason per affected `PhaseKind` (`phase definition unavailable for <kind> (timeout|error|invalid)`) when a phase definition times out, rejects, or fails validation/parsing, while keeping safe legacy capability fallbacks and omitting reasons when no `phaseDefinitionReader` is registered.
    - Passes `phaseDefReasons` and `toolResult?.reasons` into `detailReasons`.
- **Tests pinning it**:
  - `libs/backend/lane-routing/src/lib/pipeline/gather.spec.ts:614-673`: Rejected and malformed phase definitions keep legacy fallbacks and emit one bounded, sanitized reason per affected kind (`visual-review (error)` deduplicated across two phases, `design (invalid)`), with no leaked error text, semicolons, or line breaks.
  - `libs/backend/lane-routing/src/lib/pipeline/gather.spec.ts:675-738`: Non-timeout tool rejection + `null` return produce one bounded, sanitized reason per affected phase (stripping `;`, CR/LF, TAB, ESC control chars and bounding to `<= 160` chars), while a known empty list `[]` remains `[]` with no unavailable reason.
  - `libs/backend/lane-routing/src/lib/pipeline/gather.spec.ts:818-858`: Direct `readCandidateToolsDetailed` check distinguishing `[]`, `null`, and rejected reads in `byPhase` and `reasons`.

## Verification
- **Jest**:
  - Command: `npx jest --config libs/backend/lane-routing/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/lane-routing/src/lib/pipeline/gather.spec.ts libs/backend/lane-routing/src/lib/pipeline/route-deadline.spec.ts`
  - Result: **PASS** — 2 passed / 2 total suites, 23 passed / 23 total tests (exit code 0).
- **TypeScript**:
  - Command: `npx tsc --noEmit --project libs/backend/lane-routing/tsconfig.lib.json`
  - Result: **PASS** — 0 errors (exit code 0).
- **ESLint**:
  - Command: `npx eslint libs/backend/lane-routing/src/lib/pipeline/gather.ts libs/backend/lane-routing/src/lib/pipeline/gather.spec.ts libs/backend/lane-routing/src/lib/pipeline/route-deadline.ts libs/backend/lane-routing/src/lib/pipeline/route-deadline.spec.ts libs/backend/lane-routing/src/lib/pipeline/candidate-tools.ts`
  - Result: **PASS** — 0 errors, 1 pre-existing warning (`max-lines` on `gather.ts`: 759 vs 700, was 739 lines before this fix) (exit code 0).
- **Ptah Diagnostics**:
  - Tool: `ptah_get_diagnostics` scoped to all 5 modified/created files
  - Result: **PASS** — 0 errors, 0 warnings, clean coverage.

## Decisions
1. **Mirrored `sanitizeDiagnostic` in `candidate-tools.ts` (`sanitizeGatherReason`)**:
   - **Options**: (a) Export and import `sanitizeDiagnostic` from `scope/routing-rules-setting.ts` or `sanitizeText` from `reasons/compile-reasons.ts`; (b) implement the exact same control-character, semicolon, whitespace, and 160-character bounding rules inside `candidate-tools.ts` and reuse it in `gather.ts`.
   - **Evidence**: Both existing library sanitizers (`routing-rules-setting.ts:122` and `compile-reasons.ts:241`) are unexported module-private functions, and both files are outside this lane's authorized write set (`compile-reasons.ts` is concurrently edited by another lane).
   - **Reversible**: Yes — once sibling lanes finish, `sanitizeGatherReason` can be consolidated into a shared exported reason-sanitizer utility without changing external behavior.
2. **Closed-set failure causes in aggregate reasons (`timeout`, `error`, `invalid`, `unavailable`)**:
   - **Options**: (a) Include raw `error.message` snippets; (b) emit closed-set causes only, joining multiple distinct tool failure causes per phase (`timeout`, `error`, `unavailable`) into a single reason string.
   - **Evidence**: `gather.ts` and `route-decide.service.ts` never copy raw error messages into user-facing reasons or logs (to avoid leaking paths/secrets and bloating output), and Finding 7 specifies one bounded, sanitized reason per affected kind or phase while preserving `tool evidence unavailable for phase <id> (timeout)` and `phase definition unavailable for <kind> (timeout)`.
   - **Reversible**: Yes.

## Not Done / Blockers
- None. All three assigned findings (1, 6, 7) are implemented, verified, and reported.

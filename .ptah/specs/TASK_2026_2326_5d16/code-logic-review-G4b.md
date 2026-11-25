# Code Logic Review — G4b (B13) + G4 Fix Round 1 — `TASK_2026_2326_5d16`

Verdict: APPROVED
Review family: antigravity (implementer codex)
Commit: 9e1461e07
Overall score: 7/10

> Score calibration: **7/10 (sound)** — separated from **9-10 (exemplary)** by four Moderate edge-case defects (the `costMs` gate not capping against `target.timeoutMs < remainingMs`, a `reviewer-family` false negative in `unavailableReadTimedOut` when `rows()` times out, silent outcome-figure loss when optional `LaneChoiceQuestionInput.taskKind` is omitted, and the unprotected `tryStart`→`try` window plus non-settling abort lock on `inFlight`) and one Minor test-coverage gap; separated from **5-6 (real gaps)** because there are zero Blocking or Serious findings: all four AM1 protected files are untouched against `main`, all three Serious and five Moderate findings from `code-logic-review-G4.md` are fixed (one with a narrow residual edge case), AM6 payload compaction reduces the 4-phase incident body by 68.1% while keeping `SystemOneRequestBodySchema` backward-compatible, AM7 units/EWMA/busy/timeout-cap arithmetic is exact, AM8 custom/remote targets never hit `model-cold`, and removing the question cap from `runFixedRequest` is verified safe across every production caller.

## Score table

| Severity | Count |
| --- | --- |
| Blocking | 0 |
| Serious | 0 |
| Moderate | 4 |
| Minor | 1 |

**Protected files check (AM1):** Verified via `ls -l` and `git diff --stat main --` that all four decision-model connection files exist and have **zero diff** against `main`:
- `libs/backend/lane-routing/src/lib/decision-model/system-one.client.ts`
- `libs/backend/lane-routing/src/lib/decision-model/system-one.residency.ts`
- `libs/backend/lane-routing/src/lib/decision-model/decision-model.config.ts`
- `libs/backend/lane-routing/src/lib/decision-model/decision-model.target.ts`

**Coordinator change (`runFixedRequest` cap removal):** Confirmed **correct** at `libs/backend/lane-routing/src/lib/pipeline/model-refine.ts:223-274`. Enumerated every caller across `libs/` and `apps/`:
1. `route-decide.service.ts:233` (`decidePreflight`, 2 questions, no ranking fallback)
2. `scope/scope-check.service.ts:98` (`ScopeCheckService.assess`, 4 questions, no ranking fallback — would have dropped `relation` and `material_change` under a 2-question cap)
3. `task-kind/decision-model-task-kind-classifier.ts:44` (1 question)
4. `decision-model/skill-ranking-caller.service.ts:99` (N candidate items, no ranking fallback)
5. `child-session/child-setting-router.service.ts:118` (1–2 questions)

No caller reads `outcome.questionCap` from `runFixedRequest` or depends on a question cap there; `runFixedRequest` still enforces `maxRequestBytes` and routes through AM7 `callSystemOne` admission when `dispatch.admission` is supplied (`decidePreflight`).

**Skill discovery note:** No code-review or `resilient-nestjs-patterns` skill is present in this host's skill catalogue (only `agy-customizations`, `antigravity-guide`, `run-workflow`, `swarm_monitor`, and `swarm_pane` are listed). Review proceeded under the role instructions, repository conventions, and `implementation-plan.md` (including binding amendments AM1–AM8).

## G4 findings 1-9 status

| # | G4 Finding | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Unavailable-row deadline attribution (2 s gather timeout, false positive on unrelated model deadline, `explanation` mirroring) | PARTIAL | Core scenarios fixed: `pipeline/gather.ts:75-80, 268-275, 313, 425, 716-721, 769` and `pipeline/candidate-tools.ts:88, 269, 274, 317-320` propagate per-read `deadlineReads`; `route-decide.service.ts:365-391, 641-671` attributes `; route deadline reached` to both `reason` and `explanation`; `route-decide.gate.spec.ts:355-464` pins all four gather reads and unrelated model-deadline isolation. Residual edge case: `route-decide.service.ts:649` excludes `reviewer-family` on a `rows()` timeout (see New finding #2). |
| 2 | Route-capped model aborts misclassified as `'timeout'` & spurious `'unreachable'` log | RESOLVED | `route-decide.service.ts:454-504` tracks `cappedByDeadline` and `cappedStructuredSignal`, normalizes abort-triggered structured errors (`:487-489`), and rewrites capped timeouts/aborts to `'deadline'` (`:501-504`); `decision-model/decision-caller.ts:110-114` suppresses false `'unreachable'` warnings when `budget.signal.aborted`; `route-decide.gate.spec.ts:515-585` pins real `SystemOneClient` with inner/outer timer offsets and capped structured disconnects. |
| 3 | Unbounded `persistRotation` wedges `rotationWrites` and leaks closures | RESOLVED | `route-decide.service.ts:396-404` builds minimal `RotationState` synchronously and skips enqueueing when unavailable or empty; `:590-603` skips expired queued writes, races each save inside `withinBudget(capRouteDeadline(deadline, 1000), ...)`, logs once per failure, and observes late rejections; `route-decide.gate.spec.ts:971-1003` verifies ordering, expiry, hung-save recovery, and single-warning logging. |
| 4 | `shortlistTrace` tie-break picks `pruned` over equally scored `ranked` runner-up | RESOLVED | `pipeline/assemble-gate.ts:455-470` splices each remaining `ranked` entry ahead of the first tied `pruned` entry in `rankedList` order so MCP compaction's first-on-tie rule keeps the runner-up named in `row.explanation`; pinned in `pipeline/assemble-gate.trace.spec.ts:8-55` and `mcp-core/route-tool-handlers.compaction.spec.ts:69-86`. |
| 5 | Non-finite `deadlineAtMs` & silent residency probe failures | RESOLVED | `route-decide.service.ts:173-179` falls back to default stage deadline on non-finite `deadlineAtMs`; `:424, 449` guard `!(deadline.remainingMs() >= DECISION_MODEL_TIMEOUT_MIN_MS)`; `:433-448` cancels non-OK probe bodies and logs rejection, timeout, and HTTP status at `debug` level; `route-decide.gate.spec.ts:473-505` covers `NaN`, `Infinity`, and all three probe failure modes. |
| 6 | Pre-flight reuse cache skipped when `ioDeadline.remainingMs() === 0` | RESOLVED | `route-decide.service.ts:185-211` checks the synchronous in-memory `reuse` cache unconditionally before `decidePreflight`; `route-decide.preflight.spec.ts:201-243` tests both outside and inside `ROUTE_RETURN_RESERVE_MS`. |
| 7 | `DecisionCaller.dispatchFor` throws `TypeError` on negative/`NaN` budget | RESOLVED | `decision-model/decision-caller.ts:87-90, 129, 138, 177-179` clamps non-finite/negative budgets to `0` (`AbortSignal.abort()` for structured `cap === 0`, clamped `timeoutMs` and `admission.remainingMs()` for System One); `decision-model/decision-caller.spec.ts:10-47` tests `-1`, `NaN`, and `Infinity` for both transports. |
| 8 | Compaction retains empty `candidates: []` & splits UTF-16 surrogate pairs | RESOLVED | `mcp-core/route-tool-handlers.ts:102` normalizes empty `candidates: []` to `undefined`; `:124-130, 176` checks for high surrogates (`0xD800-0xDBFF`) before slicing explanations; `mcp-core/route-tool-handlers.compaction.spec.ts:40-50` verifies both. |
| 9 | Untested failure and boundary branches across G4 specs | RESOLVED | Added coverage for caller-open expiry (`route-decide.gate.spec.ts:587`), rejected `noteLive` (`:1005`), hard-only and `countsOnly` compaction (`route-tool-handlers.compaction.spec.ts:56, 62`), and namespace context forwarding + `limitEvidence` rejection propagation (`route-namespace.builder.spec.ts:355, 367`), in addition to Findings 1–8 regressions. |

## New findings

### 1. [Moderate] AM7 cost gate compares `costMs` only against route `remainingMs` and ignores a smaller `caller.target.timeoutMs`, dispatching requests estimated to exceed their own HTTP timeout
- **Location:** `libs/backend/lane-routing/src/lib/pipeline/model-call.ts:107-117`, `libs/backend/lane-routing/src/lib/decision-model/decision-caller.ts:127-144`
- **Scenario:** On a standard 8,000 ms `gate-0.1` call with the default `caller.target.timeoutMs = 3000` (when `decisionModelTimeoutMs` is unset or ≤ 3000 ms), Pass 1 enters `callSystemOne` with `remainingMs ≈ 7750`. If the configured or EWMA prefill rate is `80 tok/s` and `promptTokens = 300`, `costMs = 300 * 1000 / 80 + 250 = 4000 ms`. `model-call.ts:110` checks `4000 > 7750` (`false`) and dispatches the call, even though `decision-caller.ts:129` immediately caps `SystemOneClient`'s `AbortSignal.timeout` to `Math.min(3000, 7750) = 3000 ms`. The request is predicted to exceed its own HTTP timeout by 1,000 ms, wasting 3 s of the 8 s gate budget before failing with `timeout`. (When `decisionModelTimeoutMs = 15000` as in F3, `remainingMs` is already smaller than `target.timeoutMs`, so the gate triggers correctly.)
- **Concrete fix:** Include `maxTimeoutMs: caller.target.timeoutMs` on `SystemOneAdmission` in `decision-caller.ts:136-143`, compute `effectiveBudgetMs = Math.min(remainingMs, admission.maxTimeoutMs)` in `model-call.ts:108-116`, and skip when `costMs > effectiveBudgetMs` (reporting `Math.floor(effectiveBudgetMs)` in `requestReason`).

### 2. [Moderate] `unavailableReadTimedOut` omits `; route deadline reached` when a `rows()` gather timeout causes `reviewer-family` unavailability
- **Location:** `libs/backend/lane-routing/src/lib/route-decide.service.ts:648-652`
- **Scenario:** In a two-phase gate (`implement` + `review` with `reviews: ['build']`), if `source.rows()` hangs past `GATHER_BUDGET_MS` (2 s), `gathered.lanes` is empty and `reads.rows` is `true`. `implement` picks `subagent:implement` (family `anthropic`), leaving `review` with only `subagent:review` (also family `anthropic`). `constrainPhase` returns `status: 'unavailable', exclusionReason: 'reviewer-family'`. Because `route-decide.service.ts:649` guards `pin === undefined ? row.exclusionReason !== 'reviewer-family' : ...`, `unavailableReadTimedOut` returns `false`, and the review row silently omits `; route deadline reached` from both `row.reason` and `row.explanation` even though the `rows()` timeout directly eliminated every non-anthropic lane.
- **Concrete fix:** Remove the `row.exclusionReason !== 'reviewer-family'` exclusion at `route-decide.service.ts:648-650` (for an unpinned phase, a timed-out `rows()` read can be the direct cause of `reviewer-family` unavailability as well as `no-eligible-candidate` / `missing-capability`), and add a `route-decide.gate.spec.ts` test covering an `implement` + `review` gate with a hanging `rows()` port.

### 3. [Moderate] `buildDecisionPayload` silently discards all `outcomeFigures` and emits `0` sample counts when optional `LaneChoiceQuestionInput.taskKind` is omitted
- **Location:** `libs/backend/lane-routing/src/lib/decision-model/decision-payload.ts:21-28, 109-112`
- **Scenario:** `LaneChoiceQuestionInput.taskKind` is typed optional (`readonly taskKind?: string`). If any direct caller of the exported `buildDecisionPayload` omits `taskKind` while supplying `outcomeFigures` (the pre-B13 contract), line 109 constructs the lookup key `` `${option.laneId}/undefined` ``, which never matches any entry in `figuresByKey` (`${laneId}/${taskKind}`). `state.pastOutcomes` silently remains `{}` and every lane criterion is formatted with sample count `0`. (`fitLane` at `model-refine.ts:333` always supplies `phase.taskKind`, so `RouteDecideService` itself is unaffected.)
- **Concrete fix:** Make `taskKind` required on `LaneChoiceQuestionInput` if all callers must provide it, or handle `question.taskKind === undefined` explicitly (never looking up `${laneId}/undefined`; instead preserve/aggregate matching `input.outcomeFigures` entries for `option.laneId`).

### 4. [Moderate] `PrefillRateStore` in-flight guard has an unprotected window after `tryStart` and never releases if `caller.decide` fails to settle after `admission.signal` aborts
- **Location:** `libs/backend/lane-routing/src/lib/pipeline/model-call.ts:106-149`
- **Scenario:**
  1. `rates.tryStart(targetKey)` marks the target in-flight at line 106, while `try { ... } finally { admission?.rates.finish(admission.targetKey); }` does not begin until line 139. Any throw in lines 107–138 (e.g., `admission.now()` at line 120) leaves `targetKey` stuck in `inFlight` permanently.
  2. When `withinBudget` expires and aborts `admission.signal`, `onAbort` (line 136) lowers the rate estimate via `measure(null, true, false)` but leaves `targetKey` in `inFlight` until `caller.decide` settles. Real Node `fetch` settles promptly on `AbortSignal`, so normal production aborts recover; however, if a non-aborting transport, stalled socket/proxy, or custom `seams.systemOne` promise never settles after abort, `finally` never runs and every subsequent `decide()` call on the singleton `RouteDecideService` permanently skips with `fallbackCause: 'model-busy'`.
- **Concrete fix:** Start the `try { ... } finally { ... }` block immediately after `rates.tryStart(targetKey)` succeeds (removing the redundant manual `rates.finish(targetKey)` on line 111), and add a bounded safety release after abort (or ensure `finish` runs once a post-abort grace period elapses) so one wedged transport promise cannot permanently lock a target across the Electron session.

### 5. [Minor] `model-refine.spec.ts` alternates-omission test is silently bypassed by the 2-question cap, and `RouteDecideService` AM7 integration paths lack end-to-end specs
- **Location:** `libs/backend/lane-routing/src/lib/pipeline/model-refine.spec.ts:61-86`, `libs/backend/lane-routing/src/lib/route-decide.service.ts:261, 359-374`, `libs/backend/lane-routing/src/lib/decision-model/decision-caller.ts:148-158`, `libs/backend/lane-routing/src/lib/di/register.ts:222-225`
- **Scenario:**
  1. `model-refine.spec.ts:61-86` (`drops alternates across phases before pruning primary lanes and omits unsendable phases`) supplies 3 phases (`first`, `second`, `third`) to a `system-one` dispatch. Because `runLaneRequest` (`model-refine.ts:178-180`) now slices `sendable.slice(0, DECISION_QUESTIONS_PER_CALL)` (2) before calling `fitLane`, the alternates-only `third` phase is dropped by `question-cap` and never reaches `fitLane`; `expect(result.offered.has('third')).toBe(false)` passes without exercising `fitLane`'s unsendable-phase omission branch.
  2. No spec exercises `RouteDecideService` end-to-end with `readPrefillTokensPerSecond` (both direct and via `di/register.ts`), cost-gate `requestReason` propagation onto gate `row.reason` (`route-decide.service.ts:371-374`, including non-propagation to `question-cap` rows) and pre-flight `result.reasons` (`:261`), concurrent `RouteDecideService.decide()` calls returning `model-busy`, or invalid/throwing `readPrefillTokensPerSecond` settings (`decision-caller.ts:148-158`).
- **Concrete fix:** Keep the alternates-only phase within the 2-question window in `model-refine.spec.ts:61-86` (e.g., 2 phases total or a `structured` dispatch case), and add focused `RouteDecideService` / `DecisionCaller` specs covering the untested AM7 integration branches above.

## Five logic questions

### 1. How does this fail silently?
- `route-decide.service.ts:648-650`: When `source.rows()` times out on the 2 s gather deadline in an `implement` + `review` gate, `review` becomes `unavailable` with `exclusionReason: 'reviewer-family'` and silently omits `; route deadline reached` from both `reason` and `explanation`.
- `decision-payload.ts:109-112`: A direct caller of `buildDecisionPayload` that omits optional `LaneChoiceQuestionInput.taskKind` silently gets an empty `pastOutcomes: {}` and `0` sample counts in every criterion because `${option.laneId}/undefined` never matches `figuresByKey`.
- `decision-caller.ts:148-152`: An invalid non-positive/non-numeric `agentOrchestration.decisionModelPrefillTokensPerSecond` setting (e.g., `0`, `-10`, or `"fast"`) silently falls back to EWMA measurement with no diagnostic log.

### 2. What user action produces unexpected behaviour?
- Leaving `decisionModelTimeoutMs` at its default 3,000 ms (or setting it below 8,000 ms) on a slow local model whose `costMs` is between 3,000 ms and the 7,750 ms gate I/O budget causes `callSystemOne` (`model-call.ts:109-116`) to dispatch a call predicted to exceed its own 3,000 ms HTTP timeout (`decision-caller.ts:129`), wasting 3 s before falling back.

### 3. What input data produces a wrong answer?
- Calling `buildDecisionPayload` with `outcomeFigures` present and `question.taskKind === undefined` produces wrong `0` sample counts and drops all `pastOutcomes` (`decision-payload.ts:109-112`).
- A `gate-0.1` call with `implement` + `review` where `source.rows()` times out drops the deadline explanation on the `reviewer-family` unavailable row (`route-decide.service.ts:649`).

### 4. What happens when a dependency fails?
- `SystemOneClient` / `fetch` hangs past deadline: `withinBudget` aborts `budget.signal`, `onAbort` records the abort rate bound and logs one `bytes/4` token metric (`model-call.ts:122-137`), `decision-caller.ts:112` suppresses the false `unreachable` transport warning, `fetch` rejects on `AbortSignal.any(...)`, and `finally` releases `inFlight` (`model-call.ts:143`). If a custom transport/seam fails to settle after abort, `inFlight` remains locked permanently (`model-call.ts:136-149`, Finding #4).
- `SystemOneClient` returns HTTP 500 / 401 / `unreachable` / `bad-output`: `finally` releases `inFlight`, logs one `bytes/4` metric, and intentionally does not corrupt the EWMA rate with fast error latency (`model-call.ts:128-134, 144-148`).
- `readPrefillTokensPerSecond()` throws: caught in `decision-caller.ts:152-157`, logs a safe `loggableErrorName` warning, and falls back to EWMA.
- `rotation.save()` hangs or rejects: bounded by `capRouteDeadline(deadline, 1000)`, releases the serialized queue, logs once, and observes late rejections (`route-decide.service.ts:590-603`).
- `residencyFetch` rejects, returns non-200, or times out: cancels body when present, logs at `debug`, and skips local daemon calls as `model-cold` (`route-decide.service.ts:431-450`).

### 5. What is missing that the requirements never mentioned?
- Non-`route_decide` callers (`ScopeCheckService`, `SkillRankingCallerService`, `ChildSettingRouterService`, `DecisionModelTaskKindClassifier`) each construct or resolve a separate `DecisionCaller` without passing a `budget`, so concurrent host calls (e.g., `ScopeCheckService` + `route_decide`) do not share `RouteDecideService`'s `PrefillRateStore` in-flight guard (`di/register.ts:67-81, 179, 221`). This is outside B13's scope (`implementation-plan.md` Compatibility section keeps other callers unchanged), but worth knowing if overlapping local Ollama requests are observed from host scope checks.

## Checks run

1. **Protected files (AM1) check:**
   `ls -l` and `git diff --stat main -- libs/backend/lane-routing/src/lib/decision-model/{system-one.client.ts,system-one.residency.ts,decision-model.config.ts,decision-model.target.ts}`
   - Result: Exit 0; all four files present, zero diff against `main`.
2. **Caller enumeration for `runFixedRequest` and prefill setting:**
   `ptah_lsp_references` failed on worktree-relative path (resolved against main repo); fell back to `grep -rnE "runFixedRequest|decisionModelPrefillTokensPerSecond|readPrefillTokensPerSecond|questionCap|question-cap|model-busy" libs apps`.
   - Result: Verified all 5 `runFixedRequest` callers, `file-settings-keys.ts`, `file-settings-manager.ts`, `settings-export.types.ts`, and `di/register.ts` wiring.
3. **Scoped TypeScript diagnostics (`ptah_get_diagnostics`):**
   Passed absolute paths of all 9 G4b production files in `libs/backend/lane-routing/src/lib/`.
   - Result: `Errors: 0 | Warnings: 0 — No issues found` (`coverage: clean`).
4. **Scoped Jest run (6 spec files, logged to `.ptah/tmp/g4b-review.log`):**
   `npx jest --config libs/backend/lane-routing/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/lane-routing/src/lib/decision-model/decision-payload.spec.ts libs/backend/lane-routing/src/lib/decision-model/decision-caller.spec.ts libs/backend/lane-routing/src/lib/pipeline/prefill-rate.store.spec.ts libs/backend/lane-routing/src/lib/pipeline/model-call.spec.ts libs/backend/lane-routing/src/lib/pipeline/model-refine.spec.ts libs/backend/lane-routing/src/lib/route-decide.gate.spec.ts`
   - Result: `JEST_EXIT=0` — 6 passed, 6 total; 119 tests passed, 0 failed.

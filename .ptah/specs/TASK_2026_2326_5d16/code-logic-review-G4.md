# Code Logic Review — G4 (B09 + B10) — `TASK_2026_2326_5d16`

Verdict: REVISE
Review family: antigravity (implementer codex)
Overall score: 6/10

> Score calibration: **6/10 (real gaps)** — separated from **7-8 (sound)** by three Serious behavioural defects on likely failure/runtime paths (2 s gather timeout inside an 8 s gate deadline, 15 s saved timeout capped by a 4 s / 8 s route deadline, and an unbounded rotation-write queue that wedges and leaks closures on a hung save); separated from **3-4 (needs another pass)** because the core deadline propagation, AM1/AM8 residency boundary (including untouched protected connection files), single-read DI routing rules, sanitized `limitEvidence` projection, and legacy-preserving MCP compaction are structurally sound and need targeted fixes rather than a redesign.

## Score table

| Severity | Count |
| --- | --- |
| Blocking | 0 |
| Serious | 3 |
| Moderate | 5 |
| Minor | 1 |

**Protected files check (AM1):** Verified via `git status --short` and `git diff --stat` that `system-one.client.ts`, `system-one.residency.ts`, `decision-model.config.ts`, and `decision-model.target.ts` are **unmodified**.

**Skill discovery note:** No code-review or `resilient-nestjs-patterns` skill is present in this host's skill catalogue (only `agy-customizations`, `antigravity-guide`, `run-workflow`, `swarm_monitor`, and `swarm_pane` are listed). Review proceeded under the role instructions, repository conventions, and `implementation-plan.md` (including binding amendments AM1–AM8).

## Findings

### 1. [Serious] Unavailable-row deadline attribution fails on 2 s gather timeouts and falsely blames deadlines on unrelated unavailable rows
- **Location:** `libs/backend/lane-routing/src/lib/route-decide.service.ts:349-354`
- **Failing scenario:**
  1. **False negative (missed deadline on gather timeout):** A normal `gate-0.1` call has an 8,000 ms deadline (`ioDeadline` = 7,750 ms), while `gatherRouteCall` (`pipeline/gather.ts:118-124`) caps gather at `GATHER_BUDGET_MS` (2,000 ms). If `source.rows()` hangs past 2,000 ms, gather returns an empty lane list and a pinned or custom-role phase resolves as `status: 'unavailable', fallbackCause: null`. With no sendable phases, no model call runs, so `ioDeadline.remainingMs()` at line 349 is ~5,750 ms (`!== 0`). `; route deadline reached` is never appended to the unavailable row's reason even though the gather deadline caused unavailability. The spec (`route-decide.gate.spec.ts:339-350`) only tested an already-expired `deadlineAtMs: 100 + ROUTE_RETURN_RESERVE_MS` where `ioDeadline.remainingMs() === 0` from the start.
  2. **False positive (misattribution):** In a two-phase gate call where phase A (`implement`) dispatches to the decision model and hangs until `ioDeadline` expires (`ioDeadline.remainingMs() === 0`), while phase B (`visual-review`) gathered cleanly in 50 ms and became `unavailable` solely due to `missing-capability`, line 351–353 blindly appends `; route deadline reached` to phase B's reason even though phase B never experienced a deadline.
  3. Additionally, line 352 appends to `row.reason` only and leaves `row.explanation` unchanged.
- **Concrete fix:** Do not infer row unavailability from global `ioDeadline.remainingMs() === 0` after assembly. Attribute `; route deadline reached` only when the gather stage (or a gather input relevant to unavailability, such as `rows`, `limits`, `roles`, `phaseDefs`, or `tools` for that phase) actually timed out on its deadline, and mirror the deadline note into `row.explanation` when applicable.

### 2. [Serious] Deadline-capped requests race inner `AbortSignal.timeout(Math.floor(remainingMs))` against `withinBudget`, misreporting `'timeout'` instead of `'deadline'` and logging spurious `'unreachable'` warnings
- **Location:** `libs/backend/lane-routing/src/lib/route-decide.service.ts:399-425`, `libs/backend/lane-routing/src/lib/decision-model/decision-caller.ts:81-90, 96-112`
- **Failing scenario:**
  1. **Misclassified `'timeout'` instead of `'deadline'`:** With a saved `decisionModelTimeoutMs` larger than the remaining route budget (e.g., the real user config of 15,000 ms from AM5 addendum on a 4,000 ms pre-flight or 8,000 ms gate call, or a 3,000 ms default on gate pass 2 with 2,200 ms left), `withinBudget` (`pipeline/route-deadline.ts:79, 138-141`) schedules its outer timer for `remainingAfterStart` (e.g., `3740.8 ms`). Inside `requestWithinDeadline` (line 398–401), after `await Promise.resolve()`, `timeoutCapMs = Math.floor(deadline.remainingMs())` truncates down (e.g., `3740` or `3739 ms`), strictly shorter than `withinBudget`'s timer. `decision-caller.ts:98` passes `timeoutMs = Math.min(15000, 3739) = 3739` to `SystemOneClient` (and `decision-caller.ts:81-83` creates `AbortSignal.timeout(Math.min(3000, timeoutCapMs))` for `structured`). When the model hangs, the inner `AbortSignal.timeout` fires ~0–1 ms before `withinBudget`'s timer, `SystemOneClient` / `callStructured` returns `requestCause: 'timeout'`, and `withinBudget` sees `!expired && remainingMs() > 0` so it returns `{ kind: 'ok', value }` with `fallbackCause: 'timeout'` instead of `'deadline'`. This violates Plan Component 4 ("Use `deadline` when skipped for budget or when the outer race wins, `timeout` for an earlier provider timeout") and distorts B13's abort/rate handling.
  2. **Spurious `'unreachable'` log on deadline abort:** Conversely, when `withinBudget`'s timer fires first and aborts `budget.signal`, the `fetch` wrapper at `decision-caller.ts:107-110` aborts `fetch` via `AbortSignal.any([init.signal, budget.signal])`. Inside `SystemOneClient.classifyTransportFailure` (`system-one.client.ts:289-305`), `signal` is `SystemOneClient`'s own `AbortSignal.timeout(timeoutMs)`, which is not yet aborted, so `SystemOneClient` logs `[lane-routing] system one call failed { cause: 'unreachable', detail: 'transport error (AbortError)' }` on every deadline expiry.
- **Concrete fix:** In `route-decide.service.ts:399-429`, compute `configuredTimeoutMs = caller.kind === 'system-one' ? caller.target.timeoutMs : DECISION_REQUEST_TIMEOUT_MS` and `cappedByDeadline = timeoutCapMs < configuredTimeoutMs`. When `result.kind === 'ok' && cappedByDeadline && result.value.requestCause === 'timeout'`, rewrite `requestCause` to `'deadline'` (preserving `sent: result.value.sent`). Keeping `timeoutCapMs = Math.floor(deadline.remainingMs())` together with that rewrite also lets `SystemOneClient`'s own timer fire first in the capped case so it logs `'timeout'` rather than a false `'unreachable'` without touching AM1-protected `system-one.client.ts`.

### 3. [Serious] Unbounded `persistRotation` inside `this.rotationWrites` permanently wedges future saves and leaks `GatheredCall` + `GateResult` closures if one `rotation.save()` hangs
- **Location:** `libs/backend/lane-routing/src/lib/route-decide.service.ts:358-360, 512-528`
- **Failing scenario:**
  1. `decideGate` chains every call onto `this.rotationWrites` (`route-decide.service.ts:358-360`) and awaits `this.persistRotation(gathered, validated.data)` with no timeout bound.
  2. If a single `this.deps.rotation.save(picks)` hangs (a failure mode explicitly modeled in `route-decide.gate.spec.ts:717-728`), `this.rotationWrites` never settles.
  3. Every subsequent `decideGate` call in the long-lived Electron process appends another `.then(...)` closure onto `this.rotationWrites`, retaining the full `gathered` snapshot (capability matrix, lane models, tool maps) and the full `validated.data` (`GateResult` with candidate traces) indefinitely, and starving all subsequent rotation writes for the rest of the session.
  4. Even when `gathered.rotationUnavailable` is true or there are zero `chosen` entries (`persistRotation` is a no-op), lines 358–360 still enqueue a closure capturing `gathered` and `validated.data`.
- **Concrete fix:** Compute the minimal `picks` (`RotationState`) synchronously before enqueuing and skip enqueuing entirely when `gathered.rotationUnavailable || picks.entries.length === 0` so `gathered` and `validated.data` are never retained. Race each queued `this.deps.rotation.save(picks)` inside `withinBudget(deadline, ...)` (logging late errors via `logBackgroundFailure`) so one hung save cannot permanently wedge the serialized queue or leak memory across the session.

### 4. [Moderate] `shortlistTrace` tie-break picks a `pruned` candidate over an equally scored `ranked` candidate, contradicting `row.explanation`
- **Location:** `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/route-tool-handlers.ts:104-113`
- **Failing scenario:** `assemble-gate.ts:435-467` emits model-pruned entries (`disposition: 'excluded', rule: 'pruned'`, section 2b) **before** remaining `ranked` entries (`disposition: 'ranked'`, section 3). When a higher-tiebreak `ranked` runner-up (e.g., `grok`, total 75, named by `strongestAlternativeOf` in `row.explanation`) ties on `total` with a lower-tiebreak `pruned` candidate (e.g., `opencode`, `cause: 'option-cap'`, total 75), `shortlistTrace` visits `opencode` first and uses strict `>` at line 109 (`(candidate.total ?? -Infinity) > (alternative.total ?? -Infinity)`). `75 > 75` is `false`, so `shortlistTrace` keeps `opencode` and drops `grok`, making the compacted `candidates` shortlist disagree with `row.explanation`.
- **Concrete fix:** Break equal-`total` ties in `shortlistTrace` in favor of `candidate.disposition === 'ranked'` over `rule === 'pruned'` (e.g., replace `alternative` when `candTotal > altTotal || (candTotal === altTotal && candidate.disposition === 'ranked' && alternative.disposition !== 'ranked')`).

### 5. [Moderate] Non-finite `context.deadlineAtMs` (`NaN`) misreports `'model-cold'` instead of `'deadline'`, and residency probe failures are silently swallowed
- **Location:** `libs/backend/lane-routing/src/lib/route-decide.service.ts:166-173, 380-393`
- **Failing scenario:**
  1. If a direct caller passes `{ deadlineAtMs: NaN }`, `ioDeadline.remainingMs()` returns `NaN`. Lines 380 and 391 evaluate `NaN < DECISION_MODEL_TIMEOUT_MIN_MS` as `false`; for a local Ollama daemon, `withinBudget` detects `NaN` and returns `{ kind: 'deadline' }`, which line 392 misclassifies as `emptyOutcome('model-cold')` instead of `'deadline'`. Conversely, `{ deadlineAtMs: Infinity }` bypasses the hard route deadline completely.
  2. When `residencyFetch` throws (e.g., `ECONNREFUSED`) or returns a non-OK HTTP status, line 392 silently returns `emptyOutcome('model-cold')` with no debug/warn log (unlike `SystemOneClient.probeResident` at `system-one.client.ts:272`), and non-OK response bodies are not cancelled (`response.body?.cancel?.()`).
- **Concrete fix:** Validate `context?.deadlineAtMs` at line 167 (accept only finite numbers; fall back to `enteredAt + ROUTE_DEADLINE_MS[stage]` otherwise). Log residency probe errors/timeouts at `debug` level via `errorFacts(residency.error)` (without copying raw URLs/bodies) and guard `!(deadline.remainingMs() >= DECISION_MODEL_TIMEOUT_MIN_MS)` at lines 380 and 391.

### 6. [Moderate] Pre-flight reuse cache skipped when `ioDeadline.remainingMs() === 0`
- **Location:** `libs/backend/lane-routing/src/lib/route-decide.service.ts:175`
- **Failing scenario:** `this.deps.reuse.get(context.sessionKey, fingerprint)` is a synchronous in-memory lookup with zero I/O. Gating it on `ioDeadline.remainingMs() > 0` discards a valid confirmed cached pre-flight result whenever a call enters with `<= 250 ms` remaining (inside `ROUTE_RETURN_RESERVE_MS`), forcing a fallthrough to `decidePreflight` that returns null `skill-table` answers with `fallbackCause: 'deadline'`.
- **Concrete fix:** Remove the `ioDeadline.remainingMs() > 0` guard on the synchronous in-memory cache lookup at line 175 so a confirmed cached result is still returned within the return reserve.

### 7. [Moderate] `DecisionCaller.dispatchFor` throws `TypeError` if given a negative or `NaN` `timeoutCapMs`
- **Location:** `libs/backend/lane-routing/src/lib/decision-model/decision-caller.ts:81-83, 98`
- **Failing scenario:** `DecisionCaller.dispatchFor` is a public method on a DI-registered service (`LANE_ROUTING_TOKENS.DECISION_CALLER`). If any caller (including future B13 callers) passes `budget: { signal, timeoutCapMs }` with a negative or `NaN` value, `Math.min(DECISION_REQUEST_TIMEOUT_MS, timeoutCapMs)` (line 82) or `Math.min(caller.target.timeoutMs, timeoutCapMs)` (line 98) passes a negative/`NaN` timeout to `AbortSignal.timeout(...)`, throwing a synchronous `TypeError`. (`RouteDecideService` itself guards `< 1000` before calling `dispatchFor`, so this does not currently trigger from `RouteDecideService`.)
- **Concrete fix:** Clamp `const cap = Number.isFinite(budget.timeoutCapMs) ? Math.max(0, Math.floor(budget.timeoutCapMs)) : 0;` inside `dispatchFor` before `Math.min(...)`.

### 8. [Moderate] Compaction retains empty `candidates: []` through `shortened` tier and can split UTF-16 surrogate pairs in truncated explanations
- **Location:** `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/route-tool-handlers.ts:101-120, 143-155, 164-170`
- **Failing scenario:**
  1. `assemble-gate.ts:469` emits `candidates: []` when a phase has an empty inventory (e.g., `agent-list` failure with a custom role). `shortlistTrace` computes `omitted = 0` and leaves `candidates: []` intact, and the round-robin loop skips `row.candidates?.length === 0`. Across 100 phases, `"candidates":[]` wastes 1,600 chars through the `shortlist`, round-robin, and `shortened` tiers, potentially pushing an otherwise fitting payload into `countsOnly` (dropping all `explanation`s).
  2. Line 168 uses `row.explanation.slice(0, maxExplanationChars - 1)`, which slices UTF-16 code units and can bisect a surrogate pair (e.g., emoji in a candidate `displayName` or `callerPreferenceNote`), producing an unpaired lone surrogate in serialized JSON.
- **Concrete fix:** Normalize empty `candidates` to `undefined` in `shortlistTrace` (`if (row.candidates.length === 0) return { ...row, candidates: undefined };`), and slice explanations safely on code-point boundaries (checking whether the last retained code unit is a high surrogate `0xD800–0xDBFF` before appending `…`).

### 9. [Minor] Untested failure and boundary branches across G4 specs
- **Location:** `libs/backend/lane-routing/src/lib/route-decide.gate.spec.ts:292-400`, `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/route-tool-handlers.spec.ts:341-397`, `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/route-namespace.builder.spec.ts:233-325`
- **Failing scenario:** Key branches added in G4 have no unit coverage and allowed Findings 1, 2, and 4 to slip through:
  - `route-decide.gate.spec.ts`: (a) gather timing out at 2,000 ms within an 8,000 ms gate deadline on an unavailable row; (b) real `SystemOneClient` dispatch (without `seams.systemOne`) aborting on `budget.signal` and reporting `'deadline'` when `timeoutCapMs < target.timeoutMs`; (c) `structured` caller timeout capping; (d) `openCaller` hanging past `ioDeadline`; (e) `residencyFetch` rejection/non-200/timeout; (f) `rotationWrites` skipping expired writes, serializing concurrent saves in invocation order, and catching/logging rejected `rotation.save()` and `noteLive()`.
  - `route-tool-handlers.spec.ts`: (a) the `countsOnly` compaction tier (`route-tool-handlers.ts:173-176`); (b) equal-`total` tie between a `ranked` and a `pruned` candidate; (c) compaction of `unavailable` rows with only hard-excluded candidates.
  - `route-namespace.builder.spec.ts`: direct test that `buildRouteNamespace().decide(args, context)` forwards `{ sessionKey, deadlineAtMs }` and that `limitEvidence` propagates `agent.limits` rejections.
- **Concrete fix:** Add targeted tests for each branch above alongside fixes for Findings 1–8.

## Five logic questions

### 1. How does this fail silently?
- `route-decide.service.ts:349-354`: On a 2 s gather timeout within an 8 s gate call, `ioDeadline.remainingMs()` is still ~5.75 s, so unavailable rows silently omit `; route deadline reached`; conversely, when another phase's model pass exhausts `ioDeadline`, unrelated unavailable rows silently receive a false `; route deadline reached` reason.
- `route-decide.service.ts:399-425` + `decision-caller.ts:81-98`: When a saved timeout (e.g., 15 s) is capped by the remaining route budget, `AbortSignal.timeout(Math.floor(remainingMs))` fires slightly before `withinBudget`, silently reporting `fallbackCause: 'timeout'` instead of `'deadline'`.
- `route-decide.service.ts:383-393`: Residency probe network/HTTP errors silently collapse into `'model-cold'` with zero log output.
- `route-tool-handlers.ts:104-113`: On an equal-`total` tie, `shortlistTrace` silently selects a `pruned` candidate over the `ranked` runner-up named in `row.explanation`.

### 2. What user action produces unexpected behaviour?
- Saving `decisionModelTimeoutMs = 15000` (the real user config from AM5 addendum) causes pre-flight (4 s) and gate (8 s) model calls that hit the route deadline to report `fallbackCause: 'timeout'` instead of `'deadline'` (`route-decide.service.ts:399-425`, `decision-caller.ts:98`).
- Putting an emoji or astral Unicode character in `preferenceSource` or a Ptah CLI agent display name can cause truncated `explanation` strings in compacted MCP results to end with an unpaired UTF-16 surrogate (`route-tool-handlers.ts:168`).

### 3. What input data produces a wrong answer?
- A `gate-0.1` result with tied `total` scores between a `ranked` and a `pruned` candidate produces the wrong `alternative` in compacted `candidates` (`route-tool-handlers.ts:109`).
- Direct service calls passing `{ deadlineAtMs: NaN }` misreport `'model-cold'` instead of `'deadline'` on local Ollama targets (`route-decide.service.ts:380-393`), and passing `{ deadlineAtMs: Infinity }` disables the hard deadline (`route-decide.service.ts:167`).
- Direct calls to `DecisionCaller.dispatchFor` with `timeoutCapMs < 0` or `NaN` throw `TypeError` from `AbortSignal.timeout` (`decision-caller.ts:81-83, 98`).

### 4. What happens when a dependency fails?
- `source.rows()` hangs: bounded by `gatherDeadline` (2 s) inside `gatherRouteCall`, returns assembled gate result (Finding 1 notes the missing `; route deadline reached` on unavailable rows when `ioDeadline` still has time left).
- `rotation.save()` hangs: `decideGate` returns promptly, **but** `this.rotationWrites` permanently wedges and leaks `gathered` + `validated.data` closures on every future gate call (`route-decide.service.ts:358-360`, Finding 3).
- `decisionCaller.noteLive()` rejects: observed via `.catch()` and logged safely through `logBackgroundFailure` (`route-decide.service.ts:426-428`).
- `agent.limits()` returns `undefined` or is absent: `limitEvidence` and `limits` both return `null` cleanly (`route-namespace.builder.ts:96-126`); rejections propagate to `gather.ts`.
- `residencyFetch` hangs: capped at `SYSTEM_ONE_RESIDENCY_PROBE_TIMEOUT_MS` (1 s) within `ioDeadline` (`route-decide.service.ts:383-390`), falls back to `'deadline'` or `'model-cold'`.
- `openCaller()` hangs (e.g., hung secret store): raced against `ioDeadline`, returns `{ kind: 'blocked', cause: 'deadline' }` (`route-decide.service.ts:368-373`). (Residual note: in `decideGate`, `openCaller` uses the full 7.75 s `ioDeadline` rather than the 2 s gather cap, so a hung secret store delays even a 100%-pinned gate call until `ioDeadline`.)
- Sibling G3 note (outside G4 write set, confirmed in `batch-G4-report.md`): `pipeline/gather.ts:156-174` still leaves `provisionalLanesPromise`/`toolResultPromise` unhandled if `rowsPromise` rejects via a throwing logger, causing the existing `logs one error summary and rethrows a gate failure unchanged` test in `route-decide.gate.spec.ts:679` to fail on integration.

### 5. What is missing that the requirements never mentioned?
- `RouteCandidateSource.limitEvidence` (`route-candidate-source.port.ts:14-16`, B01) does not accept an `AbortSignal`, so `route-namespace.builder.ts:97` cannot forward the gather abort signal to `agent.limits(rows, { signal })`; a slow limit lookup keeps running until `LaneLimitLookupService`'s own deadline even after `gatherDeadline` expires.
- `callStructured` (`pipeline/model-call.ts:119-128`, outside G4) retains its hardcoded `STRUCTURED_DEADLINE_MS` (3,250 ms) internal `setTimeout` even when `withinBudget` aborts earlier; if a completer ignores `signal`, that timer outlives `decide()` by up to 3.25 s.

## Checks run

1. `git status --short && git diff --stat -- libs/backend/lane-routing/src/lib/decision-model/system-one.client.ts libs/backend/lane-routing/src/lib/decision-model/system-one.residency.ts libs/backend/lane-routing/src/lib/decision-model/decision-model.config.ts libs/backend/lane-routing/src/lib/decision-model/decision-model.target.ts`
   - Result: Exit 0; all four protected decision-model connection files have zero diff.
2. `npx tsc --noEmit --project libs/backend/vscode-lm-tools/tsconfig.lib.json` (logged to `.ptah/tmp/g4-review-tsc.log`)
   - Result: `TSC_EXIT=0` (zero errors).
3. `npx jest --config libs/backend/vscode-lm-tools/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/route-tool-handlers.spec.ts libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/route-namespace.builder.spec.ts` (logged to `.ptah/tmp/g4-review-jest.log`)
   - Result: `JEST_EXIT=0` — 2 test suites passed, 33 tests passed, 0 failed.
4. `ptah_get_diagnostics` on all 9 G4 files (attempted twice)
   - Result: `Unavailable` — TypeScript check exceeded 45 s timeout on both attempts; fell back to scoped `npx tsc --noEmit --project libs/backend/vscode-lm-tools/tsconfig.lib.json` above (lane-routing `tsc`/Jest not run per allowed-checks scope).

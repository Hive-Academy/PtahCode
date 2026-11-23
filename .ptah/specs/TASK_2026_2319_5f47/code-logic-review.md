# Code Logic Review — `TASK_2026_2319_5f47`

## Summary

| Metric              | Value          |
| ------------------- | -------------- |
| Overall score       | 7/10           |
| Assessment          | APPROVED (with moderate follow-ups) |
| Blocking issues     | 0              |
| Serious issues      | 0              |
| Moderate issues     | 4              |
| Failure modes found | 6              |

Scope: whole uncommitted diff (agent-sdk: build-safe-env, no-activity-watchdog, session-query-executor; cli-agent-runtime: session-handoff.service, session-spawner.port/service) plus surrounding code (sdk-query-options-builder.ts:1783-1802, session-turn-state.registry.ts settleTurn, spawner onSessionEnded/onGraceExpired/onTurnFailed/retirePredecessor). Focused Jest run: session-spawner.succession + session-handoff specs 278 pass; no-activity-watchdog + build-safe-env specs 81 pass. Not run: the full spawner spec, diagnostics.

## Five logic questions

### 1. How does this fail silently?
- The user-facing hang text is hard-coded to 180 s while the real window can now be larger: `session-child-outcome.ts:52-53` and `session-spawner.service.ts:2036` (`formatProviderHang(180)`). Every named run now has a window of 211 s (`max(180, min(900, 181+30))`), so the parent is told "180 s" for a 211 s wait. The reason is still correct, the number is not (moderate).
- `retiring` entries can leak: `retirePredecessor` returns early when `!this.runtimes.has(id)` (spawner:3177) without deleting from `retiring`. Pre-existing, now reachable by the new ack path (minor).

### 2. What user action produces unexpected behaviour?
- Setting `CLAUDE_STREAM_FIRST_BYTE_TIMEOUT_MS` above 870 s: the window caps at 900 s (`no-activity-watchdog.ts` `noActivityWindowMs`), the SDK waits longer, and the original race returns. Rare (moderate-minor).
- A successor acks while the predecessor's turn still runs: the predecessor keeps working next to the successor until its turn ends (spawner:3153-3160). This follows "pause, never kill"; the log line is the only signal. Accepted by the product rule.

### 3. What input data produces a wrong answer?
- `sdkFirstByteTimeoutMs` falls back to 181 000 for a non-positive or non-numeric user value (build-safe-env.ts). The SDK receives the raw string and its own parsing may differ (for example `"0"` could mean "no timeout"). Window is then 211 s against an unknown SDK wait. Minor.
- `SDK_DEFAULT_FIRST_BYTE_TIMEOUT_MS = 181_000` for a named run rests on one incident (`waited_ms: 181000`); the CLI default is not read from anywhere. If the CLI default changes, the guard races again. Minor.

### 4. What happens when a dependency fails?
- `turnRuns` (spawner:2429) is `activeIdOf && (phase undefined || generating)`. A missing phase is treated as running, so a predecessor with an active adapter session but no turn-state entry waits for a turn event, session end or ack. All three exist, so it cannot hang past session end; acceptable fail-safe direction (does not kill).
- Phases `awaiting-background` and `sleeping` count as not running (registry settleTurn). An idle predecessor with open Monitor/background tasks is retired at once. Allowed by the user's hard constraint (parent-stop after handoff) and lanes are adopted by the successor, but the cooperative-pause retire now happens at `succeed` time, before the successor's ack (spawner:3097-3103), where the old 60 s timer also ended it pre-ack. Not a regression.
- `retirePredecessor` -> `verifyAndHardStop`: failure is logged only (spawner:2617-2625). Pre-existing.

### 5. What is missing that the requirements never mentioned?
- `turnRuns` ignores queued follow-ups (`isIdleWithoutPendingWork` checks them). A predecessor between a queued follow-up and its `generating` phase is retired. Narrow window; the predecessor was already handed off.
- No spec asserts the 211 s named-run path end to end in the executor (watchdog spec covers `noActivityWindowMs`).

## Failure modes

### Guard window still races for very long user first-byte values
- Trigger: env first-byte > 870 s.
- Symptom: guard ends the turn before the SDK retry notice.
- Evidence: `noActivityWindowMs` clamps at `API_RETRY_MAX_ACCOUNTED_MS` (900 s).
- Current handling: clamp.
- Recommendation: document, or log a warning at executor build when `firstByte + 30 s > 900 s`.

### Stale "180 s" in hang text
- Trigger: any named run, or a user value above 150 s.
- Symptom: parent/UI reads "180 s" while the window was 211 s or more.
- Evidence: `session-child-outcome.ts:52-53`, `session-spawner.service.ts:2036`.
- Recommendation: carry `measured` from `ProviderTurnEndError` (already holds the real window) into `formatProviderHang`, or word the text without a number.

### Retiring predecessor waits on a long turn
- Trigger: cap-paused predecessor whose turn runs for a long time after the successor acked.
- Symptom: two agents act on the same task for a while.
- Evidence: spawner:3099-3101, 3153-3160.
- Current handling: logged; retires at turn end/session end.
- Recommendation: accept per policy; consider a notice to the parent.

### Idle predecessor with background tasks retired
- Evidence: spawner:2429 and registry settleTurn phases.
- Handling: parent-stop, allowed by the hard constraint.

### Provider-hang end after first turn
- Verified no double settle: `onTurnFailed` returns early for a no-response `ProviderTurnEndError` (spawner:1737-1740) and `onGraceExpired` settles only when `turnsSettledAtEnd` equals the current count (spawner:2020-2030). First-turn recovery unchanged: `reserveChildRetry` still runs only for `turnsSettled === 0` (spawner:1850) and `wasWorking` is only an OR extension. If the abort reason is no longer readable when `onTurnFailed` fires, the failure would settle with the generic text first and the hang reason would be lost (minor, unverified).

### `retiring` leak
- Evidence: spawner:3177 early return. Minor.

## Blocking issues
None.

## Serious issues
None.

## Moderate and minor issues
- Moderate: stale 180 s texts (above).
- Moderate: window clamp leaves the race for first-byte above 870 s (above).
- Moderate: 181 s named default is an assumption (above).
- Moderate: `turnRuns` ignores queued follow-ups (spawner:2429).
- Minor: `retiring` leak at spawner:3177; the m4 change is spec-only (context.md:64), nothing in source.

## Checks asked for
- Window computed from the SDK's env: yes. Non-named: the builder passes `firstByteTimeoutEnv({...process.env, ...effectiveAuthEnv})` (sdk-query-options-builder.ts:1802) and the executor uses the same merge (executor:1673), with `effectiveAuthEnv` from the same snapshot (builder gets `authEnvOverride: effectiveAuthEnv`, executor:1783). Named: certified env drops the key, so SDK default is used (executor:1670).
- `named` assigned before the watchdog: yes (executor:1553-1590, watchdog at 1664+).
- Other `timeoutMs` uses: tool/hook overdue notice and the api_retry floor (`Math.max(this.timeoutMs, accountedMs)`, watchdog:470) only become more lenient; capped at 900 s. No breakage.
- Predecessor never interrupted while its turn runs: confirmed for the cap path (spawner:3097-3103) and ack path (3153-3160); the 60 s timer for non-cooperative handoffs is unchanged. Top-level ack: the handoff service change is inside the child branch and guarded by `callerSessionId`; unchanged.
- m9: `capArmedAt` set in `armRuntimeCap` on the runtime it arms (spawner:2698), so a successor measures from its own arm; `limit` is added alongside `measured`.

## Data flow
1. Executor builds env, computes window (OK). 2. Watchdog fires, `ProviderTurnEndError(cause, window)` (OK). 3. Session end -> spawner `onSessionEnded`, `wasWorking` (OK). 4. Grace -> failed settle with hang text (gap: hard-coded 180).
Cap handoff: succeed -> retiring -> idle: retire; running: wait for turn event, session end or ack (OK).

## Requirements fulfilment

| Requirement | Status | Gap |
| --- | --- | --- |
| Guard not shorter than SDK first-byte wait | COMPLETE (up to 870 s) | clamp |
| ProviderTurnEndError reports real window | COMPLETE | user texts still 180 |
| Cap-paused predecessor not stuck in retiring | COMPLETE | queued follow-ups |
| Never interrupt running turn | COMPLETE | |
| Watchdog end after first turn reports to parent | COMPLETE | |
| m4 / m9 | COMPLETE | m4 spec-only |

## Edge cases

| Case | Handled | How | Concern |
| --- | --- | --- | --- |
| Named run | YES | SDK default 181 s | assumed constant |
| User value > 870 s | NO | clamp | race returns |
| Phase undefined | YES | treated as running | waits for an event |
| Duplicate end | YES | grace/settle guards | |

## Verdict

- Recommendation: APPROVE
- Confidence: MEDIUM-HIGH
- Top risk: user-visible hang text says 180 s while the window can be 211-900 s.
- What a robust implementation would add: pass the measured window into `formatProviderHang`; warn when the clamp leaves the SDK wait longer than the guard; count queued follow-ups in `turnRuns`; delete `retiring` entry on the early return in `retirePredecessor`.

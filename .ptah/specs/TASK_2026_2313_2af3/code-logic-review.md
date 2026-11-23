# Code Logic Review - `TASK_2026_2313_2af3`

Scope: uncommitted diff, 7 files in `libs/backend/auth-providers/src/lib/quota/readers/`, read whole. Plus `fallback-usage.runner.ts`, `usage-source-chain.ts`, ledger rules. Jest could not load (`jest.config.ts` ESM warning); no test evidence from me.

| Metric | Value |
| --- | --- |
| Score | 7/10 |
| Assessment | NEEDS_REVISION (small) |
| Blocking | 0 |
| Serious | 1 |
| Moderate | 4 |
| Minor | 3 |

## Five logic questions
1. Silent failure: S1. A caller that stopped waiting leaves the kill unrecorded in the backoff map. A success inside an aborted flight never clears `disabledBy`.
2. User action: refresh spam. Each click after 10 s can spawn agy through a kill-disable. This is by design (decision 4), but each spawn may bill one unseen turn.
3. Wrong answer: M1 (a non-kill timeout gets the 30/120 s kill backoff).
4. Dependency failure: agy hangs, IDE stages use full time, cleanup outlasts the chain. See S1.
5. Missing: a kill with no stdout (agy prints JSON only at the end) can never show billing. Max 3 unseen turns per process plus one per refresh. Accepted in decision 2, but should be logged on the kill-disable.

## Serious

### S1. Kill backoff is lost when the caller aborts
- `antigravity-cli-usage.source.ts:449-451`: `signal?.aborted` deletes the backoff entry. `cacheFailures:false` (`fallback-usage.runner.ts:114`) means the runner keeps nothing either.
- Scenario: stage 1 and 2 use 3 s each. CLI starts at about 6.75 s (after the sign-in wait, 0.75 s at most). Kill at 19.75 s, then `stopRun` (up to 2 s tree kill, 0.5 s close grace). The chain aborts at 20 s. The flight records the kill (`recordKill`, line 396), but the caller gets `cli-unavailable` from the abort and stores no entry.
- Result: the next non-refresh read finds no backoff and no disabled state and spawns again at once. The 30 s / 120 s delays are skipped. Before this change the runner cached the failure for 5 min, so this is a regression for the abort path.
- Fix: keep `killRetryAt` at module level. Set it in `recordKill` (now + `killBackoffMs()`). Check it at the top of `readAntigravityCliUsage` unless `mayRetry`. It then works whoever waits for the flight.

## Moderate

### M1. `backoffFor` reads `killStreak` for any `cli-timeout` (`:422`)
`cli-timeout` also comes from a stuck `mkdtemp` or an expired deadline (runner `:136`, `:159`), with no process and no kill. If `killStreak > 0` from an older kill, that failure gets 30 s or 120 s, not 5 min. The reverse is harmless. Fix: have the executor wrapper (`:474`) set a per-flight flag `killedThisRun` and use the kill backoff only when it is set.

### M2. Success and streak reset live in the caller, not the flight (`:507`, `:510`)
If the caller aborts, the flight can finish with a good answer. It is cached 60 s, but `killStreak` stays and `disabledBy='killed'` stays. A later non-refresh read returns `cli-disabled` for the whole cache time. Fix: do the reset in the `parse` callback (`:~494`), next to `trip('billed')`.

### M3. `onKill` also fires on shutdown and on non-timeout stops
`disposeFallbackRuns()` (`plan-usage.service.ts:346`) calls `stopRun`, which calls `killTree`, which calls `reportKill` (`:260-264`). `output-cap` (stdout over 48 KB) also lands in `stopRun` and counts as a kill, even though the cause is `cli-parse-failed`. Three of those disable the source as "killed". Shutdown is harmless (process state). Fix for `output-cap`: count a kill only when the stop was a timeout, for example a `timedOut` flag passed to the executor, or skip `reportKill` after `output-cap`.

### M4. Chain margin is thin
Worst case: 3 + 3 + 0.75 (sign-in, `min(1000, spare)`) + 13 = 19.75 s of 20 s. Math holds (spare 0.75 s) but leaves 250 ms, and cleanup (up to 2.5 s) always runs past the chain. Either raise the chain to 22 s or skip the sign-in wait when `spare < 1000`. S1's fix removes the main effect.

## Minor
- m1. `killStreak`, `lastRunAt`, `disabledBy` are module-level and shared across owners and accounts (`:312-316`). One owner's success resets another's streak. agy is one process-wide account, so likely fine. Document it.
- m2. `lastRunAt = now()` at start (`:475`) is set before `inner.start`. A synchronous spawn throw never reaches the `closed` update. Result: the refresh gap counts from the start. Harmless.
- m3. `killedRunShowsBilling` reads stdout at the moment of the kill. Bytes that arrive during the tree kill are not checked. Re-check in the `closed` handler and trip then.

## Checked and found sound
- Caller abort never kills: `runSignal` is not passed, `signal` only resolves the caller (`runner:124-130`). `onKill` fires once per run (`killReported`).
- A normally closed run skips `stopRun` (`isClosed`), so no false kill. A failed spawn has no pid, so no kill.
- Refresh while a run is live cannot double-spawn: same key shares the flight, another key gets `cli-busy` (`runner:103`, one per source). `mayRetry` is also true after 10 s of a long live run, but still only shares the flight.
- Billing trip stays final: `disabledBy==='billed'` returns before `mayRetry`; `??=` does not downgrade it.
- Callers outside the diff: `createAntigravityCliExecutor`, `ANTIGRAVITY_CHAIN_TIMEOUT_MS`, `readAntigravityCliUsage`, `cacheFailures` appear only in the reader, source, runner and their specs. The new `onKill(partialStdout)` signature has no other user. The `group` field in `plan-limit.types.ts` is optional (additive).
- `FallbackRequest.cacheFailures` is opt-in. Other runner users are unchanged.

## Kimi exhaustion
- Safe against a stale lane. Source `provider-api` with a known reset clears on a newer reading below 100% that names no gate (`plan-limit-ledger.rules.ts:~160-185`). It expires at its reset, and `removeProvider` drops it when the window leaves the reply (`ledger.service:277`).
- `reset_time` is validated as a datetime or `''` (`kimi...reader.ts:18`), so no NaN reset can reach `exhaustion`.
- Residual: after an auth failure the lane stays AT LIMIT until the reset (intended). A plan upgrade mid-window shows AT LIMIT until the next good read. Document in the spec.

## Data flow
chain stages (3 s, 3 s) -> `readCli` (budget check OK) -> backoff/disabled gate (S1) -> sign-in wait -> runner flight -> kill or close -> `recordKill`/parse trip OK -> caller reset (M2) -> backoff map (S1, M1).

## Requirements
| Requirement | Status | Gap |
| --- | --- | --- |
| Kill backoff 30/120 s, 3 kills disable | PARTIAL | S1 abort path |
| Billing evidence final, also in partial stdout | COMPLETE | m3 |
| Refresh passes backoff once per 10 s | COMPLETE | spawns may bill unseen |
| Kill window 13 s, chain 20 s | COMPLETE | M4 margin |
| `cacheFailures:false` | PARTIAL | removes the runner backoff for aborted callers |
| Kimi exhaustion | COMPLETE | none |

## Verdict
REVISE. Confidence MEDIUM (no test run). Top risk: S1, the backoff is skipped exactly in the slow-start case. Add: module-level `killRetryAt`, reset logic inside the flight, a kill flag for the backoff choice, and a spec for "caller aborted, then kill, then next read must not spawn".

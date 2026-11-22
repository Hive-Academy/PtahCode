# Code Logic Review r2 - TASK_2026_2297_agy (uncommitted diff, static only)

## Summary

| Metric | Value |
| --- | --- |
| Overall score | 6.5/10 |
| Assessment | NEEDS_REVISION (minor) |
| Blocking | 0 |
| Serious | 3 |
| Moderate | 6 |

No double counting, no eventKey instability and no break of the other producers' SQL branches was found. Sink failures are isolated from the turn. The findings below are silent-degradation and robustness gaps.

## Serious

### S1. Orphan identity is captured asynchronously, so a crash or slow probe leaves an unkillable, then forgotten, orphan
- `apps/ptah-electron/src/di/provider-session-pid-ledger-store.ts` `record` (about lines 131-142) persists the row with NO identity, then `capture()` probes (PowerShell CIM on Windows, timeout 5 s, `PROBE_TIMEOUT_MS` in `provider-session-orphan-sweep.ts`).
- Scenario: the host crashes or quits within the probe window, or the cold PowerShell start takes more than 5 s (load, AV). The probe failure is only a `warn` in the store `capture` catch, so the row keeps `identity: undefined`.
- At next start `sweepOne` returns `'unverifiable'` (orphan-sweep about lines 143-150). That outcome settles the row (it is not in `retained`), so the orphan is never killed and the row is deleted. The old implementation killed from a time-window match without a record-time probe, so cleanup coverage regressed.
- Fix: retain unverifiable rows for a bounded number of starts, or capture identity from the spawn handle before the row is first persisted. At minimum log at error level.
- Related: `flush()` awaits all pending probes at shutdown (store about line 155), so quit can block up to 5 s per not-yet-probed agent.

### S2. "Unbroken chain" seed cannot detect lost trailing turns, yet the snapshot claims `complete`
- `libs/backend/agent-sdk/src/lib/provider-session/provider-session-usage-ledger.ts` `isUnbrokenSeed` (`events > 0 && maxRevision === events`), used in the constructor (`complete = !restored || (!!seed && isUnbrokenSeed(seed))`).
- A lost middle write is detected (gap). If the last N turns were never persisted (queue overflow `MAX_PENDING_WRITES` in `sqlite-session-usage-sink.ts:93`, a rejected write, or a crash between `deps.stats` and the queued write), the seed is still contiguous 1..k. The resumed session then reports `coverage: complete` and a full `totalCost` that omits those turns, and continues the ordinals so the loss can never be detected later.
- `record()` is fire-and-forget (`provider-session-usage-capture.ts:123`), so no failure signal reaches the ledger. Fix: let the ledger remember a persistence failure and switch later revisions to time-based, or persist the last known ordinal separately.

### S3. A transient 2 s restore timeout permanently demotes the session to partial coverage
- `provider-session-usage-capture.ts` `restore()` (`RESTORE_TIMEOUT_MS` 2000) races `sink.readSessionUsage`, which first does `await this.tail` (`sqlite-session-usage-sink.ts:113-118`), so it waits behind every queued write and finalization (startup backfill, bursts from other producers).
- On timeout the ledger is built with `seed = null`: `complete=false`, and every new turn gets a time-based revision (`nextRevision`, ledger about line 224). The persisted max revision is then about 1.7e12, so `isUnbrokenSeed` is false on every later resume: one slow startup read makes the session partial forever, and the persisted history is also ignored for the current process.
- Fix: do not serialize the read behind unrelated writes, or retry or lengthen the wait, or seed lazily when the read finally completes.

## Moderate

1. First-turn pricing wait distorts the turn. `provider-session-turn-stream.ts:240-246`: `await deps.pricingReady?.()` runs BEFORE `const ended = Date.now()`, so `duration` and persisted `coverageEndMs` include up to 3 s of catalog wait on the first turn after boot. The terminal turn-state yield that follows is delayed too, so the UI stays "running" and the follow-up drain (`onIdle`) is held. Take `ended` before the wait and do not delay the settle event.
2. A turn priced while hydration timed out is persisted `unpriced` forever. The gate settles once (`createPricingGate`, `wait ??=`), there is no later reprice, and the repository drops a same-revision rewrite. Later resumes report partial pricing for that session. Consistent with "unknown stays null", but the 3 s bound makes it network-speed dependent.
3. Subscription turns are persisted as `costAuthority: 'model-priced'` with a positive `knownCostMicroUsd` (`provider-session-usage-capture.ts:48-54`); `covered-by-subscription` is lost at the persistence boundary. I could not confirm how the dashboard treats it (static review). If it is summed as spend, agy users see a bill that does not exist.
4. The Windows probe cannot tell a failed WMI query from a gone process. `parseWindowsIdentity` returns `undefined` for empty stdout, and the script has no `-ErrorAction Stop`; a non-terminating Get-CimInstance error (exit 0, stderr only) is classified `gone` and the row is dropped without a kill.
5. Plan-mode reset depends on `approval.kind === 'switch_mode'` (`acp-session-runtime.ts:542`) or an agent `current_mode_update`. `kind` is optional (`acp-approval-adapter.ts:66`). If agy omits it, or the user picks an "allow always" option so agy later switches mode without asking and without an update, `liveMode` stays `plan` and the next turn starts unguarded in `default`. Consider invalidating `liveMode` on any approved request while the live mode is plan.
6. Fail-closed side effect (confirm intent). If agy does not offer `plan`, setup only emits an info and continues, then every Manual chat prompt is rejected at `acp-session-runtime.ts:1508-1520`. Safe, but a behaviour change. The failed reset returns 1 with `notStarted` false, so disposition stays `reusable` and the terminal is `failed`, which is fine. Lane consumers are unaffected: `turnStartMode` is undefined unless `consumer==='chat' && permission==='ask'` (antigravity profile).

## Minor
- `restore()` logs one read failure twice (`reading.catch` plus the outer catch).
- Respawn reapply `acknowledgedMode ?? profile.modeFor?.(options)` (`acp-session-runtime.ts:1282`) uses `options.permission`, not `livePermission`; only matters when a permission change was never acknowledged through `setMode`.
- `getProducerUsageTotals` does not filter on `source`/`billable`; fine today since only live rows exist for this producer.

## Five logic questions
1. Silent failure: S1, S2, S3 (only a warn), Moderate 4.
2. Unexpected user action: approve plan exit, then send; handled for the `switch_mode` kind, escapes in Moderate 5. First message right after boot: Moderate 1.
3. Wrong-answer input: an unknown model without an effort suffix stays null (correct). The suffix is stripped only for `antigravity` and only when the exact id has no provenance (`priceTurn`), so a listed-but-incomplete rate is not overridden. Subscription cost persisted as model-priced: Moderate 3.
4. Dependency failure: absent, rejecting or throwing sink is isolated (`record` try/catch plus `.catch`; `restore` returns null). `ensureHydrated` rejection or timeout is bounded.
5. Missing: no failure feedback from sink to ledger (S2), no reprice path, no cap on probe cost at shutdown.

## Checked and sound
- Double counting: eventKey is `runId#runTurn` with a per-ledger UUID; PK is `(session, event_key, model_id)`; a resumed ledger gets a new runId, so earlier rows count only through the seed. `session.usage ??=` in `open` (adapter about line 294) runs before any turn.
- Revision: ordinal when complete, `max(now, last+1)` otherwise; the repository's `first.revision < prior.revision` check is per event key, so no cross-turn suppression. The owner check cannot trip with UUID keys.
- Other producers: `provider-session` falls under `NOT IN ('codex-checkpoint','cli-lane')` in the replay-billable UPDATE (repository about line 485), same as sdk-owner; `runCostSnapshot` is sdk-owner only. Their behaviour is unchanged.
- DI: sink and pricing are resolved with `isRegistered(..., true)`; the sink is registered in `phase-1-infra.ts:167` before the adapter factory first resolves.
- `resumeSession` and the read are both chained on the sink tail, so they are ordered after earlier writes.
- Orphan sweep: unverifiable, gone, reused and probe-failure rows are never killed; kill only on same image (case-insensitive on win32) and creation time within 1 s of a value from the same probe; retries are bounded at 3 starts with `sweepAttempts` persisted and schema-validated; previous rows are re-persisted with live rows so a second crash still sweeps them.

## Verdict
REVISE. Highest-value fixes: S3 (decouple the read from the write tail), S1 (do not drop unverifiable rows after one start; capture identity earlier), S2 (feed persistence failure into the ledger). Static review only; nothing was executed.

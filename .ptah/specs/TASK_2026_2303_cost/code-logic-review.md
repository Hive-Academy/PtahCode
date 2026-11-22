# Code Logic Review — `TASK_2026_2303_cost`

## Summary

| Metric              | Value          |
| ------------------- | -------------- |
| Overall score       | 6.5/10         |
| Assessment          | NEEDS_REVISION |
| Blocking issues     | 0              |
| Serious issues      | 1              |
| Moderate issues     | 4              |
| Failure modes found | 6              |

## Five logic questions

1. Silent failure: a per-model row with a partly known or unobserved cost now reads "Not priced" (session-stats-view.ts formatModelCost). Turns that end without `publishStats` add no time (codex-chat-turn-stream.ts:205-210).
2. Unexpected user action: a turn that waits on an approval prompt counts the wait as turn time (`started` at codex-chat-turn-stream.ts:167).
3. Wrong-answer input: a model with one priced turn and one unpriced turn gets `costUSD: null` (provider-session-usage-ledger.ts:313-316). The UI says "Not priced" for a model that has a known subtotal.
4. Dependency failure: if `persistUsage` fails, the duration lives only in memory until the next successful publish. That matches how counters behave, and the error is logged.
5. Missing: no regression guard on `duration` in `checkpointRegresses` (session-metadata-store.ts:255). The breakdown Total never shows the known subtotal.

## Verified OK (checked, no defect)

- Double counting: `recordTurnDuration` (codex-session-usage-owner.ts:262-271) replaces the same turn's figure with the max, and folds only on a new turnId. A repeat publish from the early result, the terminal, or the interrupted drain does not double count.
- Checkpoint read compatibility: `duration` is optional, so legacy checkpoints parse (line 73). Restore keeps `duration` only when the checkpoint is valid (line 202), and the snapshot is null when the total is 0.
- Revision and eventKey: `checkpointRegresses` compares only revision, pricing, counters and threads. `checkpointTurnContribution` (session-metadata-store.ts:314-400) uses accrued deltas and the cost delta. A duration-only change at the same revision gives zero models and zero cost, so it returns null and emits no ledger event. `eventKey` and the price-correction path are untouched.
- Failed and interrupted turns: a terminal failed or interrupted reaches `publishStats` through `drainInterruptedTurn` (lines 677-683) or the finally block (line 374), so their time counts.

## Failure modes

### 1. "Not priced" shown for unobserved or partially priced model rows (Serious)

- Trigger: `costUSD === null` is emitted for more causes than a missing rate.
  - provider-session-usage-ledger.ts:313-316: null when `unpricedTurns > 0`, even if `pricedTurns > 0` with a `knownCost`. It is also null when no turn was priced and none was unpriced.
  - codex-chat-turn-stream.ts:309: null when `!turnUsageObserved`.
  - stream-transformer.ts:932-934: null when the SDK reported results but no `costUSD`.
- Symptom: `formatModelCost` (session-stats-view.ts, new) maps every null to "Not priced". A model with 2 priced turns ($0.40 known) and 1 unpriced turn reads "Not priced" in the inspector (inspector-session-stats.component.ts:~330) and in session-model-breakdown.component.ts:~124. "—" or a labelled subtotal would be more accurate.
- Current handling: the Total cell is gated on the backend `costUnavailableReason === 'rate-missing'`, but the row cells are not gated on anything.
- Recommendation: add a per-row reason, or only say "Not priced" when the session reason is `rate-missing`. Otherwise fall back to "—" with a tooltip.

### 2. Breakdown Total drops the known subtotal (Moderate)

- Evidence: session-model-breakdown.component.ts:~160-170. `totalCost === null` renders `nullCostValue(stats)`, which is "Not priced" or "—". `knownCost` and `pricingCoverage: 'partial'` are ignored.
- Scenario: the Total reads "—" while the visible model rows add up to $38. The inspector header has `knownSubtotalOf`, but this component does not.
- Fix: reuse `knownSubtotalOf` and show "≥ $x" or "known subtotal".

### 3. Forward compatibility and rollback (Moderate)

- Evidence: codex-session-usage-owner.ts:73 and 56 (`.strict()` schema, `version: 2` unchanged).
- Scenario: a build without this change reads a checkpoint that has `duration`. `safeParse` fails, so `validCheckpoint` returns undefined. The session is marked "Invalid native usage checkpoint", sidebar cost becomes null, and history uses the legacy partial fallback (session-history-reader.service.ts:~419). `updateCodexUsageCheckpoint` also throws on `parse`, so the old build cannot persist new usage.
- Fix: accept this risk explicitly, or put `duration` outside the strict checkpoint object.

### 4. Time lost or inflated (Moderate)

- Evidence: codex-chat-turn-stream.ts:167, 205-210.
- Lost: `recordTurnDuration` runs only inside `publishStats`. A `startTurn` rejection, a cancel before a terminal when the drain branch does not apply, or a process exit mid-turn loses the time. Scenario: a long turn is aborted by the user, so Time stays "—" or understated.
- Inflated: `started` includes waits for approval prompts and the refused-interrupt drain wait. The Claude path sums run `durationMs` (session-stats-owner.service.ts:686-689), so the Time metric means different things per provider.

### 5. No duration regression guard (Moderate)

- Evidence: session-metadata-store.ts:255-277. The duration is never compared, so a replayed or stale checkpoint at the same or a higher revision can lower the persisted duration. Counters are guarded; duration is not.

### 6. Model-cell styling (Minor)

- session-model-breakdown.component.ts:~119. `usage.costUSD !== null` is true for `undefined`, so an undefined cost reads "Not priced" in `text-success` green. The inspector uses `=== null` for the muted class, while `formatModelCost` treats undefined as unpriced too. Use `== null` in both places.
- A truly zero cost renders "$0.0000" (formatCost, session-stats-format.ts:11-14), not "$0.00". The behaviour is not new, but the task wording says "$0.00".

## Blocking issues

None.

## Serious issues

Failure mode 1.

## Moderate and minor issues

Failure modes 2-6.

## Data flow

1. `startTurn` returns a receipt (OK).
2. Events arrive and `publishStats` is called, possibly several times (OK, idempotent via turnId and max).
3. `recordTurnDuration` runs and the checkpoint serializes with `duration` (OK).
4. `persistUsage` calls `updateCodexUsageCheckpoint`; `checkpointRegresses` ignores duration and the ledger event is null for a duration-only change (OK; gap: no guard).
5. The stats event spreads `lifetime`, which carries `durationMs` (shared type rpc-session.types.ts:499, OK).
6. The store maps it with `durationMsOf` (zero becomes null, OK). The agents row uses `card?.durationMs ?? null` (OK).
7. History restore: `owner.snapshot` carries `durationMs` (OK). The invalid-checkpoint fallback has duration 0, so Time is "—" (OK).

## Requirements fulfilment

| Requirement                                         | Status   | Gap                                                  |
| --------------------------------------------------- | -------- | ---------------------------------------------------- |
| Codex main-agent Time shown                         | COMPLETE | Aborted or errored turns before terminal not counted |
| Orchestrator row shows duration                     | COMPLETE | None                                                 |
| Unpriced model rows say "Not priced"                | PARTIAL  | Also applied to partial or unobserved rows (FM 1)    |
| Total uses `nullCostValue`, subtotal stays labelled | PARTIAL  | Breakdown component has no subtotal label (FM 2)     |
| No priced regression                                | COMPLETE | None found                                           |

## Edge cases

| Case                                   | Handled | How                      | Concern                      |
| -------------------------------------- | ------- | ------------------------ | ---------------------------- |
| Stats published twice for one turn     | YES     | Same turnId, max         | None                         |
| Legacy checkpoint without duration     | YES     | Optional field           | Time "—" until the next turn |
| NaN or negative elapsed                | YES     | Ignored                  | None                         |
| Duration overflow                      | YES     | Safe-integer guard       | Silent drop                  |
| Old build reads new checkpoint         | NO      | Strict schema rejects it | FM 3                         |
| Cancelled before terminal              | NO      | Not recorded             | FM 4                         |
| Row cost null with known partial price | NO      | Shown "Not priced"       | FM 1                         |

## Verdict

- Recommendation: REVISE
- Confidence: MEDIUM (static review only; no tests were run)
- Top risk: "Not priced" is now the label for every null per-model cost, including partially priced and unobserved rows.
- What a robust implementation would add: a per-row price reason or a session-reason gate for the row label, a subtotal label in the breakdown Total, duration recorded on every turn exit path, a duration monotonic guard, and a decision on checkpoint downgrade compatibility.

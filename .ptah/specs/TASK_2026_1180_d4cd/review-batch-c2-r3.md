# Code logic review - batch C2, round 3

Scope: uncommitted `git diff` (batch-c2-fix4-report.md) and commit 57dd07d2b
(batch-c2-fix3-report.md) on branch fix/lane-usage-readers-c2 (PR #1316).
Read-only review. No source edits.

## Verdict

PASS WITH COMMENTS. Score: 7/10.

The three PR findings are addressed in the production code. The removal cutoff,
the targeted clear and the new reason are correct for the cases that the task
names. No blocking logic defect was found. The main gap is spec quality: the
end-to-end top-up regression does not prove that the clear is persisted,
because real HTTP 402 evidence has no reset and the ledger never persists it.

Why 7 and not 8: one regression assertion passes for the wrong reason (F1),
and one correctness assumption (prepaid balance equals the Grok Build usage
balance) is not verified (F2). Why 7 and not 6: all production paths that I
traced behave as requested, and the focused specs pass.

## Checks run

- `npx jest --config libs/backend/auth-providers/jest.config.ts --runInBand --coverage=false --runTestsByPath plan-usage.service.spec.ts plan-limit-ledger.service.spec.ts readers/grok-account-plan-usage.reader.spec.ts`:
  PASS, 3 suites, 133 tests.
- Manual trace of `settle`, `recordWindowEvidence`, `removeProviderWindowEvidence`,
  `clearOwnerEvidenceByPattern`, `persist`, `serializeLedger`, `restoreLedger`,
  `laneLimitEvidence`, the Grok reader, and every `PlanLimitStatusReason` consumer.
- Not run: tsc and eslint (the fix4 report records PASS for them).

## Findings

### F1 - MEDIUM - End-to-end top-up regression does not prove persistence of the clear

- `libs/backend/auth-providers/src/lib/quota/plan-usage.service.spec.ts:707-714`
- `libs/backend/auth-providers/src/lib/quota/plan-limit-ledger.persistence.ts:72,153-157`
- `libs/backend/auth-providers/src/lib/quota/plan-limit-ledger.service.ts:640-644`

The spec records 402 evidence without `resetsAt`. This is the real shape:
`laneLimitEvidence` adds no reset for `grok-balance-exhausted`. `persistedOwner`
drops owner evidence without `resetsAt`, and `PersistedEvidenceSchema` requires
`resetsAt`. So the evidence is never in storage. Effects:

1. `storage.update` is called by `recordOwnerEvidence` (first write, payload
   `{version:1, owners:[]}`). The clear produces the same serialized payload, so
   `persist` returns early on `lastPersisted` and does not write. The assertion at
   line 713 passes because of the record, not because of the clear.
2. The reload assertion at line 714 passes also when the clear is removed,
   because unknown-reset evidence never survives a restart (F24 rule).

Functional impact: none today. The requirement "the clear must persist and
survive a reload" is true by construction, because 402 evidence is memory-only.
But the spec cannot detect a regression in the clear path. The ledger spec at
`plan-limit-ledger.service.spec.ts:1174` does prove persistence, but only with a
synthetic `resetsAt: T0 + HOUR` that the classifier never produces.

Suggested fix:
- In the service spec, record the 402 evidence with a `resetsAt` (to make it
  persist), assert that storage holds it before the read, then assert that the
  stored payload no longer contains it after the read. Or assert
  `storage.update` call count before and after the read.
- Add one line of comment that real 402 evidence is memory-only, so the reload
  case covers reset-bearing evidence only.

### F2 - MEDIUM (requirement risk) - Positive prepaid balance may not mean the 402 cause is gone

- `libs/backend/auth-providers/src/lib/quota/plan-usage.service.ts:456-459`

The clear runs on any Grok provider-api reading with `credits.hasCredits === true`.
The 402 text is "Grok Build usage balance exhausted". The reader reads
`config.prepaidBalance`. No evidence in the repository shows that these are the
same balance. If the 402 can occur while `prepaidBalance > 0` (for example a
separate product budget or a spend cap), each usage read clears the evidence,
the lane becomes eligible, the next spawn fails with 402 again, and the state
flaps at the read cadence.

Suggested fix: confirm the relation in the provider documentation or with a
captured response. If not confirmed, also require that the reading shows no
exhausted subscription window (`percent < 100` or `windows.length === 0` with
balance > 0), or rate-limit the release (for example keep the evidence when a
402 was observed less than one read interval after the previous release).

### F3 - LOW - Clear compares against response time, not request time

- `libs/backend/auth-providers/src/lib/quota/readers/grok-account-plan-usage.reader.ts:132,147`
- `libs/backend/auth-providers/src/lib/quota/plan-usage.service.ts:458`

`fetchedAt` is `now()` after the response body parses. A balance read sent
before a 402 but parsed after it has `fetchedAt > evidence.observedAt` and
clears the newer 402, although the server state predates the 402. The window is
one HTTP round trip (at most 5 s by the abort timeout). The same 402 would
reappear on the next spawn, so the impact is one wasted lane attempt.

Suggested fix: capture `const requestedAt = now()` before `fetcher(...)` and pass
it (for example as `reading.requestedAt`, or as the clear cutoff) to
`clearOwnerEvidenceByPattern`. Keep `fetchedAt` for display and windows.

### F4 - LOW - Removal cutoff map is never pruned

- `libs/backend/auth-providers/src/lib/quota/plan-limit-ledger.service.ts:169-172,250-258`

`providerWindowRemovalCutoffs` gets one entry per owner key and window key and
is not cleared when an owner is pruned or deleted. Only Grok calls
`removeProviderWindowEvidence`, with one key (`other:subscription`), so growth is
one number per Grok owner seen in the process lifetime. This is bounded in
practice and not a leak risk today. It is not persisted, which is correct: a
late in-flight read cannot survive a restart.

Suggested fix (optional): delete the owner entry when a cutoff is older than the
longest window length, or cap the map like `PLAN_USAGE_MAX_OWNERS`.

### F5 - LOW - Cutoff test uses `window.observedAt`, supersedes uses the stamp

- `libs/backend/auth-providers/src/lib/quota/plan-limit-ledger.service.ts:213-222`

The guard compares `window.observedAt <= cutoff`, but `windowStamp` uses
`max(window.observedAt, exhaustion.observedAt)`. A provider-api window with an
old `observedAt` and a newer provider-api exhaustion is rejected, although its
stamp is newer than the cutoff. The Grok reader sets both to the same value, so
this case does not occur today.

Suggested fix: use `windowStamp(next).observedAt <= cutoff` for consistency
with `removeProviderWindowEvidence:266`.

### F6 - LOW - Empty-window Grok snapshots now show a source without an age

- `libs/backend/auth-providers/src/lib/quota/readers/grok-account-plan-usage.reader.ts:192`
- `libs/backend/auth-providers/src/lib/quota/plan-usage.service.ts:403-412`
- `libs/frontend/dashboard/src/lib/components/provider-account-card/plan-tile-view.model.ts:55-56`

`source: 'provider-api'` is now set on every available Grok reading. For readings
with windows, the label was already `provider-api` (`READER_SOURCE_LABELS.grok`),
so there is no change. For empty-window readings, `fetchReading` does not add
`readAt` (the condition needs `windows.length > 0`), so the snapshot now has
`source` but no `readAt`. The dashboard then shows "provider API" with no age.
Before, it showed no source text. Cache, stale and `providerOwnerClear` are not
affected: the Grok reader never sets `providerOwnerClear`, and the stale path
re-uses the cached reading as before.

Suggested fix: either accept and note it, or add `readAt` for available
readings with an established empty window set, so the chip shows the age.

### F7 - INFO - Downgrade compatibility of the persisted `pattern` field

- `libs/backend/auth-providers/src/lib/quota/plan-limit-ledger.persistence.ts:67-74`

Old payloads parse (the field is optional) and the field round-trips through
`definedFields`. Other providers are not affected: the classifier adds `pattern`
only for `grok-balance-exhausted`. An older build reads with `z.strictObject`,
so a stored owner with a `pattern` would be dropped as a whole. Today no
persisted evidence carries a pattern, because 402 evidence has no reset (F1).
No action is needed now. Record this if a reset-bearing patterned evidence is
added later.

## Answers to the requested checks

1. Persisted shape: correct. Optional field, old payloads parse, round-trip
   preserved, no change for other providers (F7 for downgrade).
2. Targeted clear: strict `<` ordering on `observedAt` (equal stamps are kept),
   newer 402 kept, other patterns and other owners untouched, a rate limit with
   reset has no pattern and is untouched, one `changed()` call per clear. Note
   that one evidence slot per scope means a newer 402 replaces an older
   `grok-free-usage` evidence (existing design), so a release can drop both
   causes at once. Risks F2 and F3.
3. Cutoff map: bounded (F4). Non-provider and error-derived windows bypass the
   guard (stamp source is the exhaustion source), and stale re-records of an
   older cached window are correctly rejected. Equal timestamps are rejected,
   but within one reading removal and windows are mutually exclusive, and both
   values come from the same local clock, so no legitimate newer window is
   rejected in practice. F5 is the only inconsistency.
4. Reader source change: no side effect on assemble except F6. No effect on
   cache, stale or `providerOwnerClear`.
5. New reason: handled in the exhaustive dashboard map
   (`plan-tile-view.model.ts:128`), the exhaustive `FAILURE_RANK`
   (`usage-source-chain.ts:18`) and the service removal condition
   (`plan-usage.service.ts:469`). The MCP formatter map is `Partial` and only
   reads `service-unavailable` snapshots, and the reason only occurs on
   `available` readings, so no change is needed. No other consumer was found
   in `apps/` or the chat-ui library.
6. Spec quality: the end-to-end regression exercises the service and an
   in-memory storage, but it does not prove persistence of the clear (F1).

## Decisions

- Decision: rate F1 as MEDIUM, not HIGH. Options: HIGH (missing requirement) or
  MEDIUM (spec gap). Evidence: the ledger header rule (P6) and
  `persistedOwner` make unknown-reset evidence memory-only, so the production
  behavior meets the requirement. Reversible: yes.

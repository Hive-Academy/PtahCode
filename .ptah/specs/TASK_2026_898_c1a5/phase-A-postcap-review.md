# Phase A post-cap review: commit beaa59b07

Verdict: APPROVED

Static review only. No builds or tests were run. I read the full diff of `session-handoff-ack.store.ts`, its spec and `session-handoff.service.ts`. No Blocking or Serious findings. The Moderate and Minor items below can be deferred under decision 17.

## Answers

1. **N5 fixed?** Yes for the reported scenario (see findings 1-5 for the edge cases).
   - A partly invalid document keeps its invalid entries. `readState` splits the entries and `write` appends `state.invalid` after the pruned valid records.
   - Pruning only touches valid records, so invalid entries are never pruned away. This also means they can grow without bound (finding 4).
   - A whole-document-invalid read is quarantined, and the quarantine is written before the main key. If the quarantine write throws, the main key is untouched and nothing is lost.
   - Serialization is intact. `record` and `compareAndSet` both read and write inside `serialized()`.
2. **N3 fixed?** Yes.
   - `session-handoff.service.ts:222` now runs before `ackAttempts.get` at line 225.
   - The check inside `acknowledgeRecord` at line 241 still runs. It is now redundant but harmless, and it guards the race where `successorSdkId` changes in flight.
3. **Regressions.** None blocking. See the Minor findings.
4. **Spec.** It covers partial-invalid retention plus a CAS write, and whole-document quarantine. It does not cover the edge cases below, and there is no N3 spec (finding 5).

## Findings

1. **Moderate** `session-handoff-ack.store.ts:76-78`, `write()`. A later whole-invalid document overwrites an earlier quarantine at the same `HANDOFF_ACK_QUARANTINE_KEY`.
   - Scenario: doc A is invalid, so Q = A. Doc B later becomes invalid (for example after a version downgrade or upgrade), so Q = B and A is lost.
   - The doc comment says "copied once", but nothing enforces that.
   - Fix: append to a quarantine array, or key it by timestamp, or skip the copy if the quarantine key already holds a value (keep the oldest).
2. **Minor** `session-handoff-ack.store.ts:106`, `record()`. The duplicate check looks only at `state.records`.
   - Scenario: an invalid entry carries `predecessorTabId: 'x'`, for example a bad `state` value. `record()` for 'x' succeeds, so the document holds two entries for 'x'. If a later schema change makes the old entry valid, `findIndex` and CAS pick the first one, which is ambiguous.
   - Fix: also reject, or log, when an invalid entry has an object `predecessorTabId` equal to the new value.
3. **Minor** `session-handoff-ack.store.ts:63-67`. The error log fires on every read (`findByPredecessor`, CAS, `record`) while invalid entries persist, so it is noisy.
   - Fix: log once per store instance.
4. **Minor** `session-handoff-ack.store.ts:81`. `state.invalid` entries are never pruned or capped, so a persistent bad entry grows the document forever. This is a trade-off against data loss. Add a cap or a sweep later if needed.
5. **Minor (spec gap)** `session-handoff-ack.store.spec.ts:29-48` and the service specs. No test covers:
   - invalid entries plus pruning above 200 completed records;
   - a second quarantine overwrite;
   - the duplicate id hidden in an invalid entry;
   - the N3 behaviour (a stranger calling while an attempt is in flight must get `refused`, not the in-flight result). No spec in `session-children` contains 'caller is not'.
   - Fix: add a spec for N3 and one for pruning with invalid entries.
6. **Minor** `session-handoff-ack.store.ts:29`. `AckDocumentState.quarantine?: unknown` uses `undefined` as "none". A persisted `undefined` document is already handled by the `raw === undefined` early return, so this is OK. No action.

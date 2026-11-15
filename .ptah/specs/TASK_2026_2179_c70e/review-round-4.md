# Code Logic Review — TASK_2026_2179_c70e, round 4

**Verdict: CHANGES_REQUESTED. Score: 5/10.** The three round 3 cases are fixed for readable documents and the guarded acknowledgement path. Two confirmed replacement cases remain. This is below the sound 7–8 band because either case can make the wrong successor authoritative; it is above the 3–4 band because the primary acknowledgement race is guarded and the scoped checks pass.

## Round 3 findings

1. **FIXED — old acknowledgement transitions a replacement.** `session-handoff-ack.store.ts:374-394` checks the expected successor before mutation and returns `superseded`; `session-handoff.service.ts:392-407` passes the validated successor and refuses that result before the closer at `:408-448`. The replacement-during-ack test is at `session-handoff.service.spec.ts:301-335`.
2. **FIXED for readable documents — equal timestamps select stale records.** `session-handoff-ack.store.ts:294-303` computes the next generation from records in candidate documents; `session-handoff-ack.storage-candidates.ts:67-75` compares generations before pinned status. The failed-cleanup test at `session-handoff-ack.store.spec.ts:147-201` verifies that generation 8 beats generation 7. The unreadable-document gap is a new finding below.
3. **FIXED — successor lookup exposes a superseded record.** `session-handoff-ack.store.ts:220-240` resolves each matching predecessor to its authoritative record before returning the successor. Binding updates at `session-handoff.service.ts:688-695, 776-783, 1184-1190` pass the successor ID to `compareAndSet`. The failed-cleanup test checks old and new lookups at `session-handoff-ack.store.spec.ts:175-180`.

## New findings

### Major — settlement can change another successor's `starting` record

The normal settlement at `session-handoff.service.ts:750-757` and late settlement at `:1257-1265` call `compareAndSet` without the new expected-successor argument. If a `starting` record for successor A is replaced by a `starting` record for successor B before A settles, A's call sees the expected state and changes B's record to `recorded`, potentially setting A's SDK ID on it. `session-handoff-ack.store.ts:351-369` guards identity only when the optional argument is supplied, and `record()` permits replacing a `starting` record at `:280-289, 309-317`. Pass `tabId` / `record.successorTabId` in both settlements. The caller's `false` branch already handles a changed record (`service.ts:758-759, 1266-1269`).

### Major — temporary candidate read failure can create a generation tie

Suppose document A contains predecessor P at generation 1 and becomes temporarily unreadable. `readCandidates()` logs and skips A (`session-handoff-ack.store.ts:179-192`). A new handoff for P in document B sees neither A as `previous` (`:280-289`) nor its generation (`:294-303`), writes B at generation 1, and skips cleanup because `previous` is absent (`:322`). When A becomes readable again, both records are pinned with generation 1; `compareAckMatches` ties (`session-handoff-ack.storage-candidates.ts:67-75`), so candidate order selects old A (`store.ts:155-166`). `findByPredecessor` then refuses B's successor in the acknowledgement path (`session-handoff.service.ts:281-328`). This is a consequence of using a partial read to assign an authoritative generation, separate from the accepted choice to skip a failed candidate for ordinary lookup. A replacement write must fail or use a durable ordering source when any candidate read fails; otherwise it cannot guarantee that its generation exceeds the hidden record.

## Five logic questions

1. **How does it fail silently?** Candidate read errors are logged and skipped (`store.ts:179-192`), yet `record()` can return success after writing a tied generation (`:294-322`).
2. **What user action produces unexpected behaviour?** A handoff settlement after a replacement of its provisional record can publish the wrong successor (`service.ts:750-757, 1257-1265`).
3. **What input produces a wrong answer?** Two pinned documents for one predecessor with equal generation select the first document, even if the second contains the replacement (`storage-candidates.ts:67-75`, `store.ts:155-166`).
4. **What happens when a dependency fails?** A temporarily unreadable delegate is omitted from the generation maximum, allowing the tie when it recovers (`store.ts:179-192, 294-303`). Cleanup write failure with readable documents remains covered by `store.spec.ts:147-201`.
5. **What requirement is missing?** Replacement needs a complete ordering read or a durable ordering mechanism, and every mutation of a provisional record needs successor identity (`store.ts:294-303, 351-369`).

## Other checks

- The optional `generation` field is accepted by the strict record schema (`store.ts:18-32`); legacy records without it compare as generation 0 (`storage-candidates.ts:72-74`).
- The acknowledgement `superseded` branch returns before predecessor closing (`service.ts:393-408`), and the matching test asserts no close (`session-handoff.service.spec.ts:301-335`).
- The `closePending` to `closeCompleted` call at `service.ts:443-447` lacks the successor argument, but `record()` does not replace `closePending` records (`store.ts:284-289, 309-317`); it is not a confirmed replacement race.
- Reviewed committed `git diff main...HEAD` and working-tree `git diff` for `libs/backend/cli-agent-runtime`, the store and service files and their specs, round 3 review, and round 3 implementation notes.

## Verification

- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.store.spec.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.service.spec.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.spec.ts` — passed, 3 suites, 104 tests.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json` — passed, exit 0.
- `ptah_get_diagnostics` for the store and service — unavailable after 45 seconds; the scoped `tsc` check above passed.
- An initial Jest invocation named the nonexistent `session-handoff-ack.storage-candidates.spec.ts`; that invocation failed on ENOENT while its other 2 suites passed. The corrected three-suite command above passed.

## Decisions

- Treat temporary candidate read failure during generation assignment as a correctness failure rather than an accepted lookup degradation. Evidence: the later tie selects the old successor and can block the handoff. Reversible: yes, by rejecting the write when candidate coverage is incomplete.

# Code logic re-review 3 — TASK_2026_2286_b442

Review family: codex (implementer family: claude)

Score: 7/10

Verdict: REVISE

The canceled flight no longer accepts new waiters, and synchronous admission removes the indefinite hook wait. A retry can still transfer its expired deadline into a five-minute backoff for the same key. The lifecycle gaps prevent approval. The tested retry, admission, and concurrency paths support a score above the 5–6 band, with the deadline handoff and owner cancellation still unresolved.

Source citations are relative to `libs/backend/auth-providers/src/lib/quota/readers/`.

| Previous finding | Status | Evidence |
| --- | --- | --- |
| Major: an immediate retry can join an aborted flight and inherit `cli-unavailable` | FIXED | `fallback-usage.runner.ts:105–116,152–159,183–200`. The retry waits without attaching to the old flight's result. The old flight releases its slot before the retry rechecks the cache and flight map. `fallback-usage.runner.spec.ts:360–380` covers a live retry during cleanup. The handoff introduces the separate boundary defect below. |
| Minor: async admission can hold a slot indefinitely or cache after owner abort | PARTIAL | `fallback-usage.runner.ts:53,128–157` requires a synchronous boolean and never awaits admission. `fallback-usage.runner.spec.ts:348–357` covers rejection of a promise-valued return and subsequent slot reuse. Owner abort can still lose to a selected success. If output parses successfully and `handle.closed` is pending, the owner's `runSignal` can fire during close grace. `fallback-usage.runner.ts:252–256,271–273,299–308` has already selected success and removed the execution abort listener. Admission and the success cache at lines 129–150 have no owner-abort guard. A later same-key request with a fresh signal can receive that cached success. This is a residual owner-cancellation gap. |

## New defects

1. **Major — A retry whose deadline expires during the closing-flight handoff can back off a healthy CLI.** `fallback-usage.runner.ts:105–129,144–150,183–206`. A's last waiter cancels, so A is closing and will leave no failure backoff. B starts waiting before its deadline. If the cleanup completion callback settles A at or just after B's deadline before B's timer callback runs, the promise reaction clears B's timer. B resumes without checking the clock, reserves the slot, and immediately gets `cli-timeout` from `execute` without spawning. That synthetic timeout is cached, so C's valid same-key refresh receives `cli-backoff` for five minutes (`fallback-usage.constants.ts:5`). This can surface in the Antigravity source chain (`antigravity-cli-usage.adapter.ts:162–171`, `antigravity-plan-usage.reader.ts:56–60,159–167`). Recheck the retry's deadline before it can read shared state or reserve a slot. Also retain the caller's deadline when it joins a replacement flight. If two retries wake together and the longer-budget caller creates the replacement, the shorter-budget caller currently loses its timer at the handoff and can receive success after its own deadline (`fallback-usage.runner.ts:158–175,187–199`).
2. **Minor — Owner cancellation can be missed between closure notification and retry resumption.** `fallback-usage.runner.ts:101,114–129,187–199,239–246`. Once the old flight settles, `finish` removes the retry's owner listener and schedules the suspended retry to resume. If an already-queued microtask aborts the retry's `runSignal` before it resumes, the replacement registers on an already-aborted signal. Abort events are not replayed, and `execute` sees the new controller's un-aborted signal. A replacement can therefore run and cache a result after the retry's owner has disposed. Revalidate both signals after the wait. The Antigravity adapter passes only a caller signal, which the runner checks at waiter attachment, so the missed owner link concerns the runner's `runSignal` API.

## Concurrency and cancellation

- Two healthy same-key retries that wake together share one replacement flight. The first continuation installs the map entry without yielding to the second, which sees the entry and joins it (`fallback-usage.runner.ts:105–129,152–163`). The slot counts track flights. Process-scope cleanup has a tree-kill timeout and a close grace period, so the slot can be released before actual OS close if termination has failed (`fallback-usage.runner.ts:74–90,294–309`). This limit pre-dates the correction.
- The closing wait clears its timer and detaches both abort listeners when a signal, timer, or flight settlement wins. Its attached promise reaction remains until the old flight settles (`fallback-usage.runner.ts:183–200`). Ordinary execution completion and rejection release both counters in the flight's `finally` (`fallback-usage.runner.ts:141–157`). The existing pre-spawn cleanup path can still hold the slot indefinitely if temporary-directory removal never settles (`fallback-usage.runner.ts:232–240,312–318`). The Antigravity adapter supplies a caller deadline, which can release the waiting caller even while that older slot remains occupied.

## Decisions

I classify owner-abort backoff as preserved runner behavior. Suppressing disposal-driven backoff would be a reversible policy change. When explicit owner disposal wins the execution race and produces `cli-unavailable`, the same-key retry now gets the existing failure backoff immediately after cleanup (`fallback-usage.runner.ts:107–114,141–150,242–269`). Five minutes is visible to a caller that reuses that key with a fresh owner signal, but the backoff itself was already present on `origin/main` and is explicit in the correction report. The production adapter forwards `signal` only (`antigravity-cli-usage.adapter.ts:162–167`), so a failure caused by its last waiter leaving does not take this path.

## Five logic questions

1. **Silent failure.** A success selected before owner disposal can enter the cache after disposal, as shown in the second table row.
2. **Unexpected user action.** An immediate refresh around the closing-flight deadline can delay subsequent refreshes for five minutes without attempting the CLI. See finding 1.
3. **Wrong input outcome.** Same-key retries may carry different deadlines. The retry with the shorter deadline can receive the replacement's success after its own budget expires. See finding 1.
4. **Dependency failure.** Tree kill and child close have bounded waits. A stalled pre-spawn directory removal can retain the slot. A synchronous admission throw fails closed as `cli-account-mismatch` (`fallback-usage.runner.ts:129–141`).
5. **Missing requirement.** The handoff needs to specify what happens when cleanup completion, timeout, and cancellation become ready together, including which caller budget applies after a retry joins a replacement.

## Checks

- Reviewed committed head `dd9fc00ef`, the four scoped files, the prior findings, the correction report, and the reader entry point. The scoped Git diff check passed. Ptah file and symbol searches returned zero hits for hidden task files and runner references respectively, so I used `rg` for those lookups after the Ptah calls.
- The authorized Jest command passed both suites and all 42 tests. The suites cover ordinary retry, cancellation, timeout, and admission. The new interleavings and owner-cache gap above were traced from the source.
- The scoped TypeScript command exited 2 with TS2339 at `libs/backend/agent-sdk/src/lib/helpers/sdk-query-runner.service.ts:289`. The installed `Options` type lacks `mcpServersDelivery`. That file has no branch diff against `origin/main`. The command reported no diagnostic in the reviewed files.

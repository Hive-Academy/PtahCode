# Code Logic Re-review 2 — TASK_2026_2286_b442

Review family: codex (implementer family: claude)

Score: 7/10

Verdict: REVISE

The four reported failure scenarios are fixed. The shared runner can still attach a live request to a canceled flight, and its new asynchronous admission hook can retain a concurrency slot past the deadline.

## Findings from the prior review

Source citations in this report are relative to `libs/backend/auth-providers/src/lib/quota/readers/` unless otherwise stated.

| Item | Status | Evidence |
| --- | --- | --- |
| 2. Wrong-account cache after cancellation | FIXED | `antigravity-plan-usage.reader.ts:137–151` passes a fresh store fingerprint callback and retains its check before publication. `antigravity-cli-usage.adapter.ts:154–167` validates ownership inside the flight and maps rejection to account mismatch. `fallback-usage.runner.ts:121–141` runs admission before caching even if the waiter has left. `antigravity-cli-usage.adapter.spec.ts:176–193` covers a switch, cancellation, then switching back after the rejected flight. The comparison observes the store at two points, so a switch away and back entirely between them remains indistinguishable from a stable account. |
| 3. CLI exit shows an OAuth reason | FIXED | `antigravity-plan-usage.reader.ts:57–59,162–167` promotes `cli-exit-error` over absent direct sources and preserves substantive direct-source and account failures. `antigravity-plan-usage.reader.spec.ts:134–144` asserts both precedence and the returned CLI exit reason. |
| 6. Last waiter leaves the process running | FIXED | `fallback-usage.runner.ts:154–166,206–214,261–275` aborts shared execution when the last waiter leaves, blocks a pending launch, and tears down an active process. `fallback-usage.runner.spec.ts:284–317` covers cancellation before launch and keeping the process alive when a second waiter stays. A new waiter arriving after the last waiter left is a separate race below. |
| New defect from prior review. Model-turn latch depended on waiter delivery | FIXED | `antigravity-cli-usage.adapter.ts:140–163` latches the executable during admission, which `fallback-usage.runner.ts:121–131` runs on parsed replies independently of waiter delivery. `antigravity-cli-usage.adapter.spec.ts:149–162` covers a parsed turn and cancellation in the same tick, followed by a different owner’s read. The accepted first-launch risk is unchanged. The latch requires a reply that supplies a turn count. |

## New defects

1. **Major — An immediate retry can join a canceled flight.**  
   `fallback-usage.runner.ts:108–113,143–166`. When A is the last waiter and aborts, its caller returns immediately. The aborted flight stays in the map until the process or temporary-directory cleanup finishes. If B requests the same key during that interval, B increments the waiter count on the old flight. The controller is already aborted and B inherits `cli-unavailable` from A’s canceled run even though the CLI is healthy. This also affects callers that omit `admit`. Treat aborted flights as closed to new waiters. Keep the concurrency slot until cleanup ends, then recheck the cache and start or join a live flight within B’s own signal and deadline. Cover a retry before cleanup resolves.

2. **Minor — Asynchronous admission can hold the shared slot indefinitely.**  
   `fallback-usage.runner.ts:52,121–148,238–240`. The process timer and abort listener are cleared inside `execute`, then the flight awaits `admit` before releasing its slot. If an allowed asynchronous hook never settles, a caller without a signal waits indefinitely and the source stays busy even after all signaled waiters leave. If the hook resolves true after an explicit owner abort, the success can still be cached at lines 135–141. The current production hook is synchronous. Narrow admission to a synchronous boolean, or bound asynchronous admission by the flight’s deadline and cancellation and suppress cache writes if owner disposal wins.

## Shared runner checks

- A waiter that joins before the last departure keeps the flight alive. Each abort listener is removed on abort or delivery, so aborting after delivery cannot decrement the count or affect a replacement flight. `fallback-usage.runner.ts:149–166`.
- A failed flight abandoned by its waiters leaves no backoff. A completed result can still be cached if admission succeeds. A false result or a thrown admission check fails closed as `cli-account-mismatch` and does not create a backoff entry. The original failure TTLs still apply to ordinary failures and to owner-signal aborts that produce `cli-unavailable`. `fallback-usage.runner.ts:120–142`.
- Antigravity is the only production caller found. The runner’s no-hook paths retain coalescing for active flights, cache TTLs, and owner-driven process cleanup. Last-waiter cancellation also applies to those callers, and the late-join race applies regardless of hook use. Reviewed `fallback-usage.runner.spec.ts:141–161` and `../plan-usage.service.spec.ts:1402–1422`.
- The Ptah symbol search returned zero hits, so I used `rg` to enumerate callers. Reviewed the scoped diffs against `main`, both untracked adapter files, and the fix report. `git diff main --check` passed. Tests, typechecks and CLI execution were outside scope.

## Five logic questions

1. **Silent failure:** A healthy retry can inherit an earlier request’s cancellation. See new defect 1.
2. **Unexpected action:** An immediate retry during cleanup can fail even though a retry after cleanup succeeds. See new defect 1.
3. **Wrong input outcome:** A nonzero CLI exit now surfaces the CLI reason. A changed fingerprint at admission rejects the parsed windows. See rows 2 and 3.
4. **Dependency failure:** An admission throw fails closed. A promise that never settles can outlive the shared deadline. See new defect 2.
5. **Remaining lifecycle requirement:** An aborted flight needs a terminal state for joining callers, and all phases that hold a concurrency slot need bounds. See new defects 1 and 2.

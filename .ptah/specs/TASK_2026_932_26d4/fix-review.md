# Fix-round review (M1, M2, M3, m1, m4, m5) - TASK_2026_932

Verdict: APPROVED (no blocking or serious findings; 2 minor notes). Read-only; no tests were run.

Scope: session-spawner.service.ts, session-spawner.port.ts, session-tool-handlers.ts,
session-child-outcome.ts, chat-session.service.ts and the five named spec files.

## M1 - held completion (OK)
- session-spawner.service.ts:1146-1152 skips a terminal child with `heldCompletion` as
  `held-completion`, after the `live` check, so the record survives until delivery.
- session-tool-handlers.ts:812 takes held completions AFTER the tool body ran, so the first
  clear call skips the child and delivers its envelope; the second call clears it.
  CLEAR_SKIP_WORDS (529-536) is a `Record<SessionChildClearSkipReason, string>`, so a missing
  word for the new reason is a compile error. Reply wording matches behaviour.
- Test service.spec.ts:2307-2319 fails without the fix (the child would be cleared first).
  If takeHeld throws (handler:780-785), the child stays held and is retried; acceptable.

## M2 - succession (OK)
- clearFinished:1135-1138 treats `runtimes.has || retiring.has` as live. In succeedChild the
  predecessor runtime is deleted only by releaseResources, which runs after a successful
  start (2310-2320). `retiring` is added at 2313 and removed at 2357. The failure path (2333)
  deletes only the successor runtime and revertSuccession restores the predecessor, whose
  runtime was never removed. So both sets are populated for the whole in-flight window.
- Ordinary ended children: stop (1073-1074), settle (1443), 1518 and 2103 all call
  releaseResources, so their runtime is gone and they stay clearable.
- Succession spec asserts the predecessor is already `handed-off` while the host start is
  pending (registry marks it before the start), then that clear skips it as `live` and the
  revert restores it. It fails without the runtimes/retiring guard.

## M3 - pending-start join (OK)
- start():316 routes an existing-child hit (no reservation) to joinPendingStart (473-480).
  pendingStarts.set (459) happens synchronously after addPending and the call to
  routeAndStart, so no interleaving gap; delete + removePending sit in a `finally` (462-465).
  No slot reservation is taken by the joiner, so nothing is leaked; the first caller's
  `finally` (321) releases its own.
- Rejection: if the first run rejects, the joiner's `await run` rethrows the same error, the
  same as the first caller sees; no unhandled rejection because the first caller awaits it too.
  No deadlock: the joiner never holds the reservation or a lock.
- After the run settles but before the `finally` microtask, a third call still finds the
  map entry and gets the resolved result; harmless.
- Success returns `{...settled, alreadyExists: true}`, so session-namespace.builder emits no
  second `created` worktree event; the original caller (alreadyExists undefined) emits it.
- Tests start-guard.spec.ts:276-318 cover the join and the later failure; both fail without
  the fix (the old path returned the starting snapshot immediately).

## m1 (OK)
- session-child-outcome.ts:91-106: host-shutdown and workspace-close map to `interrupted`
  before the status passthrough. dispose() records status `stopped` with cause host-shutdown
  (service:1228-1234), which previously read as `stopped`. Spec added.

## m4 (OK)
- chat-session.service.ts: error text now says what is missing and what to do; the code
  is unchanged. Text-only; no consumer matches on the old string (spec at
  chat-session.account-binding.spec.ts updated).

## m5 (OK)
- stop():1003-1013 returns `{ok:false, reason:'starting'}` for an owned pending id before
  resolveOwned. Port union extended (port.ts:284-301).
- Consumers: session-tool-handlers.ts sessionStopReply (479-496) narrows `handed-off` and
  sends every other refusal through lookupRefusal (generic reason + detail), so `starting`
  renders as plain text; session-namespace.builder.ts:79 re-exports the type unchanged.
  No other src consumer of the stop result found in libs/apps. Test start-guard.spec.ts:244.

## Minor notes (not blocking)
1. service.ts:473-480: a joiner with different options (model, effort, prompt) silently
   receives the first start's child. Same as the pre-existing existing-child semantics;
   mention in the tool doc if desired. Smallest fix: none required.
2. A failed first start returns its refusal (including any rollback table) to the joiner too;
   the joiner's reply reads as a fault of its own call. Acceptable; correct and informative.

## New defects introduced
None found. The `live` skip is now broader, but it is bounded: runtime and retiring
entries are removed on every end path checked above, and retiring clears on a 60 s timer.

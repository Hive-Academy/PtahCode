# Independent review of head 8ba4199a5

Reviewed commit: 8ba4199a510dd85fc2756869042ea2aeaf0c73df

Fix commits: 9e192a5e3, d455fdd14, 4dd63f219, 8ba4199a5

Verdict: APPROVED

## Findings

None.

## Round 4

1. **Major from Round 3 — resolved.** `libs/frontend/chat/src/lib/services/git-window/git-window-sync.service.ts:251-264,267-283`: `desiredScope()` returns `UNAVAILABLE_SCOPE` for a rejected parse. The retry callback invokes `publishDesired()` after the delay, so a failed unavailable publication is retried without another signal change. The new test at `git-window-sync.service.spec.ts:221-237` covers failure followed by a successful retry. The six-attempt cap remains; after exhaustion, Focus forces another publication.
2. **Minor from Round 3 — resolved.** `git-window-sync.service.ts:133-142,258-264`: Focus forces publication of the desired scope and retains `SCOPE_UNAVAILABLE` when the parse remains rejected. The test at `git-window-sync.service.spec.ts:239-252` covers Focus in this state.
3. **Ordering and lifecycle:** `git-window-sync.service.ts:107-113,214-234,258-283`: `pending` serializes publications. If a valid scope arrives while an unavailable retry is queued or in flight, the effect queues the valid scope after it; a retry timer firing later reads the current valid scope. Successful publication updates `lastPublished` and cancels the retry; failures retain the bounded retry count for the failed key. The retry checks detached state before entering the queue and again in `publish`; close and destroy cancel its timer. A stale unavailable completion does not restore the unavailable error after the parse becomes valid because `publishDesired` checks the current desired scope after awaiting publication. No new Blocker or Major defect was found in these paths.
4. **Initial detach:** `git-window-sync.service.ts:144-157`: The first detach still requires a valid parsed scope before opening and publishing; a failed first publication closes the child. The change affects the already detached Focus and retry paths, not that guard.
5. **Code rules and verification:** The delta adds no `any`, `@ts-ignore`, `as unknown as X`, or silent catch. `GitWindowScopeSchema.safeParse` remains the outgoing scope boundary at `git-window-sync.service.ts:88-99` and the acknowledgement boundary at `:221-224`; push messages are parsed at `:175-192`. The author reports `npm run verify -- -p chat` passed with 355 suites, 6324 tests, and zero lint/typecheck errors. I did not rerun tests for this read-only review.

## Round 3

1. **Major — failed unavailable-scope publication was never retried; resolved in Round 4.** Previously, `scopeRejected` sent `UNAVAILABLE_SCOPE`, but the retry timer read `this.scope()`, which was null during rejection. The Electron host could retain its previous repository after one failed publication. Commit 8ba4199a5 makes the timer publish the current desired scope.
2. **Minor — Focus cleared the rejected-scope error; resolved in Round 4.** Previously, Focus skipped publication when `this.scope()` was null and unconditionally cleared `_error`. Commit 8ba4199a5 sends the unavailable scope and keeps `SCOPE_UNAVAILABLE` while rejected.
3. **Bound and ordering:** `boundedOpenSessions` keeps at most 100; stable sorting retains source order within the active/pinned, same-root, and other groups. Active and pinned share rank zero, so their relative order follows the source list. A pinned tab absent from `open` remains in `pinnedTabId` and can use the child's retained pin state; the function cannot add a missing candidate. The 101st and later same-root entries lose inclusion when the first 100 fill the bound. Root comparison uses exact strings, so Windows case or separator variants can lower a session's rank and lead to omission when crowded; active and pinned IDs still rank first. This is a coverage limit, not a separate Major defect.
4. **Rejection and recovery:** The constructor effect handles rejection only while detached and when the parsed scope changes; `untracked` prevents logging and publishing from adding dependencies. A successful unavailable publication is deduplicated by `lastPublished`. The log includes only Zod issue paths and codes, not values or user paths. A later valid scope publishes and clears the error on success.
5. **Host and child:** `apps/ptah-electron/src/windows/git-window.ts:173-189` accepts and forwards the schema-valid unavailable scope. In `git-window-scope-guard.ts:208-220`, null roots provide no scoped read/write or lease authority. `git-dock-scope.store.ts:316-325,557-565` treats `unresolved: true` as unresolved and blocks Git actions. These outcomes require the unavailable publication to reach the host.
6. **Dropped sessions:** The guard's `git:watchRoots` lease roots and `filterPush` status/worktree matching use the bounded `open` plus `active` (`git-window-scope-guard.ts:151-193,213-220`). Omitted sessions lose leases and push forwarding; they gain no extra authority. That is an acceptable 100-session coverage limit, though it can reduce updates for the 101st same-root session.
7. **Round 3 verification:** The delta then added no `any`, `@ts-ignore`, `as unknown as X`, or silent catch. Reported chat verification passed (355 suites, 6322 tests, lint and typecheck); it was not rerun in that round.

## Round 2

The review of d455fdd14 was **APPROVED**. The host guard strictly parses `gitWindow:setMode` and accepts `pinned` only for the acknowledged active tab, and `follow-session` only with a null tab ID. The settings restriction still allows only `diff.renderSideBySide` and `editorLauncher.lastTarget` with specified value types. The Electron window and IPC delta had no other Blocker or Major finding. Reported Electron verification passed (113 suites, 1931 tests, lint and typecheck); it was not rerun here.

## Round 1

The review of b3da01f39 was **CHANGES_REQUIRED** because `gitWindow:setMode` accepted any open tab ID and could switch the child to another repository. Commit d455fdd14 addressed that finding. The 9e192a5e3 settings restriction was complete; other permitted non-Git methods were scoped or harmless, and the reviewed Electron window and IPC merge introduced no additional finding.

Read-only source review. Skill discovery found no invocable code-review skill in this lane.

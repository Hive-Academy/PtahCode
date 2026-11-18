# Automatic hand-off single-send fix

Worktree: `D:\projects\ptah-extension\.claude-worktrees\handoff-single-send`; branch: `fix/handoff-single-send`. No commit, push, PR, main-checkout edits, install, Nx command, build, serve, or e2e run.

## Confirmed root cause

In the original coordinator, `libs/frontend/chat/src/lib/services/session-auto-handoff-coordinator.service.ts:532` accepted `absent` plus a currently non-streaming tab as proof of a completed delivered turn. Line 538 released the claim for resend. Direct submission scheduled immediate reconciliation at line 371; queued settlement did the same at line 396. Neither path required observing a turn start. The new direct and queued regressions both reproduced **five sends instead of one** before the fix.

Dispatch corroboration: `libs/frontend/chat/src/lib/services/chat-store/message-dispatch.service.ts:72` returns submission/queue acceptance, not turn completion. Its busy predicate separately considers pending starts and queue/lock state, and queued acceptance returns before the RPC. `libs/frontend/chat/src/lib/services/message-sender.service.ts:1133` can return successful settled delivery with the tab loaded; the ordinary continuation marks streaming separately at line 1142. `libs/frontend/chat-state/src/lib/tab-manager.service.ts:1868` writes streaming status, while `markLoaded` writes loaded status independently. `libs/frontend/chat-types/src/lib/chat-types.ts:509` defines these distinct statuses. Thus a non-streaming snapshot alone cannot establish whether the command's turn started and ended.

## Fix design

Reuse the coordinator's `awaitingSettlement` map for each direct or queued delivery, initially `waiting`. Its existing signal effect observes `streaming`, then a transition out of streaming marks it `settled` and wakes reconciliation. An absent record permits resend only for a settled delivery while the tab is no longer streaming. Every new delivery resets the observation. Waiting survives bounded polling expiry, so a late start/end still wakes reconciliation. Existing polling delays, cancellation, manual wrap-up, stale withdrawal, compaction deferral, failure retries, and five-attempt cap remain in place.

The coordinator is 611 lines. No claim-store field or service change was needed.

## Files changed

- `libs/frontend/chat/src/lib/services/session-auto-handoff-coordinator.service.ts`
- `libs/frontend/chat/src/lib/services/session-auto-handoff-coordinator.service.spec.ts`
- `.ptah/specs/TASK_2026_2273_1ab1/lane-report.md`

## Tests added / changed

- Added parameterized direct/queued regressions: absent status with delivery not yet streaming stays at one submission through all polling timers (15 simulated minutes). Both also prove that a late streaming-to-loaded transition permits exactly one resend, whose fresh delivery does not immediately resend again.
- Changed `resends a direct delivered command after authoritative absent` to `resends a direct delivered command after streaming ends with authoritative absent`, explicitly observing streaming then loaded. The original test encoded the immediate-resend bug.
- Changed `stops after five settled deliveries with authoritative absent status` to observe streaming then loaded for each delivered attempt. Its old setup treated queued settlement alone as turn completion and encoded the same bug. The five-delivery cap still passes.
- Updated `reconciles a delivered turn after polling expires and the stream settles` to establish an actual direct delivery before observing streaming, rather than constructing a claim manually.

## Verification results

Exact Jest command for all three runs:

```text
npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat/src/lib/services/session-auto-handoff-coordinator.service.spec.ts
```

Pre-fix, with new regressions:

```text
Test Suites: 1 failed, 1 total
Tests:       2 failed, 35 passed, 37 total
Snapshots:   0 total
Time:        53.506 s
```

Both new regressions: `Expected number of calls: 1`, `Received number of calls: 5`.

First post-fix run, before updating the old retry-cap setup:

```text
Test Suites: 1 failed, 1 total
Tests:       1 failed, 36 passed, 37 total
Snapshots:   0 total
Time:        27.676 s, estimated 47 s
```

Only the old cap test failed: expected 2 sends, received 1, because it never observed streaming.

Final run:

```text
Test Suites: 1 passed, 1 total
Tests:       37 passed, 37 total
Snapshots:   0 total
Time:        13.24 s, estimated 19 s
```

Other focused checks:

| Command | Output summary |
| --- | --- |
| `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json` | PASS, exit 0, no output (0 diagnostics). |
| `npx tsc --noEmit --project libs/frontend/chat/tsconfig.spec.json` | FAIL; initial output was truncated (818 output lines). Repeated the same command with PowerShell output capture/counting to assess scope. Exact compact summary: `Exit code: 2; TypeScript errors: 383`. Zero matching error lines for `session-auto-handoff-coordinator`; errors are in unchanged tests/shared dependencies. |
| `npx eslint libs/frontend/chat/src/lib/services/session-auto-handoff-coordinator.service.ts libs/frontend/chat/src/lib/services/session-auto-handoff-coordinator.service.spec.ts` | PASS, exit 0, no lint violations reported. Two notices: `warning No cached ProjectGraph is available. The rule will be skipped.` for `@nx/enforce-module-boundaries`. That rule was not verified. |
| `git diff --check` | PASS, exit 0, no output (run during review and again at completion). |
| Ptah AST analysis of changed coordinator | `parseStatus: ok`, `errorNodeCount: 0`, clean coverage, 1 file analyzed. |

Spec typecheck examples in unchanged files: TS2352 in `resize-handle.component.spec.ts:7` and `agent-card-truncation.spec.ts:138,142`; other diagnostics include branded-ID fixture mismatches and BigInt target errors. These were left outside this bugfix's scope. A baseline checkout typecheck was not run, so no claim is made that the entire baseline diagnostic set was compared.

## Tooling and limits

Read and applied `.claude/skills/angular-frontend-patterns/SKILL.md`. Native CLI skill discovery/loading was not exposed in this session; used filesystem discovery and read as fallback. Ptah AST analysis was available. The dependency graph tool returned `status: building`; used targeted native `rg` reference search instead (production import in `chat.store.ts`). Focused native TypeScript checks supplied diagnostics under the task's restricted verification rules. No template, rendered UI, or styling changed; no browser/render checks were applicable. Electron renderer behavior is covered at its host-neutral coordinator boundary; no Electron runtime smoke test was requested or run.

Outstanding verification limitations: the spec project has 383 diagnostics outside the changed files, and ESLint could not execute the module-boundary rule without a cached graph.

## Symptom

The successor's `ptah_session_handoff_ack` repeatedly returned `retryable-failure` with a generic close error while the predecessor tab stayed open.

## Root cause

`libs/backend/rpc-handlers/src/lib/handlers/session-handoff-closer.ts:47` ignored `blocked` and `absent` replies until timeout. `libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.ts:278` converted false to a generic reason. The renderer blocks on background/sleep status or pending tasks (`libs/frontend/chat/src/lib/services/auto-handoff-source-closer.service.ts:67-75`), which turn state stamps (`libs/frontend/chat-state/src/lib/tab-manager.service.ts:1958-1971`). Handoff re-parents children and lanes (`session-handoff.service.ts:460-470`). The incident's exact renderer blocker is not proven by the logs.

## Hypotheses checked

| Hypothesis | Verdict | Evidence |
| --- | --- | --- |
| Stale background state | Plausible, not proven for this tab | Turn state stamps background/sleep and tasks; adoption does not clear predecessor snapshot. |
| SDK ID mismatch | Possible after deliberate rebind/resume, no incident evidence | `tab-manager.service.ts:2946` rebinds a tab to a new SDK ID and `:3063` sets the resumed ID; stop itself does not change it. The old renderer compared IDs without logging mismatch. |
| Wrong window absent | Possible | Broadcast reaches every renderer; each searches its own active and parked partitions. |
| Timeout | Confirmed | Three ack calls took approximately 30 seconds each. |

## Logs

Read only `C:\Users\abdal\AppData\Roaming\Ptah\logs\Ptah Electron-2026-11-10.log`. Calls at 10:50:58, 10:51:32 and 10:52:11 UTC; slow-tool records at 10:51:28, 10:52:02 and 10:52:41 show 30104, 30008 and 30012 ms. The predecessor SDK session was already ended at 10:51:00. No `SessionAutoHandoff` blocker line was found in the host log.

## Does main already correct it

No. The current main worktree had the boolean closer and generic reason before these edits.

## Fix

- `libs/shared/src/lib/types/messages/session-handoff.ts`, `libs/shared/src/lib/types/rpc.types.ts`: closed blocker codes; optional stopped flag and RPC cause.
- `libs/backend/rpc-handlers/src/lib/handlers/session-handoff-closer.ts`, `session-rpc.handlers.ts`: validate cause; complete blocked at once; distinguish absent at deadline, timeout, broadcast failure.
- `libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.port.ts`, `session-handoff-close-result.ts`, `session-handoff.service.ts`, `index.ts`: discriminated result and fixed host messages.
- `libs/frontend/chat/src/lib/services/auto-handoff-source-closer.service.ts`: send codes and honor host-confirmed stop for stale background indicators.
- `libs/frontend/chat-state/src/lib/tab-manager.service.ts`, `tab-cross-partition-close.ts`: allow stopped predecessor close in background/sleep state, retaining dirty and live-turn guards.
- Jest specs in cli-agent-runtime, rpc-handlers and chat cover cause propagation, deadline results and stopped background case.
- `libs/frontend/chat-state/src/lib/tab-manager.cross-workspace.spec.ts`: verifies parked sleeping tab removal after host-confirmed stop.
- `libs/backend/rpc-handlers/src/lib/handlers/session-rpc.handlers.spec.ts`: rejects arbitrary renderer blocker text at the RPC boundary.
- `plugins/ptah-core/skills/session-handoff/SKILL.md`: bundled successor guidance now distinguishes retryable causes from refusals.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/session-handoff-ack.tool.ts`, `mcp-contract.sweep.spec.ts`: the tool description tells the successor to retry `retryable-failure` and not to retry `refused`; the length budget is 243.
- `jest.preset.js` is NOT part of the commit. The worktree has no local `node_modules`, so the fixed `marked` path prevented 188 suites from loading. A local-only edit resolves the installed `marked` UMD entry from its package location. It stays uncommitted because it is not part of this task and it changes the Nx cache key of all projects.

### Corrections after the first review

Commit `0eb425a0e` includes three corrections for the MINOR findings of the first review:

1. `session-handoff-closer.ts` `finish` writes the host log line `Handoff predecessor close finished` with `requestId`, `kind` and `code`. The next incident shows the blocker in the host log.
2. The tool description and its length budget (see above).
3. `auto-handoff-source-closer.service.spec.ts` has a table of blockers that still stop the close of a stopped predecessor (live turn, unsent input, queued message, permission prompt, Command Center). A dirty parked-tab test in `chat-state` was not added, because this table covers the guard.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Optional RPC code | Required / optional | Old renderers send only outcome | Yes |
| Wait for absent | Immediate / deadline | Another window may own tab | Yes |
| Stopped-only stale bypass | Always block / stopped-only bypass | Host stops before close and re-parents work | Yes |

## Verification

### Run 2 (final code, commit `0eb425a0e`)

Command: `npm run verify -- -p @ptah-extension/cli-agent-runtime,@ptah-extension/rpc-handlers,@ptah-extension/chat,@ptah-extension/chat-state,@ptah-extension/shared,@ptah-extension/vscode-lm-tools -- --output-style=static`. Exit code 0 at 2026-11-10T12:18:19Z. Lint and typecheck passed for 6 projects (0 errors). Jest passed for 6 projects: shared 148 suites/4213 tests, chat-state 35/673, cli-agent-runtime 177/3689 (1 skipped), chat 354/6308 (2 skipped), vscode-lm-tools 107/3489, rpc-handlers 240/6365 (8 skipped). The run used the local-only `jest.preset.js` edit.

### Run 1 (lane code, before the corrections)

Command: `npm run verify -- -p @ptah-extension/cli-agent-runtime,@ptah-extension/rpc-handlers,@ptah-extension/chat,@ptah-extension/chat-state,@ptah-extension/shared -- --output-style=static | tail -60` (Git `tail.exe` in PowerShell). Exit code 0. Lint/typecheck: 10/10 tasks passed. Jest: 5/5 targets passed; shared 148 suites/4213 tests, chat-state 35/673, cli-agent-runtime 177/3689 (1 skipped), chat 354/6303 (2 skipped), rpc-handlers 240/6365 (8 skipped). Total: 954 suites, 21,243 passed tests, 11 skipped. Rpc-handlers printed a worker teardown warning while passing.

Real final 60 lines (ANSI color removed):

```text
(Use `node --trace-warnings ...` to show where the warning was created)
(node:5492) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)

Test Suites: 177 passed, 177 total
Tests:       1 skipped, 3689 passed, 3690 total
Snapshots:   2 passed, 2 total
Time:        219.622 s
Ran all test suites.

> nx run @ptah-extension/chat:test

> jest --passWithNoTests=true

(node:19264) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:16728) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:23448) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)

Test Suites: 354 passed, 354 total
Tests:       2 skipped, 6303 passed, 6305 total
Snapshots:   0 total
Time:        452.495 s
Ran all test suites.

> nx run @ptah-extension/rpc-handlers:test

> jest --passWithNoTests=true

(node:18492) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:18492) Warning: Failed to load the ES module: D:\projects\ptah-extension\.claude-worktrees\fix-handoff-ack-tab-close-ef9abeb5f16f\libs\backend\rpc-handlers\jest.config.ts. Make sure to set "type": "module" in the nearest package.json file or use the .mjs extension.
(node:41256) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:32836) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
A worker process has failed to exit gracefully and has been force exited. This is likely caused by tests leaking due to improper teardown. Try running with --detectOpenHandles to find leaks. Active timers can also cause this, ensure that .unref() was called on them.

Test Suites: 240 passed, 240 total
Tests:       8 skipped, 6365 passed, 6373 total
Snapshots:   0 total
Time:        167.37 s, estimated 351 s
Ran all test suites.



 NX   Successfully ran target test for 5 projects


  Run duration:      15m 11s
  Cache:             0/5 hit (0%)
  Critical path:     7m 33s (1 task)
  Recoverable time:  7m 38s (50% of the run)

  Recommendations:
    - Increase parallelism to recover up to 7m 38s → https://nx.dev/docs/concepts/ci-concepts/parallelization-distribution?utm_source=nx-cli&utm_medium=cli&utm_campaign=performance-report&utm_content=parallelization.
    - Drastically reduce your run duration by sharing a cache across your team and CI → https://cloud.nx.app/connect/dIT0oQ4w22.
[verify 2026-11-10T11:54:34.375Z] lock released after 921.8s, exit code 0
```

## Open points

- The exact old-renderer blocker was not logged by the host. The new host log line records it for the next occurrence.
- `jest.preset.js` fails in a worktree without local `node_modules`. This needs a separate task.
- Lane limits during this task: codex stopped on the agent budget after the implementation; antigravity, grok and kimi code were at their limits. Glm did the reviews.

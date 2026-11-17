# PR #1402 second revision

## Findings

1. **Windows kill ordering corrected.** `libs/backend/agent-sdk/src/lib/helpers/off-thread-process-spawner.ts:110` adds an optional completion callback to `stopWindowsTree`. It runs after taskkill success, not-found, failure, timeout, synchronous launch failure, or invalid PID. `InlineProcess.kill()` at `:822` starts taskkill before closing the job; completion closes it. The existing close on exit at `:772` remains immediate and idempotent. Non-Windows still closes the job before `child.kill`. The other caller, `signalDirectly`, supplies no completion callback and retains its existing fallback and not-found behavior.
2. **Failed inline spawns leave tracking.** `libs/backend/agent-sdk/src/lib/helpers/off-thread-process-spawner.ts:783` closes the job and invokes a guarded `finish()` on close. Exit invokes the same guard and still closes the job immediately. `finish()` at `:793` calls `onFinished` at most once, removing the inline entry even for error + close without exit.

Regression coverage: `libs/backend/agent-sdk/src/lib/helpers/off-thread-process-spawner.spec.ts:1831` covers five taskkill outcomes and ensures no job close before taskkill starts, closure after completion, and no duplicate close after exit/close. At `:1868`, error + close removes the inline entry, while exit + close invokes the tracking deletion once. Both cases close the job once.

## Decisions

- **Choice:** use the preferred taskkill-first ordering, with completion closure and existing exit closure. Options were taskkill-first or close-first plus a scheduled snapshot cleanup after not-found. Taskkill-first is the smaller correction and preserves tree enumeration while the root exists, including descendants created before job assignment.
- **Prior correction preserved:** read `batch-c-revise-report.md` before editing. It records explicit-kill job closure and tests requiring one close through kill and subsequent exit; it does not separately explain why close preceded taskkill. This revision retains that closure guarantee on every outcome and immediate root-exit closure, rather than removing closure to fix ordering. The existing 3-second taskkill timeout bounds completion when the root remains alive. Existing disposal and worker replacement closure remain intact.
- **Evidence:** delayed callback tests assert that job closure has not happened at taskkill invocation or while its callback remains pending, then that it happens once for success, not-found, failure and timeout. Launch throws also close once. Existing real-worker lifetime tests continue to pass.
- **Scope:** no dependency, host API, settings, DI or RPC changes. The shared implementation remains usable by Electron and the other hosts.

## Worker path

- Finding 1 is present in generated worker source: the kill message handler closed the job before `killChild` started taskkill. Corrected `libs/backend/agent-sdk/src/lib/helpers/off-thread-process-spawner-source.ts:198` to close in the taskkill callback's `finally`, and on launch throws; non-Windows still closes before signaling. Removed early closure from the kill-message handler at `:438`. Existing exit, replacement and worker-exit closures remain. `off-thread-process-spawner-source.windows-job.spec.ts:11` adds five matching outcome tests using the generated source in a VM; existing real-worker tests remain.
- Finding 2 is absent in the worker/pool path: the worker error handler sends error plus stream completion without waiting for exit; host `WorkerProcess.fail()` settles the failure and calls teardown, releasing a non-reusable lease. `spawn-worker-pool.ts` owns no inline tracking set or `onFinished` callback. No pool edit was needed.

## Checks

Commands ran one heavy check at a time; output was tailed.

| Exact command | Result |
| --- | --- |
| `npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-sdk/src/lib/helpers/off-thread-process-spawner.spec.ts libs/backend/agent-sdk/src/lib/helpers/off-thread-process-spawner-source.windows-job.spec.ts` | PASS: 2 suites, 98 tests, 0 failures. Includes 12 new cases. First attempt failed before execution: both suites rejected the new tests' incorrect `NodeJS.ExecException` type name (0 tests run). Changed the callbacks to `Error`, then reran successfully. Existing Jest config module-format warning remains. |
| `npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.lib.json` | PASS: exit 0, 0 diagnostics. |
| `npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.spec.json` | PASS: exit 0, 0 diagnostics. |
| `npx eslint libs/backend/agent-sdk/src/lib/helpers/off-thread-process-spawner.ts libs/backend/agent-sdk/src/lib/helpers/off-thread-process-spawner.spec.ts libs/backend/agent-sdk/src/lib/helpers/off-thread-process-spawner-source.ts libs/backend/agent-sdk/src/lib/helpers/off-thread-process-spawner-source.windows-job.spec.ts` | PASS: exit 0, 0 errors, 1 existing max-lines warning for the spawner (794 lint-counted lines, limit 700). |

Tooling: Ptah AST/dependent inspection was requested before editing; targeted PowerShell reads and `rg` supplied source details. Ptah diagnostics returned unavailable after its 45-second compiler window, so the explicit focused TypeScript commands above provide verification. No matching local process-lifetime skill was found; skill search returned unrelated, non-invocable remote results. This CLI exposes no matching native skill loader, so no matching skill could be loaded.

## Unmet requirements

No finding remains open. No real Electron application smoke run was performed; verification covers shared source, mocked Windows ordering and existing real-worker tests. No Nx, build, serve, dev, e2e, package or workspace-wide checks were run. Only the four allowed source/spec files and this deliverable were edited. No Git mutation command was used; `HANDOFF.md` was untouched.

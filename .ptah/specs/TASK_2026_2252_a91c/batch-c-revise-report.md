# PR C revision report

All five findings are addressed. The explicit native loader change is complete.

## Findings

Paths below are relative to the worktree.

| Finding | Change and evidence | Check result |
| --- | --- | --- |
| 1. Generated worker tests | `libs/backend/agent-sdk/src/lib/helpers/off-thread-process-spawner-source.windows-job.spec.ts:9` runs the generated source in real workers. A temporary JavaScript binding records load, assignment and close calls. An assignment message from the binding proves message order before `spawned`. Tests check the success reply, one close on child exit, explicit kill and replacement, and isolation from the previous child exit. Missing module, thrown assignment and bad binding shape each return a failure reply while the original child stays usable. Tests check one spawned child and no close after failed assignment. Without job fields, the binding is never loaded. A close error is reported once. Cleanup stops all child PIDs, terminates the worker and removes temporary files. | PASS. Eight new tests. The combined agent SDK run passed 86 tests. |
| 2. Safe setting read | `libs/backend/agent-sdk/src/lib/helpers/off-thread-process-spawner.ts:893` returns before reading settings unless platform, architecture and policy match. A thrown read logs a real Error and returns no job path, including when the environment override is present. `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-windows-job.ts:18` has the same early guard; its existing catch keeps the child and logs a real Error. `off-thread-process-spawner.spec.ts:1793` tests a thrown reader and four guard exclusions. `cli-adapter.utils.spec.ts:1003` tests a thrown reader with one usable child. | PASS. Agent SDK and CLI suites; both TypeScript checks. |
| 3. Close log | `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-windows-job.ts:32` logs `[WindowsJob] close failed pid=<pid> root=process`. `off-thread-process-spawner.ts:500` and `:788` now include PID and root kind in worker and inline close logs. The inline handle receives the existing root kind from its spawn plan. `cli-adapter.utils.spec.ts:1019` checks the real Error, correct log and one close. | PASS. Focused suites and TypeScript checks. |
| 4. Detached roots | `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.utils.ts:318` states that job policy with the switch on stops detached descendants on root exit. `.ptah/specs/TASK_2026_2252_a91c/batch-c-plan.md:52` records the accepted policy, options, evidence and reversibility in Decisions. | PASS. Source and plan inspection. The allowed CLI live Windows suite also passed. |
| 5. Exit registration | `libs/backend/agent-sdk/src/lib/helpers/off-thread-process-spawner-source.ts:119` declares `current` before the exit listener at line 120. | PASS. Generated source tests and agent SDK type check. |

## Compatibility change

`libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.live-windows.spec.ts:148` passes `(): unknown => require(jobBinary)` to `NativeWindowsJobAssigner`. The existing `jobBinary` constant resolves the absolute `libs/backend/windows-job-native/build/Release/windows_job.node` path. This supports both constructor contracts. The CLI live suite and CLI type check pass.

## Files changed in this revision

- `libs/backend/agent-sdk/src/lib/helpers/off-thread-process-spawner-source.windows-job.spec.ts` (new).
- `libs/backend/agent-sdk/src/lib/helpers/off-thread-process-spawner-source.ts`.
- `libs/backend/agent-sdk/src/lib/helpers/off-thread-process-spawner.ts`.
- `libs/backend/agent-sdk/src/lib/helpers/off-thread-process-spawner.spec.ts`.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-windows-job.ts`.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.utils.ts`.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.utils.spec.ts`.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.live-windows.spec.ts`.
- `.ptah/specs/TASK_2026_2252_a91c/batch-c-plan.md`.
- This report.

## Checks

Checks ran one at a time.

1. `npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-sdk/src/lib/helpers/off-thread-process-spawner.spec.ts libs/backend/agent-sdk/src/lib/helpers/off-thread-process-spawner-source.windows-job.spec.ts` — PASS, 2 suites, 86 tests. Initial runs found test harness issues: the Jest environment object could not be cloned, and a native error did not pass a realm-specific Error check. Both were fixed. The failed run with open workers was stopped and its test children were removed.
2. `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.utils.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.live-windows.spec.ts` — PASS, 2 suites, 124 tests, no skipped tests reported.
3. `npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.lib.json` — PASS, exit 0.
4. `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json` — PASS, exit 0.
5. `npx eslint` with all eight changed TypeScript files listed above — PASS, exit 0, no errors. It reported the existing spawner file length warning and two non-null assertion warnings in the new spec. The two assertions were replaced with explicit PID guards.
6. `npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-sdk/src/lib/helpers/off-thread-process-spawner-source.windows-job.spec.ts` — PASS, 8 tests, after the final PID guard edits.
7. `npx eslint libs/backend/agent-sdk/src/lib/helpers/off-thread-process-spawner-source.windows-job.spec.ts` — PASS, exit 0, no source warnings.

All ESLint runs skipped `@nx/enforce-module-boundaries` because no cached project graph was available. No new cross-project import was added. Jest emitted the existing module-format warning for its TypeScript config.

## Existing changes and limits

The worktree already contained uncommitted batches 1, 2 and 3. Existing changes included Electron composition, SDK registration and worker pool, CLI adapters and detection, Codex runtime, platform-core, platform-electron, and prior batch reports. They were preserved. This revision only edited the files listed above. No commit, push, stash, reset, restore or clean was run.

No matching skill was exposed through this CLI skill mechanism. The local skill catalogue has no matching worker or process lifetime skill. No UI work was needed.

Ptah dependency analysis returned the worker pool and spawner spec as dependents, with partial index coverage. An initial analysis call had an invalid argument; targeted file reads and `rg` were used as fallback. Ptah diagnostics did not return a usable result within 45 seconds. The two explicit TypeScript checks passed instead.

No requested finding remains open. The generated-worker stub tests use no Windows API and have no platform skip. They ran on this Windows host; Linux and macOS execution was not available in this session. A real Electron application smoke run was not requested and was not run.

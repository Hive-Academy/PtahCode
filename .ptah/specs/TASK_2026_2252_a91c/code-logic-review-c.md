# Code Logic Review C: Windows job roots

Verdict: PASS WITH CHANGES. No critical findings. One major test gap and several minor points.

Scope read: the full `git diff` for part C, `windows-job-gate.ts`, `cli-windows-job.ts`, the generated worker source, `windows_job.c`, the Electron assigner and registration, `cli-detection.service.ts`, and the specs for the spawner and `spawnCli`. No tests or builds were run.

## Checks that passed

- Startup (focus 1). `resolveElectronWindowsJobBinaryPath` only joins and resolves paths. It does not load the binary or throw on any platform or arch. `container.resolve(WINDOWS_JOB_ASSIGNER)` is safe. `registration.ts:110` registers a `useValue` instance of `ElectronWindowsJobAssigner` whose constructor only stores options. Loading and the win32 x64 check happen inside `assignToNewJob`, so macOS, Linux and arm64 never throw at composition. A missing binary only fails inside the worker `require` or the assigner call, and both are caught and logged.
- Other hosts. `registerSdkServices` configures the spawner only when `options.windowsJobs` is given. VS Code and CLI hosts pass nothing, so `windowsJobBinaryPath` stays undefined and `jobPath` returns undefined. The factory returns one cached instance and every consumer injects by the token, so there is no second spawner.
- Switch off (focus 2). The `spawn` message gets `windowsJobBinaryPath` and `windowsJobPolicy` only through a conditional spread, so the old message is unchanged. The worker never calls `require` unless both fields are present. The only difference is that `spawned` now carries a `job: undefined` key. The host reads it with `message.job?.ok`, so this is harmless.
- Same tick. The worker assigns directly after `spawn()` and before `send('spawned')`. The inline branch assigns before any await.
- Lifetime. Per-child state holds the handle. It is closed on child `exit`, on the `kill` message, and when a new `spawn` replaces `current`. The state's own exit listener closes only its own state, so a reused pooled worker cannot close the next child's job. Closing on exit is the intended kill-on-close behavior.
- Error path. A worker failure is returned as `{ok:false, message, stack}`. The host rebuilds a real `Error` and calls `logger.error`. The spawn is not repeated and snapshot cleanup is untouched in both the worker and inline paths.
- Native module. `windows_job.c:152` uses `NAPI_MODULE` with an `init(env, exports)` function that does not store global state. That is context-aware, so loading in a worker thread is fine. The external handle has a finalizer (`finalize_job`, lines 31-40) that closes the job. A `terminate()`d worker therefore still releases the job when its environment tears down. The plan keeps snapshot cleanup for that case, which is correct.
- CLI (focus 3). Policy comes from the explicit argument and is never inferred from `detached`. Probes and ACP and Antigravity use `no-job`. OpenCode gets `job` only when `standalone === true`. The helper runs only in the non-spawner branch, so a spawner root is assigned once. An unbound token is safe because `@inject(..., { isOptional: true })` is used for both the assigner and the workspace provider, and `assignCliWindowsJob` returns early when no assigner exists.
- Codex (focus 4). Only the `app-server` spawn request sets `job`.
- Settings key. `agentOrchestration.windowsJobs` is in `FILE_BASED_SETTINGS_KEYS` (line 138) and in the defaults (line 378, `false`).
- Repo rules (focus 6). No `any`, `@ts-ignore`, `as unknown as` or `console.*` in the new code. The only `require` is inside the generated worker source string. The imports use public aliases. `cli-agent-runtime` already depended on `agent-sdk` and `platform-core`.

## Findings

### 1. Major: the worker-side job code has no test

- Files: `libs/backend/agent-sdk/src/lib/helpers/off-thread-process-spawner-source.ts:320-334,348-351` and `off-thread-process-spawner.spec.ts:1761-1860`.
- Scenario: the inline path is tested well (default off, success, failure, exit close, dispose close). The worker path is not. The only worker test checks that the host posts the two fields when the gate is open. Nothing runs the generated source with a fake binding. No test covers `require` failure, an invalid binding shape, the `{ok:false}` reply, the `job-close-error` message, close on `exit`, close on `kill`, or close when a second spawn replaces `current`. A typo in the string source would pass all tests.
- Correction: add a spec that evaluates the worker source with a stub `node:worker_threads` and a stub binding. It should assert that `createJobForPid` runs before `spawned` is posted, that `closeJob` runs exactly once on exit, kill and replacement, and that a thrown binding yields `job.ok === false` while the child still runs. The Windows live test from the plan should also cover the worker path.

### 2. Minor: the setting read can fail a spawn and also runs on non-Windows

- File: `off-thread-process-spawner.ts:894-897`, called at `:932` and `:987`.
- Scenario: `shouldUseWindowsJob` receives `settingEnabled: this.windowsJobSetting()` as an eager argument. The call runs on every spawn, including macOS and Linux, and sits outside any try/catch. The Electron closure resolves the workspace provider and reads the file settings. If that read throws, the spawn throws. That breaks the rule that nothing from this feature may fail a spawn, and it adds a settings read to platforms that must not change.
- Correction: in `jobPath`, return early when `process.platform !== 'win32'` or `process.arch !== 'x64'` or `policy !== 'job'`. Wrap the setting read in try/catch, log with `logger.error`, and treat it as off.

### 3. Minor: the close-failure log says "assignment failed"

- File: `cli-windows-job.ts:26-28`.
- Scenario: a failing `job.close()` logs `[WindowsJob] assignment failed ... snapshot cleanup active`. That text is wrong for a close failure and will mislead whoever reads the log.
- Correction: use a message such as `[WindowsJob] close failed pid=...`.

### 4. Minor: descendants of detached roots now die when the root exits

- Files: `windows-orphan-cleanup.ts:36-38` and `copilot-sdk.adapter.ts:383-386`, `pi-cli.adapter.ts:463-466`, `opencode-cli.adapter.ts:867-870`.
- Scenario: the existing snapshot cleanup skips detached roots because "detached rival CLIs own their process lifetime". The job closes on root `exit` and kills the whole tree, detached or not. With the switch on, a Copilot, Pi or OpenCode child that is meant to outlive the root dies with it. `batch-c-plan.md` does not address this. It is only reachable with the switch on, so it is low risk.
- Correction: record the decision in the plan or in a code comment that the job intentionally overrides the detached rule, or close the job on stop only for detached roots.

### 5. Minor: the worker exit hook is not reliable on terminate and can read `current` early

- File: `off-thread-process-spawner-source.ts:112`.
- Scenario: the `process.on('exit')` handler is registered before `let current` at line 120. If the worker throws at the `parentPort` check, the handler would hit a temporal dead zone. A `worker.terminate()` may also skip the `exit` event. In practice the native finalizer and the retained snapshot cleanup cover both cases, so there is no leak.
- Correction: move the registration below `let current`, and note that the finalizer is the real backstop.

## Five logic questions

1. Silent failure: a native error is logged and the spawn continues, as designed. The visible gap is that worker-side failures are untested (finding 1).
2. Unexpected user action: turning the switch on does not affect already running roots, because the gate is read at spawn time only. This is acceptable.
3. Wrong answer from input: a non-boolean stored for the setting reads as off, because the check is `=== true`.
4. Dependency failure: a missing binary, a bad binding shape or a native throw all end in a logged error and a normal spawn. A throwing settings read is the one uncovered case (finding 2).
5. Missing: the worker-path tests and the decision on detached roots (findings 1 and 4).

# Code Logic Review — `TASK_2026_2286_c7e2`

## Summary

| Metric              | Value          |
| ------------------- | -------------- |
| Overall score       | 7/10           |
| Assessment          | NEEDS_REVISION |
| Blocking issues     | 0              |
| Serious issues      | 1              |
| Moderate issues     | 4              |
| Failure modes found | 5              |

Scope: the full diff plus whole-file reads of `run-process-to-completion.ts`, the touched regions of the detector, resolver and `select-codex-executable.ts`, `OffThreadProcessSpawner` (`spawnProcess`, `WorkerBackedProcess` events, `kill`), `register.ts` and the Electron bootstrap. No tests were run.

## Five logic questions

1. Silent failure. A timed-out probe is not stopped when the pid is not known yet (see F1). The process is orphaned and no error is raised. A failure of `container.resolve(SDK_PROCESS_SPAWNER)` in bootstrap is caught and logged, and it then skips the whole Codex chat binding (F4).
2. Unexpected user action. None specific. The slow-spawn case is the one that matters: first launch with antivirus scanning, where the pid arrives late.
3. Wrong answer from input. A process killed by a signal, or a worker that dies, gives `exitCode: null`. The detector then reports `success:false, exitCode:0` (`claude-cli-detector.ts` executeOffThread, `result.exitCode || 0`). The inline code does the same, so this is parity, but the result is still self-contradictory. Output is capped at 64 KiB per stream. That is fine for the current probes (`--version`, `npm config get prefix`, `wsl which`, `where`).
4. Dependency failure. A worker that refuses to start, or a `spawnProcess` that throws, rejects. The detector and resolver convert that to a failed `CommandResult` or `null` and log it. This matches the inline `error` event. A worker that dies mid-run emits `error`, then `close`; the first one settles and the rest are ignored.
5. Missing. There is no test for the pid-unknown timeout. A second `error` event after the first has no listener (F2).

## Failure modes

### F1. Timeout does not stop a process whose pid is unknown (Serious)

- Trigger: `where`, `which`, `wsl` or `npm` hangs or starts slowly, and the timeout fires before the worker reports `spawned`. This is the same slow-CreateProcess case the task is about.
- Symptom: the timeout resolves, but the child keeps running when it finally starts. Nothing kills it, and the worker stays leased until the child exits.
- Evidence: `claude-cli-detector.ts` executeOffThread `onTimeout` and `claude-cli-path-resolver.ts` resolveCommandPathOffThread `onTimeout` both run `if (handle.pid && !handle.killed) void killProcessTree(handle.pid)`. `WorkerBackedProcess.kill` (`off-thread-process-spawner.ts:418-425`) queues `pendingKill` until the pid is known. The default `handle.kill()` in `run-process-to-completion.ts` therefore covers this case, and the custom callback does not.
- Fix: in `onTimeout`, call `handle.kill()` when `handle.pid` is undefined. Better, always call `handle.kill()` and add `killProcessTree` only when the pid is known. The shim already tree-kills on Windows through taskkill.

### F2. Late second `error` can throw (Moderate)

- Evidence: `run-process-to-completion.ts` uses `handle.once('error', ...)`. After it fires, no `error` listener is left. `WorkerBackedProcess` can emit `error` more than once (`off-thread-process-spawner.ts:474, 577, 789`).
- Impact: an unhandled `'error'` on an EventEmitter throws on the main thread.
- Fix: use `on('error')` and ignore the event once settled. Also remove the listeners after settling.

### F3. Cross-spawn parsing still runs on the main thread (Moderate)

- Evidence: `spawnProcess` calls `parseCommand(...)` (`off-thread-process-spawner.ts:~1004`) on the host. On Windows it does a PATH lookup (`which.sync`) with synchronous fs calls, then opens the target file to read its shebang.
- Impact: the CreateProcessW cost is gone, but small synchronous file opens remain. They can be slow under antivirus, especially on `codex.exe`.
- Fix: acceptable residual. Note it and measure in the Electron lag check from the plan.

### F4. Eager spawner resolve inside the Codex binding try (Moderate)

- Evidence: `bootstrap.ts:~606` calls `container.resolve(SDK_TOKENS.SDK_PROCESS_SPAWNER)` unconditionally. Other callers guard with `isRegistered` (`phase-4-handlers.ts:144`, `task-end-hook-composition.ts:487`).
- Impact: if the resolve ever throws, the `catch` logs and continues startup, and Codex chat is never bound. That is a new way to lose a feature that the old code did not have.
- Fix: use `isRegistered ? resolve : undefined`. The factory is a cached singleton, and phase 2 runs before this point, so there is no ordering problem today.

### F5. Non-Electron hosts also take the new path (Moderate, behavioural note)

- Evidence: `register.ts:557-566` registers `SDK_PROCESS_SPAWNER` for every host that calls `registerSdkServices`. The `@inject(..., { isOptional: true })` on `ClaudeCliDetector` therefore resolves for those hosts too. The detector then uses worker threads outside Electron.
- Impact: this is probably intended, but it contradicts "hosts without a spawner keep the inline path". Only `new ClaudeCliDetector()` (for example `worker-host/serve.ts:204`) stays inline.
- Fix: confirm it is intended and state it in `context.md`.

## Blocking issues

None.

## Serious issues

F1.

## Moderate and minor issues

- F2 to F5 above.
- `run-process-to-completion.ts`: the timer is `unref`'d. A host with nothing else keeping the loop alive could exit before a probe finishes. This is minor.
- `claude-cli-detector.ts` executeOffThread: `exitCode: result.exitCode || 0` with `success: false` when the exit code is null. This is the same as the old code, but still misleading.

## Checked and found sound

- Timeout semantics: both paths return the same `Command timeout` result with exit code -1, and the resolver returns `null`.
- Codex: a non-zero exit or a timeout rejects, like `execFile`. The 16 KiB limit now truncates instead of rejecting, which is harmless for `--version`.
- No double-settle: `settled` guards all three exits.
- The timer is cleared on `close` and on `error`.
- `detached` follows the platform, as before.
- `env: process.env` goes through `stripUndefinedEnv`.
- Bare commands and `.cmd` shims are handled by `parseCommand` (`cross-spawn _parse`) in `spawnProcess`, the same resolution the inline `crossSpawn` used.
- Child errors: ENOENT and refused spawns reject through `error` (`RefusedProcess`, `off-thread-process-spawner.ts:865`).
- DI: `ClaudeCliDetector` is registered at `register.ts:392` and the spawner at line 558. Neither depends on the other, so there is no cycle. Resolution is lazy, so registration order does not matter. The optional `LOGGER` token is already imported from `vscode-core`.
- Electron callers: the only Electron site that builds Codex probes is `createElectronCodexSelectionSnapshot`, and bootstrap passes the spawner. `codex-lane-composition.ts:334` passes its own `binary`, so the `NativeCodexLaneBinaryProbe` default is not used there. The default `NativeCodexLaneBinaryProbe()` still uses inline probes. That is acceptable for CLI hosts only.

## Data flow

1. Caller: `ClaudeCliDetector.executeCommand`, `ClaudeCliPathResolver.resolveCommandPath` or Codex `readVersion`. OK.
2. `runProcessToCompletion` calls `spawner.spawnProcess`. A throw rejects. OK.
3. `parseCommand` runs on the host (F3), then the worker spawns the child. OK.
4. Output is collected with a cap. On `close`, `error` or timeout the promise settles. Timeout cleanup has the F1 gap.
5. The caller maps the result to `CommandResult`, `null` or a throw. OK.

## Requirements fulfilment

| Requirement                                        | Status   | Gap                                                    |
| -------------------------------------------------- | -------- | ------------------------------------------------------ |
| Codex `--version` off the main thread (Electron)   | COMPLETE | F4 (resolve guard)                                     |
| Claude detector and resolver off the main thread   | COMPLETE | F1, F3                                                 |
| Inline fallback kept when no spawner               | COMPLETE | F5 (more hosts get the spawner than the task implies)  |
| Plan-usage readers (antigravity, grok, opencode)   | MISSING  | Listed in `context.md` and not in this diff            |

## Edge cases

| Case                          | Handled | How                         | Concern                  |
| ----------------------------- | ------- | --------------------------- | ------------------------ |
| Timeout before pid is known   | NO      | pid check skips the kill    | F1                       |
| Spawn fails (ENOENT, refused) | YES     | reject, then null or failed | none                     |
| Two `error` events            | NO      | `once` listener             | F2                       |
| Output over the cap           | YES     | truncated                   | none for current probes  |
| Worker dies mid-run           | YES     | error or close with null    | `exitCode 0` oddity      |

## Verdict

- Recommendation: REVISE
- Confidence: MEDIUM-HIGH
- Top risk: F1. The timeout leaves a slow-starting probe running because the custom kill needs a pid that may not exist yet.
- What a robust implementation would add: call `handle.kill()` on timeout, use `on('error')` with listener removal, guard the bootstrap resolve with `isRegistered`, a spec for the timeout with no pid, and the plan-usage readers, or a note that they are deferred.

# Code logic review: Windows orphan cleanup live specs

Reviewed files (read-only):

- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.live-windows.spec.ts`
- `libs/backend/platform-core/src/utils/windows-orphan-cleanup.live-windows.spec.ts`
- Production code under test: `spawnCli` (`cli-adapter.utils.ts:305-352`), `scheduleWindowsOrphanCleanup` (`windows-orphan-cleanup.ts:29-46`).

## Verdict

REVISE — the positive tests discriminate against a no-op cleanup, but the unrelated-process control sits outside the cleanup time window and an early root exit can leak detached processes past the test run.

## Findings

1. **Major — `libs/backend/platform-core/src/utils/windows-orphan-cleanup.live-windows.spec.ts:84`**: The unrelated control process starts before the test captures `startedAt` at line 91. The cleanup receives `startedAt` and `exitedAt` (`windows-orphan-cleanup.ts:41`), so creation time is part of its selection. The control is therefore excluded by time alone. A cleanup without any ancestry filter would still pass, because the control lies outside the window. The real hazard is a process that starts during the CLI lifetime, for example a CLI of a second concurrent lane. The `spawnCli` spec has no such control at all, so this weak control is the only guard. Fix: spawn the control process after line 91, for example right after the root spawn, and keep it outside the root ancestry.

2. **Major — `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.live-windows.spec.ts:76`**: The stdout promise rejects only on a spawn `error` event. It never rejects when the root exits before it prints the tree line. The test then hangs until the 30 s Jest timeout, and the child and grandchild pids stay unrecorded. The afterEach can dispose only the root. `taskkill /T` cannot walk through a dead intermediate process, and detached processes belong to no job object, so the descendants can outlive the whole Jest run. The same pattern is at `libs/backend/platform-core/src/utils/windows-orphan-cleanup.live-windows.spec.ts:45`. Fix: reject on the root `exit` event in both helpers. Also print the root child pid from the root script before it waits for the grandchild line, so a partial tree is recorded and `taskkill /T` can reach the rest.

3. **Minor — `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.live-windows.spec.ts:53`**: `dispose` throws on the first taskkill failure against a live pid. The loop stops, so the remaining pids are never killed and `pids.clear()` never runs. The same pattern is at `libs/backend/platform-core/src/utils/windows-orphan-cleanup.live-windows.spec.ts:63`. Fix: kill every remaining pid, collect all errors, and throw one combined error at the end.

4. **Minor — `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.live-windows.spec.ts:28`**: `alive` treats every throw as dead. On Windows, `process.kill(pid, 0)` throws EPERM when the process exists but denies access, and it probes whether the pid can be opened, not whether the process still runs. A terminated process can still answer while another process holds a handle to it. The EPERM case can make a death poll pass while the process lives. The lingering-handle case weakens `staysAlive`. The same helper is at `libs/backend/platform-core/src/utils/windows-orphan-cleanup.live-windows.spec.ts:28`. Fix: treat EPERM as alive, or check liveness through `tasklist /FI "PID eq <pid>"`.

5. **Minor — `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.live-windows.spec.ts:57`**: `dispose` and `alive` trust a recorded pid for the whole test. A pid that dies early and is reused makes `dispose` kill an unrelated process. The same applies at `libs/backend/platform-core/src/utils/windows-orphan-cleanup.live-windows.spec.ts:67`. Fast reuse is rare on Windows. Fix: document the accepted risk, or verify the process creation time before each kill.

6. **Minor — `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.live-windows.spec.ts:45`**: `staysAlive` samples every 100 ms for 2 s. One slow timer tick can cut the run to a single sample at the start, so a daemon that dies soon after that sample passes. The helper also samples only the grandchild, and never the detached middle child. Fix: require a minimum sample count, or check the alive state once more at the deadline, and assert the child too.

7. **Minor — `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.live-windows.spec.ts:125`**: The name says the test "records what happens", but the body asserts a fixed outcome: both non-detached descendants die within the poll window. A reader cannot tell the pass condition from the name, and the test fails on a runtime without the libuv job behavior. Fix: rename it to state the outcome, for example "kills non-detached descendants through the libuv job when the root exits".

8. **Minor — `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.live-windows.spec.ts:64`**: `treeFor` has no explicit return type. Every other helper in the file declares one. Fix: declare the return type of the helper.

9. **Minor — `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.live-windows.spec.ts:97`**: The describe callback body sits at two-space indent and the closing lines 131 to 133 do not match it. The second spec, lines 74 to 117, shows the consistent layout, and a formatter check would rewrite this block. Fix: align the indentation with the second spec.

10. **Minor — `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.live-windows.spec.ts:97`**: The specs skip on non-Windows but carry no opt-out for CI or slow machines. On a loaded Windows CI the 5 s and 15 s deadlines can fail while real process trees add minutes to the run. The same applies at `libs/backend/platform-core/src/utils/windows-orphan-cleanup.live-windows.spec.ts:74`. Fix: confirm that these live tests belong in CI, or add an environment guard.

## Checked and correct

- Both specs skip on non-Windows through `describe.skip` (`cli-adapter.live-windows.spec.ts:97`, `windows-orphan-cleanup.live-windows.spec.ts:74`).
- The positive tests cannot pass when the cleanup does nothing. The descendants are spawned detached, so they escape the libuv job object and survive a root exit on their own. The 15 s poll then times out (`cli-adapter.live-windows.spec.ts:109`, `cli-adapter.live-windows.spec.ts:115`, `windows-orphan-cleanup.live-windows.spec.ts:112`).
- The survival test cannot pass when the cleanup fires although it is disabled. `spawnCli` leaves `startedAt` undefined and registers no exit handler in that case (`cli-adapter.utils.ts:338-350`), so `staysAlive` catches a wrongly registered cleanup.
- `windows-orphan-cleanup.live-windows.spec.ts:105-111` reproduces the production call with the same shape: a pid, a `startedAt` from before the spawn, `detached: false`, and the default dependencies, like `spawnCli` passes them (`cli-adapter.utils.ts:347-349`).
- Every recorded pid is disposed in afterEach with `taskkill /T /F`, and dispose tolerates a pid that died on its own.
- The poll helpers use a deadline with a 100 ms interval, not a fixed sleep.
- The scripts pass the detach flag through argv correctly. With `node -e`, extra arguments start at `argv[1]`.
- `expect(errors).toEqual([])` (`windows-orphan-cleanup.live-windows.spec.ts:114`) proves the error callback never fired.
- No `any`, no `console` call, and no unused import in either file.

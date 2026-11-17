# Context

Follow-up of the research task TASK_2026_2250_b224 (`../TASK_2026_2250_b224/research-report.md`)
in the performance program TASK_2026_2181_dbbb.

## Decisions (user delegated them to the coordinator, 2026-11-17)

- Use an owned N-API module. `@seydx/win-job` is rejected: one maintainer, 4 commits, one
  release (0.1.0), and it assigns the job after spawn, so the spawn race stays.
- Build for win32-x64 only. The release workflow publishes no Windows arm64 build.
- The snapshot cleanup stays as the fallback on each native error.
- The git/workspace watcher stays on the snapshot cleanup in the first change.
- Daemon survival: the plan must decide it per root from the code, with an explicit policy.
- Product priority of the user: the MCP server and the hosts must stay stable and fast.
  Prefer the smallest change that closes the race. A stop recommendation is a valid result.

## Design approved by the user (2026-11-17): the small design

`implementation-plan.md` describes the full design (suspended start in C++). The user rejected
it for stability. The approved design replaces its sections "Native module", "Port and lifetime
contract" and "Implementation batches" as follows. Its "Root policy" table stays valid.

- Node stays the process starter. Stdio, events and `.cmd` resolution do not change.
- The owned native module does only three things: create a private job with
  `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`, add a live process to it by PID immediately after the
  spawn, and close the job handle. No `CREATE_SUSPENDED`, no `CreateProcessW`, no pipes.
- Accepted gap: a child that the root starts before the assignment (the same tick as spawn).
- On each native error the caller logs the real Error and keeps the snapshot cleanup.
- No `CREATE_BREAKAWAY_FROM_JOB`. Nested jobs: try the assignment, fall back when it fails.

Contract in `platform-core` (types only, no native import):

```ts
export type WindowsJobPolicy = 'job' | 'no-job'; // omitted on a request means 'no-job'
export interface WindowsJobHandle { close(): void } // idempotent; kills every process in the job
export interface IWindowsJobAssigner {
  /** Creates a private kill-on-close job and adds the process. Throws an Error on failure. */
  assignToNewJob(pid: number): WindowsJobHandle;
}
```

Pull requests:

1. PR A: the contract above, `windowsJobPolicy` on `ProcessSpawnRequest`, and the native
   package `libs/backend/windows-job-native` with unit and live Windows specs. No caller.
2. PR B: Electron adapter, DI token, packaging and packed check.
3. PR C: managed roots use the job behind a switch that is off by default.

# Windows job object research

## Summary

**Recommend an owned Windows N-API spawn adapter** for managed roots. It should create the child suspended, assign it to a private job with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`, then resume it. A simple `assign(pid)` after Node `spawn()` improves cleanup but leaves the spawn race. Keep the snapshot path when native launch or assignment fails, for unsupported spawn modes, and for non-Windows behavior.

## Options

| Option | New dependency | Spawn race handled | Packaging cost | Risk |
| --- | --- | --- | --- | --- |
| Owned N-API adapter | Owned native module, likely `node-addon-api` | Yes, if it owns CreateProcess | Build x64/arm64 `.node`, unpack, verify | Handle and stdio complexity; build maintenance |
| `@seydx/win-job` | MIT N-API package | No with `assign(child.pid)` | Windows x64/arm64 prebuilds; unpack | Small project; no atomic spawn API documented |
| Koffi FFI | MIT `koffi` native module | Only if FFI owns suspended CreateProcess | Unpack and verify native module | Win32 structs and handle lifetime in JS |
| Small native launcher EXE | Owned EXE | Yes, if launcher owns target creation | Ship and sign x64/arm64 EXEs | IPC, stdio, AV review |
| PowerShell `Add-Type` wrapper | No npm dependency | Only if wrapper owns target creation | No bundled binary | Slow, policy/AV friction, quoting |
| Current Node spawn and snapshot | None | No | None | Late or reparented descendants escape |

## Findings

### 1. Win32 access and Electron packaging

Node's public `child_process` options expose `detached` and `windowsHide`, but no job handle or `CREATE_SUSPENDED` option ([Node API](https://nodejs.org/api/child_process.html)). The required Win32 calls are `CreateJobObject`, `SetInformationJobObject(JobObjectExtendedLimitInformation)`, and `AssignProcessToJobObject`. `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` terminates associated processes when the final handle closes ([Microsoft limit definition](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-jobobject_basic_limit_information), [assignment API](https://learn.microsoft.com/en-us/windows/win32/api/jobapi2/nf-jobapi2-assignprocesstojobobject)). There is no pure Node API for atomic assignment. A no-new-dependency path can retain the existing snapshot or ship an owned helper executable.

[`@seydx/win-job`](https://github.com/seydx/win-job) is MIT and uses `napi-rs`. Its repository says it ships Windows x64 and arm64 prebuilds and provides `Job.assign(pid)`. It also warns that processes started before assignment remain outside the job. Its repository has little adoption, so its maintenance risk needs review. [Koffi](https://github.com/Koromix/koffi) is MIT, is actively published, and documents Windows x64 and arm64 builds. It can call Win32 DLLs ([Koffi guide](https://koffi.dev/start)). Neither package's source proves a tested Electron 44 and Node 24 job flow. Test the binary in both runtimes. N-API is ABI-stable in principle, but packaging still needs validation.

The root `package.json:103` lists `better-sqlite3`; `package.json:64-65` invokes native rebuild after install. The root manifest does not list `node-pty` as a direct dependency. `apps/ptah-electron/scripts/rebuild-native.js:5-22` compiles `better-sqlite3` against Electron 44, ABI 149, and checks a query. `apps/ptah-electron/electron-builder.yml:17-23` disables broad native rebuild; lines 52-70 unpack native packages. `apps/ptah-electron/scripts/verify-packed-native.js:249-306` checks packed `better-sqlite3`. A new addon needs explicit bundler externalization, ASAR unpacking, x64/arm64 coverage, and a packed-runtime load check.

### 2. Spawn race and ConPTY

Post-spawn assignment can miss a grandchild started before assignment. Use `CreateProcessW(CREATE_SUSPENDED)`, assign its process handle, then `ResumeThread`. `PROC_THREAD_ATTRIBUTE_JOB_LIST` is another atomic create path on Windows 10 and later ([process attribute documentation](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-updateprocthreadattribute)). Both require control of process creation. A wrapper spawned by Node is not race-free if the wrapper itself is assigned later.

ConPTY provides terminal I/O, not job ownership ([Microsoft ConPTY guide](https://learn.microsoft.com/en-us/windows/console/creating-a-pseudoconsole-session)). [`node-pty` Windows source](https://github.com/microsoft/node-pty/blob/main/src/win/conpty.cc) calls `CreateProcessW` for the terminal client without `CREATE_SUSPENDED`. A job attached to the parent CLI should be inherited by ordinary descendants, including a ConPTY client, unless a process breaks away or an external broker starts it. Test this with a real ConPTY child. `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.utils.ts:293` notes that rival CLIs use node-pty internally.

### 3. Nested jobs and survival

Windows 8 and later supports nested jobs. An already-jobbed process can enter a new nested job only when the hierarchy is valid and UI limits do not conflict ([nested jobs](https://learn.microsoft.com/en-us/windows/win32/procthread/nested-jobs), [assignment rules](https://learn.microsoft.com/en-us/windows/win32/api/jobapi2/nf-jobapi2-assignprocesstojobobject)). Electron or its launcher may already be in a job. Test inside a parent job and use the snapshot fallback on assignment failure. Do not set `CREATE_BREAKAWAY_FROM_JOB` by default: a parent job may deny it, and it may escape host policy. A daemon can escape only if the job chain permits breakaway and its creator uses `CREATE_BREAKAWAY_FROM_JOB`; silent breakaway is a separate limit ([job rules](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects)). For roots whose daemon must survive, skip the private job unless the exact daemon launch is controlled.

The current opt-in is `ProcessSpawnRequest.cleanupOrphanDescendants?: boolean` at `libs/backend/platform-core/src/interfaces/process-spawner.interface.ts:73-74`. Long-lived CLI roots set it, for example `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/pi-cli.adapter.ts:464` and `opencode-cli.adapter.ts:866`. `libs/backend/platform-core/src/utils/windows-orphan-cleanup.ts:36-38` skips detached roots and says they own their lifetime. However, `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.utils.ts:324` forces `detached` false on Windows. The short probe at line 393 requests detached but does not request orphan cleanup. Add an explicit Windows job policy; do not infer daemon survival from this POSIX-oriented flag.

### 4. Call sites and fallback

`libs/backend/platform-core/src/utils/windows-orphan-cleanup.ts:29-45` schedules `WindowsOrphanDescendants` after exit and injects query and kill operations at lines 4-25. `libs/backend/codex-runtime/src/lib/codex-orphan-cleanup.ts:63-76` invokes the same snapshot type. The Codex app-server root calls it from `libs/backend/codex-runtime/src/lib/codex-app-server-process.ts:732`. `libs/backend/agent-sdk/src/lib/helpers/off-thread-process-spawner.ts:340-354` sends spawn work to a worker; its worker and inline paths schedule cleanup at lines 509-517 and 740-750. The common CLI adapter uses it at `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.utils.ts:338-349`. `libs/backend/cli-engine/src/lib/platform/cli-platform-commands.ts:146-167` uses direct Node spawn for auth. The path supplied under `cli-agent-runtime/src/lib/platform` does not exist in this checkout. `libs/backend/platform-cli/src/implementations/cli-workspace-watcher.ts:103,123-127,192-199` uses `fork` and starts cleanup on `exit`, since inherited pipes can delay `close`.

Use jobs for managed CLI roots and Codex app server first. Keep snapshot fallback for native errors and process modes that cannot use atomic spawn. Then migrate auth and watcher once stream and Node `fork` IPC parity is proven. Do not job Electron itself. On success, close the per-root job on root exit, explicit stop, or host shutdown. Do not wait for `close` if descendants hold inherited pipes. Job membership does not cover a process started by WMI, Task Scheduler, or another outside broker ([package note](https://github.com/seydx/win-job)).

### 5. Tests

Unit test with fake job and spawner ports: successful assignment; root exit; explicit stop; one snapshot after assignment failure; skipped unmanaged or survival requests; no duplicate close after late callbacks. A live Windows test should spawn a root that immediately starts a grandchild, including a `cmd` wrapper and ConPTY client. Verify descendants die on job close and owner crash. Repeat inside a parent job and check permitted and denied breakaway. Test Node 24 and packaged Electron 44 on shipped architectures. Check that handles do not leak. No tests were run for this read-only research.

### 6. Cost and risk

An owned addon adds Windows native build time and review for handle ownership, quoting, stdio, and failure paths. A `.node` needs unpacking and packed load verification. A helper EXE also needs code signing and may get more antivirus scrutiny because it launches and kills processes. PowerShell `Add-Type` may face execution policy or AV checks and adds startup latency. Koffi reduces C++ code but moves Win32 ABI structs and pointer lifetime into TypeScript. `@seydx/win-job` is cheap for post-spawn assignment but does not meet the strong race requirement. These are engineering inferences from the APIs and the repository's packaging process.

## Proposed design

1. Add a host-neutral `IManagedProcessJob` or `IWindowsJobLauncher` port in `platform-core`. Return a process handle and assignment outcome together. Add an explicit `jobPolicy: 'kill-descendants' | 'allow-survival' | 'none'` request field. Keep Electron imports in host adapters. Preserve the `.cmd` resolution and launch guard contract at `process-spawner.interface.ts:16-17,98-102`.
2. Implement the Windows adapter in `platform-electron` first. Its native layer creates one private job per managed root, sets kill on close, creates the child suspended, assigns it, then resumes. Design pipe bridging before replacing a Node `ChildProcess` path. Define failure handling so a suspended child is always resumed or terminated.
3. Wire the adapter through `IProcessSpawner` for managed CLI and Codex roots. The off-thread worker must own or safely transfer the job lifetime. A main-thread handle that remains open after worker loss could leave descendants alive. Treat direct auth spawn and watcher `fork` as separate integration work because of stdio and IPC contracts.
4. Keep the existing snapshot path for assignment failure, unsupported launches, and non-Windows. Report native errors through the injected logger. Close a successful job on root `exit`, not only `close`.

## Proposed batches

Each batch has at most six files. The listed ownership is file-disjoint. These are future implementation batches.

1. **Contract:** `libs/backend/platform-core/src/interfaces/process-spawner.interface.ts`, a new job port under that interfaces folder, `libs/backend/platform-core/src/index.ts`, and one contract spec.
2. **Native adapter:** a new N-API source file, native build metadata, an adapter file in `libs/backend/platform-electron`, its registration file, and one focused spec. Exact new names depend on build layout.
3. **Packaging:** `apps/ptah-electron/electron-builder.yml`, `apps/ptah-electron/scripts/rebuild-native.js`, `apps/ptah-electron/scripts/verify-packed-native.js`, `apps/ptah-electron/project.json`, `apps/ptah-electron/package.json`, `package.json`.
4. **CLI spawn:** `libs/backend/agent-sdk/src/lib/helpers/off-thread-process-spawner.ts`, its worker implementation, `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.utils.ts`, and targeted specs.
5. **Other roots:** `libs/backend/codex-runtime/src/lib/codex-app-server-process.ts`, `libs/backend/codex-runtime/src/lib/codex-orphan-cleanup.ts`, `libs/backend/cli-engine/src/lib/platform/cli-platform-commands.ts`, `libs/backend/platform-cli/src/implementations/cli-workspace-watcher.ts`, and up to two focused specs.
6. **Live test:** one Windows process-tree integration spec, one packaged Electron smoke script, and fixtures, at most six files.

## Decisions

- Use an owned atomic N-API spawn path for the strong fix. `@seydx/win-job` is an optional interim improvement, not an equivalent fix.
- Use one private job per managed root. Do not place Electron main in a lane job.
- Retain snapshots on failure and for non-Windows behavior.
- Give daemon survival an explicit policy. Do not derive it from Windows `detached`.

## Open questions for the user

- Approve owned native Windows build and signing maintenance, or prefer the smaller post-spawn package change with its known race?
- Which Windows architectures are shipped? Live tests should match them.
- Which roots intentionally start a daemon that must survive? They need the explicit survival policy.
- Must the watcher retain exact Node `fork` IPC behavior, or may it stay on snapshot cleanup initially?

# Implementation Plan - TASK_2026_2252_a91c

## Inputs and constraints

Read `context.md:6-15`, the prior research report, both live Windows specs, the Electron packaging files, and the call sites below. The fixed choices are an owned N-API module, win32-x64, snapshot fallback on every native error, and watcher deferral. No code or tests were run. Skill discovery exposed no loader to this lane.

## Codebase evidence and recommendation

The snapshot runs after root exit (`libs/backend/platform-core/src/utils/windows-orphan-cleanup.ts:29-45`). It cannot link a grandchild after its intermediate parent exits, and there is another race between query and kill (`windows-orphan-descendants.ts:45-47,90-97`). Thus the window spans root launch through post-exit cleanup. A CLI that starts an instant intermediate child, a detached server, or a ConPTY client can leave that descendant behind. Host crash skips the JavaScript cleanup entirely. The current live test proves a still-visible detached tree (`windows-orphan-cleanup.live-windows.spec.ts:11-31,161-195`), not those cases.

Proceed with a small, default-off Electron trial. This race is material for long-lived managed agent roots. The addon adds C++ build, handle, quoting, pipe, signing and packing risk. Yet Electron already source-builds and verifies a native addon (`apps/ptah-electron/scripts/rebuild-native.js:5-19`; `verify-packed-native.js:249-306`). An EXE adds a separately signed launcher and IPC. Post-spawn assignment still races. Stop rollout if stream parity or packed runtime validation fails; snapshots remain the production path until then.

## Root policy

Policy is explicit `job` or `no-job`, never inferred from `detached` (`libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.utils.ts:319-335`). `job` means descendants die on root exit, stop, or host death.

| Root | Survival evidence | Policy |
| --- | --- | --- |
| Pi main RPC turn | The main run opts into orphan cleanup (`pi-cli.adapter.ts:458-465`). No surviving daemon is documented. | `job` |
| OpenCode standalone run turn | `--standalone` creates a private server from the run environment (`opencode-cli.adapter.ts:40-52`); main turn opts into cleanup (`:850-868`). | `job`, only when standalone is confirmed |
| OpenCode model/auth probes | They can start one shared background server that must survive the short probe (`opencode-cli.adapter.ts:481-501`); probe at `:433` has no cleanup opt-in. | `no-job` |
| Other CLI adapter main runs | Common helper passes explicit cleanup for long-lived calls (`cli-adapter.utils.ts:319-349`; `process-spawner.interface.ts:73-74`). No surviving daemon is established. | `job` only for audited managed main-run calls; probes `no-job` |
| Codex app server | One app-server child is owned by the process wrapper (`libs/backend/codex-runtime/src/lib/codex-app-server-process.ts:185-215`); exit calls descendant cleanup (`:730-735`). No daemon survival contract appears. | `job` |
| Agent SDK off-thread Claude root | SDK spawn sets cleanup true (`libs/backend/agent-sdk/src/lib/helpers/off-thread-process-spawner.ts:875-894`). Worker and inline stops target its tree (`:653-672,1024-1045`). | `job` |
| Auth command | Direct spawn has bounded timeout and tree stop (`libs/backend/cli-engine/src/lib/platform/cli-platform-commands.ts:146-167,175-215`). Provider commands may start external sign-in helpers; survival is not established. | `no-job`; retain snapshot |
| Workspace watcher | Fork needs IPC, stderr, and `unref` (`libs/backend/platform-cli/src/implementations/cli-workspace-watcher.ts:103-127`); exit uses snapshot (`:192-205`). Descendants are unwanted, but fork IPC parity is unproven. | `no-job` in this change; retain snapshot |

## Native module and packaging

Place the owned package in `libs/backend/windows-job-native`, tagged `scope:shared`, `type:util`. Keep C++ Win32/N-API and its typed loader there. `platform-core` has no native dependency. Use pinned `node-addon-api` and `node-gyp`; a Windows x64 developer runs its targeted build after install. Windows release CI builds the same source on `windows-latest`, before packaging. No third-party prebuilt download. N-API should allow one x64 binary for Node 24 and Electron 44, but both runtimes must load and exercise it.

Externalize the package in every Electron main and worker esbuild target that imports it (`apps/ptah-electron/project.json:30-41` and worker target entries). Keep it in generated runtime dependencies and prune rules. Unpack `node_modules/<package>/**` in `apps/ptah-electron/electron-builder.yml:52-70`; `npmRebuild: false` at `:17-23` makes this explicit build mandatory. Extend `verify-packed-native.js:249-306` to find the unpacked `.node`, compare its hash, load it under Electron, and perform one jobbed smoke spawn. Fail on absent, ASAR-trapped, wrong-architecture, or unloadable binaries. The release workflow has x64 Windows and native verify stages (`.github/workflows/publish-electron.yml:209-221,330-344,388-429`). Verify the signed installer smoke path; no new EXE is signed.

## Port and lifetime contract

Add `readonly windowsJobPolicy?: 'job' | 'no-job'` to `ProcessSpawnRequest`; omitted means `no-job`. Add type-only `IWindowsJobSpawner` in `platform-core`: `spawnSuspendedInJob(request: ProcessSpawnRequest): { handle: SpawnedProcessHandle; closeJob(): void }`. The Electron adapter binds it. VS Code and CLI adapters keep the existing spawn and snapshot path until integrated. Preserve cross-spawn `.cmd` resolution and the launch guard immediately before creation (`process-spawner.interface.ts:16-19,22-37,97-102`).

Native order: create private job with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`; prepare three inherited child stdio ends; call `CreateProcessW(CREATE_SUSPENDED)`; assign process; close unused child ends; resume primary thread. On any pre-resume failure terminate the suspended root and close every handle. Never resume an unassigned root as a native success. Provide async pipe read/write and process wait; map them to `SpawnedProcessHandle` streams, `whenSpawned`, `pid`, `kill`, `exit`, `close`, and `error` (`process-spawner.interface.ts:112-151`). `exit` follows root death; `close` follows pipe EOF. Honor stdin backpressure and end, stdout/stderr order per stream, and null streams for ignore/user console (`:77-96`). Keep raw `ChildProcess` callers on the old path until this handle is accepted.

The worker creates the job, duplicates a handle into main-thread ownership, sends an opaque id, and waits for main acknowledgment before resume. Close both copies once on root `exit`, explicit stop, worker loss, or host shutdown. Host death closes all OS handles. If acknowledgment times out, terminate the still-suspended root. The main copy prevents a lost worker from leaving descendants alive; the worker copy supports normal closure (`off-thread-process-spawner.ts:426-518,633-672`). Inline fallback follows the same registry rule.

On native load, guard, pipe, create, assignment, resume, or nested-job error: log the actual Error, prove any created root terminated, then use Node spawn with the existing snapshot cleanup. Never start a duplicate while native process state is unknown. Attempt a nested job when the host is already jobbed; fall back if assignment fails. Do not set `CREATE_BREAKAWAY_FROM_JOB`. Do not job Electron itself. Parent job UI restrictions remain external (`research-report.md:34-36`).

## Implementation batches

File sets are disjoint. Commands below are future targeted verification only. No batch runs a workspace-wide target.

1. **Contract and default-off gate; merge alone.** Write `libs/backend/platform-core/src/interfaces/process-spawner.interface.ts`, new `windows-job-spawner.interface.ts`, `libs/backend/platform-core/src/index.ts`, and one new contract spec. Verify with `npx jest --runInBand --coverage=false <contract spec>` and scoped diagnostics. Acceptance: omitted policy preserves current behavior. Live Windows tests: none changed.
2. **Native package.** Write only new files under `libs/backend/windows-job-native/`: `project.json`, `package.json`, `binding.gyp`, C++ source, typed loader, unit spec, live Windows spec. Verify targeted `node-gyp rebuild`, Jest unit spec, then the package live spec on x64. Acceptance: instant grandchild, root exit, explicit close, host crash, stdio, nested-job allowed/denied, and handle-count cases pass. No polling per process.
3. **Electron adapter and packaging.** Write new `libs/backend/platform-electron/src/implementations/windows-job-spawner.ts` and spec; existing `platform-electron/src/registration.ts`, `apps/ptah-electron/project.json`, `electron-builder.yml`, `scripts/rebuild-native.js`, `scripts/verify-packed-native.js`, `.github/workflows/publish-electron.yml`, root `package.json` and lockfile. Verify targeted Jest and scoped diagnostics; CI dry-run packaging plus packed verifier. Acceptance: x64 binary is unpacked and works under Electron 44. Live Windows test: adapter spec and packed smoke.
4. **Managed roots.** Write `libs/backend/agent-sdk/src/lib/helpers/off-thread-process-spawner.ts`, `off-thread-process-spawner-source.ts`, `off-thread-process-spawner.spec.ts`; `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.utils.ts`, `cli-adapter.live-windows.spec.ts`; `libs/backend/codex-runtime/src/lib/codex-app-server-process.ts` and one new focused spec. Verify changed Jest specs with `--coverage=false --maxWorkers=2`, scoped diagnostics, then the named live Windows spec. Acceptance: default-off stays on snapshots; opt-in Pi, Claude, standalone OpenCode, and Codex roots kill immediate grandchildren; worker loss closes jobs; probes do not. Live Windows tests changed: `cli-adapter.live-windows.spec.ts`; add a Codex live case in the new spec.
5. **Deferred follow-up.** No files in this release. Auth and watcher stay on snapshots (`cli-platform-commands.ts:146-167`; `cli-workspace-watcher.ts:103-127,192-205`). A later task can own them and `windows-orphan-cleanup.live-windows.spec.ts` after provider survival and fork IPC tests. Acceptance here: neither gets a job accidentally.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Gated owned addon | Stop; post-spawn assign; suspended spawn | Snapshot gap (`windows-orphan-descendants.ts:45-47,90-97`) and existing native packing (`electron-builder.yml:17-23,52-70`) | Yes, switch and fallback |
| Exempt shared-server probes | Blanket job; per-root job | `opencode-cli.adapter.ts:40-52,481-501` | Yes |
| Host duplicates job handle | Worker only; main only; both | Worker loss and main-thread stop (`off-thread-process-spawner.ts:426-518,653-672`) | Yes |
| Nested attempt, no breakaway | Breakaway; fail; nested | `research-report.md:34-36` | Yes |
| Defer auth and watcher | Migrate now; snapshots | Auth command boundary and watcher IPC cited above | Yes |

## Clarifications Needed

None. `context.md:6-15` fixes user-reserved architecture and release scope. Non-standalone OpenCode remains `no-job` until a live test proves its server does not need to survive.

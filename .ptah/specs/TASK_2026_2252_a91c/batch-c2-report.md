# Batch C2: CLI roots

Batch 2 is complete. Work stayed in the requested worktree. No commit was made.

## Files changed

All source paths below start at `libs/backend/cli-agent-runtime/src/lib/cli-agents/`.

- `cli-adapters/cli-adapter.utils.ts`: Add explicit policy and optional inline dependencies. Forward policy to the spawner. Assign immediately after inline spawn. Close the handle on stop.
- `cli-adapters/cli-windows-job.ts`: New small helper. Apply the shared gate. Retain the job in listener closures. Close once. Log native errors with an Error object. Keep the original root.
- `cli-adapters/pi-cli.adapter.ts`: Set main runs to `job`. Accept optional inline dependencies.
- `cli-adapters/copilot-sdk.adapter.ts`: Set main runs to `job`. Accept optional inline dependencies.
- `cli-adapters/opencode-cli.adapter.ts`: Carry policy from the confirmed standalone result to every turn. Accept optional inline dependencies.
- `cli-adapters/antigravity-cli.adapter.ts`: Make the conservative main-run `no-job` policy explicit.
- `cli-adapters/acp/acp-process-transport.ts`: Make the conservative main-run `no-job` policy explicit.
- `cli-detection.service.ts`: Inject the assigner and workspace provider as optional dependencies. Pass the dependency object through existing adapter constructors.
- `cli-adapters/cli-adapter.utils.spec.ts`: Cover forwarding, omitted policy, explicit no-job, switch off, success, exit, stop, real Error failure, one spawn, and snapshot cleanup after success and failure.
- `cli-adapters/pi-cli.adapter.spec.ts`, `cli-adapters/copilot-sdk.adapter.spec.ts`, `cli-adapters/opencode-cli.adapter.spec.ts`: Assert main-run policy. Assert an OpenCode model probe stays no-job.
- `cli-adapters/cli-adapter.live-windows.spec.ts`: Add two real native inline tests. The root starts the descendant tree immediately. Descendants are detached. Test root exit and explicit handle stop. Disable snapshot cleanup in these two cases so it cannot mask a job failure. Keep marker and taskkill cleanup.

## Spawn call audit

Paths in this table start at `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/`. These are all production calls found by `rg`. The function declaration is not a call.

| File:line | Purpose | Policy | Evidence |
| --- | --- | --- | --- |
| `pi-cli.adapter.ts:459` | Main persistent Pi session | job | The adapter owns the child and its stdin protocol. Stop and session completion end that root. |
| `copilot-sdk.adapter.ts:378` | Main Copilot prompt run | job | The adapter starts the CLI with prompt and per-run MCP configuration. It owns completion and tree stop. No surviving daemon is specified in this path. |
| `opencode-cli.adapter.ts:865` | Main turn and later resumed turns | job only with confirmed standalone; otherwise no-job | `supportsStandalone` must return true before baseArgs receives `--standalone`. The same result sets the turn launch policy at line 784. No policy is inferred from argv, detached, or cleanup flags. |
| `opencode-cli.adapter.ts:435` | Model and authentication probe helper | no-job, omitted default | Short probe. It does not own a managed session root. |
| `antigravity-cli.adapter.ts:522` | Help and stream-input capability probe | no-job, omitted default | Short probe. |
| `antigravity-cli.adapter.ts:592` | Model listing probe | no-job, omitted default | Short probe. |
| `antigravity-cli.adapter.ts:858` | Main Antigravity print run | no-job, explicit | The adapter writes shared editor MCP configuration and supports external editor sessions. The source does not establish that every editor helper can die with this root. |
| `acp/acp-process-transport.ts:455` | Main generic ACP agent transport | no-job, explicit | The transport accepts an arbitrary command and args. The byte-stream contract does not define daemon or helper lifetime for every vendor. |
| `cli-adapter.utils.ts:400` | Shared CLI version probe | no-job, omitted default | Short version probe used by detection. |
| `cli-stdout-probe.ts:41` | Shared help, auth, model and other stdout probes | no-job, omitted default | Short one-shot probe. This includes OpenCode standalone capability detection. The file was read but not changed. |

## Inline dependencies

The production path is `CliDetectionService` -> Pi, Copilot or OpenCode constructor -> main-run `spawnCli` options -> `assignCliWindowsJob`.

`CliDetectionService` uses optional injection for `PLATFORM_TOKENS.WINDOWS_JOB_ASSIGNER` and `PLATFORM_TOKENS.WORKSPACE_PROVIDER`. No host binding was added. Hosts without an assigner remain valid. The object carries the assigner, injected logger, and a function that reads `ptah.agentOrchestration.windowsJobs` at spawn time. The helper reads `PTAH_WINDOWS_JOBS` at spawn time. The shared gate requires win32, x64, explicit job policy, and either switch source.

The spawner branch only forwards policy. It does not call the inline helper. The spawner owns its gate and handle. The inline branch starts one process with cross-spawn, then assigns before any await. The returned wrapper retains the close closure. An exit listener also retains it. Close is idempotent. Snapshot cleanup still runs after success and failure. No binary path or environment value is logged.

## Checks

Checks ran one at a time. No Nx, build, serve, dev, e2e, package or workspace verification command was run.

| Check | Real result |
| --- | --- |
| `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath` with the seven paths listed below | PASS. 7 suites and 375 tests passed. No skipped tests were reported. Elapsed Jest time: 68.855 seconds. |
| Native Windows live cases in that run | PASS. Root exit and explicit stop both killed the immediate detached descendant tree through inline spawnCli and a real NativeWindowsJobAssigner. The binary exists at `libs/backend/windows-job-native/build/Release/windows_job.node`. The suite gate checks win32, the skip environment variable, and binary presence. |
| `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json` | PASS, exit 0. An earlier run found an incorrect workspace token name in new plumbing. It was corrected to WORKSPACE_PROVIDER before this passing run. |
| `npx eslint` on the live spec alone | Exit 0. The public native assigner alias was accepted. The module-boundary rule warned that no cached project graph was available. |
| `npx eslint` on all 13 changed or new TypeScript files | Exit 0. 0 errors and 56 warnings. Warnings concern existing file size, non-null assertions and empty callbacks. The module-boundary rule was skipped because no cached graph was available. |
| Ptah diagnostics on the helper and detection service | Incomplete. The tool timed out after 45 seconds. Native focused tsc supplied the check instead. |

Jest paths, relative to `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/`:

- `cli-adapter.utils.spec.ts`
- `cli-adapter.live-windows.spec.ts`
- `pi-cli.adapter.spec.ts`
- `opencode-cli.adapter.spec.ts`
- `copilot-sdk.adapter.spec.ts`
- `antigravity-cli.adapter.spec.ts`
- `acp/acp-process-transport.spec.ts`

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Pass an optional dependency object through existing constructors | Constructor object; broad host registration; inline snapshot only | Existing CliDetectionService creates these adapters and already supplies the spawner and logger. Optional token injection needs no host change. | Yes |
| Carry OpenCode policy on OpencodeTurnLaunch | Carry confirmed result; infer from detached or argv | The same confirmed standalone result controls flag insertion and every turn launch. | Yes |
| Keep Antigravity no-job | Job; no-job | Shared editor configuration and external sessions do not establish helper lifetime. Requirement 2 permits this conservative result. | Yes, after vendor lifetime evidence |
| Keep generic ACP no-job | Job for every command; no-job | Generic command and byte-stream contracts do not promise private helper lifetime. | Yes, after vendor-specific ownership evidence |
| Keep snapshot cleanup after assignment | Always keep; skip after success | The accepted Node spawn and same-tick assignment sequence has a gap. Unit tests cover cleanup after both success and failure. | Yes |
| Use public native assigner alias in the live spec | Public alias; load native file by path | Focused ESLint exited 0. Real Windows tests passed with the alias. Module-boundary validation remains limited by the missing cached graph. | Yes |

## Unmet requirements

No implementation requirement remains open. Antigravity and ACP use the conservative policy permitted by requirement 2.

Validation limits: ESLint could not enforce module boundaries without a cached graph. Ptah diagnostics timed out. Focused TypeScript and Jest checks passed. No installed matching skill was returned by skill discovery. The CLI did not expose a skill loader, so no matching skill could be loaded through its skill mechanism. Ptah dependency discovery was used before edits; native rg and focused file reads supplied source details.

Pre-existing uncommitted batch 1 and batch 3 changes remain untouched. They include Electron composition, agent-sdk helpers and registration, codex-runtime, platform-core, platform-electron, and the batch 1 and batch 3 reports. This lane did not write those files. No concurrent changes appeared inside the batch 2 write set during this run.

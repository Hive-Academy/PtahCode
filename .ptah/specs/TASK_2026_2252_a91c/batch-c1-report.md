# Batch C1 report

## Files changed
- `libs/backend/platform-core/src/utils/windows-job-gate.ts` and its spec: pure Windows x64, switch, and policy gate.
- `libs/backend/platform-core/src/index.ts` and `file-settings-keys.ts`: public gate export and file setting with a false default.
- `libs/backend/platform-electron/src/implementations/electron-windows-job-assigner.ts` and its index: shared absolute binary path resolver.
- `libs/backend/agent-sdk/src/lib/helpers/off-thread-process-spawner.ts`, `off-thread-process-spawner-source.ts`, `spawn-worker-pool.ts`, and the spawner spec: job assignment, typed worker result, handle lifetime, and tests.
- `libs/backend/agent-sdk/src/lib/di/register.ts` and `apps/ptah-electron/src/di/phase-2-libraries.ts`: optional Electron job configuration.

## Injection shape
Electron passes an assigner, resolved binary path, and live boolean setting reader through `registerSdkServices` options. The registration configures the singleton spawner. Other hosts omit the option. The spawner reads the setting and environment switch on every spawn.

## Worker message shape
The spawn message has optional `windowsJobBinaryPath` and `windowsJobPolicy: 'job'` only when the gate opens. The spawned reply has an optional `job` result: `{ ok: true }` or `{ ok: false, message, stack? }`. The worker loads the absolute binary path, calls `createJobForPid` in the spawn turn, and retains the raw handle. It closes the handle on child exit, explicit kill, replacement, and worker exit. The host logs the result through Logger. The inline path uses the injected assigner and closes its handle on exit, kill, and spawner disposal. Snapshot cleanup remains active.

## Checks
- Agent SDK spawner Jest: passed, 73 tests.
- Platform core gate Jest: passed, 2 tests.
- Agent SDK TypeScript: passed.
- Platform core TypeScript: passed.
- Electron app TypeScript: passed.
- ESLint on changed TypeScript files: passed with no errors. Existing file length warnings remain. The Nx boundary rule was skipped because no cached project graph was available.
- Ptah diagnostics: unavailable after its 45 second timeout. The focused TypeScript checks above passed.

## Decisions
| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Use registration options to configure the singleton spawner | New DI token or public class export | Keeps optional dependencies absent in VS Code and CLI. `registerSdkServices` is already the SDK composition entry. | Yes |
| Keep the switch out of advanced settings UI | Add UI catalogue entry or use file setting only | This is an internal off by default rollout switch. The file settings registry accepts the key and false default. | Yes |
| Send a job result in `spawned` | Separate message or result field | Assignment runs before the first `spawned` post and uses one root. | Yes |

## Unmet requirements and limits
The native Windows binary could not run in this environment. Tests cover the gate, worker message, and inline assigner behavior. A real Windows native assignment still needs a Windows x64 smoke check. Ptah diagnostics timed out, but all three focused TypeScript checks passed. No matching local skill was available from skill discovery. Concurrent `codex-runtime` edits were present and were left untouched.

# Backend implementation — `TASK_2026_2322_4ba4`, batch 2

**Verdict**: Batch 2 is complete. All three verify commands pass, and the eight required specs pass (187 tests).

**Pre-check A1**: `git log main --oneline -5` (head `32d76f406`) and a grep of the last 40 main commits show no TASK_2026_2320 merge. A1 holds.

**Tasks completed**: 2.1, 2.2

## Files

CA = `D:\projects\PtahCode\.claude-worktrees\agy-acp-only\libs\backend\cli-agent-runtime\src\lib\cli-agents`

- REWRITTEN `CA\cli-adapters\antigravity-cli.adapter.ts`: ACP-only, cut from 2151 lines to 605.
- MODIFIED `CA\cli-adapters\antigravity-acp-lane.ts`: removed the override, the cooldown, the help helpers and the seam `transport`. Reworded the header and the `now` doc. The manifest is unchanged.
- MODIFIED `CA\cli-detection.service.ts`: `new AntigravityCliAdapter(this.spawner, this.logger)`.
- MODIFIED `CA\lane-spawn-policy.ts`: `'antigravity'` moved to the no-argv union and the no-argv case. Deleted `antigravityArgv`. Reworded the `mapEffortToAgy` doc to "agy ACP `thought_level`".
- DELETED `CA\cli-adapters\antigravity-result-diagnostics.ts`
- DELETED `CA\cli-adapters\antigravity-result-diagnostics.spec.ts`
- DELETED `CA\cli-adapters\antigravity-cli.adapter.mcp.spec.ts`
- REWRITTEN `CA\cli-adapters\antigravity-cli.adapter.spec.ts`: it now covers detect, capabilities, listModels, parseOutput and agyModelId. Cut from 1797 lines to 431.
- MODIFIED `CA\cli-adapters\antigravity-cli.adapter.acp.spec.ts`: version floor, ACP lane, and the ported model-id cache tests.
- MODIFIED `CA\cli-adapters\antigravity-cli.adapter.acp.live.spec.ts`: D8 constructor.
- MODIFIED `CA\cli-adapters\antigravity-cli.adapter.sign-in.spec.ts`: D8 constructor.

The deletions are unstaged working-tree deletions. I ran no commit and left nothing staged.

## Task 2.1 evidence

- **Constructor (D8)**: `(spawner?, logger?, acp: AntigravityAcpSeam = {}, readSignIn = readCachedAgySignIn)`.
- **`capabilities()`**: always returns `antigravityAcpManifest(this.roleChannel)`.
- **`detect()`**: `resolveCliPath`, then `probeCliVersion`, then `probeAcp(binary, version)`. The `probeStreamJsonInput` call is gone, so detection spawns no `--help`.
- **`probeAcp`**: checks only the version.
  - It keeps definite answers per binary (`acpFloorByBinary`), shares one probe in flight (`acpProbesInFlight`) and still honours the `acp.probe` seam.
  - It has no help read, no cooldown and no spawner check.
  - An unreadable version returns `undefined`, is not cached and is logged at warn.
  - A version below the floor gets an `info` log with `{ version, minVersion }`.
  - A version it reads is stored in `versionByBinary`, which the D2 message uses.
- **`runSdk`**: takes `binary = options.binaryPath ?? 'agy'`.
  - If `probeAcp` returns `false`, it throws the D2 message: `Antigravity lanes need agy ${AGY_ACP_MIN_VERSION} or later (installed: <version>). Update agy and try again.` This happens before any spawn, MCP use or folder write.
  - Otherwise it calls `runAcp(options, binary)`.
  - If an injected probe answers `false` there is no stored version, and the message says `installed: unknown`.
- **`runAcp`**: unchanged except that the `fallBack` parameter and the `fallback` config are gone.
- **Kept unchanged**: `ensureTokensFresh`, `parseOutput`, `geminiRoot`, `listModels`, `readModels`, `currentModelIds`, `probeModels`, `ensureFolderTrusted`, `parseAgyModels`, `agyModelId`, `AgyEffort`/`isAgyEffort`/`AGY_EFFORT_SUFFIX`, the model-id constants and the seam `now`.
- **Doc-only edits**:
  - The `agyModelId` doc now names only the ACP `model` option.
  - The comment in the `ensureFolderTrusted` catch no longer cites `--dangerously-skip-permissions`. It is now tagged `degradation-audit: optional-capability`, the tag this file already uses.
- **Imports**: the adapter no longer imports harness-sync, `zod`, the diagnostics module, `buildTaskPrompt`, `buildArgvTaskPrompt`, `resolveDirectSpawn`, `assertCommandLineWithinLimit`, `createBufferedEmitter`, `classifyCliStderr`, `laneMcpAuthUrl`, `ptahMcpServerUrl`, `MCP_ATTACHMENT_TIMEOUT_MS`, `completedTurnTelemetry`, `turnIdentity` or the lane-policy argv helpers. It still imports `probeCliVersion`, which detection and the probe use.
- **Docs**: the file header and the `supportsMcp` doc describe the ACP-only adapter.
- **No timers or writes**: no new timers. Nothing writes `mcp_config.json`.

## Task 2.2 evidence

**`antigravity-cli.adapter.spec.ts`** keeps:
- `detect()`: installed, not installed, and a new "no `--help` spawn at detection" case. The two help-probe cases are dropped. `messagingMode` is now `interrupt`, the ACP manifest's best mode.
- `listModels()` (all 11 cases), `parseOutput` and `agyModelId`.
- New case: `capabilities()` equals `antigravityAcpManifest('task-prompt')` on a fresh adapter with no probe.

It deletes the argv, role delivery, stream-json parsing, session id and input-format blocks.

**`antigravity-cli.adapter.acp.spec.ts`**:
- Detection block (replaces "transport choice"):
  - It reads only `--version` and declares the ACP manifest (spawnCli is never called).
  - An agy below the floor is still reported installed.
  - A lane after a below-floor detection rejects with D2, from the cached detection answer, and the transport factory is never called.
- ACP lane, "version floor":
  - It runs ACP at or above 1.5.1 after one `--version` read and no `--help`. The test asserts the spawn argv `['acp','--dangerously-skip-permissions','--add-dir',…]`, that every spawnCli argv is `['models']`, and that a second lane makes no second read.
  - Below the floor it rejects with D2. Nothing spawns, `~/.gemini` is not written, and the info log is asserted.
  - An unreadable version is not cached: the lane runs ACP and logs a warn, and the second lane reads the version again.
  - An injected probe that answers `undefined` is re-run, two concurrent lanes share one probe, and a definite answer is cached.
- "a session that never opens fails the lane with one ACP error and no stream-json spawn": `initialize` returns an error, `done` resolves to 1, there is one error segment, and the only spawnCli argv is `['models']`.
- "an unknown resume id starts a new session with one info": `session/resume` and `session/load` both answer not-found. The lane emits exactly one `could not resume …; started a new session` info, uses the `session/new` id, emits no error and resolves 0.
- Model-id cache (review F2): all nine cases are ported. Each asserts the value sent in `session/set_config_option` `model`, or the probe count, not argv.
  - `:556`: an `id<TAB>name` value is mapped and a warn is logged.
  - `:584`: the saved effort is kept.
  - `:660`: the chosen effort goes through the closest base. I added `claude-opus-5-5-*` lines to this spec's `AGY_MODELS_STDOUT` for this case.
  - `:597`: no re-probe after a failed probe.
  - `:611`: live ids are scoped per binary.
  - `:637`: a clean empty refresh drops the earlier ids.
  - `:716`: one probe per freshness window, shared.
  - `:726`: a re-probe after 10 minutes, using the seam `now`.
  - `:740`: no probe when no model is chosen.
- Describe `:687` is renamed "ACP quota and rate-limit errors keep their wording", and its `viaStreamJson` variable is now `fromWording`. Title `:516` is now "sends a retired saved id as a live id of the closest base".
- The override, fallback and cooldown describes are deleted.
- The `startLane` helper is split into `laneRig` (one adapter, with every agent, transport and spawn it creates), `runLane` and `finishLane`, so one adapter can run several lanes. The logger is injected through `LaneSetup.logger`.

**Live and sign-in specs**: updated to the D8 signature.

## Acceptance checks

- `git grep -E "startupChildStopDeadlineMs|PTAH_AGY_TRANSPORT|readAgyTransportOverride|agyHelpListsAcp|agyModelWithEffort|antigravity-result-diagnostics|redactAgyText|antigravityArgv|streamJsonProbe" -- libs apps` finds nothing (exit 1).
- The adapter source has no `harness-sync`, `zod`, `fallback`, `--print`, `stream-json`, `--input-format` or `--help`.
- `git diff` of `antigravity-acp-lane.ts` has hunks only at old lines 1-8, 14-49, 62-66, 68-71 and 75-81. The manifest (old lines 87-139) has no hunk.

## Verification

All logs are under `D:\projects\PtahCode\.claude-worktrees\agy-acp-only\.ptah\tmp\`.

| Command | Result | Log |
| --- | --- | --- |
| `npm run verify -- --related -p @ptah-extension/cli-agent-runtime` | exit 0, `NX 1 task: 1 succeeded` (2m 32s, cache 0/1) | `b2-related.log` |
| `npm run verify -- -t lint,typecheck -p @ptah-extension/cli-agent-runtime` | exit 0, `NX 2 tasks: 2 succeeded`, no lint warnings or errors in the log | `b2-lint-typecheck.log` |
| `npm run verify -- -t typecheck -p @ptah-extension/cli-engine,ptah-electron` | exit 0, `NX 2 tasks: 2 succeeded` (the D8 change on the barrel-exported class compiles in both hosts) | `b2-typecheck-hosts.log` |
| Focused `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath` on the eight required specs | exit 0, `Test Suites: 8 passed, 8 total`, `Tests: 187 passed, 187 total` | `b2-specs.log` |

Nx did not inline the Jest output of the `--related` run. I ran the focused command so there is per-suite evidence for the eight specs the batch names.

## Risks and edge cases

- **Old resume ids**: no adapter code is needed. The lane handle's `attachFailure: 'new-session'` handles them, and the new ACP spec case pins it.
- **agy below 1.5.1**: `runSdk` rejects with the D2 message and the installed version, before any spawn or folder write. Detection still reports it installed. The manager revokes the credential and rethrows; that file was not changed.
- **ACP open failure**: one error segment, `done` resolves 1, and no stream-json spawn. Pinned by the spec.
- **Unreadable version (D3)**: not cached, the lane tries ACP, and a warn is logged.
- **Barrel export (F3)**: the class export is unchanged. The host typecheck passes.
- **`lane-spawn-policy.spec.ts`**: it had no antigravity argv cases, so it needed no change. It passes.

## Decisions

- **Where D2 gets the installed version.** Options: return the version from the probe, or keep a per-binary map. I chose the map (`versionByBinary`), filled by the production probe. It keeps `probeAcp`'s `boolean | undefined` contract and the seam shape. With an injected probe the message says `installed: unknown`. Reversible.

## Plan deviations

- None to the contract.
- The detect spec's expected `messagingMode` changes from `queue` to `interrupt`. This follows from `capabilities()` now always returning the ACP manifest.

## Out-of-scope observations

- `CA\cli-adapters\provider-session\provider-session-lane-handle.spec.ts:1842` still asserts the stream-json fallback wording. Batch 3 owns it. The lane-handle `fallback` option is untouched.
- The `harness-sync` files in `git status` were changed by Batch 6. I did not touch them.

# Implementation Plan - TASK_2026_2322_4ba4

> **Revision 1** (2026-11-23), in response to `implementation-plan-review.md` F1-F10:
>
> - **F1.** Component 6 ports stderr secret and lane-token redaction onto the ACP lane handle (orchestrator decision).
> - **F2.** The model-id cache tests are ported to the ACP spec.
> - **F3.** The barrel evidence row is corrected.
> - **F4.** D5 states the accepted risk and logs the removed shape.
> - **F5.** The harness-sync and comment fixes are added as component 5b.
> - **F6.** Each group has a scoped verify command and named specs.
> - **F7.** The relied-on files are listed, and the 2320 obsolete rows are noted.
> - **F8.** The `agyModelWithEffort` test wording is fixed.
> - **F9.** More lane-handle cases are kept.
> - **F10.** `provider-session-lane-handle.ts:233` is cited.

Remove the Antigravity (agy) stream-json transport. Every agy lane runs on `agy acp`.

Paths are relative to the worktree `D:\projects\PtahCode\.claude-worktrees\agy-acp-only`.
`CA` stands for `libs/backend/cli-agent-runtime/src/lib/cli-agents`.

## Inputs and constraints

- Requirements used: `.ptah/specs/TASK_2026_2322_4ba4/context.md`, `task.md`. The capability
  trace is in `parity-inventory.md`, in the same folder, and this plan follows it row by row.
- Corrections applied: none.
- Design handoff used: none. No UI changes.
- Missing decision-critical input: no `task-description.md`. The user's words in
  `context.md` ("just remove completely") settle the scope. Two follow-on behaviours that ACP
  cannot keep go to the user as Proposed Removals P1 and P2 in `parity-inventory.md`. The
  recommendation for both is to approve. The plan assumes approval. If either is rejected,
  stream-json has to be kept, and this plan is void.
- Parallel task: TASK_2026_2320_lnpar edits the agy ACP lane, lane capabilities and per-turn
  model and effort. This task changes only what the removal needs in those files. It does
  not change the ACP manifest (`antigravity-acp-lane.ts:92-139`), the profile's
  model/effort/mode logic, or `continue`/`interrupt` semantics. The shared files are listed
  in `parity-inventory.md` § "Shared files with TASK_2026_2320_lnpar". This task merges first.
- Skills: no Nx project, tag or boundary change, so `nx-workspace-architect` was not needed.
  The code uses no NestJS resilience patterns, so `resilient-nestjs-patterns` was not loaded.

## Codebase evidence

| Evidence | Location | Architectural implication |
| --- | --- | --- |
| The adapter holds both transports. `runSdk` probes ACP, otherwise it runs stream-json, with a cooldown and an env override | `CA/cli-adapters/antigravity-cli.adapter.ts:1281-1298` | Only `runSdk`'s choice changes; `runAcp` (`:903-954`) is already the full ACP lane |
| stream-json code: schemas `:185-261`, turn deferred `:263-284`, argv `:407-446`, `formatUsage`/`withLeadingInfo` `:448-474`, MCP lock `:481-502`, manifest `:672-726`, help/input probes `:728-812`, fallback `:956-978`, MCP file writer `:1188-1279`, run body `:1305-1945`, event handlers `:1946-2151` | adapter | All of it is deleted |
| `runAcp` keeps the folder trust write, `agyModelId` with live ids, and `antigravitySkipsPermissions` | adapter:903-954 | Reuse it unchanged, minus the `fallBack` parameter and the `fallback` config |
| The ACP manifest supports continuation, interrupt and resume. Steer and `ask` are unsupported | `CA/cli-adapters/antigravity-acp-lane.ts:92-139` | `capabilities()` returns it unconditionally |
| Override, cooldown and help helpers: `AGY_TRANSPORT_ENV`, `readAgyTransportOverride`, `AgyTransportOverride`, `AGY_ACP_FAILURE_COOLDOWN_MS`, `agyHelpListsAcp` | acp-lane:14-48, 62-65 | Delete. Keep `AGY_ACP_MIN_VERSION`, `meetsAgyAcpFloor`, the `AntigravityAcpSeam` (minus `transport`) and the manifest |
| The seam has `probe`, `transport`, `now`, `transportFactory` | acp-lane:73-85 | `now` is still used by the model-id cache (adapter:1029-1058), so it stays. `transport` is deleted |
| The lane handle has a `fallback` option, used only by agy. Grok passes none | `CA/cli-adapters/provider-session/provider-session-lane-handle.ts:82-110, 147-167, 223, 370-441, 465-468, 495, 515-519, 545, 581-604`; `CA/cli-adapters/grok-cli.adapter.ts:272` | Delete the fallback, hold-setup and delegate machinery. Grok's behaviour does not change |
| The lane handle fails at once without a spawner | lane-handle:128-140 | No new "no spawner" path is needed in the adapter |
| Both hosts inject the spawner | `CA/cli-detection.service.ts:124-125, 187-190`; `libs/backend/cli-engine/src/lib/container.ts:744`; `apps/ptah-electron/src/di/phase-2-libraries.ts:261` | ACP can always spawn in Electron and in the benchmark |
| A failed ACP resume starts a new session with an info notice. Lanes hard-code `attachFailure: 'new-session'` | `CA/cli-adapters/provider-session/provider-session-lane-handle.ts:233`; `libs/backend/acp-runtime/src/lib/acp-session-runtime.ts:1207-1229` (runtime default `:1765`) | Resume ids persisted by older stream-json lanes are safe |
| ACP usage per turn comes from `PromptResponse.usage` / `usage_update` | `libs/backend/acp-runtime/src/lib/acp-session-helpers.ts:25-70`; lane-handle:600-601 | Telemetry parity needs no new code |
| A runSdk rejection is revoked and rethrown to the spawn caller | `CA/agent-process-manager.service.ts:1556-1570` | The below-floor case can throw a plain `Error` with an actionable message |
| The argv policy for antigravity (`--mode plan` / `accept-edits`) is read only by the stream-json path | `CA/lane-spawn-policy.ts:54-57, 156-162, 252-266`; consumers of `.argv`: adapter:1335, copilot-sdk.adapter.ts:258, opencode-cli.adapter.ts:775 | Move `'antigravity'` to the no-argv union branch and delete `antigravityArgv` |
| `buildArgvTaskPrompt`, `resolveDirectSpawn`, `assertCommandLineWithinLimit`, `probeCliVersion` are also used by copilot, opencode, pi and grok | grep over `CA/cli-adapters` | Keep the utilities; remove only the adapter's imports |
| `antigravity-result-diagnostics.ts` is imported only by the adapter's stream-json code. Its `redactAgyText` also protects stderr: adapter:1690-1695 scrubs secrets and `options.mcpToken` from each stderr line (test `antigravity-cli.adapter.spec.ts:1570`) | adapter:143-148, 1690-1761, 2142; `antigravity-result-diagnostics.ts:1-13` | Delete the `formatAgy*` code. Move the redaction to the lane handle (component 6) |
| The ACP lane handle emits raw stderr. Every provider-session lane sends `Authorization: Bearer <mcpToken>` in `session/new` | lane-handle:184-187 (`diagnostic` → `output.emit`, `segment.emit`); `CA/cli-adapters/provider-session/lane-mcp-attachments.ts:19-28` | Redaction belongs in the shared handle, so it covers agy and Grok |
| The retired-slot sweep keeps lane-shaped `ptah` entries because "a stream-json lane that is running" may own them | `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/retired-ptah-mcp-slots.ts:22-34, 65-66, 102-110` | With no writer left, a crash leftover is never cleaned. The sweep must also take the lane shape |
| The `SdkHandle.mcpConfigWriteFailed` contract and the manager's warning | `CA/cli-adapters/cli-adapter.interface.ts:239`; `CA/agent-process-manager.service.ts:1994-1995` | Kept as a generic contract (D6) |
| The adapter IS exported from the lib barrel. No code outside the lib constructs it (only class mocks: `cli-detection.service.spec.ts:53`, `codex-native-selection.spec.ts:32`) | `CA/cli-adapters/index.ts:25` → `CA/index.ts:66` → `libs/backend/cli-agent-runtime/src/index.ts:1` | Keep the export. The D8 constructor change is a public-signature change with no external caller. Typecheck `ptah-electron` and `cli-engine` to confirm it |
| No settings key, DB column or UI references the agy transport | grep for `agyTransport` and `stream-json` in libs/frontend, persistence and settings: no hits | The only "saved preference" is the `PTAH_AGY_TRANSPORT` env var |

## Architecture decision

- **Chosen approach.** Keep `AntigravityCliAdapter` as the single agy adapter, with one
  transport: the ACP lane it already builds through `createProviderSessionLaneHandle` and
  `antigravityAcpProfile`. `runSdk` becomes three steps: the version-floor check, the model id
  resolution, then the lane handle. Everything that exists only for stream-json is deleted,
  including the lane-handle fallback seam, its only user. The one job that stream-json did
  implicitly, cleaning a crashed lane's `ptah` entry from `~/.gemini/config/mcp_config.json`,
  moves into the retired-slot sweep in vscode-lm-tools.
- **Rationale.** The user approved removing the transport. The ACP lane already covers
  continuation, interrupt (new), resume, MCP, usage, modes, model ids, trust and role delivery
  (parity-inventory §1-§3). Keeping one adapter class leaves the detection registration,
  limit-reader manifest, sign-in check and `agy models` listing exactly where their consumers
  expect them.
- **Rejected alternatives.**
  - A new `AntigravityAcpAdapter` class replacing the old one. It renames a registry entry
    and churns every spec for no behaviour gain, and it collides harder with TASK_2026_2320.
  - Keeping the `fallback` seam in the lane handle "for future vendors". There is no second
    user, and the repository rule is to delete unused code. It also keeps the hold-setup
    buffering on Grok's path.
  - Marking agy below 1.5.1 as not installed in detection. The user would see agy vanish
    with no reason. A spawn-time error that says "update agy" is actionable.
  - Keeping `PTAH_AGY_TRANSPORT` and warning on `stream-json`. That is a shim for a dev-only
    escape hatch. Ignoring the variable already gives the safe result (ACP).
- **Assumptions.**
  - A1: TASK_2026_2320 has not merged before this task. Check `git log main` for its
    commits before implementing. If it merged first:
    - rebase the shared files onto its version and keep this plan's deletions;
    - re-verify the behaviour this task relies on in the 2320 files it does not edit
      (`acp-session-runtime.ts` resume fallback, the `SdkHandle` members in
      `cli-adapter.interface.ts`, `grok-cli.adapter.ts`'s lane-handle call, and the manager's
      revoke and rethrow). The table is in `parity-inventory.md` § "TASK_2026_2320 files this
      task relies on but does not edit".
    TASK_2026_2320 `task-description.md:68` and `:87` hold agy stream-json rows that become
    obsolete. That coordinator updates them; this task does not edit the 2320 worktree.
  - A2: The lane handle's error for a failed `initialize` or `session/new` already includes the
    sign-in hint where it applies (`antigravity-acp-profile.ts:53`, `SIGN_IN_HINT`). Check
    that the existing acp spec "does not fall back from a missing sign-in" (lane-handle spec
    `:1745`) asserts the hint before deleting it, and keep that assertion as a plain
    setup-failure test.
- **Effect on existing code.** About 1,500 lines of the adapter and about 2,400 spec lines
  are deleted. Grok's lane-handle path loses unused branches. The manager, manifests, the
  ACP profile logic, the hosts, cli-engine and platform-cli do not change behaviour.

### Decisions

| # | Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- | --- |
| D1 | `PTAH_AGY_TRANSPORT` is no longer read. Any value, `stream-json` included, runs ACP. No warning | Read it and warn; read it and honour `acp` only; drop it | acp-lane:14-37 shows it is environment-only. No settings or UI reference exists (grep) | yes |
| D2 | agy below `AGY_ACP_MIN_VERSION` fails the spawn: `runSdk` rejects with `Antigravity lanes need agy ${AGY_ACP_MIN_VERSION} or later (installed: <version>). Update agy and try again.` Detection still reports it installed | Not-installed detection; a silent attempt | manager:1556-1570 surfaces rejections; acp-lane:11-12, 50-60 | yes (Proposed Removal P1) |
| D3 | The `agy --help` read is dropped completely: no input-format probe and no "`acp` listed" check. A version string that cannot be read is not cached, and the lane tries ACP; the handshake reports a real failure | Keep the help check | `--help` existed for stream-json (adapter:728-751). The ACP check reused that text (adapter:883-892). Each read is an 8 s-bounded spawn at detection | yes |
| D4 | The lane-handle `fallback` option, `ProviderSessionLaneFallback`, hold-setup buffering, `setupErrors`, `delegate`/`delegating` and `MAX_HELD_SETUP_ITEMS` are deleted | Keep as an unused seam | Only agy passes `fallback` (grep: adapter:937-944) | yes |
| D5 | The retired-slot sweep also removes a `ptah` entry whose URL has the lane shape `http://localhost:{port}/auth/{43}/agent/{id}[/workspace/{enc}]` or `http://localhost:{port}/agent/{id}[/workspace/{enc}]` (remote, no `command`, no `headers`). **Accepted risk (F4):** an older Ptah build running a stream-json lane at the same moment as the sweep loses its entry. The header text this replaces (`retired-ptah-mcp-slots.ts:31-33`) protected exactly that case. Accepted because it needs two Ptah builds on one machine during the upgrade window; that lane loses only its Ptah MCP tools for the rest of the run, and it restores its prior entry when it ends. Mitigation: the removal log line names the removed shape (`lane` or `persistent`), so a report can be traced | Leave leftovers forever; a separate task | Before this change the next stream-json spawn normalised such an entry to its origin (adapter:1217-1225), and the sweep then took it (`retired-ptah-mcp-slots.ts:33-35`). No current Ptah writes the lane shape | yes |
| D9 | stderr redaction runs in the shared lane handle for every provider-session lane (agy and Grok), not as an agy-only hook | An agy-profile hook; a new `ProviderSessionLaneHandleConfig` option | The token exposure is generic (`lane-mcp-attachments.ts:28`). Hiding a secret is correct for every vendor, and it needs no option with a single user | yes |
| D6 | `SdkHandle.mcpConfigWriteFailed` (interface:239) and the manager's `config-write-failed` warning (manager:1994-1995) stay as a generic contract. Only the lane-handle getter goes | Delete across the interface, the manager and its spec | This keeps `agent-process-manager.service.ts` out of the diff, so the overlap with TASK_2026_2320 stays small. The field is optional, and any future config-writing adapter can use it. Recorded as a follow-up candidate | yes |
| D7 | `agyModelWithEffort` and its tests are deleted. Effort travels as ACP `thought_level` | Keep it for 2320 | Only `buildAntigravityArgs` uses it (adapter:438); profile:29-33 | yes |
| D8 | The constructor becomes `(spawner?, logger?, acp: AntigravityAcpSeam = {}, readSignIn = readCachedAgySignIn)`, with `streamJsonProbe` removed | Keep a placeholder parameter | Callers: cli-detection.service.ts:189 and specs only (grep) | yes |

## Component specifications

### 1. AntigravityCliAdapter (ACP-only)

- **Purpose.** The single agy lane adapter: detection, capabilities, models, sign-in, and a
  lane that runs on `agy acp`.
- **Responsibilities.**
  - `detect()`: resolve the binary and probe the version (adapter:566-602). Drop the
    `probeStreamJsonInput` call. Record the version-floor answer through `probeAcp(binary, version)`.
  - `capabilities()`: always `antigravityAcpManifest(this.roleChannel)`.
  - `runSdk(options)`:
    1. Take `binary = options.binaryPath ?? 'agy'`.
    2. Run the floor check through `probeAcp`. A definite `false` rejects with the D2 error,
       before any spawn, MCP mint use or folder write. `undefined` (unknown) or `true` →
       `runAcp(options, binary)`.
  - `probeAcp` is reduced to a version check. It keeps the per-binary cache of definite
    answers, the in-flight sharing (`acpProbesInFlight`) and the `acp.probe` seam. It drops
    the help read, `acpSupported`/`lastProbedBinary` (these existed only for `capabilities()`)
    and the cooldown. The production probe needs no spawner check: the lane handle reports
    a missing spawner.
  - `runAcp`: unchanged apart from removing the `fallBack` parameter and the spread `fallback`
    config (adapter:937-944). Update its doc comment.
  - Kept unchanged: `ensureTokensFresh`, `parseOutput`, `geminiRoot`, `listModels`,
    `readModels`, `currentModelIds`, `probeModels`, `ensureFolderTrusted`, `parseAgyModels`,
    `agyModelId`, `AgyEffort`/`isAgyEffort`/`AGY_EFFORT_SUFFIX`, and the model-id constants.
  - Deleted: everything in the "stream-json code" evidence row, plus `agyModelWithEffort`,
    `PRINT_TIMEOUT`, `streamJsonInputSupported*`, `helpTextByBinary`, `acpFailedAtByBinary`,
    `unknownTransportWarned`, `transportOverride`, `acpTransportActive`, `acpCoolingDown`,
    `readAgyHelp`, `mcpFacet`, `configureMcpServer`, `cleanupMcpEntry`, `lockMcpStartup`,
    `startupChildStopDeadlineMs`, `withLeadingInfo`, and the imports that become unused
    (`zod`, harness-sync facet, `translateLaneSpawnPolicy`/`applyLaneArgvPolicy`,
    `buildTaskPrompt`, `buildArgvTaskPrompt`, `resolveDirectSpawn`,
    `assertCommandLineWithinLimit`, `createBufferedEmitter`, `classifyCliStderr`,
    `laneMcpAuthUrl`, `ptahMcpServerUrl`, `MCP_ATTACHMENT_TIMEOUT_MS`,
    `completedTurnTelemetry`, `turnIdentity`, and the diagnostics imports).
    `readFile`/`writeFile`/`mkdir`, `homedir`/`join`, `killProcessTree` and
    `spawnCli`/`stripAnsiCodes` stay, for trust, models and the probe.
  - Rewrite the file header to describe the ACP-only adapter. Drop the stream-json schema notes.
  - Fix the `supportsMcp` doc (adapter:506): Ptah MCP travels as an ACP `http` entry in
    `session/new`, and `mcp_config.json` is not written.
  - `redactAgyText` moves out (component 6) instead of being deleted.
- **Verified contracts and entry points.** `CliAdapter` (`CA/cli-adapters/cli-adapter.interface.ts`);
  `createProviderSessionLaneHandle(config)` (lane-handle:115); `antigravityAcpProfile`,
  `antigravitySkipsPermissions` (`libs/backend/acp-runtime/src/lib/profiles/antigravity-acp-profile.ts:138`);
  `validateLaneSpawnPolicy` (`CA/lane-spawn-policy.ts:62`); `meetsAgyAcpFloor` (acp-lane:51).
- **Dependencies.** acp-runtime, harness-sync is no longer imported, auth-providers (sign-in),
  platform-core (spawner, kill). The direction is unchanged (cli-agent-runtime → acp-runtime).
- **Integration points.** `CliDetectionService` (cli-detection.service.ts:187-190),
  `AgentProcessManager.runSdk` (manager:1487), `cli-model-list.service.ts:81`
  (`agent:listCliModels`), and the limit-reader manifest.
- **Failure behaviour.**
  - Below the floor: reject with the D2 message. The manager revokes the credential and
    rethrows (manager:1566-1569).
  - ACP setup failure: one error segment, and `done` resolves 1 (lane handle, no fallback).
  - Missing spawner: the lane handle's single error (lane-handle:128-140).
  - A failed `agy models` read: the model passes as chosen (adapter:1063-1072, unchanged).
- **Quality requirements.** No `agy --help` spawn at detection. No write to
  `~/.gemini/config/mcp_config.json` from any lane. No new timers.
- **Verification seam.** `antigravity-cli.adapter.acp.spec.ts` (fake ACP transport via
  `transportFactory`), `antigravity-cli.adapter.spec.ts` (detect and models), the sign-in spec.
- **Files.**
  - REWRITE `CA/cli-adapters/antigravity-cli.adapter.ts`
  - MODIFY `CA/cli-adapters/antigravity-acp-lane.ts`: delete lines 14-45 (override and
    cooldown) and 47-48 and 62-65 (help), plus the seam's `transport` field (79-80). Reword
    the header (1-6) and the `now` doc (81), so the clock now serves the model-id cache. The
    manifest is not touched.
  - DELETE `CA/cli-adapters/antigravity-result-diagnostics.ts`, after component 6 has taken
    `redactAgyText`
  - MODIFY `CA/cli-detection.service.ts:189` → `new AntigravityCliAdapter(this.spawner, this.logger)`
  - MODIFY `CA/lane-spawn-policy.ts`: move `'antigravity'` from the argv union (54-57) to the
    `'cursor' | 'grok' | 'pi'` branch (58). Move its case (156-162) to the no-argv return
    (170-173). Delete `antigravityArgv` (252-266). Reword the comment at 486 ("agy ACP
    `thought_level`" instead of "`agy --effort`").

### 2. Adapter test suite

- **Purpose.** Prove the ACP-only behaviour, and delete the stream-json tests.
- **Responsibilities.**
  - DELETE `CA/cli-adapters/antigravity-cli.adapter.mcp.spec.ts` (all stream-json
    `mcp_config.json` tests). The ACP equivalent is acp spec `:466` and live D9 `:249`.
  - DELETE `CA/cli-adapters/antigravity-result-diagnostics.spec.ts`. Its `redactAgyText`
    cases move to `lane-stderr-redaction.spec.ts` (component 6).
  - REWRITE `CA/cli-adapters/antigravity-cli.adapter.spec.ts`:
    - keep `detect()`: installed, not installed, version; drop the help-probe cases at 232-300;
    - keep `listModels()` (302-472), `parseOutput`, `agyModelId` (1768+) and `parseAgyModels`;
    - delete argument construction (473-884), except the model-id cache cases listed under
      the ACP spec below, which move rather than disappear (F2);
    - delete role delivery (885-1000, covered by lane-handle spec `:127`, `:878`),
      stream-json parsing (1001-1664; the stderr redaction case `:1570` moves to component 6),
      session id capture (1665-1726) and the input-format capability tests (1727-1766);
    - `agyModelWithEffort` has no spec of its own (F8). Its only coverage is the argv cases
      `:674`, `:690` and `:746-806` (effort suffix, `--effort`), which go with the argv block;
    - add `capabilities()` equal to `antigravityAcpManifest('task-prompt')` on a fresh
      adapter, with no probe.
  - MODIFY `CA/cli-adapters/antigravity-cli.adapter.acp.spec.ts`:
    - transport choice (152-362) becomes "version floor":
      - ACP is used at or above 1.5.1, from one `--version` read and no `--help`
        spawn (assert the spawn argv);
      - below the floor, `runSdk` rejects with the D2 message and spawns no transport;
      - an unreadable version is not cached, and the lane runs ACP;
      - an injected probe that answers `undefined` is re-run, and one probe in flight is shared;
    - delete the override tests (280-362), the fallback tests (727-811) and the cooldown
      tests (813-899);
    - add "a session that never opens fails the lane with one ACP error and no
      stream-json spawn" (initialize error → `done` 1, one error segment);
    - add "an unknown resume id starts a new session with one info";
    - port the model-id cache cases from `antigravity-cli.adapter.spec.ts` (F2). Each one
      drives `startLane` with a fake `agy models` probe (the same `spawnCli` mock the old
      spec used for `models`) and asserts the `model` value sent in
      `session/set_config_option` (or the `model` the runtime receives), not argv:
      - `:556` a retired saved id from `id<TAB>name` becomes the live variant of the closest base;
      - `:584` the saved effort is kept when the closest base lists it;
      - `:660` the chosen effort is applied through the closest live base;
      - `:597` no re-probe of `agy models` for each spawn after a failed probe (60 s window);
      - `:611` the live ids are scoped to the binary, and another binary probes its own;
      - `:637` a clean empty refresh drops the earlier ids for the next spawn;
      - `:716` at most one probe per 10-minute window, shared by concurrent spawns;
      - `:726` a re-probe after 10 minutes (seam `now`);
      - `:740` no `agy models` probe when no model is chosen;
    - rename the describe at 687 to "ACP quota and rate-limit errors keep their wording".
      Compare against `classifyLaneLimit` on the raw wording, which is what the existing
      body already does, without naming stream-json. Also update the title at 516;
    - update every constructor call to the D8 signature.
  - MODIFY `CA/cli-adapters/antigravity-cli.adapter.acp.live.spec.ts:189-194` (D8
    signature: `(spawner, logger, { transportFactory })`).
  - MODIFY `CA/cli-adapters/antigravity-cli.adapter.sign-in.spec.ts:10-16` (D8 signature).
  - `CA/cli-adapters/limit-reader-manifest.spec.ts` and `cli-detection.service.spec.ts` need
    no change. Assumption: a no-argument constructor still compiles. Typecheck confirms it.
- **Verification seam.**
  - `npm run verify -- --related -p @ptah-extension/cli-agent-runtime`.
  - The specs that must run: `antigravity-cli.adapter.spec.ts`,
    `antigravity-cli.adapter.acp.spec.ts`, `antigravity-cli.adapter.sign-in.spec.ts`,
    `limit-reader-manifest.spec.ts`, `cli-detection.service.spec.ts`,
    `codex-native-selection.spec.ts`, `lane-spawn-policy.spec.ts`,
    `agent-spawn-environment.service.spec.ts`.
- **Files.** As listed above.

### 3. Provider-session lane handle without fallback

- **Purpose.** Present one ACP session as a lane, with no second transport.
- **Responsibilities.**
  - Delete `MAX_HELD_SETUP_ITEMS` (83-86), `ProviderSessionLaneFallback` (88-94) and
    `config.fallback` (107-108).
  - Delete hold-setup (`holdingSetup`, `held`, `setupErrors`, `releaseHeld`, `deliver` at
    147-165), so events project directly. Delete `delegate`/`delegating` (166-168) and
    `mayFallBack`/`runFallback` (370-441).
  - Simplify `runFirstTurn` (464-470), plus `supportsContinuation`, `continueTurn`,
    `interrupt`, `getSessionId`, `supportsInterrupt`, `getPid`,
    `getObservedNativeThreadId` (495, 515-519, 545, 585-604) to their ACP-only branches.
  - Delete the `mcpConfigWriteFailed` getter (581-584).
  - Rewrite the header bullets (22-28, 30-39) and the comment at 600 ("Both transports").
  - `onMcpConfigRestored` behaviour is unchanged: revoke on a self-exit or a failed setup,
    never on abort.
- **Verified contracts.** `SdkHandle` (`cli-adapter.interface.ts:228-290`), `createAcpSession`
  (acp-runtime), and the callers: Grok (`grok-cli.adapter.ts:272`) and agy.
- **Dependencies.** Unchanged.
- **Failure behaviour.** A failed setup releases the credential (`releaseCredentialOnExit`)
  and returns 1, with the ACP error segment as today when no fallback is configured.
- **Quality requirements.** No output buffering on the setup path, so the first segment
  arrives as soon as it is projected.
- **Verification seam.**
  - `npm run verify -- --related -p @ptah-extension/cli-agent-runtime`.
  - The specs that must run: `provider-session/provider-session-lane-handle.spec.ts`,
    `provider-session/provider-session-lane-handle.sdk-unavailable.spec.ts`,
    `provider-session/provider-session-lane-handle.review-1450.spec.ts`,
    `grok-cli.adapter.spec.ts`, `antigravity-cli.adapter.acp.spec.ts`.
- **Files.**
  - MODIFY `CA/cli-adapters/provider-session/provider-session-lane-handle.ts`
  - MODIFY `CA/cli-adapters/provider-session/provider-session-lane-handle.spec.ts`:
    - delete the describe at 1680-1872, but keep these as plain setup-failure tests in a
      new describe "createProviderSessionLaneHandle — setup failure" (F9):
      - `:1861` "keeps the original single error without a fallback", retitled "a failed
        setup ends the lane with one error";
      - the sign-in hint assertion from `:1745` (A2);
      - the assertion from `:1841` that a failed setup closes the ACP child (`h.agent.closed`);
      - `:1760`: a refused model after the session opened fails the lane with its error;
    - delete the fallback credential case at `:1937`;
    - remove the stand-in stream-json handle helper (1681-1698).

### 4. Retired MCP slot sweep: lane-shape leftovers

- **Purpose.** Clean a `ptah` entry that a crashed stream-json lane left in agy's config. That
  job used to happen as a side effect of the next stream-json spawn.
- **Responsibilities.**
  - Extend the matcher used by `removeRetiredPtahEntry`, either by adding a lane-URL regex
    beside `PTAH_PERSISTENT_URL` (`retired-ptah-mcp-slots.ts:65-66`) or by adding a sibling
    predicate.
  - The lane-URL regex is
    `^http:\/\/localhost:\d+(?:\/auth\/[A-Za-z0-9_-]{43})?\/agent\/[^/]+(?:\/workspace\/[^/]+)?\/?$`,
    which follows the grammar in `CA/cli-adapters/ptah-mcp-url.ts` and the `laneMcpAuthUrl`
    function in `CA/cli-adapters/lane-mcp-credentials.ts:112-115`.
  - The same guards still apply: remote, no `command`, no `headers`, only the
    `PTAH_SPAWN_MCP_KEY` key, inside `withMcpConfigLock`.
  - Rewrite the header (9-10, 22-35), so that no Ptah writer produces the lane shape anymore.
    State the D5 accepted risk there.
  - Fix the stale comments at `ptah-mcp-slots.ts:62-65`, `http-mcp-server.service.ts:842-848`
    and `http-mcp-server.service.ts:1211` (the "failure `AntigravityCliAdapter` already
    documents" reference becomes the facet's own rationale).
  - F4 mitigation: the existing info line `Removed retired ptah entry from <path>` gains the
    removed shape (`(lane)` or `(persistent)`). `removeRetiredPtahEntry` returns the matched
    shape, or `false`, so the sweep can log it. The return type changes from `boolean`; update
    its callers and specs.
- **Verified contracts.** `removeRetiredPtahEntry` (:118), `isPtahPersistentEntry` (:102),
  `sweepRetiredPtahMcpEntries` (:158). The predicate is exported, so a rename must update
  its spec imports.
- **Dependencies.** Unchanged (vscode-lm-tools → harness-sync). vscode-lm-tools must not import
  cli-agent-runtime: copy the grammar into the regex and cite the source in a comment.
- **Failure behaviour.** Unchanged. A parse failure throws and is logged at warn; the next
  reconcile retries.
- **Quality requirements.** A user's own `ptah` server (any non-localhost URL, or one with
  headers) is never removed.
- **Verification seam.**
  - `npm run verify -- --related -p @ptah-extension/vscode-lm-tools`.
  - The specs that must run: `code-execution/mcp-http/retired-ptah-mcp-slots.spec.ts`,
    `code-execution/mcp-http/http-mcp-server.service.concurrency.spec.ts`.
  - Assertions on `toBe(true)` / `toBe(false)` change to the shape or `false`.
- **Files.**
  - MODIFY `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/retired-ptah-mcp-slots.ts`
  - MODIFY `.../mcp-http/retired-ptah-mcp-slots.spec.ts:169-178`: "removes a leftover lane entry".
    Add cases for the shape without auth and for the lane shape with `headers` (kept).
  - MODIFY `.../mcp-http/http-mcp-server.service.concurrency.spec.ts:578-590`: the lane entry
    is removed, and the user's `ptah` server stays.
  - MODIFY `.../mcp-http/ptah-mcp-slots.ts` (comment only)
  - MODIFY `.../mcp-http/http-mcp-server.service.ts` (comment only)

### 5. ACP profile wording

- **Purpose.** Stop describing a transport that no longer exists.
- **Responsibilities.** Comment text only:
  - `antigravity-acp-profile.ts:11`, `:14`, `:136`: describe the behaviour itself, not
    "as the stream-json lane does";
  - the spec titles at `antigravity-acp-profile.spec.ts:52`, `:77`.
  - No logic change.
- **Failure behaviour.** Not applicable.
- **Verification seam.**
  - `npm run verify -- --related -p @ptah-extension/acp-runtime`.
  - The spec that must run: `profiles/antigravity-acp-profile.spec.ts`.
  - Then `npm run verify -- -t lint -p @ptah-extension/acp-runtime`.
- **Files.**
  - MODIFY `libs/backend/acp-runtime/src/lib/profiles/antigravity-acp-profile.ts`
  - MODIFY `libs/backend/acp-runtime/src/lib/profiles/antigravity-acp-profile.spec.ts`

### 5b. harness-sync wording (F5)

- **Purpose.** Stop naming `AntigravityCliAdapter` as a live second writer of
  `~/.gemini/config/mcp_config.json`.
- **Responsibilities.**
  - Comment text only. The file lock still serialises any concurrent writer (the reconciler,
    another Ptah process, the user), so the rationale stays. The adapter is mentioned only as
    the former writer (TASK_2026_2322).
  - The spec helper at `harness-reconciler.antigravity-mcp.spec.ts:136-150` stays. It
    simulates a second facet writer, and the lock behaviour it proves still matters. Only its
    comment changes.
- **Failure behaviour.** Not applicable.
- **Verification seam.**
  - `npm run verify -- --related -p @ptah-extension/harness-sync`.
  - The specs that must run: `reconciler/harness-reconciler.antigravity-mcp.spec.ts`,
    `targets/mcp/antigravity-mcp-facet.spec.ts`.
  - Then `npm run verify -- -t lint -p @ptah-extension/harness-sync`.
- **Files.** MODIFY these, under `libs/backend/harness-sync/src/lib/`:
  - `targets/mcp/mcp-facet.port.ts` (69-73)
  - `targets/mcp/mcp-config-lock.ts` (13-16)
  - `lock/file-lock.ts` (4-7, 286-287)
  - `targets/rival-targets.ts` (50-56)
  - `targets/mcp/antigravity-mcp-facet.spec.ts` (5)
  - `reconciler/harness-reconciler.antigravity-mcp.spec.ts` (136)

### 6. Lane stderr redaction (F1, orchestrator decision: keep)

- **Purpose.** No provider-session lane shows a secret or its own lane token from agent
  stderr in lane output or segments. This keeps the stream-json guarantee at adapter:1690-1695.
- **Responsibilities.**
  - CREATE `CA/cli-adapters/provider-session/lane-stderr-redaction.ts`. It exports
    `redactLaneStderr(line: string, mcpToken?: string): string`, which does two things:
    - applies the `redactAgyText` rules, moved verbatim from
      `antigravity-result-diagnostics.ts:3-13` (the quoted secret-key values,
      `Bearer <x>`, `api_key|token|secret|authorization|password|credential|cookie|session[:=]<x>`);
    - then replaces every occurrence of `mcpToken`, when it is non-empty, with `[REDACTED]`.
    It is a pure function with no I/O.
  - In the lane handle's `diagnostic` branch (lane-handle:184-187), compute
    `safe = redactLaneStderr(event.line, options.mcpToken)` once, and use it for
    `output.emit`, for `classifyCliStderr(safe)` and for the segment `content`.
  - Applies to agy and Grok (D9).
  - No other event type changes. ACP error and info text comes from `readAcpErrorDetail`
    and is not raw stderr. Assumption A3: no ACP error path echoes the `session/new`
    request. Check: grep `acp-runtime/src/lib` for any code that formats `mcpServers` or
    `headers` into an error or info string. If one is found, route that string through the
    same function.
- **Verified contracts.** `ProviderSessionEvent` `diagnostic` with `line`, consumed at
  lane-handle:184; `classifyCliStderr` (`CA/cli-adapters/cli-stderr-severity.ts`);
  `options.mcpToken` (`cli-adapter.interface.ts:157-158`).
- **Dependencies.** Within cli-agent-runtime only. No dependency on the agy adapter, so the
  rules live with the shared handle.
- **Failure behaviour.**
  - The function cannot throw: it only calls `String.replace`.
  - An empty or undefined token skips the token scrub. Do not use `replaceAll('')`, which
    would insert the marker between every character; the old code avoided that with `'\u0000'`.
- **Quality requirements.** The redaction is applied to every stderr line. The cost is linear
  in the line length.
- **Verification seam.**
  - `npm run verify -- --related -p @ptah-extension/cli-agent-runtime`.
  - The specs that must run: `provider-session/lane-stderr-redaction.spec.ts` (new) and
    `provider-session/provider-session-lane-handle.spec.ts`.
- **Files.**
  - CREATE `CA/cli-adapters/provider-session/lane-stderr-redaction.ts`
  - CREATE `CA/cli-adapters/provider-session/lane-stderr-redaction.spec.ts`. It takes the
    `redactAgyText` cases from `antigravity-result-diagnostics.spec.ts`, plus three new
    cases: the token scrub, an empty token that is a no-op, and a line with no secret that
    comes back unchanged.
  - MODIFY `CA/cli-adapters/provider-session/provider-session-lane-handle.ts`, in the
    diagnostic branch. This is the same file as component 3, so the two land in the same group.
  - MODIFY `CA/cli-adapters/provider-session/provider-session-lane-handle.spec.ts`. Add
    "redacts secrets and the lane token from agent stderr", ported from
    `antigravity-cli.adapter.spec.ts:1570`:
    - drive a `diagnostic` event `HTTP debug Authorization: Bearer super-secret-token api_key=abc123 <mcpToken>`;
    - assert that output and segments contain `[stderr]` and `[REDACTED]`;
    - assert that they contain neither `super-secret-token`, nor `abc123`, nor the token.

## Integration architecture

- **Data flow.**
  1. A lane request goes through `AgentProcessManager` (manager:1487), to
     `AntigravityCliAdapter.runSdk`, the floor check and `runAcp`.
  2. `runAcp` writes the folder trust and resolves the model id through `agy models`.
  3. It then calls `createProviderSessionLaneHandle`, which spawns `agy acp` and runs
     `initialize`, `session/new` (with the `ptah_lane` http MCP entry, modes and config),
     the MCP attachment wait, then the prompt.
  4. Segments and stream events go back to the manager and the renderer.
  - Review lanes and Electron UI lanes take the same path
    (`apps/ptah-electron/src/services/review/review-lane-gateway.ts:151`). Main chat is
    unchanged (`provider-session-composition.ts:101-102`).
- **State or persistence.** The adapter keeps only the per-binary floor cache and the model-id
  cache (process lifetime). No settings change. Persisted lane resume ids are attached by ACP,
  or fall back to a new session (acp-session-runtime.ts:1224-1228).
- **External boundaries.** The `agy` child process and `~/.gemini/config/mcp_config.json`.
  Ptah stops writing that file from lanes. The sweep's removal is limited to two exact
  Ptah-authored URL grammars, under the config lock.
- **Failure and rollback.**
  - Below the floor: the spawn is rejected and the credential revoked by the manager.
  - ACP setup failure: the lane fails with one error, and the credential is released on exit.
  - Code rollback: revert the PR. No data migration exists to undo. The sweep removed only
    Ptah's own dead lane entries.
- **Observability.**
  - The existing log `[AntigravityCliAdapter] lane runs on agy acp` (adapter:916) stays.
  - Add an `info` log on a below-floor rejection, with the version.
  - The sweep's existing `Removed retired ptah entry from <path>` info covers D5.

## Architecture-level quality requirements

- **Functional.**
  - Every agy lane on agy 1.5.1 or later runs on ACP, whatever `PTAH_AGY_TRANSPORT` is set to.
  - No code path spawns `agy --print`, `--input-format` or `--output-format stream-json`,
    except the `/usage` probe, which keeps `--output-format json`.
  - A grep for `stream-json` under `libs/backend/cli-agent-runtime`, `acp-runtime` and
    `vscode-lm-tools` returns only copilot and opencode references.
- **Performance.** Detection spawns one process fewer (no `--help`). Setup output is no longer held.
- **Security.**
  - No lane writes a credential into a home-global file.
  - Leftover lane credentials in `mcp_config.json` are removed.
  - The user's own servers stay untouched.
  - Agent stderr shown in a lane never contains a bearer token, an api key, a quoted secret
    value or the lane's own `mcpToken`. This holds for agy and Grok (component 6).
- **Maintainability.**
  - No new project, tag or dependency edge.
  - The adapter no longer imports harness-sync. The project dependency stays, because
    harness-sync is still used elsewhere in the lib (`cli-adapter.utils.ts:28`,
    `capability-toggle-store.ts:46`; verified in the review).
  - vscode-lm-tools does not import cli-agent-runtime.
- **Testability.** The behaviours to prove:
  - the floor gate, both ways;
  - the unknown version;
  - an ACP setup failure with no fallback;
  - the unknown resume id;
  - the always-ACP manifest;
  - the sweep removing the lane shape and keeping user servers;
  - the Grok lane-handle specs still passing;
  - stderr redaction of secrets and the lane token;
  - the model-id cache behaviours, ported to the ACP spec.

## Team-leader handoff

- **Recommended executors.** All components (1-6, including 5b) go to `backend-developer`. They are TypeScript
  backend libs with no UI. `senior-tester` can do the spec rewrite in component 2 if it is
  split out.
- **Complexity.** MEDIUM. The work is mostly deletion inside one large file and one shared
  handle. The risk is in exact spec pruning and the conflict surface with TASK_2026_2320.
- **Dependencies and ordering.**
  - Component 1 (stop passing `fallback`) comes before or with component 3 (remove the
    option). Otherwise typecheck fails.
  - Component 2 follows component 1.
  - Component 6 must land before or with the deletion of `antigravity-result-diagnostics.ts`.
    The rules move rather than disappear.
  - Components 4, 5 and 5b are independent.
- **Parallel-safe work.**
  - Suggested file-disjoint groups (the team-leader decides the batching). Each group has a
    scoped check, and lanes run only the focused `npx jest` command on the named specs.
    - **Group A: components 1 and 2,** in `@ptah-extension/cli-agent-runtime`: adapter,
      acp-lane, detection, lane-spawn-policy and their specs.
      - Check: `npm run verify -- --related -p @ptah-extension/cli-agent-runtime`.
      - Specs that must run: `cli-adapters/antigravity-cli.adapter.spec.ts`,
        `cli-adapters/antigravity-cli.adapter.acp.spec.ts`,
        `cli-adapters/antigravity-cli.adapter.sign-in.spec.ts`,
        `cli-adapters/limit-reader-manifest.spec.ts`, `cli-detection.service.spec.ts`,
        `codex-native-selection.spec.ts`, `lane-spawn-policy.spec.ts`,
        `agent-spawn-environment.service.spec.ts`.
    - **Group B: components 3 and 6,** in `@ptah-extension/cli-agent-runtime`: the lane
      handle, the new redaction file and their specs.
      - It runs after A or together with A, because it is the same project. Do not check
        the project while the other group edits it.
      - Check: `npm run verify -- --related -p @ptah-extension/cli-agent-runtime`.
      - Specs that must run: `cli-adapters/provider-session/provider-session-lane-handle.spec.ts`,
        `cli-adapters/provider-session/provider-session-lane-handle.sdk-unavailable.spec.ts`,
        `cli-adapters/provider-session/provider-session-lane-handle.review-1450.spec.ts`,
        `cli-adapters/provider-session/lane-stderr-redaction.spec.ts`,
        `cli-adapters/grok-cli.adapter.spec.ts`, `cli-adapters/antigravity-cli.adapter.acp.spec.ts`.
    - **Group C: component 4,** in `@ptah-extension/vscode-lm-tools`. Parallel-safe.
      - Check: `npm run verify -- --related -p @ptah-extension/vscode-lm-tools`.
      - Specs that must run: `code-execution/mcp-http/retired-ptah-mcp-slots.spec.ts`,
        `code-execution/mcp-http/http-mcp-server.service.concurrency.spec.ts`.
    - **Group D: component 5,** in `@ptah-extension/acp-runtime`. Parallel-safe.
      - Check: `npm run verify -- --related -p @ptah-extension/acp-runtime`.
      - Spec that must run: `profiles/antigravity-acp-profile.spec.ts`.
    - **Group E: component 5b,** in `@ptah-extension/harness-sync`. Parallel-safe.
      - Check: `npm run verify -- --related -p @ptah-extension/harness-sync`.
      - Specs that must run: `reconciler/harness-reconciler.antigravity-mcp.spec.ts`,
        `targets/mcp/antigravity-mcp-facet.spec.ts`.
  - Every group also runs `npm run verify -- -t lint,typecheck -p <its project>` as a separate
    command.
  - Five groups in total. A and B can be merged into one if preferred.
- **Files affected.**
  - CREATE:
    - `CA/cli-adapters/provider-session/lane-stderr-redaction.ts`
    - `CA/cli-adapters/provider-session/lane-stderr-redaction.spec.ts`
  - DELETE:
    - `CA/cli-adapters/antigravity-result-diagnostics.ts`
    - `CA/cli-adapters/antigravity-result-diagnostics.spec.ts`
    - `CA/cli-adapters/antigravity-cli.adapter.mcp.spec.ts`
  - REWRITE:
    - `CA/cli-adapters/antigravity-cli.adapter.ts`
    - `CA/cli-adapters/antigravity-cli.adapter.spec.ts`
  - MODIFY:
    - `CA/cli-adapters/antigravity-acp-lane.ts`
    - `CA/cli-adapters/antigravity-cli.adapter.acp.spec.ts`
    - `CA/cli-adapters/antigravity-cli.adapter.acp.live.spec.ts`
    - `CA/cli-adapters/antigravity-cli.adapter.sign-in.spec.ts`
    - `CA/cli-detection.service.ts`
    - `CA/lane-spawn-policy.ts`
    - `CA/cli-adapters/provider-session/provider-session-lane-handle.ts`
    - `CA/cli-adapters/provider-session/provider-session-lane-handle.spec.ts`
    - `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/retired-ptah-mcp-slots.ts`
    - `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/retired-ptah-mcp-slots.spec.ts`
    - `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/http-mcp-server.service.concurrency.spec.ts`
    - `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/ptah-mcp-slots.ts`
    - `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/http-mcp-server.service.ts`
    - `libs/backend/acp-runtime/src/lib/profiles/antigravity-acp-profile.ts`
    - `libs/backend/acp-runtime/src/lib/profiles/antigravity-acp-profile.spec.ts`
    - `libs/backend/harness-sync/src/lib/targets/mcp/mcp-facet.port.ts`
    - `libs/backend/harness-sync/src/lib/targets/mcp/mcp-config-lock.ts`
    - `libs/backend/harness-sync/src/lib/lock/file-lock.ts`
    - `libs/backend/harness-sync/src/lib/targets/rival-targets.ts`
    - `libs/backend/harness-sync/src/lib/targets/mcp/antigravity-mcp-facet.spec.ts`
    - `libs/backend/harness-sync/src/lib/reconciler/harness-reconciler.antigravity-mcp.spec.ts`
  - Relied on, not edited (2320 may change them):
    - `libs/backend/acp-runtime/src/lib/acp-session-runtime.ts`
    - `CA/cli-adapters/cli-adapter.interface.ts`
    - `CA/cli-adapters/grok-cli.adapter.ts`
    - `CA/agent-process-manager.service.ts`
- **Verification points.**
  - References to confirm:
    - after the rewrite, grep for `startupChildStopDeadlineMs`, `PTAH_AGY_TRANSPORT`,
      `readAgyTransportOverride`, `agyHelpListsAcp`, `ProviderSessionLaneFallback`,
      `agyModelWithEffort`, `antigravity-result-diagnostics` and `redactAgyText`. Each must
      return zero hits in libs and apps;
    - grep for `AntigravityCliAdapter` in `libs/backend/harness-sync` returns only the
      "former writer" wording;
    - grep for `fallback:` in `CA/cli-adapters` must show no lane-handle config.
  - Contracts to honour:
    - the `antigravityAcpManifest` output must stay byte-identical (2320 owns changes to it);
    - the `CliAdapter` interface does not change;
    - `SdkHandle.mcpConfigWriteFailed` stays (D6).
  - Data changes: none. No settings migration is needed (D1).
  - Inner loop, after all groups:
    - `npm run verify -- --related -p @ptah-extension/cli-agent-runtime,@ptah-extension/vscode-lm-tools,@ptah-extension/acp-runtime,@ptah-extension/harness-sync`
    - then `npm run verify -- -t lint,typecheck -p @ptah-extension/cli-agent-runtime,@ptah-extension/vscode-lm-tools,@ptah-extension/acp-runtime,@ptah-extension/harness-sync,@ptah-extension/cli-engine,ptah-electron`
  - Full gate, once before push:
    - `npm run verify -- -p @ptah-extension/cli-agent-runtime,@ptah-extension/vscode-lm-tools,@ptah-extension/acp-runtime,@ptah-extension/harness-sync,@ptah-extension/cli-engine,ptah-electron`
    - No template change, so `typecheck-templates` is not needed.
    - cli-engine is included because it consumes `CliDetectionService` (benchmark).
    - `@ptah-extension/platform-cli` has no agy reference and is not affected.
  - Lanes do not run nx or verify. They run focused `npx jest --runInBand --runTestsByPath`,
    `npx tsc --noEmit --project` and `npx eslint` on changed files only.

### Live-test plan (Electron, agy over ACP, model Gemini 4 Hydrogen; not run in this phase)

Preconditions:

- a signed-in `agy` at version 1.5.1 or later on PATH;
- Ptah Electron built from this branch, dev run;
- the model is Gemini 4 Hydrogen, with its id read from `agent:listCliModels` (the agy list)
  or from agy's ACP `model` config option. Never a hardcoded fallback id.

Steps:

1. **Env migration.** Launch Electron with `PTAH_AGY_TRANSPORT=stream-json`. Spawn an agy
   lane (`ptah_agent_spawn`, cli `antigravity`, Hydrogen model).
   - Expect the log `lane runs on agy acp`.
   - Expect no `--print`/`stream-json` process in the process list, and no "runs on stream-json" info.
2. **Turn, continuation and interrupt.** The lane replies. Send a follow-up message. It runs
   on the same pid. Interrupt mid-turn: the process stays and the next message runs. Stop the
   lane: no agy process tree remains.
3. **Ptah MCP.** The lane calls a Ptah MCP tool (`mcp_ptah_lane_*`).
   `~/.gemini/config/mcp_config.json` is byte-identical before and after.
4. **Plan permission.** A plan-mode lane refuses an edit and is granted read and Ptah MCP tools.
5. **Resume.** Resume an older agy lane id, ideally one recorded before this change. The lane
   either restores context or shows "could not resume … started a new session", and continues.
6. **Review lane.** Run a review with agy selected as a lane (Hydrogen). It completes and
   publishes its result.
7. **Main chat sanity.** One agy main-chat turn on Hydrogen. Unchanged behaviour.
8. **Usage and models.** The Usage panel shows the Antigravity plan reading (`/usage` probe),
   and the model picker lists Hydrogen.
9. **Leftover sweep (D5).**
   - Quit Ptah. Seed `~/.gemini/config/mcp_config.json` with a `ptah` entry
     `{"serverUrl":"http://localhost:51820/auth/<43 chars>/agent/a1"}` and a user server.
   - Start Ptah. The `ptah` entry is removed, the user server stays, and the info log names the file.
10. **Floor error (optional, if an older agy is at hand).** Spawning shows the D2 upgrade
    message, and no process is left behind.
11. **Gated jest live spec.** This is a paid run, outside CI:
    `PTAH_LIVE_AGY=1 PTAH_AGY_LIVE_MODEL=<Hydrogen id> npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/antigravity-cli.adapter.acp.live.spec.ts`.

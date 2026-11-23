# Parity Inventory - TASK_2026_2322_4ba4

> **Revision 1** (2026-11-23), in response to `implementation-plan-review.md`:
>
> - **F1.** stderr secret and lane-token redaction is now a `move` row (orchestrator decision), not remove-approved.
> - **F2.** The model-id cache rows name the tests that must be ported.
> - **F3.** The adapter is in the public barrel; noted.
> - **F4.** The sweep row states the accepted risk.
> - **F5.** Stale harness-sync and comment rows added.
> - **F7.** The shared-file section is extended.
> - **F9.** Lane-handle cases are kept as plain setup-failure tests.
> - **F10.** Resume row cites `provider-session-lane-handle.ts:233`.

Remove the Antigravity (agy) stream-json transport and keep ACP only.

Scope of the trace: the OLD code on `main` at 32d76f406 (worktree
`D:\projects\PtahCode\.claude-worktrees\agy-acp-only`). All paths below are
relative to that worktree. `adapter` means
`libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/antigravity-cli.adapter.ts`.
`acp-lane` means `.../cli-adapters/antigravity-acp-lane.ts`. `lane-handle` means
`.../cli-adapters/provider-session/provider-session-lane-handle.ts`.

Decision values:

- `keep-via-ACP`: the user keeps the capability; the ACP lane already provides it, or the plan adds it.
- `keep`: the capability does not depend on stream-json and is not changed.
- `move`: the job stays, but the code that does it moves.
- `remove-approved`: this is the stream-json transport itself, which the user approved removing (context.md, "just remove completely").
- `remove-proposed`: ACP cannot provide this capability. It is listed under Proposed Removals for the user to decide.

## 1. Lane transport and runtime behaviour

| Capability | Where today (file:line) | Backing RPC/API | Decision | New location | Test |
| --- | --- | --- | --- | --- | --- |
| Transport choice per lane (probe ACP, else stream-json) | adapter:1281-1298 (`runSdk`), adapter:823-893 (`probeAcp`/`runAcpProbe`) | `CliAdapter.runSdk` | remove-approved (the choice); ACP path is kept | `runSdk` always calls `runAcp` after the version-floor check | rewrite `antigravity-cli.adapter.acp.spec.ts:152-362` (transport choice) |
| stream-json lane run (spawn `agy --print= --input-format stream-json --output-format stream-json`, NDJSON stdin) | adapter:1305-1945, adapter:407-446 (`buildAntigravityArgs`), adapter:155 (`PRINT_TIMEOUT`) | `agy` print mode | remove-approved | deleted | delete `antigravity-cli.adapter.spec.ts:473-1726` |
| stream-json event parsing (`init`, `step_update`, `result` zod schemas; text/tool segments) | adapter:185-258, adapter:1946-2151 (`handleLine`, `parseKnownEvent`, `handleStepUpdate`, `handleResult`) | agy stream-json schema | remove-approved; segments come from ACP `projectToCliSegments` (lane-handle:43-45) | lane-handle (unchanged) | ACP segments: `antigravity-cli.adapter.acp.spec.ts:466` |
| One-shot argv mode for binaries without `--input-format` | adapter:407-446 (`useStreamInput=false`), adapter:728-751 (`probeStreamJsonInput`) | `agy --print <prompt>` | remove-proposed (see Proposed Removals P1) | none | delete `antigravity-cli.adapter.spec.ts:935`, `:1739` |
| Automatic fallback to stream-json when the ACP session never opens | adapter:903-978 (`runAcp` fallBack, `runStreamJsonFallback`), lane-handle:82-110, 147-167, 370-441, 465-466 | `ProviderSessionLaneFallback` | remove-proposed (see Proposed Removals P2) | none: the lane fails with the ACP setup error | delete lane-handle spec `provider-session-lane-handle.spec.ts:1680-1872`; keep as plain setup-failure tests: `:1861` (single error), the sign-in hint from `:1745`, the closed ACP child from `:1841` (`h.agent.closed`), and the refused model after the session opened from `:1760`. Delete acp spec `:727-811` |
| ACP failure cooldown (10 min on stream-json after an ACP setup failure) | acp-lane:39-45, adapter:534, 663-670, 1285-1296 | none | remove-approved (exists only to choose stream-json) | deleted | delete `antigravity-cli.adapter.acp.spec.ts:813-899` |
| `PTAH_AGY_TRANSPORT=auto/acp/stream-json` override (dev escape hatch, environment only) | acp-lane:14-37, adapter:635-656 | process env | remove-approved (transport toggle). A saved `stream-json` value no longer has any effect, and ACP runs | deleted; the variable is no longer read | delete `antigravity-cli.adapter.acp.spec.ts:280-362` |
| Fresh conversation when the fallback received a resume id | adapter:956-978 | none | remove-approved | deleted | delete acp spec `:766` |
| Multi-turn continuation on the same process | adapter:1868-1900 (stdin NDJSON); ACP: lane-handle:7, 590-591 | `SdkHandle.continue` | keep-via-ACP | lane-handle (unchanged) | `antigravity-cli.adapter.acp.spec.ts:548` |
| Interrupt mid-turn while keeping the process (stream-json: unsupported) | adapter:679-682 (unsupported); ACP: acp-lane:101, lane-handle:10-14, 593-596 | `SdkHandle.interrupt`, ACP `session/cancel` | keep-via-ACP (better than before) | lane-handle (unchanged) | `antigravity-cli.adapter.acp.spec.ts:548`; live `antigravity-cli.adapter.acp.live.spec.ts:323` |
| Steer | adapter:674-677; acp-lane:97-100 | none | keep (unsupported on both transports) | acp-lane manifest | `antigravity-cli.adapter.acp.spec.ts` capabilities test (to add) |
| Resume by session id | adapter:440-442 (`--conversation`); ACP: `libs/backend/acp-runtime/src/lib/acp-session-runtime.ts:1207-1229` | ACP `session/resume`/`session/load` | keep-via-ACP | acp-runtime (unchanged) | `provider-session-lane-handle.spec.ts:878` |
| Resume of a stream-json-era conversation id persisted by an older lane | adapter:440-442 | ACP attach | keep-via-ACP: if the attach fails, a new session starts with an info notice (`acp-session-runtime.ts:1224-1228`). Lanes hard-code `attachFailure: 'new-session'` at `provider-session-lane-handle.ts:233`, and the runtime default is the same (`acp-session-runtime.ts:1765`) | acp-runtime (unchanged) | add: acp spec "an unknown resume id starts a new session with one info" |
| Session id capture | adapter:1621 (`init` event), 1864 | `SdkHandle.getSessionId` | keep-via-ACP | lane-handle:585-589 | `antigravity-cli.adapter.acp.spec.ts:466` |
| Abort with a process-tree kill | adapter:1606-1617, 1906 | `killProcessTree` | keep-via-ACP: `session/cancel`, a grace period, then kill (lane-handle:15-17) | lane-handle (unchanged) | live `antigravity-cli.adapter.acp.live.spec.ts:323` |
| Windows `NODE_PTY_USE_CONPTY=0`, hidden console | adapter:1314-1317 | spawn env | keep-via-ACP | `libs/backend/acp-runtime/src/lib/profiles/antigravity-acp-profile.ts:13-14` | `antigravity-acp-profile.spec.ts:122` |
| Workspace trust write (`trustedWorkspaces`) | adapter:1132-1172 (`ensureFolderTrusted`) | `~/.gemini/antigravity-cli/settings.json` | keep (already called by `runAcp`, adapter:913-915) | adapter (unchanged) | `antigravity-cli.adapter.acp.spec.ts:490` |
| Role and project guidance in the prompt | adapter:1324-1330 (`buildTaskPrompt`/`buildArgvTaskPrompt`) | none | keep-via-ACP: `_meta.antigravity.systemPrompt.append` plus the first prompt (profile:15-19) | acp-runtime profile, lane-handle | `provider-session-lane-handle.spec.ts:127`, `:878` |
| Permission modes plan / auto-edit / yolo | stream-json: adapter:705-719, `lane-spawn-policy.ts:252-266` (`--mode`); ACP: profile:69-74 | ACP `session/new.modes` | keep-via-ACP; the argv translation is remove-approved | `antigravity-acp-profile.ts` (unchanged) | `antigravity-acp-profile.spec.ts:284`; `antigravity-cli.adapter.acp.spec.ts:588-685` |
| `ask` permission on a lane | adapter:710-714; acp-lane:113-117 | none | keep (unsupported on both transports) | acp-lane | `antigravity-cli.adapter.acp.spec.ts:901` |
| Headless approval rules (S1) | profile:138-200 | ACP `session/request_permission` | keep | profile | `antigravity-acp-profile.spec.ts:133` |
| Model id, with a retired id mapped to the closest live id | adapter:348-375 (`agyModelId`), used by both transports (adapter:921-928) | `agy models` | keep | adapter | `antigravity-cli.adapter.spec.ts:1768+` (kept), acp spec `:516`, `:533` |
| Model-id cache for spawns (`currentModelIds`) | adapter:1047-1084 (10 min freshness, 60 s miss window, per binary, shared in-flight probe, an empty refresh drops the ids), used by `runAcp` (adapter:921-928) | `agy models` | keep; its tests move | adapter (unchanged) | port from `antigravity-cli.adapter.spec.ts` to the ACP spec, asserting the model in the ACP `session/set_config_option` `model` value instead of argv: `:556` (retired id from `id<TAB>name`), `:584` (keeps the saved effort), `:597` (no re-probe after a failure), `:611` (per-binary scope), `:637` (an empty refresh drops the ids), `:660` (effort through the closest base), `:716` (one probe per window, shared), `:726` (re-probe after 10 min), `:740` (no probe without a model). `:674` and `:690` are argv-only (effort suffix) and are deleted with `agyModelWithEffort` |
| Effort encoded in the model id (`agyModelWithEffort`) or `--effort` | adapter:384-405, 430-436 | argv | remove-approved (argv only); effort goes over ACP as `thought_level` (profile:29-33) | profile (unchanged) | `antigravity-acp-profile.spec.ts:387` (sessionConfig) |
| Per-turn usage telemetry | adapter:1421-1546 (`emitTelemetry`) | `CliOutputSegment` info + usage | keep-via-ACP: `PromptResponse.usage` / `usage_update` (`acp-session-helpers.ts:25-70`); `usageScope: 'turn'` lane-handle:600-601 | acp-runtime, lane-handle | `usage-scope-adapters.spec.ts:5`; `cli-segment-projector.spec.ts:115` |
| Failure diagnostics for a failed stream-json `result` (redacted error steps, exit code: `formatAgyFailure`, `formatAgyDiagnostics`, `safeAgyText`) | adapter:1700-1761, 2136-2151; `antigravity-result-diagnostics.ts:21-57` | none | remove-approved (they format stream-json events); ACP errors are summarised by `readAcpErrorDetail` | deleted | delete the `formatAgy*` cases of `antigravity-result-diagnostics.spec.ts` |
| Secret and lane-token redaction of agy stderr (`Bearer …`, `api_key=`, quoted secret keys, the lane's `mcpToken`) before the line reaches lane output and segments | adapter:1690-1695 (`redactAgyText(...).replaceAll(options.mcpToken, '[REDACTED]')`); `antigravity-result-diagnostics.ts:1-13` (`redactAgyText`); ACP today emits raw stderr at lane-handle:184-187 | lane output, `CliOutputSegment` | **move** (orchestrator decision F1): apply it on the ACP path for every provider-session lane. The ACP lane sends `Authorization: Bearer <mcpToken>` in `session/new` for every vendor (`provider-session/lane-mcp-attachments.ts:19-28`) | new `CA/cli-adapters/provider-session/lane-stderr-redaction.ts` (`redactLaneStderr(line, mcpToken?)`), called in the lane-handle `diagnostic` branch | port `antigravity-cli.adapter.spec.ts:1570` ("redacts secrets on stderr lines") to the lane-handle spec through a `diagnostic` event, add a case for the `mcpToken` scrub, and move the `redactAgyText` cases of `antigravity-result-diagnostics.spec.ts` to `lane-stderr-redaction.spec.ts` |
| Quota and rate-limit classification of lane errors | `limits/lane-limit-classifier.ts:50,161,188` | lane outcome | keep (works on text, and ACP keeps the wording) | unchanged | `antigravity-cli.adapter.acp.spec.ts:687-725` (rename to drop the stream-json comparison) |
| stderr severity classification | adapter:1690-1705; lane-handle:44, 186 | `classifyCliStderr` | keep-via-ACP (it now classifies the redacted line) | lane-handle | lane-handle spec (existing) |

## 2. Ptah MCP for the lane

| Capability | Where today (file:line) | Backing RPC/API | Decision | New location | Test |
| --- | --- | --- | --- | --- | --- |
| Ptah MCP for the lane | stream-json: adapter:1188-1279 (`mcpFacet`, `configureMcpServer`, `cleanupMcpEntry`), 1353-1385; ACP: profile:20-23, 117-128 | stream-json writes `~/.gemini/config/mcp_config.json`; ACP passes `session/new.mcpServers` http `ptah_lane` | keep-via-ACP; the config-file writer is remove-approved | profile and lane-handle (unchanged) | `antigravity-cli.adapter.acp.spec.ts:466`; live `:249`; delete `antigravity-cli.adapter.mcp.spec.ts` |
| Per-home startup lock around the MCP config write | adapter:481-502 (`startupChildStopDeadlineMs`, `lockMcpStartup`) | none | remove-approved | deleted | delete `antigravity-cli.adapter.mcp.spec.ts:361`, `:487`, `:522` |
| Restoring the prior `ptah` key, so a user's own server is never dropped | adapter:1261-1279 | harness-sync facet | remove-approved: ACP never writes the file, so nothing needs restoring | deleted | live D9 `antigravity-cli.adapter.acp.live.spec.ts:249` (file byte-identical) |
| Cleanup of a stale lane `ptah` entry (`/auth/{t}/agent/{id}`) that a crashed run left behind: the next stream-json spawn normalised it to its origin (adapter:1217-1225), then the sweep removed it | adapter:1217-1225; `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/retired-ptah-mcp-slots.ts:22-34, 65-66` | CodeExecutionMCP reconcile | move: the retired-slot sweep also removes the lane URL shape, now that no Ptah writer produces it. Accepted risk (plan D5, F4): an older Ptah build running a stream-json lane at the same moment loses its entry. The removal log names the URL shape | `retired-ptah-mcp-slots.ts` | flip `retired-ptah-mcp-slots.spec.ts:169`, `http-mcp-server.service.concurrency.spec.ts:578` |
| MCP attachment timeout warning | adapter:1782-1862 (`onMcpAttachmentTimeout`); lane-handle:247-294, 576-579 | `SdkHandle.onMcpAttachmentTimeout` → `agent-process-manager.service.ts:2017-2021` | keep-via-ACP | lane-handle (unchanged) | `provider-session-lane-handle.spec.ts:417-459` |
| "config-write-failed" MCP warning | adapter:1863 (`mcpConfigWriteFailed`); lane-handle:421-433, 581-584; manager `agent-process-manager.service.ts:1994-1995` | `SdkHandle.mcpConfigWriteFailed` (`cli-adapter.interface.ts:239`) | remove-approved for agy, since no agy transport writes a config. The generic `SdkHandle` field and the manager's handling stay (see Decision D6) | lane-handle getter deleted | `agent-process-manager.service.spec.ts:1571` (unchanged) |
| Revoking the lane MCP credential (`onMcpConfigRestored`) | adapter:1364; lane-handle:30-39, 132, 451; manager:1524-1527 | `CliCommandOptions.onMcpConfigRestored` | keep-via-ACP | lane-handle and manager (unchanged) | `provider-session-lane-handle.spec.ts:1874-1966` (minus `:1937`) |
| Lane MCP token capability `lane-report` | `lane-mcp-token-rule.ts:12-13` | MCP credential | keep | unchanged | `lane-mcp-token-rule.spec.ts` |

## 3. Detection, capabilities, models, usage, sign-in

| Capability | Where today (file:line) | Backing RPC/API | Decision | New location | Test |
| --- | --- | --- | --- | --- | --- |
| Detection: installed, path, version | adapter:566-602 | `CliDetectionService` → `agent:getInstalledClis`-style rows | keep | adapter | `antigravity-cli.adapter.spec.ts:230-300` (keep the installed and version cases) |
| Detection: `agy --help` probe for `--input-format` and `acp` | adapter:728-812, acp-lane:47-65 (`agyHelpListsAcp`) | `agy --help` | remove-approved (the input-format probe); the `acp`-listed check is dropped with it (see D3) | deleted | delete `antigravity-cli.adapter.spec.ts:232-300` help cases; acp spec `:180`, `:198-278` help cases |
| ACP version floor 1.5.1 | acp-lane:11-12, 50-60 (`meetsAgyAcpFloor`) | `agy --version` | keep; it now gates the lane with an upgrade error instead of choosing stream-json | acp-lane, adapter `runSdk` | `antigravity-cli.adapter.acp.spec.ts:138` (kept); add a below-floor error case |
| Manifest that `capabilities()` reports | adapter:629-633, 672-726 (stream-json manifest) | `CliAdapterManifest` → messaging mode, lane policy | keep-via-ACP: always `antigravityAcpManifest` | acp-lane:92-139 | add: `new AntigravityCliAdapter().capabilities()` equals the ACP manifest without a probe |
| Messaging mode in the detection row | adapter:571, 587, 597 (`bestMessagingCapability`) | detection row | keep (now always derived from ACP) | adapter | detection spec (kept) |
| Limit reader manifest `antigravity` | adapter:722; acp-lane:136 | plan usage reader | keep | acp-lane | `limit-reader-manifest.spec.ts:12` |
| Model listing (`agy models`, ids cached for spawns) | adapter:1006-1123 | RPC `agent:listCliModels` (`libs/shared/src/lib/types/rpc.types.ts:1964`) via `libs/backend/rpc-handlers/src/lib/services/cli-model-list.service.ts:81` | keep | adapter (unchanged) | `antigravity-cli.adapter.spec.ts:302-472` (kept) |
| Plan usage `/usage` probe | `libs/backend/auth-providers/src/lib/quota/readers/antigravity-cli-usage.source.ts:89` (`-p /usage --output-format json`) | plan-usage readers | keep (print mode with JSON output, not the stream-json transport) | unchanged | existing auth-providers specs |
| Sign-in check (`ensureTokensFresh`) | adapter:609-623 | keyring reader | keep | adapter | `antigravity-cli.adapter.sign-in.spec.ts` (constructor args updated) |
| Effort allowlist for agy | `lane-spawn-policy.ts:455-456, 486-498` | `AgentSpawnEnvironment.resolveReasoningEffort` | keep (feeds ACP `thought_level`) | unchanged; comment updated | `agent-spawn-environment.service.spec.ts:290` |

## 4. Consumers and hosts

| Capability | Where today (file:line) | Backing RPC/API | Decision | New location | Test |
| --- | --- | --- | --- | --- | --- |
| Adapter registration | `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-detection.service.ts:187-190` (`new AntigravityCliAdapter(this.spawner, undefined, this.logger)`) | DI `CliDetectionService` (spawner from `SDK_TOKENS.SDK_PROCESS_SPAWNER`, :124) | keep; the constructor arguments change | same file | `cli-detection.service.spec.ts:52-53, 83`; the mock at `codex-native-selection.spec.ts:32` is unaffected |
| Public export of `AntigravityCliAdapter` | `CA/cli-adapters/index.ts:25` → `CA/index.ts:66` → `libs/backend/cli-agent-runtime/src/index.ts:1` | lib barrel | keep the export; the constructor signature changes (plan D8). No consumer outside the lib constructs it (review sweep) | unchanged | typecheck of the consumers (`ptah-electron`, `cli-engine`) |
| Electron lanes and main-agent spawns | `agent-process-manager.service.ts:1487-1535` | `ptah_agent_spawn` and lane RPCs | keep-via-ACP | unchanged | manager specs (unchanged) |
| Review lanes | `apps/ptah-electron/src/services/review/review-lane-gateway.ts:5, 74, 151` → `AgentProcessManager` | review lane gateway | keep-via-ACP | unchanged | review-core specs (unchanged) |
| Main chat with agy | `apps/ptah-electron/src/di/provider-session-composition.ts:42, 101-102` (`antigravityAcpProfile`) | provider-session runtime | keep (already ACP-only) | unchanged | `acp-provider-session-runtime.spec.ts` |
| Benchmark `cli-engine` | `libs/backend/cli-engine/src/lib/container.ts:744` (spawner), CliDetectionService from cli-agent-runtime | benchmark container | keep; no code change, scoped checks only | unchanged | cli-engine typecheck and test |
| Benchmark `platform-cli` | no agy reference (grep) | none | keep; not touched | none | none needed |
| User docs | none mention stream-json or `PTAH_AGY_TRANSPORT` (grep over `apps/ptah-docs`, `README.md`) | none | none | none | none |
| Code comments that describe stream-json as a live transport | profile:11, 14, 136; `retired-ptah-mcp-slots.ts:9-10, 22, 33`; `ptah-mcp-slots.ts:64`; `http-mcp-server.service.ts:845-846, 1211`; lane-handle:30-39; acp-lane:1-6; adapter:506 (`supportsMcp` "configured via mcp_config.json") | none | update the text | same files | none |
| harness-sync comments that name `AntigravityCliAdapter` as a live second writer of `~/.gemini/config/mcp_config.json` | `libs/backend/harness-sync/src/lib/targets/mcp/mcp-facet.port.ts:69-73`; `.../targets/mcp/mcp-config-lock.ts:13-16`; `.../lock/file-lock.ts:4-7, 286-287`; `.../targets/rival-targets.ts:50-56`; `.../targets/mcp/antigravity-mcp-facet.spec.ts:5`; the helper comment at `.../reconciler/harness-reconciler.antigravity-mcp.spec.ts:136` | none | update the text: the lock still protects any concurrent writer (other Ptah processes, the user, the reconciler), and the adapter is named only as the former writer. The spec helper and its concurrency assertions stay; only the comment changes | same files | harness-sync lint and related tests (no assertion changes) |
| Persisted settings | no settings key, DB column or UI toggle for the agy transport (grep `agyTransport`, `stream-json` in libs/frontend and persistence returned none) | none | none | none | none |

## Proposed Removals

These follow from removing the stream-json transport, which the user approved. ACP cannot
provide them. The recommendation for each is **approve**. Both are inherent in "just remove
completely", but each is a behaviour a user could notice.

- **P1 - Lanes on agy older than 1.5.1.** stream-json was the only transport below
  `AGY_ACP_MIN_VERSION` (acp-lane:11-12; adapter:871-875). After the change, starting
  an agy lane on such a binary fails with a single actionable error, "update agy to
  1.5.1 or later". Detection still lists agy as installed. Option: approve (recommended).
  Option: reject, which keeps stream-json for old binaries and contradicts the approved
  removal.
- **P2 - Automatic lane fallback when the ACP session cannot open** (spawn, `initialize`
  or `session/new` failure; lane-handle:22-28, adapter:903-978). After the change, such a
  lane fails with the ACP setup error, which already carries the sign-in hint where it
  applies. A missing sign-in never fell back anyway (lane-handle:370-380). Option: approve
  (recommended). Option: reject, which keeps a stream-json lane as a hidden second
  transport.

## Shared files with TASK_2026_2320_lnpar

These are files in the ACP, registry or manifest area that this task edits:

- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/antigravity-acp-lane.ts` (delete the override, cooldown and help helpers; the doc header; the manifest is not changed)
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/antigravity-cli.adapter.ts` (rewrite: only the ACP path stays; `runAcp` loses only its `fallBack` parameter)
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/antigravity-cli.adapter.acp.spec.ts`
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/antigravity-cli.adapter.acp.live.spec.ts` (constructor arguments only)
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/provider-session/provider-session-lane-handle.ts` (delete `fallback`/`delegate`; Grok uses this file too)
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/provider-session/provider-session-lane-handle.spec.ts`
- `libs/backend/acp-runtime/src/lib/profiles/antigravity-acp-profile.ts` (three comment lines only)
- `libs/backend/acp-runtime/src/lib/profiles/antigravity-acp-profile.spec.ts` (two test titles only)
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-detection.service.ts` (one constructor call)
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/provider-session/lane-stderr-redaction.ts` (new, F1) and its spec. This is a new file, so it cannot conflict, but 2320 sees it in the lane-handle `diagnostic` branch.

### TASK_2026_2320 files this task relies on but does not edit

| File | What this task relies on | Rule if 2320 merged first (plan A1) |
| --- | --- | --- |
| `libs/backend/acp-runtime/src/lib/acp-session-runtime.ts` | A failed resume starts a new session with an info notice (`:1207-1229`, `:1765`) | Re-verify the new-session fallback before implementing. If it changed, update the resume row and its test |
| `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.interface.ts` | `SdkHandle` members the lane handle returns; `mcpConfigWriteFailed` stays (D6) | Rebase onto 2320's interface. Delete only the lane-handle getter |
| `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/grok-cli.adapter.ts` | Grok's lane-handle path with no `fallback` (`:272-278`) | Re-run the Grok spec after the lane-handle edit |
| `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts` | Revoke and rethrow on a `runSdk` rejection (`:1556-1570`); `onMcpConfigRestored` for agy (`:1524-1527`) | Re-verify both before implementing |

### Obsolete rows in TASK_2026_2320 (do not edit that worktree from this task)

After this task merges, TASK_2026_2320 `task-description.md:68` (the "Antigravity stream-json"
capability row) and `:87` (the "Antigravity (ACP and stream-json)" wording) describe a
transport that no longer exists. The TASK_2026_2320 coordinator drops or rewords them when it
rebases.

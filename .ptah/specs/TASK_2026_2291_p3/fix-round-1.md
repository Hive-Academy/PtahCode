# Fix round 1 — TASK_2026_2291_p3 (P3: Antigravity lane on `agy acp`)

Input: `code-logic-review.md` (REVISE, 3 serious, 5 moderate) and the coordinator's brief.
Worktree `D:/projects/PtahCode/.claude-worktrees/provider-session-p3`, on `f3dd358cb`.
Nothing staged or committed.

## Findings and changes

| # | Finding | Change | Proving spec |
|---|---|---|---|
| S1 | `plan`/`auto-edit` lanes auto-approved every `session/request_permission` (sink saw `autoApprove: undefined`) | The profile's rule is exported as `antigravitySkipsPermissions` (`antigravity-acp-profile.ts`). `runAcp` passes `autoApprove: antigravitySkipsPermissions(options)`, so only yolo, or no permission with auto-approve on, can grant. The same rule picks `--dangerously-skip-permissions`. | `antigravity-cli.adapter.acp.spec.ts` "tool approvals follow the profile rule (S1)": `auto-edit` and `plan` get `reject` with argv `['acp']`, `autoApprove: false` gets `reject`, yolo and the unattended default get `allow`. `antigravity-acp-profile.spec.ts` `it.each` truth table of the predicate (9 rows). |
| S2 | A probe timeout or spawn error was cached as "no ACP" | `probeAcp` caches only definite answers: version below the floor, or a `--help` read that lists or does not list `acp`. An unreadable version, a timed-out, failed or empty `--help` returns `undefined`, so the lane runs on stream-json and the next lane probes again. `readAgyHelp` stores help text only from a child that closed with output before the timeout. Floor met but `acp` not listed logs `warn`. Concurrent probes of one binary share one promise. The `streamJsonProbe` seam no longer blocks ACP, because the ACP probe reads `--help` itself when no text was captured. | `antigravity-cli.adapter.acp.spec.ts` "a probe that could not tell is not cached (S2)": `--help` times out twice (fake timers), then the next detect chooses ACP. A spawn error plus an unread version, then ACP. A definite "not listed" makes one `--help` spawn across two detects. An injected probe answers `undefined`, then is re-run once for two concurrent detects. |
| S3 | No escape from a broken `agy acp` | (a) The lane handle takes an optional `fallback` (`ProviderSessionLaneFallback`). While the setup runs, output is held (up to 200 items). If `session.start()` fails with no session id (spawn, `initialize` or `session/new`), with no abort and no `auth-required`, the lane runs the fallback. It drops the held ACP errors, emits one `info` (`… could not open an ACP session (<reason>); this lane runs on stream-json instead.`), forwards output, segments, stream events and session ids, and delegates `continue`, `interrupt`, `getPid`, `getSessionId`, `supportsContinuation`, `supportsInterrupt`, `abort` and `mcpConfigWriteFailed`. Once a session exists the lane stays on ACP (for example a refused model), so nothing switches mid-run. (b) `PTAH_AGY_TRANSPORT=acp\|stream-json` (`AGY_TRANSPORT_ENV`, `readAgyTransportOverride`) forces one transport: `acp` skips the probe and never falls back, `stream-json` never probes or spawns `agy acp`. Unset, `auto` or an unknown value keeps the automatic choice. `capabilities()` follows the override. | `provider-session-lane-handle.spec.ts` "fallback when the ACP session never opens (S3)", 7 cases: an `initialize` failure falls back, with no error segment, the info, forwarded segments and output, and delegated pid, session id, continue and abort. A non-auth `session/new` failure falls back. `auth-required` does not fall back. A refused model after `session/new` does not fall back. An abort during the setup does not fall back. A failing fallback gives one error naming both transports. Without a fallback the single error is unchanged. `antigravity-cli.adapter.acp.spec.ts` "a session that never opens falls back to stream-json (S3)": runs `runStreamJson` with the same options. Forced `acp` gives no fallback and one error. Forced `stream-json` spawns no ACP. "transport override (S3)": the env parsing table, `stream-json` skips the probe, `acp` forces the ACP manifest, and the default reads `process.env`. |
| M | Projector state after an interrupt | `runTurn` creates a fresh `createFlatStreamProjector()` when the previous turn ended `interrupted`. | `antigravity-cli.adapter.acp.spec.ts` interrupt case: after the cancelled `run_command` turn, the next turn's stream starts with `message_start`, its `text_delta` `AFTER-INTERRUPT` has `blockIndex: 0`, it has no `tool_result`, and it uses one `messageId`. |
| M | ACP usage carries no model (`actualModel` lost) | Root cause: agy sends the protocol's `PromptResponse.usage` (`cachedReadTokens`, …), not `_meta.usage`, so the runtime dropped agy usage entirely and waited the 2 s drain on every turn. `readAcpStandardUsage` (`acp-session-helpers.ts`) maps it, and the context comes from the turn's last `usage_update.used`. Usage without a model gets the session model: acknowledged or bound model, else the advertised `model` option's `currentValue`. Grok usage now carries its model too. | `acp-session-runtime.spec.ts` "reads the protocol PromptResponse.usage and names the advertised model (no drain wait)". `antigravity-acp-profile.spec.ts` recorded tool-use turn: usage `{model: 'gemini-3.8-flash-low', inputTokens: 12618, outputTokens: 37, cacheReadTokens: 8415, cacheWriteTokens: 0}`. `antigravity-cli.adapter.acp.spec.ts`: the usage segment and the `message_complete` stream event carry the model. |
| M | No ACP rate-limit or quota proof | The runtime keeps the JSON-RPC error `data.message` in the error segment (`genericFailure`). No code change. | `antigravity-cli.adapter.acp.spec.ts` "ACP quota and rate-limit errors classify as on stream-json": a `-32603` prompt error with `Error 429 RESOURCE_EXHAUSTED … reset after 144h24m50s.` gives `classifyLaneLimit('antigravity')` quota, equal to the classification of the same stream-json text. A `HTTP 429 Too Many Requests: rate limit exceeded` error matches `matchesApiRateLimit` and is not quota. The wordings are synthetic (provisional F36 wording); no agy ACP quota error has been recorded. |
| M | `ptah` MCP name clash with the persistent `mcp_config.json` entry | The rename happens in the profile's `buildMcpServers`: `ANTIGRAVITY_ACP_PTAH_MCP_NAME = 'ptah_lane'`, so agy tools are `mcp_ptah_lane_<tool>`. The shared `lane-mcp-attachments.ts` is unchanged. HEAD never modified it (`git diff 61cec87d9 -- …/lane-mcp-attachments.ts` is empty), so there was nothing to revert. Grok still sends `ptah`. | `antigravity-acp-profile.spec.ts` http entry plus the recorded `session/new` (`name: 'ptah_lane'`), `antigravity-cli.adapter.acp.spec.ts` `mcpServers` assertion, and the live D9 spec (the tool is listed and called under the new name, token returned). |
| M | `capabilities()` depends on the last probed binary | Each run validates against its own transport's manifest: `runAcp` uses `antigravityAcpManifest(...)`, and `runStreamJson` (the former `runSdk` body) uses `streamJsonManifest()`. A stream-json fallback is therefore never validated against the ACP manifest. `capabilities()` keeps the last-probed field, with the single-binary assumption documented on the field. | Covered by the fallback and forced-transport specs above. |
| M | Batch report: user MCP servers | Note added under "D9 outcome" in `batch-report.md`: Ptah forwards none on the ACP path, agy loads them from its shared `mcp_config.json` (D10), same as stream-json, and the `ptah_lane` naming reason. | — |
| m | No in-flight probe de-duplication; `streamJsonProbe` seam disables ACP; `runSdk` probe cache key | Fixed by the de-duplication and the help self-read (S2 row). Both call sites use the same key: `detect()` probes `detection.path`, and the manager passes `binaryPath: detection.path`, which `runSdk` uses. | S2 specs. |
| extra | P2 rebase conflict: `provider-session-lane-handle.spec.ts` "leaves a failure to its error segment so the card does not show it twice" failed on HEAD | Since `61cec87d9` the projector opens a message for a failed `terminal` with no output, so a prompt error came back as `Error: the turn failed`. The lane handle now also skips projecting a failed `terminal` of a turn whose error already went out as a segment and that had no stream rows. A turn with rows still gets its `message_complete`. | That spec passes again. |

Not changed (outside the listed Serious and Moderate items): the reviewer's Q3 note that `thought_level` is a non-binding hint, so a model without the option drops the effort with only the runtime's skip. The reverse resume direction (an ACP id fed to `--conversation`) also has no spec.

## Decisions

| Decision | Options | Evidence | Reversible |
|---|---|---|---|
| Transport override is an env var `PTAH_AGY_TRANSPORT`, not a setting | env / `agentOrchestration.*` setting | A setting spans `shared`, `platform-core` and the settings UI, outside this lane's projects. Precedent: `PTAH_CODEX_SKIP_WRITE_DAC_PREFLIGHT`. | yes; the coordinator can add a setting that feeds `AntigravityAcpSeam.transport` |
| No fallback on `auth-required` | fall back / do not | Both transports share agy's signed-in profile (D10), so stream-json would fail the same way, and the ACP error carries the sign-in hint. | yes |
| Fallback only when no session id exists | also after config/mode failures | A refused binding model is a user setting error, and the brief scopes the fallback to spawn, `initialize` and `session/new`. | yes |
| Usage model order: agent-reported, then acknowledged or bound, then advertised `currentValue` | `currentValue` first | agy reports the base (`gemini-3.8-flash`) as `currentValue` after `gemini-3.8-flash-low` is bound. The bound id is accepted (binding) and keeps the effort. | yes |
| MCP name `ptah_lane` (underscore) | `ptah-lane` | An underscore is valid in every model's tool-name pattern. The live run listed and called `mcp_ptah_lane_ptah_echo_token`. | yes |
| A stream-json `--help` timeout still caches the stream-json argv decision | change it too | Pre-existing stream-json behaviour, outside the brief. The ACP decision no longer depends on it. | yes |

## Files

MODIFIED (all LF):
- `libs/backend/acp-runtime/src/lib/profiles/antigravity-acp-profile.ts`: `antigravitySkipsPermissions`, `ANTIGRAVITY_ACP_PTAH_MCP_NAME`, MCP rename.
- `libs/backend/acp-runtime/src/index.ts`: exports of the two above.
- `libs/backend/acp-runtime/src/lib/acp-session-helpers.ts`: `readAcpStandardUsage`.
- `libs/backend/acp-runtime/src/lib/acp-session-runtime.ts`: protocol usage, `latestUpdateUsed`, `sessionModel()`.
- `libs/backend/acp-runtime/src/lib/acp-session-runtime.spec.ts`, `.../profiles/antigravity-acp-profile.spec.ts`: specs.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/antigravity-acp-lane.ts`: `AGY_TRANSPORT_ENV`, `AgyTransportOverride`, `readAgyTransportOverride`, seam `transport`, `probe` may answer `undefined`.
- `.../cli-adapters/antigravity-cli.adapter.ts`: S1, S2, S3, `streamJsonManifest()`, `runStreamJson()`, `readAgyHelp()`, `runAcpProbe()`.
- `.../cli-adapters/provider-session/provider-session-lane-handle.ts`: `fallback`, held setup output, projector reset, failed-terminal de-duplication.
- `.../cli-adapters/antigravity-cli.adapter.acp.spec.ts`, `.../provider-session/provider-session-lane-handle.spec.ts`: specs.
- `.ptah/specs/TASK_2026_2291_p3/batch-report.md`: user-MCP note.

Not touched: `lane-mcp-attachments.ts` (shared), `grok-*`, the stream-json lane body (only renamed from `runSdk` to `runStreamJson`, and its manifest call changed to `streamJsonManifest()`).

## Checks (focused, lane rules; no `npm run verify`, no `nx`)

- `npx tsc --noEmit --project` on `libs/backend/acp-runtime/tsconfig.lib.json`, `libs/backend/acp-runtime/tsconfig.spec.json`, `libs/backend/cli-agent-runtime/tsconfig.lib.json` and `libs/backend/cli-agent-runtime/tsconfig.spec.json`: no output, clean (`.ptah/tmp/p3-fix-tsc.log`).
- `npx jest --config libs/backend/acp-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath <all 14 non-live acp-runtime specs>`: `Test Suites: 14 passed, 14 total`, `Tests: 185 passed, 185 total` (`.ptah/tmp/p3-fix-acp-runtime.log`).
- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath antigravity-cli.adapter.acp.spec.ts antigravity-cli.adapter.spec.ts antigravity-cli.adapter.mcp.spec.ts antigravity-result-diagnostics.spec.ts provider-session-lane-handle.spec.ts provider-session-lane-handle.sdk-unavailable.spec.ts lane-mcp-attachments.spec.ts lane-acp-spawn.spec.ts grok-cli.adapter.spec.ts limit-reader-manifest.spec.ts cli-detection.service.spec.ts agent-process-manager.service.spec.ts`: `Test Suites: 12 passed, 12 total`, `Tests: 537 passed, 537 total` (`.ptah/tmp/p3-fix-cli-agent-runtime.log`).
- `npx eslint <11 changed files>`: `✖ 25 problems (0 errors, 25 warnings)`. All are pre-existing: `max-lines` in `acp-session-runtime.ts` and `antigravity-cli.adapter.ts`, plus 23 non-null assertions in the stream-json code (`.ptah/tmp/p3-fix-eslint.log`).
- `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`: exit 0, `libs/backend/cli-agent-runtime: 1 ok (baseline 1)` (the pre-existing `lane-mcp-credentials.ts:102`), no new site and no orphaned marker in the changed files. The new fallback catch logs through `logger.error` and emits an error segment (`.ptah/tmp/p3-fix-degradation.log`).
- Live (`PTAH_LIVE_AGY=1`, agy 1.5.13, signed in):
  - `antigravity-cli.adapter.acp.live.spec.ts`: `Tests: 2 passed, 2 total` (28.9 s). D9 passed with the entry named `ptah_lane`, and interrupt then continue passed (`.ptah/tmp/p3-fix-live-lane.log`).
  - `agy-acp.live.spec.ts`: `Tests: 1 passed, 1 total` (9.5 s) (`.ptah/tmp/p3-fix-live-runtime.log`).
  - `tasklist /FI "IMAGENAME eq agy.exe"` before and after: `INFO: No tasks are running which match the specified criteria.`
- Not run, per lane rules: `npm run verify`, the gate, `cli-engine` and `ptah-electron` projects, and the Electron live check with the real Ptah MCP. The coordinator owns them. `cli-engine` and `platform-cli` were not edited. The `AntigravityCliAdapter` constructor signature is unchanged; the seam gained only optional fields.

## Round 2

Input: `code-logic-review-round-2.md` (APPROVED; 3 Moderate, 8 Minor), plus the coordinator's list.

| # | Finding | Change | Proving spec |
|---|---|---|---|
| M1 | After a fallback, a failed `mcp_config.json` write was never reported. The manager reads `mcpConfigWriteFailed` once, at spawn. | The lane handle checks `next.mcpConfigWriteFailed` right after `fallback.run()`. When it is true, it logs `warn` and emits the info `Ptah MCP was not configured for the stream-json lane (config-write-failed); report in your final message.` The stream-json handle still prints its own output line. | `provider-session-lane-handle.spec.ts`: "reports a fallback that could not write its MCP config (round-2 M1)" and "adds no MCP warning when the fallback configured MCP". |
| M2 | Every lane paid the full handshake wait on a persistent ACP failure | `AGY_ACP_FAILURE_COOLDOWN_MS` is 10 min, kept per binary like the probe cache (`acpFailedAtByBinary`). It is set in `runStreamJsonFallback`, so only when the fallback actually ran. While it runs, `runSdk` sends `auto` lanes straight to stream-json with one info segment (`… an earlier ACP session failed to start within the last 10 minutes.`) plus a log line, and `capabilities()` reports the stream-json manifest. It expires lazily. `PTAH_AGY_TRANSPORT=acp` ignores it and never records one. The clock is a seam (`AntigravityAcpSeam.now`). | `antigravity-cli.adapter.acp.spec.ts` "ACP failure cooldown (round-2 M2)": the second lane spawns no ACP and gets exactly that info, `capabilities()` reports stream-json, and at cooldown end ACP is tried again. Forced `acp` with a seeded failure still spawns ACP and does not fall back. |
| M3 | Resume id crosses transports on fallback | Not provable: the code captures stream-json `conversation_id` and ACP `sessionId` separately, and no recording passes an ACP id to `--conversation`. So the fallback drops `resumeSessionId`, which makes `buildTaskPrompt` send the full task, and the lane gets the info `Antigravity cannot resume the earlier session on stream-json (it may be an ACP session id); this lane starts a fresh conversation.` A cooled-down lane (M2) keeps its resume id, as on any binary without ACP: that is the pre-P3 stream-json path, and its ids come from earlier stream-json runs. | `antigravity-cli.adapter.acp.spec.ts` "starts a fresh conversation instead of resuming an id on stream-json (round-2 M3)": `runStreamJson` gets `resumeSessionId: undefined`, and the info segment is present. |
| minor | `readAgyHelp` dropped the cause | Logs `warn` with the cause: `agy --help timed out` (`timeoutMs`), `could not be spawned` (`error`), or `printed nothing` (`exitCode`). | "logs why --help could not be read (round-2 minor)": a spawn error logs `{ error: 'spawn EBUSY' }`. |
| minor | Unknown `PTAH_AGY_TRANSPORT` silently meant `auto` | `readAgyTransportOverride(env, onUnknown)` reports the raw value, except an unset, blank or `auto` value. The adapter warns once per adapter with the accepted values. | "reports an unknown value through onUnknown, but not auto or blank" and "warns once about an unknown environment value". |
| minor | No spec showed the failed ACP child is killed before the fallback spawns | No change needed: `runSetup` stops the child synchronously before `start()` resolves. | `provider-session-lane-handle.spec.ts` "kills the failed ACP child before the fallback spawns": `killCount` is 1 when `fallback.run()` is entered, and the fake agent is closed. |

Not addressed: the remaining Minor items. These are the `detect()` catch, the serial 8 s reads on a slow start, a `session/new` reply racing the handshake timeout, `thoughtTokens`/cost in protocol usage, synthetic-only quota wording, a non-binding `thought_level`, and the reverse resume direction.

### Round 2 checks

- `npx tsc --noEmit --project` on the `tsconfig.lib.json` and `tsconfig.spec.json` of `acp-runtime` and of `cli-agent-runtime`: all `exit 0`, no output (`.ptah/tmp/p3-r2-tsc.log`).
- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath` on the same 12 specs as round 1: `Test Suites: 12 passed, 12 total`, `Tests: 546 passed, 546 total` (`.ptah/tmp/p3-r2-cli-agent-runtime.log`). After the prefer-const fix, `provider-session-lane-handle.spec.ts` alone gave `Tests: 74 passed, 74 total` (`.ptah/tmp/p3-r2-lane.log`).
- `npx jest --config libs/backend/acp-runtime/jest.config.ts … <14 non-live specs>`: `Test Suites: 14 passed, 14 total`, `Tests: 185 passed, 185 total` (`.ptah/tmp/p3-r2-acp-runtime.log`).
- `npx eslint <changed .ts files>`: `✖ 25 problems (0 errors, 25 warnings)`. They are the existing `max-lines` in `acp-session-runtime.ts` and `antigravity-cli.adapter.ts`, plus 23 non-null assertions in the stream-json code (`.ptah/tmp/p3-r2-eslint.log`).
- `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`: exit 0, `libs/backend/cli-agent-runtime: 1 ok (baseline 1)` (the existing `lane-mcp-credentials.ts:102`) (`.ptah/tmp/p3-r2-degradation.log`).
- Live `PTAH_LIVE_AGY=1` `antigravity-cli.adapter.acp.live.spec.ts`: `Tests: 2 passed, 2 total` (30.5 s) (`.ptah/tmp/p3-r2-live-lane.log`). Afterwards, `tasklist /FI "IMAGENAME eq agy.exe"` printed `INFO: No tasks are running which match the specified criteria.`
- All changed files use LF line endings. Nothing is staged or committed.

## Round 3 (live F1)

Input: `electron-live-check.md` finding F1.

- A lane with the default permission resolves to `plan`.
- In plan mode, agy 1.5.14 sends `session/request_permission` for every MCP call (`agy_tool_safety: unsupported_tool`).
- S1's `autoApprove: false` refused all of them, including `mcp_ptah_lane_ptah_search_files`.
- The lane ended `completed`, exit 0, with no output, and `ptah_agent_read` showed nothing.

### Stream-json comparison (what the old lane passed per mode)

Sources: `lane-spawn-policy.ts` `antigravityArgv`, `antigravity-cli.adapter.ts` `buildAntigravityArgs`, and the adapter header note on `--dangerously-skip-permissions`. agy has no `--approval-mode` or `--yolo` flag; those are gemini-cli flags. agy takes `--mode` and `--dangerously-skip-permissions`.

| Lane permission | stream-json argv | Who decided tool approvals | ACP lane now |
|---|---|---|---|
| none, auto-approve on | `--dangerously-skip-permissions` | nobody; everything runs | Same flag. agy sends no request. |
| none, `autoApprove: false` | no flag | agy's interactive prompt. The adapter notes "required or file-writing tool calls hang waiting for interactive approval": there was no Ptah route, so the turn ran into `--print-timeout`. | Every request is refused, and the refusal is shown. |
| `plan` | `--mode plan`, skip flag removed | agy's plan mode. Anything it prompted for hung as above. | ACP mode `plan`. Ptah grants read-only kinds and `ptah_lane` MCP tools, and refuses the rest visibly. |
| `auto-edit` | `--mode accept-edits`, skip flag removed | agy's accept-edits mode. Prompts hung as above. | ACP mode `accept-edits`. Also grants `edit`. Exec, delete, move and `switch_mode` are refused. |
| `yolo` | `--dangerously-skip-permissions` | nobody | Same flag, ACP mode `auto`. The sink grants any request agy still sends. |

The stream-json lane never answered an approval. A tool that needed one either ran under the skip flag or hung until the print timeout. Nobody ever checked live whether `agy -p --mode plan` prompted for MCP tools; the live check says so. The ACP grant set follows each mode's intent instead. Plan mode may read, accept-edits may also edit, and only yolo or an unattended lane may execute.

### Changes

| # | Item | Change | Proving spec |
|---|---|---|---|
| 1 | Plan mode refused read-only and Ptah tools | New optional profile hook `AcpVendorProfile.grantsWithoutAutoApprove(request, options)` (`acp-vendor-profile.ts`). The runtime hands it to `decideAcpPermission` as `grant` (`acp-session-runtime.ts`, `answerPermission`). With auto-approve off, a request the hook accepts gets `allow_once`. `antigravityGrantsWithoutAutoApprove` (`antigravity-acp-profile.ts`) grants the kinds `read`, `search`, `fetch` and `think`, plus the lane's own Ptah MCP tools. A Ptah tool must have kind `other` or no kind. Its agy `name` must match `^mcp_ptah_lane_\w+$`; without a `name`, its title must match `^Run mcp_ptah_lane_\w+$`. Any other kind never counts as a Ptah tool, so an `execute` titled like one is still refused. Tools of the persistent `ptah` entry (`mcp_ptah_*`, no lane bearer) and of other MCP servers are refused. Grok has no hook, so its behaviour is unchanged. | `antigravity-acp-profile.spec.ts`, "headless grants in narrower modes (live F1)": 15 request shapes, each in plan and auto-edit. No permission, `ask` and yolo grant nothing extra. A malformed request does not throw. `acp-permission-policy.spec.ts`: `grant` is honoured with auto-approve off. |
| 2 | Accept-edits | `auto-edit` adds `edit`. `delete`, `move`, `execute` and `switch_mode` stay refused (decision below). | The same table. `antigravity-cli.adapter.acp.spec.ts`, "%s request: plan and auto-edit answers (live F1)", over the real fake-agent wire: read-only is allow/allow, ptah_lane MCP is allow/allow, edit is reject/allow, exec is reject/reject. Yolo grants all four. |
| 3 | Visible refusals | `decideAcpPermission` now names the lane mode: `Refused permission for <title> in plan mode: auto-approve is off`. The runtime marks that info with `notice: 'permission-refused'`, a new optional field on the `info` event (`provider-session-events.ts`). The lane handle also writes these infos to its output as `[Antigravity] Refused permission …`, so `ptah_agent_read` shows them. The segment stays `info`. | `antigravity-cli.adapter.acp.spec.ts`, "shows a refusal in the lane output and segments, naming the tool and mode". Policy spec, "names the lane mode in a refusal". |
| 4 | Live proof | New gated live case, "calls the ptah_lane MCP tool in plan mode, the default lane permission (live F1)". It requires at least one `session/request_permission` from agy, each answered with an `allow_*` option. It also requires a `tools/call` at the test MCP server, no `Refused permission` segment, and the token in the reply. | Live run below: passed. |

### Decisions (round 3)

| Decision | Options | Evidence | Reversible |
|---|---|---|---|
| The grant lives in a profile hook, not in `decideAcpPermission` | a generic kind ladder in the policy | The mode meanings (`plan`, `auto-edit`) and the `ptah_lane` name are agy-specific. Grok and other ACP agents keep "auto-approve off refuses everything". | yes |
| `auto-edit` grants `edit` only, not `delete` or `move` | edits plus deletes and moves | The brief: "approve edits too, but not exec". agy names the mode accept-edits, and the brief itself listed deletes and moves separately from edits. This is the narrowest choice. | yes: add the kinds to `EXTRA_KINDS['auto-edit']` |
| A Ptah tool is recognised by agy's `name` field first, then by the `Run <name>` title | title only | The recordings carry `name: "mcp_ptah_ptah_echo_token"`, `kind: "other"`, `title: "Run …"` (`antigravity-p3-ptah-mcp-tool-use.ndjson`). | yes |
| A refusal stays an `info` segment plus an output line, not an `error` | an error segment | An `error` segment would feed the failure and rate-limit readers and the failed-terminal de-duplication. A plan lane refusing an edit is policy, not a failure. | yes |

Residual risk: a user MCP server whose name starts with `ptah_lane` (for example `ptah_lane_x` in `mcp_config.json`) would match the prefix and be granted in plan mode. This is unlikely, and that server is the user's own.

### Round 3 checks

- **Typecheck:** `npx tsc --noEmit --project` on `tsconfig.lib.json` and `tsconfig.spec.json` of `provider-session-contracts`, `acp-runtime` and `cli-agent-runtime`: all six `exit 0` (`.ptah/tmp/p3-r3-tsc.log`).
- **acp-runtime:** `npx jest --config libs/backend/acp-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath <14 non-live specs>`: `Test Suites: 14 passed, 14 total`, `Tests: 206 passed, 206 total` (`.ptah/tmp/p3-r3-acp-runtime.log`).
- **provider-session-contracts:** `npx jest --config libs/backend/provider-session-contracts/jest.config.ts … <2 specs>`: `Test Suites: 2 passed`, `Tests: 19 passed, 19 total` (`.ptah/tmp/p3-r3-contracts.log`).
- **cli-agent-runtime:** `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts … <the same 12 specs as rounds 1-2>`: `Test Suites: 12 passed, 12 total`, `Tests: 555 passed, 555 total` (`.ptah/tmp/p3-r3-cli-agent-runtime.log`).
- **eslint:** `npx eslint <changed .ts files>`: `✖ 1 problem (0 errors, 1 warning)`. It is the existing `max-lines` warning in `acp-session-runtime.ts` (`.ptah/tmp/p3-r3-eslint.log`).
- **degradation-audit:** `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`: exit 0, `libs/backend/cli-agent-runtime: 1 ok (baseline 1)` (`.ptah/tmp/p3-r3-degradation.log`).
- **Live:** `PTAH_LIVE_AGY=1 PTAH_AGY_LIVE_MODEL=gemini-4-hydrogen-low` on `antigravity-cli.adapter.acp.live.spec.ts`, agy 1.5.14: `Tests: 3 passed, 3 total` in 46.7 s. The three cases are D9, the new plan-mode F1 case, and interrupt then continue (`.ptah/tmp/p3-r3-live-lane.log`).
- **agy processes:** `tasklist /FI "IMAGENAME eq agy.exe"` before and after: `INFO: No tasks are running which match the specified criteria.`
- All changed files use LF line endings. Nothing is staged or committed.

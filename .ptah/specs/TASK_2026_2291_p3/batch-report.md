# Batch report — TASK_2026_2291_p3 (P3: Antigravity lane on `agy acp`)

Worktree `D:/projects/PtahCode/.claude-worktrees/provider-session-p3`, branch
`feat/provider-session-p3` (on P2 `d6cdf3b`). Nothing committed or pushed.

## D9 outcome — PASSED (P3x not needed)

The Ptah MCP `http` entry in `session/new.mcpServers` works on agy 1.5.13, although agy
advertises no `mcpCapabilities`:

- agy connects to the entry, sends the `Authorization: Bearer <lane token>` header on every
  POST (`server/discover`, `initialize`, `notifications/initialized`, `tools/list`,
  `tools/call`), lists the tool as `mcp_ptah_ptah_echo_token` and calls it; the tool result
  reaches the reply (`TOKEN-ZETA-9917`).
- `~/.gemini/config/mcp_config.json` is byte-identical before and after (sha256
  `2282ab3d…f547` before/after, live spec + manual hash).
- Proof: gated live spec `antigravity-cli.adapter.acp.live.spec.ts` test 1 (a minimal local
  Streamable-HTTP MCP server; Ptah's real MCP server cannot run inside jest) and the recorded
  fixture `antigravity-p3-ptah-mcp-tool-use.ndjson`.
- Not yet proven: Ptah's real MCP server and a real `ptah_*` tool in Electron. That is the
  coordinator's Electron live check (P3 manual script). Side observation: agy also probes
  `GET /.well-known/oauth-protected-resource[/agent/x]` without the bearer; the test server
  answered 405 and agy carried on.

Result: the ACP lane never writes `mcp_config.json`. The stream-json fallback keeps the facet
write. P3x (stdio bridge) is **not needed** for the lane; P8 chat can use the same http entry.

## Files

CREATED
- `libs/backend/acp-runtime/src/lib/profiles/antigravity-acp-profile.ts`: the `agy acp` profile
  (argv, Windows env/console, http MCP, modes, model/thought_level, model error wording).
- `libs/backend/acp-runtime/src/lib/profiles/antigravity-acp-profile.spec.ts`: rule specs and
  runtime specs on the two P3 recordings (MCP tool use, interrupt then continue).
- `libs/backend/acp-runtime/src/testing/tee-transport.ts` (+ `tee-transport.spec.ts`): test-only
  tee recorder (`createAcpTeeRecorder`), `redactAcpEnvelopes` (paths in both slash forms and
  URL-encoded, bearer tokens, a non-boolean `tier`), `writeAcpFixture`.
- `libs/backend/acp-runtime/src/testing/live-process-spawner.ts`: the plain `child_process`
  spawner for the gated live specs (moved out of `agy-acp.live.spec.ts`, now shared).
- `libs/backend/acp-runtime/src/lib/__fixtures__/antigravity-p3-ptah-mcp-tool-use.ndjson`,
  `antigravity-p3-cancel-then-continue.ndjson`: real agy 1.5.13 turns recorded through the tee
  transport, redacted (checked: no user name, home or tmp path, no bearer token; the tier is
  `<redacted>`).
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/antigravity-acp-lane.ts`:
  `AGY_ACP_MIN_VERSION` (1.5.1), `meetsAgyAcpFloor`, `agyHelpListsAcp`, `AntigravityAcpSeam`,
  `antigravityAcpManifest` (kept out of the already oversized adapter file).
- `.../cli-adapters/antigravity-cli.adapter.acp.spec.ts`: transport choice (floor, help listing,
  no spawner), ACP `runSdk` on the recordings (http entry, no `mcp_config.json`, folder trust,
  stream events), legacy model id normalised, interrupt + continue on the same pid, `ask` refused.
- `.../cli-adapters/antigravity-cli.adapter.acp.live.spec.ts`: gated live spec (`PTAH_LIVE_AGY=1`,
  `PTAH_RECORD_AGY_FIXTURES=1` to re-record) through the real adapter.

MODIFIED
- `.../cli-adapters/antigravity-cli.adapter.ts`: ACP path in front of the unchanged stream-json
  lane: `probeAcp` (cached per binary), `runAcp`, ACP manifest in `capabilities()`, help text
  captured by the existing `--help` probe, 4th ctor param `acp: AntigravityAcpSeam = {}`.
- `libs/backend/acp-runtime/src/index.ts`: export `antigravityAcpProfile` (1 line).
- `libs/backend/acp-runtime/src/testing/index.ts`: append exports (tee recorder, live spawner).

### Shared-file edits (for the P2 rebase)

| File | Edit | Size |
|---|---|---|
| `cli-agent-runtime/.../provider-session/provider-session-lane-handle.ts` | m-4: import `createFlatStreamProjector` + `FlatStreamEventUnion`; header doc lines; one `stream` emitter + projector after `sessionResolved`; in `onEvent` after the segment loop, `error` events skipped then `projector.project` → `stream.emit`; `onStreamEvent: stream.subscribe` in the returned handle. No other line touched. | +24/-2 |
| `cli-agent-runtime/.../provider-session/provider-session-lane-handle.spec.ts` | import of `FlatStreamEventUnion`; one new `describe` appended at the end (2 cases). | +65/-1 |
| `acp-runtime/src/lib/live/agy-acp.live.spec.ts` | local spawner replaced by `createLiveProcessSpawner()`; header comment. | +4/-56 |
| `acp-runtime/src/index.ts`, `acp-runtime/src/testing/index.ts` | export lines only. | +1, +7 |

No edits to `acp-session-runtime.ts`, `acp-approval-adapter.ts`, `acp-process-transport.ts`,
`acp-replay-collector.ts`, `acp-session-update-mapper.ts` or `flat-stream-projector.ts`.

## Stack observed

TypeScript Nx libs; no DI for adapters (plain constructor args, `cli-detection.service.ts:189`
constructs `new AntigravityCliAdapter(this.spawner, undefined, this.logger)`, unchanged); lane
policy validation through `validateLaneSpawnPolicy` (`lane-spawn-policy.ts`); ACP runtime from
`@ptah-extension/acp-runtime` (`createAcpSession`, profile interface `acp-vendor-profile.ts`);
lane handle `provider-session-lane-handle.ts` (Grok model in `grok-cli.adapter.ts`).

## Decisions

| Decision | Options | Evidence | Reversible |
|---|---|---|---|
| ACP probe reads the help text the stream-json probe already spawns (`agy --help` lists `acp`) plus `agy --version` >= 1.5.1; no `agy acp --help` spawn. | `agy acp --help` exit 0 (plan) / reuse `agy --help` | Both answer in ~0.6 s on 1.5.13; reusing saves a spawn per binary; no probe ever spawns `agy acp`. | yes |
| ACP only with a spawner (or a spec transport); otherwise stream-json. | — | The lane handle refuses to run without one; all existing specs construct without a spawner and so stay on stream-json unchanged. | yes |
| `cancelBehavior: 'await-reply'` (plan wrote `wait-for-prompt`, which is not a value of `AcpCancelBehavior`). | `await-reply` / `kill` | Live: `session/cancel` mid `ping` → prompt answers `stopReason: cancelled`, same pid takes the next prompt (`antigravity-p3-cancel-then-continue.ndjson`). | yes |
| Unattended lanes (no permission + autoApprove, or yolo) add `--dangerously-skip-permissions` to `agy acp`. | flag / headless sink only | Parity with stream-json argv; `agy acp --help` lists the flag; with it no `session/request_permission` was sent for MCP or shell. Without it agy asks per MCP tool (observed in the scratch probe), which the headless sink would allow anyway. | yes |
| Modes: plan→`plan`, auto-edit→`accept-edits`, ask→`default`, yolo→`auto` (PF-4 ids). | — | `session/new.modes` of the recording. | yes |
| `ask` stays unsupported on the ACP **lane** (plan said supported). | supported / unsupported | A lane uses the headless sink: with auto-approve it would grant every request, without it reject every one, so "ask" cannot be honoured until an approval route exists (P7). Manifest reason names it. | yes |
| Model: `agyModelId(model)` as a binding `model` config entry; effort as non-binding `thought_level` only when the id has no effort suffix; `max`→`xhigh`. | strip suffix / full id | Live: `set_config_option model=claude-sonnet-5-5-medium` accepted (also the base); `gpt-oss-120b-medium` is an option value, so suffixes are not stripped. | yes |
| `needsConsole: true` + `NODE_PTY_USE_CONPTY=0` on Windows (Assumption in plan). | — | Default worked live (shell tool ran, interrupt worked); the no-console variant was not tried, per plan ("only if the default fails"). | yes |
| Lane `onStreamEvent` skips `error` events. | project all / skip errors | The agent card renders `error` segments next to the event tree (`cli-agent-output.component.ts` `executionNodes`), so projecting errors would show each failure twice. | yes |
| No user setting to force stream-json; the first-turn ACP failure keeps the lane handle's single error segment. | add `agentOrchestration.antigravityTransport` | Plan mentions "naming the fallback setting", but no such setting exists; adding one spans `shared`, `platform-core`, settings UI, outside the P3 project list. **Open for the coordinator** (recommend: decide in P8/P9 if a live failure shows it is needed). | yes |
| ACP lane does not call `onMcpConfigRestored`. | call on exit / not | Nothing to restore (no config write); the manager revokes the lane credential on kill/release for every lane (`agent-process-manager.service.ts` 3216, 3581), as for Grok. | yes |
| Created a `node_modules` junction in the worktree → main checkout `node_modules` (git-ignored). | — | `jest.preset.js` maps `marked` to `<root>/node_modules/marked/lib/marked.umd.js`; without the junction every cli-agent-runtime spec reaching `marked` fails to resolve. | yes (delete the junction) |

## Plan deviations

- Fixture names: `antigravity-p3-ptah-mcp-tool-use` and `antigravity-p3-cancel-then-continue`
  instead of the six `antigravity-{handshake,plain-turn,tool-use,permission,load-replay,cancel}`.
  Handshake exists from P2; the first prompt of each recording is a plain turn; load-replay is
  covered live by `agy-acp.live.spec.ts`; no permission request is sent on an unattended lane,
  so a permission recording would need an attended lane (P7).
- ACP specs in a sibling `antigravity-cli.adapter.acp.spec.ts` (precedent: `.mcp.spec.ts`)
  instead of inside `antigravity-cli.adapter.spec.ts`, whose module mocks (`fs/promises`,
  `killProcessTree`) do not suit the ACP path. Stream-json specs untouched.
- `ask` unsupported on the lane; `cancelBehavior` value name (see Decisions).

## Verification

Focused (during the batch):
- `npx jest ... antigravity-acp-profile.spec.ts`: 16 passed. `tee-transport.spec.ts`: 2 passed.
- `npx jest ... antigravity-cli.adapter.acp.spec.ts`: 15 passed.
- `npx jest ... provider-session-lane-handle.spec.ts grok-cli.adapter.spec.ts
  antigravity-cli.adapter.spec.ts antigravity-cli.adapter.mcp.spec.ts`: 4 suites, 171 passed.
- `npx tsc --noEmit` on acp-runtime lib/spec and cli-agent-runtime lib/spec tsconfigs: clean.
- `npx eslint` on the changed files: 0 errors; 24 warnings, all pre-existing in
  `antigravity-cli.adapter.ts` (`max-lines`, non-null assertions in the stream-json code).

Inner loop:
- `npm run verify -- -t lint,typecheck -p @ptah-extension/acp-runtime,@ptah-extension/provider-session-contracts,@ptah-extension/cli-agent-runtime,@ptah-extension/cli-engine,ptah-electron`
  (`PTAH_VERIFY_SLOTS=1`): `10 tasks: 10 succeeded`, exit 0 (`.ptah/tmp/p3-lint-typecheck.log`).
  Run before the `antigravity-acp-lane.ts` extraction; the gate below re-ran lint/typecheck after it.
- `npm run verify -- --related -p @ptah-extension/acp-runtime,@ptah-extension/provider-session-contracts,@ptah-extension/cli-agent-runtime`:
  `3 tasks: 3 succeeded`, exit 0 (`.ptah/tmp/p3-related.log`).

Full gate (once, at the end, after the extraction):
`PTAH_VERIFY_SLOTS=1 npm run verify -- -p @ptah-extension/acp-runtime,@ptah-extension/provider-session-contracts,@ptah-extension/cli-agent-runtime,@ptah-extension/cli-engine,ptah-electron`
(`.ptah/tmp/p3-gate.log`, 925 s):
- lint + typecheck: `10 tasks: 10 succeeded, 2 cached`.
- test: `15 tasks: 14 succeeded, 1 cached, 1 failed`. The failure was `ptah-electron:test`:
  `src/activation/wire-runtime.spec.ts` "Jest worker ran out of memory and crashed" (FATAL heap
  limit). Not `container.smoke.spec.ts`. Every other ptah-electron suite passed (115 passed,
  1 skipped, 1947 tests passed).
- OOM re-run alone, per the brief:
  `NODE_OPTIONS=--max-old-space-size=4096 node scripts/verify.mjs --exec --task p3-electron-wire-runtime -- npx jest --config apps/ptah-electron/jest.config.ts --runInBand --coverage=false --runTestsByPath apps/ptah-electron/src/activation/wire-runtime.spec.ts`
  → `Test Suites: 1 passed`, `Tests: 27 passed`, exit 0 (`.ptah/tmp/p3-electron-wire.log`).
- Conclusion: all gate projects green. The one red Nx task is a worker heap OOM, and it passes
  when re-run alone with a 4 GB heap.

## Live results (agy 1.5.13, signed in, this machine)

- `PTAH_LIVE_AGY=1` `antigravity-cli.adapter.acp.live.spec.ts`, through the real adapter and
  `spawnAcpProcess` behind the tee recorder: **2 passed** (recording run 38 s; re-run after the
  refactor 62 s, `.ptah/tmp/p3-live-lane-2.log`).
  1. D9: http MCP entry, tool listed and called with the bearer, token in the reply, stream
     events `tool_start`/`text_delta` emitted, `mcp_config.json` hash unchanged, stop → every
     pid of the agy tree gone (checked by pid via the OS process table).
  2. First turn `READY`; `ping -n 90` started as a tool call; interrupt → turn `done` 0, same pid
     alive; next message `AFTER-INTERRUPT` on the same pid; stop → every pid of the tree gone.
- `PTAH_LIVE_AGY=1` `agy-acp.live.spec.ts` (P2 runtime spec, now on the shared spawner): 1 passed.
- After both runs: `tasklist /FI "IMAGENAME eq agy.exe"` → no tasks; `mcp_config.json` sha256
  unchanged (`.ptah/tmp/p3-mcp-hash.log`).
- Not run here (coordinator): Electron `npm run dev` lane with Ptah's real MCP server and a
  `ptah_*` tool, the renderer execution cards for the Grok/Antigravity lanes (m-4 visual check),
  PF-8 baseline.

## Out-of-scope observations

- `antigravity-cli.adapter.ts` remains far over `max-lines` (pre-existing); the stream-json path
  is `remove-proposed` in P12.
- The worktree had no `node_modules`; every worktree needs the junction (or an install) before
  cli-agent-runtime specs that reach `marked` can run.

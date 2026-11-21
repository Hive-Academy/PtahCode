# Code Logic Review — `TASK_2026_2289_p1`

Reviewer: same-family reviewer (subagent). Reason: no other-family CLI lane is available in this session.

Scope read in full: `acp-session-runtime.ts`, `acp-session-helpers.ts`, `acp-process-transport.ts` (diffed against HEAD), `acp-vendor-profile.ts` and `grok-acp-profile.ts` (diffed), `acp-session-update-mapper.ts` (against the old mapper), the old `acp-session-handle.ts` (HEAD), `provider-session-lane-handle.ts`, `cli-acp-spawn-transport.ts`, `lane-mcp-attachments.ts`, `provider-session-contracts` (events, types, both projectors, index), the new specs, the diffs of the moved specs, and the wiring files. No builds or tests were run, as instructed.

## Summary

| Metric              | Value                                          |
| ------------------- | ---------------------------------------------- |
| Overall score       | 8/10                                           |
| Assessment          | APPROVED (conditional on the gate finishing)   |
| Blocking issues     | 0                                              |
| Serious issues      | 0                                              |
| Moderate issues     | 4                                              |
| Failure modes found | 4                                              |

Evidence for 8, not 9: every Grok-lane behaviour I traced matches the old handle line for line. The remaining defects are latent traps in the new neutral layer (replay ids, a silent MCP drop on a raw options object, no stream row for failures) plus an incomplete test gate. Evidence for 8, not 7: no parity row is broken, and the four changed spec cases are equivalent (see below).

## Five logic questions

### 1. How does this fail silently?

- Silent loss of the Ptah MCP attachment. `grokAcpProfile.buildMcpServers` now reads only `options.mcp` (`libs/backend/acp-runtime/src/lib/profiles/grok-acp-profile.ts:112-126`). `CliCommandOptions` still structurally satisfies `AcpSessionOptions`, because `mcp` is optional (`acp-vendor-profile.ts` `mcp?:`). Any future caller that passes raw lane options, such as a P3 Antigravity lane or the chat adapter, type-checks and gets `[]`. `sentMcpServers` becomes false, so the MCP wait is skipped as well, and nothing is logged. The only P1 caller (`provider-session-lane-handle.ts:84`) sets `mcp`, so there is no P1 regression. See M-2.
- The stream projector gives `error` events no row (`flat-stream-projector.ts`, the `error`/`info`/`plan` case). When P2 wires it, a failed handshake or a refused prompt would leave an empty execution tree. Unwired today.

### 2. What user action produces unexpected behaviour?

- Resuming a Grok session through `session/load` and then replaying history. The handler drops replayed updates (`acp-session-runtime.ts:339`, `isReplayedUpdate`), so the runtime never emits `replayed: true` events. The M-3 projection only works in the spec, where the fixture is fed to the mapper directly. See M-1 for the id collision in that path.
- Everything else I traced (abort mid-prompt, abort during handshake, continue while a turn runs, continue after exit) is identical to the old handle (`provider-session-lane-handle.ts:179-199` against old `acp-session-handle.ts:937-957`).

### 3. What input data produces a wrong answer?

- Multiple replayed user turns without `messageId`. The mapper falls back to the constant `'user-message'` (`acp-session-update-mapper.ts:10`). The projector builds `messageId = ${contextId}:user:${itemId}` (`flat-stream-projector.ts`, the `userText` case). Every user turn in a replayed conversation therefore gets the same message id. The Grok `session/load` fixture carries no `messageId` (0 matches), so this is the real wire shape. See M-1.
- Streamed user chunks. Each `user_message_chunk` becomes its own `message_start`, `text_delta` and `message_complete`. A user message split into chunks becomes several messages.

### 4. What happens when a dependency fails?

- Spawn refused or `resolveDirectSpawn` rejects. `AcpSpawnTransport` rejection reaches the same `.catch` as before (`acp-process-transport.ts` around lines 479-492), so `exited` settles with signal `'error'`. The new spec `cli-acp-spawn-transport.spec.ts` pins the rejection. OK.
- SDK fails to load. `AcpUnavailableError` still becomes one error event with a kill (`reportFailure`, runtime spec "maps AcpUnavailableError"). Its code is now `protocol-unsupported`, which is not user-visible in P1. OK.
- Handshake timeout, cancel grace, usage drain and process exit mid-turn all keep their old structure. I compared timers and clear paths line by line, and every timer is still cleared on its settle path.

### 5. What is missing that the requirements never mentioned?

- A type-level guard that a profile always receives a built `mcp` list (M-2).
- A lane-level assertion of the SDK-unavailable output line. The old case checked `h.errors()` through the lane, and now only the runtime event is asserted. The `[Agent] …` output line from `lane onEvent` is still covered by other lane cases, so this is minor.
- A unique per-message id for replayed history (M-1).

## Parity inventory check (Grok ACP lane)

| Row | Verdict | Evidence |
| --- | --- | --- |
| Detection, manifest, `grok models`, auth.json, plan-limit reader | unchanged | adapter diff touches only `runSdk` and the imports (`grok-cli.adapter.ts`) |
| argv `agent [--always-approve] --no-leader stdio` | holds | `buildSpawn` unchanged; profile spec unchanged except the `mcpPort` input |
| Ptah MCP URL plus bearer | holds | `lane-mcp-attachments.ts:20-30` uses the same predicate (`!mcpPort \|\| !mcpToken` returns none), the same `ptahMcpServerUrl(port, cwd, agentId)` and the same `Bearer` header. The profile only maps it to `{type:'http',name,url,headers}`, the same shape as before. |
| Model binding / effort hint | holds | `applySessionConfig` copied verbatim |
| x.ai silence, `servers_updated` log, unknown-extension info (max 32) | holds | `extNotification` identical |
| Exit code, error hints | holds | profile code unchanged apart from types |
| Resume via `session/resume`, fallback info | holds | `attachExistingSession` and the `could not resume` info identical |
| Handshake 45/90 s | holds | constants and `withHandshakeTimeout` identical |
| Cancel grace plus tree kill | holds | `onAbort` and `stopAfterCancelGrace` identical |
| Usage and 2 s drain | holds | now emits a `usage` event. `projectToCliSegments` rebuilds the same info row (`content`, `usage` with `model ?? provider/unknown`, `turnTelemetry` through the same `completedTurnTelemetry` and `turnIdentity` inputs). |
| Headless permission decision | holds | `decideAcpPermission` still called directly in the runtime |
| MCP wait and timeout callback | holds | `awaitMcpAttachment` is the old block, with `closed` read through `session.isClosed()` and `sentMcpServers` through `attachedMcpServers()` |
| `getSessionId` (resume id) and `getObservedNativeThreadId` | holds | `provider-session-lane-handle.ts:213-217` |
| stderr classification | holds | `onEvent` diagnostic branch writes `[stderr] line\n` and a `classifyCliStderr` segment, as before |
| Off-thread spawner | holds | `spawner` goes config, `AcpSpawnOptions.spawner`, `AcpSpawnRequest.spawner`, `spawnCli` (spec pins the options object: cwd, env, detached, cleanupOrphanDescendants, `windowsJobPolicy: 'no-job'`, spawner) |
| Spawn env | holds | `spawnSpec.env` goes through `AcpSpawnRequest.env` to `spawnCli` `env`, which still does the merge over the inherited env |

Hidden-behaviour checks in the move, all clean:

- The spawn is now started one microtask later (`Promise.resolve().then(spawnTransport)` replacing a direct `resolveDirectSpawn` call). `kill()` before attach is handled by the unchanged queue logic.
- Event ordering inside `onEvent` is the old order: output text first, then segments. For `error`, the output line is written before the segment, as `emitError` did.
- `terminal` events are emitted in `finally` while `currentTurnId` is still set, and project to no lane row.
- The `closed ? 'broken'` disposition has no consumer in P1.
- Log strings, including the `[AcpSessionHandle]` prefix, are kept.
- No new log site includes `options`, `options.mcp` or the token. `logMcpRequest` still redacts the headers.

## The four changed spec cases

1. `maps AcpUnavailableError` (old handle spec, moved to `acp-session-runtime.spec.ts`): equivalent. Same trigger (`connectAcp` spy), same message, `killCount` 1, one error. The lane-level `done === 1` assertion is not repeated. Minor (m-1).
2. The three grok `buildMcpServers` cases (now `lane-mcp-attachments.spec.ts`): equivalent. The original inputs and the exact expected entries are composed through `buildLaneMcpAttachments` plus `grokAcpProfile.buildMcpServers`. The profile spec keeps an attachment-to-entry case and a "no attachment" case.
3. `never puts the model… on argv` (`mcpPort: 51820` became `mcp: []`): equivalent. The assertion is on argv, and argv never read `mcpPort`.
4. Mapper spec wrapper: the golden segment assertions are unchanged. The wrapper computes `output` in the test (`textDelta` joined), so the old `output` assertions pin the wrapper, not production code. The production rule (`textDelta` goes to `output.emit`, `provider-session-lane-handle.ts:76`) is covered only through the lane-handle spec's `onOutput` cases. I confirmed that spec is textually unchanged apart from names and imports (`diff` against HEAD shows only renames, imports and the removed case).

## Failure modes

### Replayed user turns collapse to one message id
- Trigger: a future consumer replays a `session/load` history with two or more user turns that carry no `messageId` (the Grok fixture has none).
- Symptom: the renderer merges or overwrites all user messages with the same `messageId`.
- Evidence: `acp-session-update-mapper.ts:10` (`USER_MESSAGE_ITEM`), `acp-session-update-mapper.ts` `user_message_chunk` case; `flat-stream-projector.ts` `userText` case builds the id from `itemId` only. The new spec uses one user turn, so it cannot catch this.
- Current handling: none. Unreachable in P1 because the runtime drops replayed updates and the lane does not wire `onStreamEvent`.
- Recommendation: see M-1.

### Profile silently attaches no MCP on a raw options object
- Trigger: any caller passes `CliCommandOptions` (or anything lacking `mcp`) to a profile or the runtime.
- Symptom: the agent starts without Ptah MCP. No error, no log, and the MCP-attachment wait is skipped.
- Evidence: `grok-acp-profile.ts:112-126`, `acp-vendor-profile.ts` (`mcp?:`).
- Recommendation: see M-2.

### Failures have no stream row
- Trigger: P2 wires `createFlatStreamProjector`, and a turn fails before any assistant output.
- Symptom: the event tree shows nothing for the failure. Only the lane segment path shows the error.
- Evidence: `flat-stream-projector.ts` (`error`, `info`, `plan` return `[]`; `terminal` returns `[]` when no message started).
- Recommendation: see M-3.

### Gate not complete
- Trigger: the coordinator pushes on the current evidence.
- Symptom: regressions in cli-agent-runtime's other suites, cli-engine, platform-cli or ptah-electron go unseen. The red `dashboard-budgets.spec.ts` in shared is unverified against `main`.
- Evidence: batch-report "Check results": the test phase was killed. Only the related-test run of cli-agent-runtime (49 suites, 1528 tests) passed.
- Recommendation: see M-4.

## Blocking issues

None.

## Serious issues

None.

## Moderate and minor issues

### Moderate

- **M-1. Replay ids collide.** Files: `libs/backend/acp-runtime/src/lib/acp-session-update-mapper.ts:10` and the `user_message_chunk` case; `libs/backend/provider-session-contracts/src/lib/flat-stream-projector.ts` (`userText`). Fix: when the chunk has no `messageId`, have the mapper take a per-mapper counter that advances on each role change (user to agent to user), so each user turn gets a distinct itemId. Have the projector fall back to `${contextId}:user:${event.sequence}` instead of a shared constant. Merge chunks of one user turn into one `message_start` and `message_complete`. Add a two-turn replay spec.
- **M-2. Optional `mcp` is a silent trap.** Files: `libs/backend/acp-runtime/src/lib/acp-vendor-profile.ts` (`AcpSessionOptions.mcp?`), `grok-acp-profile.ts:112`. Fix: make `mcp` required (`readonly mcp: readonly ProviderMcpAttachment[]`). `CliCommandOptions` then no longer satisfies the type, and the lane's `{ ...options, mcp }` (`provider-session-lane-handle.ts:84`) keeps compiling. Update `BASE_OPTIONS` in the profile spec to `mcp: []`.
- **M-3. No stream row for failures.** File: `flat-stream-projector.ts`. Fix: before P2 wires it, project `error` to a visible row (an assistant message with an error block, or whichever member the renderer already shows for chat failures), and project `terminal.status === 'failed'` even when no message started. Add a spec for "handshake failed, no output". Note the deferral in the P2 plan so it is not forgotten.
- **M-4. Gate incomplete.** Fix: before the first push, run `npm run verify -- -p acp-runtime,provider-session-contracts,cli-agent-runtime,cli-engine,platform-cli,shared,ptah-electron` to completion and confirm the header says 7 projects. Check `libs/shared/src/mcp-apps-contracts/dashboard-budgets.spec.ts` against `main` (via the shared Nx cache); if it also fails there, record it as pre-existing.

### Minor

- m-1. The SDK-unavailable case has no lane-level assertion of `done === 1` and the `[Agent] …` output line (`provider-session-lane-handle.spec.ts`, where the removed case sat near line 1091). Add a small case through `createProviderSessionLaneHandle`.
- m-2. `stripAnsiCodes` is copied into `acp-process-transport.ts` (lines ~69-76). It is identical to `cli-adapter.utils.ts:73-79` today, so this is only a drift risk. Add a comment naming the twin, or move it to a shared util.
- m-3. `ProviderSessionEventIdentity.replayed` is never set by the runtime (replay is dropped at `acp-session-runtime.ts:339`). M-3 of the plan is therefore met only at projector level. The batch report states this; record it as the P2 `acp-replay-collector` input.
- m-4. The lane does not wire `onStreamEvent`, which Component 3 lists. The deferral is justified (the renderer would switch from segment rows to the event tree) and matches the P1 "nothing new reachable" row. Keep it recorded as a decision in the PR.
- m-5. The `provider-session-contracts` tags are `type:feature` while Component 1 says `type:core`. R2-1 ("tags as codex-runtime") wins on conflict, so the choice is correct. The tag array formatting in `project.json` differs from codex-runtime (cosmetic only).
- m-6. The git state mixes staged renames (`R`/`RM`) with unstaged edits to the same files. The coordinator must stage the new content of each `RM` path as well as the untracked files (`acp-session-helpers.ts`, `acp-session-runtime.spec.ts`, `src/testing/`, the `provider-session/*` files, the two new libs). Do not stage the worktree `node_modules` junction (git ignores it).

## Nx wiring (checked)

- `tsconfig.base.json`: three paths, correct targets (`src/index.ts`, `src/testing/index.ts`, contracts `src/index.ts`).
- `apps/ptah-electron/tsconfig.build.json`: both paths added with the `../../libs/...` shape of codex-runtime. The `/testing` path is correctly absent (test-only).
- `libs/backend/cli-agent-runtime/package.json`: the SDK dependency moved to `acp-runtime/package.json`, and both new libs were added. `apps/ptah-electron/package.json:13` and `project.json:45` keep the SDK as a runtime and external dependency, so `validate-deps` is unaffected.
- `cli-agent-runtime/jest.config.ts:17` keeps `transformIgnorePatterns` for `@agentclientprotocol/`. It is still needed because the Grok adapter spec loads the SDK through the acp-runtime source path.
- `acp-runtime/jest.config.ts` has the same pattern. `tsconfig.lib.json` excludes `__fixtures__` and `testing`.
- `project.json`: build (esbuild, `external: ['@agentclientprotocol/sdk']`) and typecheck copied from codex-runtime. `lint` and `test` come from the `nx.json` plugin `include` lists (both lists updated at lines 189-190 and 279-280).
- `.commitlintrc.json`: the three scopes are present, and `opencode-runtime` is added ahead of P11a, as R2-1 asks.
- No other tsconfig, bundler or CI file in the repo maps `codex-runtime`-style paths (grep), so there is no missed alias site.
- Lost exports: the old `acp/index.ts` exports are all present in the new `src/index.ts`. `createAcpSessionHandle` and `AcpSessionHandleConfig` are replaced by `createAcpSession` and `AcpSessionConfig`. The only caller was `grok-cli.adapter.ts` (grep across `libs` and `apps`, with no other hits), which is updated. The new index also exports `decideAcpPermission`-free surface, `spawnAcpProcess`, `AcpSpawnRequest` and `AcpSpawnTransport`.

## Data flow

1. `GrokCliAdapter.runSdk` calls `validateLaneSpawnPolicy`, then `createProviderSessionLaneHandle`. OK.
2. The lane builds `options.mcp` from `mcpPort`, `mcpToken`, `workingDirectory` and `agentId`. OK, same predicate and URL. Optional `mcp` is a trap for other callers (M-2).
3. `createAcpSession` runs `profile.buildSpawn` and the transport factory, with `cliAcpSpawnTransport` as the policy. OK.
4. `start()` runs the handshake (initialize, resume or new, config). OK, identical.
5. The MCP attachment wait runs in the lane. OK.
6. `prompt()` makes one `session/prompt`. Updates go through the mapper to events, then the lane `onEvent`, then `projectToCliSegments` plus `output.emit`. OK, golden shapes preserved.
7. A usage event projects to the usage info row. OK.
8. `terminal` is emitted and ignored by the lane. OK.
9. `done` resolves 0 or 1 and never rejects. OK.
10. `projectToCliSegments` and `createFlatStreamProjector`: the first is exercised, and the second is not reachable from production code in P1 (M-1, M-3).

## Requirements fulfilment

| Requirement | Status | Gap |
| --- | --- | --- |
| Fixture-identical Grok lane (M-2) | COMPLETE | The runtime-level spec set passes per the batch report; the full gate is open (M-4) |
| New libs and wiring (R2-1) | COMPLETE | None found |
| `projectToCliSegments` identical to the old mapper | COMPLETE | None |
| `createFlatStreamProjector` plus user-turn projection (M-3) | PARTIAL | Collapsing ids for id-less replay (M-1); no failure rows (M-3) |
| Lane `onStreamEvent` | MISSING by decision | Deferred, justified (m-4) |
| Gate: 7 projects | PARTIAL | Lint and typecheck done; the test phase was killed (M-4) |

Implicit requirements not addressed: guard against a silently missing MCP attachment (M-2).

## Edge cases

| Case | Handled | How | Concern |
| --- | --- | --- | --- |
| Abort before handshake ends | YES | `signal` abort stops the process; `start()` returns not-ok without an error event | none |
| Abort with prompt in flight | YES | cancel, then grace, then kill | identical to the old handle |
| `continue()` during a turn | YES | rejects with the same message | none |
| Spawn rejected | YES | `exited` settles with `error` | none |
| Missing token or port | YES | no attachment, no wait | silent by design, as before |
| Replay with several id-less user turns | NO | constant item id | M-1 (unwired in P1) |
| Failure before any assistant output, stream path | NO | no stream row | M-3 (unwired in P1) |

## Verdict

- Recommendation: APPROVE (proceed after the gate completes)
- Confidence: HIGH for Grok-lane parity (traced against the old handle line by line), MEDIUM for the unwired stream projector
- Top risk: the new neutral layer carries three latent traps (M-1, M-2, M-3) that P2 and P3 will inherit if they are not fixed at the contract level now.
- What a robust implementation would add: required `mcp` on `AcpSessionOptions`; a per-turn user-message id with chunk merging; a failure row in the stream projector; a lane-level SDK-unavailable case; a completed 7-project gate with the `dashboard-budgets` result checked against `main`.

# Batch report — TASK_2026_2289_p1 (program TASK_2026_2288_acp1, phase P1)

Nothing is committed. `git mv` staged the renames (requested so history follows); every other
change is unstaged or untracked. The coordinator owns staging, the commit and the PR.

## What was done

1. **New lib `libs/backend/provider-session-contracts`**: the session contract types
   (`ProviderSession`, `ProviderSessionRuntime`, the open request, policy, MCP attachment,
   capabilities, approval types), the `ProviderSessionEvent` union (body plus identity),
   `ProviderSessionLogger`, and two pure projectors: `projectToCliSegments` (lane `onSegment`,
   the same shapes the old mapper emitted) and `createFlatStreamProjector` (`FlatStreamEventUnion`).
   It depends on `@ptah-extension/shared` only.
2. **New lib `libs/backend/acp-runtime`**: the ACP folder and the Grok profile moved here with
   `git mv`. `acp/index.ts` became `src/index.ts`. The old `cli-adapters/acp/` and
   `cli-adapters/grok/` folders are gone. The handle became `createAcpSession` (acp-session-runtime.ts),
   which emits `ProviderSessionEvent`s through `onEvent`. Pure helpers went into acp-session-helpers.ts
   to stay under the 700-line lint limit. Nothing in the lib imports `vscode-core` or `cli-agent-runtime`.
   The fake agent is published as `@ptah-extension/acp-runtime/testing` (test-only entry, excluded
   from `tsconfig.lib.json`).
3. **Grok lane on the runtime**: `GrokCliAdapter.runSdk` now calls
   `createProviderSessionLaneHandle`, which wraps `createAcpSession` as an `SdkHandle` with
   unchanged semantics:
   - `done` and `continue`
   - the MCP attachment wait and `onMcpAttachmentTimeout`
   - `getSessionId` (including the resume id) and `getObservedNativeThreadId`
   - `usageScope: 'turn'` and `outcomeUsageIsTurnTotal`
   - stderr classified by `classifyCliStderr`

   The adapter constructor `(spawner?, logger?)` and `detect`, `capabilities`, `listModels` and
   `ensureTokensFresh` did not change.
4. **Wiring (R2-1)**:
   - `tsconfig.base.json` has three paths: `acp-runtime`, `acp-runtime/testing` and
     `provider-session-contracts`.
   - `apps/ptah-electron/tsconfig.build.json` has two paths.
   - `.commitlintrc.json` has three new scopes, including `opencode-runtime`.
   - Each new lib has its own `package.json`. `@agentclientprotocol/sdk` moved from
     cli-agent-runtime to acp-runtime, and cli-agent-runtime now lists both new libs.
   - `project.json` (build/typecheck copied from codex-runtime; tags `scope:extension`,
     `type:feature`).
   - The other config files: `jest.config.ts` (acp-runtime keeps
     `transformIgnorePatterns: ['node_modules/(?!@agentclientprotocol/)']`, and neither lib needs
     `reflect-metadata`), `eslint.config.mjs`, `tsconfig.json/lib/spec` and a README.
   - `nx.json`: the two libs were added to the `@nx/eslint/plugin` and `@nx/jest/plugin`
     `include` lists. That is how codex-runtime gets its `lint` and `test` targets.
5. **Shared**: `libs/shared/src/lib/types/provider-session-profile.types.ts`
   (`ProviderSessionProfileId` = `'antigravity' | 'grok' | 'opencode'`), exported from
   `libs/shared/src/index.ts`.

## Files

Moved with `git mv`, from `CA` (`libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters`)
to `R` (`libs/backend/acp-runtime/src`):

- `CA/acp/__fixtures__/**` → `R/lib/__fixtures__/**`
- `CA/acp/{acp-process-transport,acp-sdk-loader,acp-permission-policy,acp-session-update-mapper}.ts`
  and their specs → `R/lib/`
- `CA/acp/acp-vendor-profile.ts` → `R/lib/`
- `CA/acp/acp-session-handle.ts` → `R/lib/acp-session-runtime.ts` (rewritten as the runtime)
- `CA/acp/acp-session-handle.spec.ts` → `CA/provider-session/provider-session-lane-handle.spec.ts`
  (the `SdkHandle` cases)
- `CA/acp/index.ts` → `R/index.ts`
- `CA/grok/grok-acp-profile{,.spec}.ts` → `R/lib/profiles/`

Created:

- `R/lib/acp-session-helpers.ts`
- `R/lib/acp-session-runtime.spec.ts`
- `R/testing/index.ts`
- the acp-runtime project files
- `libs/backend/provider-session-contracts/**` (src, 2 specs, project files)
- `CA/provider-session/provider-session-lane-handle.ts`
- `CA/provider-session/cli-acp-spawn-transport.ts` (+ spec)
- `CA/provider-session/lane-mcp-attachments.ts` (+ spec)
- `libs/shared/src/lib/types/provider-session-profile.types.ts`

Modified:

- `CA/grok-cli.adapter.ts`, `CA/grok-cli.adapter.spec.ts` (mock target and import paths only)
- `libs/backend/cli-agent-runtime/package.json`
- `libs/shared/src/index.ts`
- `tsconfig.base.json`, `apps/ptah-electron/tsconfig.build.json`, `.commitlintrc.json`, `nx.json`

Environment, not part of the diff: I added a `node_modules` junction in the worktree pointing to the
main checkout. Other worktrees use the same setup, and git ignores it. Without it, the jest preset's
`marked` mapper fails.

## Decisions

| Decision | Options | Evidence | Reversible |
|---|---|---|---|
| The P1 runtime exposes the lane-shaped `AcpSession` (`start`/`prompt`/state accessors), not the full `ProviderSession` interface. The contract types are complete in the contracts lib. | Implement the full `ProviderSession` now, or the lane subset | M-2: P1 acceptance is fixture-identical. `interrupt`, `setMode`, the approval sink and the generation guard are P2 items in Component 2. | Yes; P2 adds conformance |
| `onStreamEvent` is **not** wired on the Grok lane. The FlatStream projector is built and tested. | Wire it now, or defer | A lane that emits stream events moves the renderer from segment rows to the event tree (`cli-agent-output.component.ts:174-199`), a visible change that needs an Electron visual review. The plan's P1 row (implementation-plan.md:164) says "Behaviour-identical… nothing new reachable". | Yes; one line in the lane handle |
| The profile keeps `vendor: CliType` and `resumeStrategy`. The `id` / `signInHint` / `cancelBehavior` contract is P2. | Trim the profile now, or later | The moved specs assert `resumeStrategy` and `vendor`. The plan says the attach method is chosen from advertised capability in P2. | Yes |
| Profiles take the neutral `AcpSessionOptions`, a structural subset of `CliCommandOptions`. The lane builds the MCP attachment (`buildLaneMcpAttachments` → `options.mcp`), and `grokAcpProfile.buildMcpServers` maps it to the ACP `http` entry. | Move `ptahMcpServerUrl` into the runtime, or keep it in the lane | Parity row "Ptah MCP over HTTP with bearer: URL built by lane handle (C3 + profile)". It avoids a fourth URL-grammar twin (`ptah-mcp-url.ts` header). | Yes |
| `AcpSpawnTransport` is injected. The lane supplies `cliAcpSpawnTransport` (`resolveDirectSpawn` + `spawnCli`, the same options as before). | — | M-2. | — |
| Event identity: `sessionId` and `turnId` are optional, because the setup events come before either exists. `processGeneration` is fixed at 1. Error codes `request-failed` and `turn-failed` were added for generic failures. A `fileChange` body was added so diff rows survive the projection. | — | These keep the golden segment shapes exact. | Yes |
| M-3: `FlatStreamEventUnion` already has a user-message member (`MessageStartEvent.role: 'user'`). Replayed `userText` projects to `message_start(user)` + `text_delta` + `message_complete` with `source: 'history'`, the shape `agent-sdk/.../codex-history-projector.ts:300-316` produces. The mapper maps `user_message_chunk` → `userText`; the lane row stays `[]`. | — | Spec: `acp-session-update-mapper.spec.ts` "replayed history through the stream projector" (grok-p2-session-load-replay fixture). | Yes |
| Log messages keep the `[AcpSessionHandle]` prefix. | Rename it | The moved specs assert the exact strings. Existing log greps keep working. | Yes |
| Both libs are tagged `type:feature`, as codex-runtime is. | Tag the contracts lib `type:core` (Component 1) | R2-1 "Tags as codex-runtime" wins on conflict. | Yes |

## Deviations from the plan, and why

- **Spec assertions**: they did not change, except for these four cases:
  1. **`maps AcpUnavailableError`** moved to `acp-session-runtime.spec.ts`. `jest.spyOn` on the
     loader module only works inside the runtime lib. Its assertions were re-expressed on `start()`
     and the error events.
  2. **The grok profile's three `buildMcpServers` cases**: the original inputs and expected entries
     now live in `lane-mcp-attachments.spec.ts`. The profile spec keeps an attachment-to-entry case
     and a "no attachment" case.
  3. **`never puts the model… on argv`**: the input `mcpPort: 51820` became `mcp: []`. The profile no
     longer reads `mcpPort`.
  4. **The mapper spec** wraps the event mapper with `projectToCliSegments`, so its old assertions
     pin the mapper and the projector together (golden).
- **Harness-only changes**:
  - the transport spec passes a spec-local `spawnTransport`;
  - the specs use the barrel and testing imports;
  - `describe` titles renamed;
  - `as unknown as Logger` dropped in the runtime specs.
- **Not done in P1**, with the phase that does it:
  - "missing spawner → clear error" (P2, with the `IProcessSpawner` switch). Today `spawnCli`
    runs inline without a spawner, and the Grok spec relies on that.
  - `headless-approval-sink.ts` (P2, approval adapter). The runtime still calls
    `decideAcpPermission` directly, as before.
  - Moving the `_x.ai/mcp/servers_updated` log into the Grok profile (P2, extension hooks). It
    stays in the runtime, unchanged.

## Parity inventory (Grok ACP lane)

Every row holds. Detection, manifest, `grok models`, auth.json and the plan-limit reader did not
change. Argv, model binding, the x.ai silence, the exit code and the error hints moved with the
profile; their specs passed. The MCP URL and bearer moved to the lane (`lane-mcp-attachments.spec.ts`
plus the grok adapter spec's full-turn case). These moved and their moved specs passed:

- resume via `session/resume`
- the 45/90 s handshake deadlines
- cancel grace and tree kill
- usage and the 2 s drain
- the headless permission decision
- the unknown-extension info (max 32)

The MCP wait and timeout callback, `getSessionId` and `getObservedNativeThreadId` are in the lane
handle; their cases are in the lane-handle spec. The off-thread spawner still reaches the spawn
through `spawner` → `AcpSpawnRequest.spawner` → `spawnCli` (`cli-acp-spawn-transport.spec.ts`).

## Check results

- `npm run verify -- -t typecheck -p acp-runtime,provider-session-contracts,cli-agent-runtime`:
  3 tasks succeeded.
- Inner loop, `npm run verify -- --related -p acp-runtime,provider-session-contracts,cli-agent-runtime`.
  The run after the node_modules junction exited 0, with 3 tasks succeeded:
  - acp-runtime: 6 suites, 85 tests passed;
  - provider-session-contracts: 2 suites, 17 tests passed;
  - cli-agent-runtime (related to main): 49 suites, 1528 tests passed.

  The first run failed in cli-agent-runtime only because `marked` was missing from the worktree's
  `node_modules`, before the junction existed.
- Inner loop, `npm run verify -- -t lint,typecheck -p acp-runtime,provider-session-contracts,cli-agent-runtime,cli-engine,platform-cli,shared,ptah-electron`:
  the first run failed lint (a `no-useless-escape` in the two new `jest.config.ts` files, plus the
  max-lines warning). Both are fixed, and the gate's lint and typecheck phase then passed.
- Degradation audit (`npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`):
  exit 0. Both new catch sites carry `degradation-audit: optional-capability` markers.
- Full gate, `npm run verify -- -p acp-runtime,provider-session-contracts,cli-agent-runtime,cli-engine,platform-cli,shared,ptah-electron`:
  - lint and typecheck phase: **14 tasks, 14 succeeded** (4 cached), for all 7 projects;
  - test phase: **did not finish**. Claude Code killed the run because the machine was critically
    low on memory, and I did not restart it.
  - Tests that finished before the kill:
    - acp-runtime: 6 suites, 85 tests passed;
    - provider-session-contracts: 2 suites, 17 tests passed;
    - shared: 154 of 155 suites passed. 2 tests failed in
      `libs/shared/src/mcp-apps-contracts/dashboard-budgets.spec.ts` ("a pathological tree… so deep
      that measuring it overflows": expected a `RangeError` from a 5,000-deep recursion, none was
      thrown). That spec and its source are untouched by this batch (`git diff` empty). The failure
      depends on the stack depth, not on this change; not verified against main.
  - **Not run** in the gate's test phase: cli-agent-runtime (full suite), cli-engine, platform-cli,
    ptah-electron.

## Deferred / for the coordinator

- Run the full gate's test phase again when memory allows, and confirm the header shows 7 projects.
  cli-agent-runtime's full suite, cli-engine, platform-cli and ptah-electron tests are still open,
  and the shared `dashboard-budgets` result needs a check against main.
- The program's P2 items listed above: `ProviderSession` conformance, `onStreamEvent` wiring with an
  Electron visual review, the approval sink, the spawner switch, and the extension hooks.

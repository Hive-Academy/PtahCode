# Batch 19 report: remove the Ptah slot writer (C12d; C13 = D-U5 Option 1)

Executor: backend-developer (subagent). No git operations were run.

## Files

All paths are under `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/`.

- DELETED `ptah-mcp-slots.ts`. After this batch nothing imports it. Two comments still name it, in
  `cli-agent-runtime/.../ptah-mcp-url.ts:15` and `codex-runtime/.../codex-ptah-mcp.ts:9,31`
  (see Out of scope).
- DELETED `ptah-mcp-slots.spec.ts`.
- MODIFIED `http-mcp-server.service.ts` (1411 to 574 lines). Removed:
  - `planPtahMcpSlots` and all slot state: `registrations`, `retainedRoots`, the re-point queue,
    generations and `queuedEnsure`
  - `reconcileRegistrations`, `registerRootSlots`, `desiredSlots`, `syncMcpJsonRegistration`
  - `registerInSlot`, `writeMcpJsonEntry`, `writeFacetEntry`, `unregisterFromSlot`,
    `removeMcpJsonEntry`, `removeFacetEntry`
  - `hasCurrentClaudeEntry`, `persistentCredential`, `readFileAuthToken`, `getMcpJsonPath`
  - the entry-compare helpers, and the `fs`, `withMcpConfigLock`, `isFileLockTimeoutError`,
    `isLinkedWorktreeRoot` and `PTAH_SPAWN_MCP_KEY` imports

  Kept as non-writing readiness answers (decision 38, G2):
  - `ensureRegisteredForSubagents()` (`:381`): returns `{registered:true}` while the server is up,
    otherwise `not-started`.
  - `retainRoot(root)` (`:393`): returns `invalid-root`, `not-started` or `registered`.
  - `releaseRoot` (`:404`): a no-op.

  Their callers are unchanged: session-spawner, chat-session, chat-ptah-cli, gateway-turn-preparation,
  subsystem-bringup, and the DI in `di/register.ts`. `McpRegistrationFailure` is narrowed to
  `'not-started'`. No consumer compares the removed literals; I checked with grep across `libs` and
  `apps`.
- MODIFIED `http-mcp-server.service.spec.ts` (2318 to 927 lines). The slot-write sections are gone:
  - registration
  - unregister
  - workspace-switch symmetry
  - per-folder
  - the re-point queue
  - linked worktree
  - retained roots
  - persistent credential files

  Two new sections replace them, with 9 cases in total:
  - "ensureRegisteredForSubagents (readiness only)": not-started before start and after stop;
    `registered` with no `fs` write, no lock and no `.mcp.json` access; `registered` with no folder
    open; an existing `.mcp.json` `ptah` entry left untouched; folder changes write nothing;
    a stuck sweep does not hold the answer past the deadline.
  - "retainRoot / releaseRoot (readiness only)": invalid-root; not-started; a root outside the open
    folders gives `registered` and leaves the disk alone.

  Construction, lifecycle, error-propagation and gateway sections are kept. One case was dropped:
  "stop() leaves persistent entries", which tested slots.
- MODIFIED `http-mcp-server.service.concurrency.spec.ts` (601 to 314 lines). It uses the real disk:
  - a chat start, a retain/release and a stop leave an empty workspace and child root empty
  - an existing `.mcp.json` that holds an earlier `ptah` entry stays byte-identical
  - the retired Antigravity suite is kept; its first case now also asserts that no `.mcp.json` is
    created

  The two-writer lock and queue cases were deleted: there is no second writer now.

## How Claude sessions get `ptah` without a `.mcp.json` slot

`libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.ts`:
- `buildMcpServers` (`:2404`) issues a per-session bearer token through `IMcpCallerCredentials.issue`.
- It returns `{ ptah: { type:'http', url: /session/{id}/workspace/{cwd}, headers: Authorization } }`
  (`:2470`).
- That map goes into the SDK `Options.mcpServers` (`:1785`). It is gated on `mcpServerRunning`, and
  that flag is the readiness answer kept above.

Other CLIs get `ptah` through each adapter's per-spawn config (inventory rows 7-11 and 53-57).

## Retired sweep (row 50, D-U5 Option 1)

`retired-ptah-mcp-slots.ts` is unchanged, including its linked-worktree skip.
- Before: it ran inside every full reconcile.
- Now: it runs from `ensureRegisteredForSubagents` on the first chat start after `start()`, and again
  after a workspace-folder change. Runs are serialized on the operation queue, one queued run serves
  every waiter, and `stop()` drops a queued run.
- The chat start waits for a sweep at most `MCP_CHAT_REGISTRATION_DEADLINE_MS`, and the readiness
  answer does not depend on it.

Entries in `.mcp.json`, `.cursor/mcp.json` and Codex TOML written before P2 stay on disk. Their
persisted token hashes keep authorizing them, because `McpCallerTokenRegistry` was not touched.

## Inventory rows covered

| Row | Result |
| --- | --- |
| 45 | `planPtahMcpSlots` and `SLOT_SPECS` removed; module and spec deleted |
| 46 | `start` and workspace changes write no config file (folder event only sets `sweepDue`) |
| 47 | `ensureRegisteredForSubagents` writes nothing; "registered" when the server is up |
| 48 | `retainRoot`/`releaseRoot` write and remove nothing; port and DI unchanged |
| 49 | `registerInSlot`, the writers and removers, and `readFileAuthToken` removed; `issue` kept |
| 50 | retired sweep kept unchanged (D-U5 Option 1) |

## Plan deviations

- The read set mentioned the old line ranges. The source had already moved (P1 5673e1c82); I worked
  from the current source.
- The sweep's workspace roots no longer include retained child roots, because nothing is retained
  now. Child roots are linked worktrees, which the sweep skips anyway (B8), so in practice nothing
  changes.
- `McpRegistrationFailure` narrowed to `'not-started'`. `'timeout'` is gone because the deadline no
  longer changes the answer.
- The batch's verify commands are `npm run verify`. As instructed, I ran focused checks instead.

## Decisions

- **Readiness when no folder is open:** answers `registered`. Before, it answered `no-workspace`.
  - Options: keep `no-workspace`, or answer `registered`.
  - Evidence: inventory row 47 says "registered when the server is up", and the session gets `ptah`
    at spawn either way.
  - Reversible: yes.
- **When the sweep runs:** once after `start()` and once after each folder change, not on every chat
  start. This matches the old fast path, which skipped the reconcile after the first pass.
  - Reversible: yes.

## Verification

All checks ran under `node scripts/verify.mjs --exec --task b19 --`. Logs are in `.ptah/tmp/b19-*.log`.

| Command | Result |
| --- | --- |
| `npx jest --config libs/backend/vscode-lm-tools/jest.config.ts --runInBand --coverage=false --runTestsByPath` on `http-mcp-server.service.spec.ts`, `http-mcp-server.service.concurrency.spec.ts` and `retired-ptah-mcp-slots.spec.ts` | PASS: 3/3 suites, 62/62 tests (includes the B8 linked-worktree case) |
| `npx tsc --noEmit --project libs/backend/vscode-lm-tools/tsconfig.lib.json` | PASS (exit 0, 0 errors) |
| `npx tsc --noEmit --project libs/backend/vscode-lm-tools/tsconfig.spec.json` | PASS (exit 0, 0 errors) |
| `npx eslint` on the 3 changed `.ts` files | PASS: 0 problems |

Not run:
- di-lint: no constructor signature changed.
- Consumer projects (rpc-handlers, cli-agent-runtime, gateway-chat-bridge, vscode-core, Electron):
  the public signatures are the same, and `McpRegistrationFailure` was narrowed with no literal
  comparisons downstream. The coordinator's inner loop should cover them.

## Acceptance

- The http server spec shows no slot writes: `fsWriteFileSync` and `withMcpConfigLock` are never
  called, and the real-disk spec finds empty directories or byte-identical files.
- The retired-sweep spec, including the B8 case, passes.

## Out of scope (not touched)

- `libs/backend/platform-core/src/interfaces/mcp-subagent-root-registrar.interface.ts`: its doc still
  says it writes `.mcp.json`.
- `cli-agent-runtime/.../ptah-mcp-url.ts:15` and `codex-runtime/.../codex-ptah-mcp.ts:9,31`: their
  comments name the deleted `ptah-mcp-slots.ts` as a twin.
- `mcp-caller-token-registry.ts`: `preparePersistent` now has no production caller.
- The JSDoc on the consumers' `ensureRegisteredForSubagents` call sites still describes `.mcp.json`
  writes (for example `chat-ptah-cli.service.ts:114`).

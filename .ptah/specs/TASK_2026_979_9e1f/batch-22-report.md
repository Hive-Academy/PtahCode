# Batch 22 report: grok switch, and removal of the agy stream-json write (C14b + C12e, rows 13 and 36)

Executor: backend-developer (subagent). Worktree `D:\projects\PtahCode\.claude-worktrees\mcp-connector-parity`.
No commit was made; the coordinator owns git.

## A5 findings

### Grok (row 57): UNVERIFIED, unchanged

- The lane runs `grok agent --no-leader stdio` (ACP) and attaches `ptah` through
  `session/new.mcpServers` (`grok-acp-profile.ts:50`, `:118-128`).
- Local `grok 1.0.92 (b06756fd6256) [stable]`:
  - `grok --help` and `grok help`: the only MCP mention is the subcommand
    `mcp  Manage MCP server configurations`. No flag disables configured MCP servers. The nearby
    flags are `--tools`, `--disallowed-tools` (built-in tools), `--no-memory`, `--no-subagents`
    and `--no-plan`.
  - `grok agent --help` lists `--reauth -m --reasoning-effort --always-approve --agent-profile
    --plugin-dir --leader --no-leader ...`. `grok help agent` mentions MCP only for plugin scope:
    "Highest-priority plugin scope; always trusted: hooks and MCP servers activate without a
    prompt."
  - `grok agent stdio --help` lists only `--debug --debug-file --leader-socket`.
  - `grok mcp --help` lists `list/add/remove/enable/disable/doctor`. These are persistent config
    edits, not per-spawn switches.
- Result: no per-spawn switch could be verified. The adapter and specs are unchanged.
  `grok mcp disable` would rewrite the user's config, which is not allowed.

### Antigravity / agy (rows 51-53): UNVERIFIED, no switch set

- Local `agy 1.5.15`:
  - `agy --help` lists `--settings`: "Settings for this session only, never saved: a JSON object
    of settings.json keys, inline or as a file path". No help text names a settings key that
    turns off `mcp_config.json`, so it is not verified.
  - `agy acp --help` lists `--gemini-dir` / `--gemini_dir`: "Path where Gemini files are stored
    (default .gemini)". This would move the whole Gemini directory, including sign-in, settings
    and folder trust, not only MCP. It would drop things the gateway does not serve, so it was
    not used. `--include-default-customizations (default true)` does not say that it covers MCP.
  - `agy help mcp` lists `add/remove/list/enable/disable`. These are persistent edits.
- Result: no switch was set. ACP still attaches `ptah` through `session/new.mcpServers`
  (unchanged, row 53).

## Row 13: the stream-json spawn-time write and restore are removed

`antigravity-cli.adapter.ts`:

- Removed `mcpFacet()`, `configureMcpServer()` (the `facet.write` of `ptah`) and
  `cleanupMcpEntry()` (the `facet.remove` / `facet.write` restore).
- Removed the static home-keyed MCP startup lock (`mcpStartupLocks`, `lockMcpStartup`) and
  `startupChildStopDeadlineMs`. They existed only to serialize the shared-file write and restore.
- Removed the stream-json attachment-probe wait, the `config-write-failed` and
  `handshake-timeout` output lines, and the handle's `onMcpAttachmentTimeout` and
  `mcpConfigWriteFailed` fields.
- Removed imports that are now unused: `createMcpFacet`, `PTAH_SPAWN_MCP_KEY`,
  `IHarnessMcpFacet`, `McpServerConfig`, `MCP_ATTACHMENT_TIMEOUT_MS`, `laneMcpAuthUrl` and
  `ptahMcpServerUrl`. `cli-agent-runtime` still depends on `harness-sync` elsewhere.
- When the spawn carries an MCP port, the stream-json lane now emits one `info` segment and one
  output line: "Antigravity runs this lane on stream-json, which has no Ptah MCP server: Ptah
  tools and ptah_agent_report are unavailable; report in your final message."
- The startup-failure path no longer waits on the child stop. It starts the tree kill without
  waiting, logs a kill failure at error, revokes the credential and rethrows at once.
- The header and `supportsMcp` doc comments now say that stream-json has no `ptah`.

## Row 36: agy token is `privileged`, revoked at teardown, and gateway denials are logged

- `lane-mcp-token-rule.ts`: `antigravity` now returns `'privileged'`. The return type is
  narrowed to `'privileged' | null`, because no CLI is issued `lane-report` any more. The
  `lane-report` capability itself remains for other callers. `route-namespace.builder.ts` reads
  this function and now also sees `privileged` for agy, which matches what the lane gets.
- Teardown revocation: the manager wires `onMcpConfigRestored` to
  `mcpCredentials.revokeSubject(agentId)` for `antigravity` (unchanged,
  `agent-process-manager.service.ts:1524-1527`). The ACP lane calls it on process exit
  (`provider-session-lane-handle.ts`, `releaseCredential`). The stream-json hook was tied to the
  removed restore, so the lane now calls it through a once-guard `releaseMcpCredential`. It runs
  on `done` (the lane ending) and on a startup failure. The manager's stop, idle release, expiry
  and spawn-failure paths still revoke too (`:813`, `:1572`, `:3362`, `:3416`, `:3808`, `:3816`).
  New specs cover it: revoked once at lane end and not before; revoked once after a failed launch.
- `gateway-tool-bridge.ts`: `gatewayScopeOf` now takes the bridge context. When it denies a
  caller, it logs one debug line, `[MCP] gateway tools withheld from caller`, with
  `{ reason, callerKind, agentId, bindingCapability, capability }`. `reason` is one of
  `no-caller-binding`, `caller-not-permitted` or `request-not-privileged`. The line never carries
  a token, params or tool name. To keep it quiet:
  - It runs only when a gateway is bound.
  - `routeGatewayCall` now checks for host tool names before the scope, so calls to Ptah's own
    tools never log it.
- `GatewayBridgeContext` gained `debug`. `protocol-dispatcher.ts` `gatewayBridgeContext` wires it
  to `deps.logger.debug(message, 'CodeExecutionMCP', meta)` inside `runObserver`, as its `warn`
  is wired.

## Files

- MODIFIED `D:\projects\PtahCode\.claude-worktrees\mcp-connector-parity\libs\backend\cli-agent-runtime\src\lib\cli-agents\cli-adapters\antigravity-cli.adapter.ts`:
  removes the row 13 write and restore, and adds the no-`ptah` notice and the credential release.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\mcp-connector-parity\libs\backend\cli-agent-runtime\src\lib\cli-agents\cli-adapters\antigravity-cli.adapter.mcp.spec.ts`:
  rewritten with 9 tests:
  - zero writes to an absent home file;
  - a user's file stays byte-identical, its own `ptah` included;
  - no token or URL in the argv;
  - one no-`ptah` notice, and no MCP gate fields;
  - no notice without a port;
  - revoked once at lane end, not before;
  - revoked and child stopped after a failed launch;
  - immediate rethrow when the pid never arrives;
  - two lanes start without serializing.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\mcp-connector-parity\libs\backend\cli-agent-runtime\src\lib\cli-agents\cli-adapters\antigravity-cli.adapter.spec.ts`:
  - removed the `configureMcpServer` spy helper and the "still writes the MCP entry" test;
  - the oversize-prompt test no longer spies on the removed method.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\mcp-connector-parity\libs\backend\cli-agent-runtime\src\lib\cli-agents\lane-mcp-token-rule.ts`:
  agy returns `privileged`.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\mcp-connector-parity\libs\backend\cli-agent-runtime\src\lib\cli-agents\lane-mcp-token-rule.spec.ts`:
  agy is in the privileged set.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\mcp-connector-parity\libs\backend\vscode-lm-tools\src\lib\code-execution\mcp-core\gateway-tool-bridge.ts`:
  adds the denial debug line.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\mcp-connector-parity\libs\backend\vscode-lm-tools\src\lib\code-execution\mcp-core\protocol-dispatcher.ts`:
  wires `debug` into the bridge context (2 lines).
- CREATED `D:\projects\PtahCode\.claude-worktrees\mcp-connector-parity\libs\backend\vscode-lm-tools\src\lib\code-execution\mcp-core\gateway-tool-bridge.spec.ts`:
  4 tests:
  - a lane-report denial logs kind, id and capability;
  - a missing binding is logged and no secret is;
  - a privileged lane logs nothing;
  - a host without a gateway logs nothing.

## Decisions

- Stream-json credential release on `done`, not right at spawn. The options were to revoke at
  once (the lane never uses the credential) or to revoke at lane end. Lane end keeps the
  teardown contract that row 36 names and matches the ACP lifetime. This is reversible.
- No suppression of the manager's generic 15 s `handshake-timeout` warning for stream-json agy
  lanes (`agent-process-manager.service.ts:1996-2020` still probes, because the handle has no
  `onMcpAttachmentTimeout`). The lane really has no Ptah MCP, so the warning is true. The new
  info line says why. This is reversible: give the handle a no-op `onMcpAttachmentTimeout` if
  the warning is unwanted.
- Gateway debug meta logs `agentId` as the caller "name" and never the tool name, because a
  requested tool name is caller input (see `UNKNOWN_TOOL_LABEL` in the dispatcher).

## Plan deviations

- Files outside the listed B22 write set, each needed by the brief:
  - `antigravity-cli.adapter.spec.ts`: it spied on the removed `configureMcpServer` and would
    fail.
  - `gateway-tool-bridge.ts`, `protocol-dispatcher.ts` (2 lines) and the new
    `gateway-tool-bridge.spec.ts`: these implement the requested debug line.
- No `agent-process-manager.service.ts` change was needed. Its `onMcpConfigRestored` wiring is
  intact, and the adapter now calls the hook on lane exit itself.
- The batch's `npm run verify` commands were replaced with the focused checks the coordinator
  required.

## Verification (shared with B21)

Every heavy command ran as `node scripts/verify.mjs --exec --task <b21|b22|b22-tsc> -- <command>`.
Logs are in `.ptah/tmp/`. These are focused checks only: no `npm run verify`, no `nx`, no build.

- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath`
  with these specs:
  - `cursor-cli.adapter.spec.ts`
  - `antigravity-cli.adapter.mcp.spec.ts`
  - `antigravity-cli.adapter.spec.ts`
  - `antigravity-cli.adapter.acp.spec.ts`
  - `lane-mcp-token-rule.spec.ts`
  - `provider-session/provider-session-lane-handle.spec.ts`
  - `copilot-sdk.adapter.spec.ts`
  - `opencode-cli.adapter.spec.ts`
  - `grok-cli.adapter.spec.ts`
  - `lane-mcp-credentials.spec.ts`

  Result: PASS, 10/10 suites, 465/465 tests (`b21-jest-cli.log`).
  - An earlier cursor-only run had 1 failure of 52: the resume expectation lacked
    `settingSources: []`. It was fixed in the spec, and the 465-test run includes it.
- `npx jest --config libs/backend/vscode-lm-tools/jest.config.ts --runInBand --coverage=false --runTestsByPath`
  with `gateway-tool-bridge.spec.ts`, `route-namespace.builder.spec.ts` and
  `mcp-caller-policy.spec.ts`: 2 suites passed with 21 tests (`b22-jest-lm.log`).
  - The new bridge suite first failed to load because it needed `import 'reflect-metadata'`.
    After that fix, a re-run of the bridge suite passed 4/4 tests (`b22-jest-bridge.log`).
- `npx tsc --noEmit --project` gave 0 errors for each of:
  - `libs/backend/cli-agent-runtime/tsconfig.lib.json`
  - `libs/backend/cli-agent-runtime/tsconfig.spec.json`
  - `libs/backend/vscode-lm-tools/tsconfig.lib.json`
  - `libs/backend/vscode-lm-tools/tsconfig.spec.json`

  (`b22-tsc-*.log`)
- `npx eslint` on all 11 changed or created source and spec files: 0 errors. The warnings are
  existing ones (`max-lines`, `no-non-null-assertion` in the large adapter and dispatcher files).
- Not run:
  - `protocol-dispatcher.spec.ts`: it is large and has the known Windows symlink EPERM failures.
    The dispatcher change is 2 lines of wiring, and it typechecks.
  - `agent-process-manager.service.spec.ts`: the manager is unchanged.
  - The live agy `livecheck__echo` check: it belongs to the P2 live review and needs paid runs.

## Acceptance

- `antigravity-cli.adapter.mcp.spec.ts`: a stream-json spawn records zero writes to the home
  `mcp_config.json` (temp `HOME`): see Verification.
- The ACP spec still passes: see Verification.
- An agy ACP lane token is `privileged`: `lane-mcp-token-rule.spec.ts`. The live check that agy
  lists `livecheck__echo` belongs to the P2 live review and was not run here (no paid runs).
- A5 findings for grok and agy are recorded above.

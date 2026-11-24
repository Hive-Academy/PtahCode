# Batch 20 report: strict MCP for Claude (C11)

Executor: backend-developer (subagent). No git operations were run.

Precondition: LR-P2-0(a) FAILED (strict drops claude.ai account connectors). Decision row 40
(user, 2026-11-24) ships strict anyway for main chat and Claude lanes. LR-P2-0(b) was not
testable. A7 is resolved below.

## Behaviour

`capabilityIsolationOptions(policy, servedByGateway)` in `sdk-query-options-builder.ts` now
decides strict for every Claude path:

| Policy | Gateway serves `ptah` here | Result |
|---|---|---|
| unverified | either | `{strictMcpConfig: true, skills: []}` (same as before) |
| verified | yes | `{strictMcpConfig: true}` (new, C11) |
| verified | no | `{}` (same as before) |

"Gateway serves `ptah` here" is `gatewayServesPtah(gateway, mcpServers)` in
`gateway-session-wiring.ts`: a gateway is bound (`PLATFORM_TOKENS.MCP_GATEWAY` resolved) AND
`ptah` is in the session's final `mcpServers` map. When `ptah` is absent (server not running, or
the policy turned it OFF), the session keeps the CLI's own MCP sources. Without that condition,
strict would leave the session with no MCP server at all.

- Interactive sessions (`SdkQueryOptionsBuilder.build`): strict when the gateway serves `ptah`.
  The spread is unchanged (`...capabilityIsolationOptions(...)` after `mcpServers`). Nothing
  later in the object sets `strictMcpConfig`.
- One-shots (`SdkQueryRunner.buildOneShotOptions`): strict only for a run with
  `includeConnectors: true` that gets `ptah` from a bound gateway. This is the same eligibility
  the removed served list had (decision row 11). `toolAccessOptions` is still spread after it.
  Its `'none'` branch sets strict and `skills: []` itself, and its `'claude-code'` branch does
  not set `strictMcpConfig`, so a later spread cannot loosen strict.
- Claude lanes (configured ptah-cli and native `claude` lanes): both build through
  `PtahCliSpawnOptions.assembleSpawnOptions` and `buildClaudeSdkLaneOptions`. The assembly now
  injects `PLATFORM_TOKENS.MCP_GATEWAY` (optional) and sets
  `capabilityIsolation = capabilityIsolationOptions(policy, gatewayServesPtah(gateway, mcpServers))`.
  `buildClaudeSdkLaneOptions` already spreads `assembly.capabilityIsolation`, so one change
  covers both lane kinds. The bootstrap options (`mcpServers: {}`, `strictMcpConfig: true`) are
  unchanged.

### Removed: P1 flag-tier served-name list (B10 Task 10.3)

- `readServedFileServerNames` and `readOneShotServedFileServerNames` were deleted from
  `gateway-session-wiring.ts`.
- The builder no longer reads served names into `capabilityFlagsFor`. Its extra list is now
  only the back-off set.
- The runner no longer reads served names, and `buildOneShotOptions` no longer takes the
  `servedFileServers` parameter.
- The flag-tier specs for these were replaced by strict specs.

## A7 result

`rg -n "agents\s*[:=]" libs/backend/agent-sdk/src` (and a wider search for `.agents`,
`AgentDefinition` in agent-sdk and cli-agent-runtime) finds no SDK `Options.agents` that Ptah
passes. The hits are history, stats and budget-monitor locals, plus a type re-export of
`AgentDefinition`. Ptah passes no `agents` definitions, so nothing declares `mcpServers` and
nothing needs stripping. One side effect of strict: per `sdk.d.ts:2506-2513`, on-disk agent
frontmatter MCP, including subagent frontmatter MCP, is also ignored (see the list below).

## Sources Claude loses under strict that the gateway does not serve (follow-up issue)

The gateway (`cli-agent-runtime/.../gateway/server-sources.ts`) serves:
- OAuth and Smithery connectors
- Ptah install intents
- `~/.claude.json`, user and project scope
- enabled plugins' MCP (`<claudeConfigDir>/plugins`)
- APPROVED `{root}/.mcp.json` and `{root}/.vscode/mcp.json` entries
- `http`, `sse` and `stdio` transports

Under strict, Claude loses these sources:

1. **claude.ai account connectors** (for example "claude.ai Claude Docs"). LR-P2-0(a) proved
   this loss, and decision row 40 accepted it. Follow-up: a one-time setup that moves them into
   Ptah.
2. **Unapproved project `.mcp.json` entries the user enabled in Claude itself**
   (`enabledMcpjsonServers` or `enableAllProjectMcpServers` in Claude's user or local settings).
   The gateway serves a repository entry only when Ptah's `approvedProjectMcpServers` names it.
3. **`~/.claude.json` under a non-default config dir.** The reader reads
   `homedir()/.claude.json` only. A child running with `CLAUDE_CONFIG_DIR` (named or certified
   accounts) reads `$CLAUDE_CONFIG_DIR/.claude.json`, and the gateway does not serve that file.
   The reader also returns `unsupported` for a `named` account context.
4. **Agent and subagent frontmatter MCP** (`mcpServers` in `.claude/agents/*.md`, user or
   plugin agents). Strict ignores it, and the gateway does not read agent files.
5. **Enterprise managed MCP** (`managed-mcp.json` or managed settings). The gateway does not
   read it.
6. **Transports other than `http`, `sse` and `stdio`** (for example `ws`). The gateway does not
   serve them.
7. **`~/.claude.json` entries with an unset `${VAR}` and no default.** The gateway skips them.
   Previously the CLI applied its own handling to them.
8. **Plugin installs the gateway skips** (an install scoped to another project, or a malformed
   registry). Previously the CLI applied its own rules to them.

Behaviour was not changed for any of these.

## Files

- MODIFIED `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.ts`:
  `capabilityIsolationOptions(policy, servedByGateway)`; strict from `gatewayServesPtah`; the
  served-list read is removed.
- MODIFIED `libs/backend/agent-sdk/src/lib/helpers/sdk-query-runner.service.ts`: one-shot
  strict for opted-in gateway runs; the served-list read and its parameter are removed.
- MODIFIED `libs/backend/agent-sdk/src/lib/helpers/gateway-session-wiring.ts`: the two
  served-name readers are replaced by `gatewayServesPtah`.
- MODIFIED `libs/backend/agent-sdk/src/index.ts`: exports `gatewayServesPtah`, which lanes use.
- MODIFIED `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.capabilities.spec.ts`:
  4 strict regressions plus a `capabilityIsolationOptions` table test; the 3 flag-tier tests
  are removed.
- MODIFIED `libs/backend/agent-sdk/src/lib/helpers/sdk-query-runner.mcp-delivery.spec.ts`:
  5 one-shot strict regressions (with a verified resolver); the 3 flag-tier tests are removed.
- MODIFIED `libs/backend/cli-agent-runtime/src/lib/ptah-cli/helpers/ptah-cli-spawn-options.service.ts`:
  optional `MCP_GATEWAY` inject; lane strict.
- MODIFIED `libs/backend/cli-agent-runtime/src/lib/ptah-cli/helpers/ptah-cli-spawn-options.builtins.spec.ts`:
  3 lane strict regressions.
- MODIFIED `libs/backend/cli-agent-runtime/src/lib/claude/claude-sdk-lane-options.spec.ts`:
  `assemblyFor` takes `servedByGateway`; 2 tests show that strict reaches the lane options.

The cli-agent-runtime files and `gateway-session-wiring.ts` / `index.ts` are outside the batch
write set. The brief's tasks 2 and 4 required them, because the served-list reader lives in
`gateway-session-wiring.ts` and both lane kinds assemble in `PtahCliSpawnOptions`.

## Decisions

| Decision | Options | Evidence | Reversible |
|---|---|---|---|
| "Gateway bound" means bound AND `ptah` in the session's `mcpServers` | token bound only; bound + `ptah` delivered | strict with no `ptah` leaves no MCP source; the removed list used the same gate (`mcpServerRunning && ptahEnabled`) | yes |
| One-shots are strict only with `includeConnectors: true` | every one-shot with `ptah`; opted-in only | the removed served list was opt-in only (`readOneShotServedFileServerNames`), and decision row 11 limits connectors to opted-in runs | yes |
| One predicate, `gatewayServesPtah`, exported for lanes | inline checks per caller; shared helper | three callers (builder, runner, lane assembly) must agree | yes |

## Checks

All checks were run under `node scripts/verify.mjs --exec --task b20`. Logs are in `.ptah/tmp/b20-*.log`.

- `npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.lib.json`: exit 0
- `npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.spec.json`: exit 0 (after fixing a
  quote escape in a test title)
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json`: exit 0
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.spec.json`: exit 0
- `npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false
  --runTestsByPath` on the builder capabilities spec and the runner mcp-delivery spec:
  2 suites, 50 tests passed
- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts ...` on lane-options,
  spawn-options.builtins, registry-capabilities, claude-cli.adapter and lane-runner specs:
  5 suites, 216 tests passed
- `npx eslint` on the 9 changed files: 0 errors. 1 warning: the pre-existing `max-lines` on
  `sdk-query-options-builder.ts` (1728 counted lines). That file was already far over 700
  lines before this batch, and the batch adds 6 physical lines to it.
- Not run (forbidden by the brief): `npm run verify`, `nx` targets, di-lint (`nx run
  di-lint:lint`). The new constructor parameter has an explicit `@inject(PLATFORM_TOKENS.MCP_GATEWAY,
  { isOptional: true })` on an already-registered token.

## Out of scope

- `IMcpGateway.servedFileServerNames` (platform-core port), its implementation in
  `mcp-gateway.service.ts:342` and its stubs in the cron-scheduler and vscode-lm-tools specs
  now have no production consumer. `GatewayServerSet.servedFileServerNames` in
  `server-sources.ts` feeds only that method. Remove them in a follow-up, since they are
  outside this batch's ownership.
- The test-report row "No duplicate livecheck in main chat without strict ... the P1 flag-tier
  suppression holds" describes the removed mechanism. Strict now covers it, so the row needs a
  new live check on the B20 build.

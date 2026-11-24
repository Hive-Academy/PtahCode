# Batch 21 report: lane config switches, copilot, cursor, opencode (C14a)

Executor: backend-developer (subagent). Worktree `D:\projects\PtahCode\.claude-worktrees\mcp-connector-parity`.
No commit was made; the coordinator owns git.

## A5 findings per provider

A5 asks whether each lane can be told at spawn to load only Ptah's `ptah` server and not its own
user or project MCP config. The evidence comes only from local `--help` output and installed SDK
type definitions and code. No paid runs and no model calls were made.

### Copilot (row 54): UNVERIFIED, unchanged

- The adapter spawns the `copilot` CLI and passes `ptah` through `--additional-mcp-config`
  (`copilot-sdk.adapter.ts:349-368`).
- Local help could not be read. The only `copilot` on PATH is the VS Code launcher shim
  (`...\Microsoft VS Code\bin\copilot-shim\copilot`), which prints:
  `GitHub Copilot CLI was not found. Run copilot in a terminal to install it, ...`
- No `@github/copilot` package is installed in the workspace `node_modules` or in the global npm
  folder. The repo's `copilot-sdk.d.ts` is a 35-line ambient stub (`CopilotClient`,
  `createSession`) with no MCP or config options.
- Result: no switch could be verified. Nothing was changed. The `--additional-mcp-config` `ptah`
  injection is unchanged.

### Cursor (row 55): VERIFIED, switch set explicitly

- The adapter runs `@cursor/sdk` in process (`cursor-cli.adapter.ts`, `Agent.create` /
  `Agent.resume`). The installed version is `@cursor/sdk` 1.0.31.
- Type evidence, `node_modules/@cursor/sdk/dist/esm/agent/options.d.ts`:
  - `:37` `export type SettingSource = "project" | "user" | "team" | "mdm" | "plugins" | "all";`
  - `:172-178` on `LocalAgentOptions`: "Ambient Cursor settings layers to load from the local
    filesystem. Local agents only." `settingSources?: SettingSource[];`
- Code evidence (installed `dist/esm/357.js`), confirming that the setting sources control MCP:
  - The MCP adapter is built with
    `includeProjectMcp:(0,l.ue)(_,"project"),includeUserMcp:(0,l.ue)(_,"user"),includePluginMcp:U,inlineMcpServers:e.mcpServers`,
    with `U=(0,l.ue)(_,"plugins")`.
  - The project and user loaders read `<project>/.cursor/mcp.json` and `~/.cursor/mcp.json` only
    when those flags are set.
  - The parser treats `undefined` or `[]` as all flags false:
    `if(void 0===e||0===e.length)return a([])`.
- Result: with `settingSources: []`, the SDK loads no project or user `.cursor/mcp.json` and no
  plugin MCP. The inline `ptah` entry is the only MCP server. This is already the SDK default when
  the field is omitted. The adapter now sets `local.settingSources: []` explicitly, so a change to
  the SDK default cannot bring duplicate servers back. Because `[]` equals the current default, the
  change drops nothing the lane loaded before, so the gate "do not switch if it drops something
  the gateway does not serve" is not triggered.
- The `ptah` injection is unchanged: the same `mcpServers.ptah` entry with the bearer header.

### OpenCode (row 56): UNVERIFIED, unchanged

- The adapter spawns `opencode run` and passes `ptah` through the `OPENCODE_CONFIG_CONTENT` env
  var, merged over any inherited `OPENCODE_CONFIG_CONTENT` (`opencode-cli.adapter.ts:637-660`,
  `:745-756`).
- Local `opencode v2.3.2`: `opencode --help`, `opencode run --help`, `opencode mcp --help` and
  `opencode debug --help` list no flag or env var that disables the user's global config, the
  project config or their `mcp` blocks. `run` flags are `--continue --session --fork --worktree
  --model --agent --format --file --title --archived --thinking --auto`, and the global flags are
  `--standalone --server --log-level --print-logs`. `mcp` has only
  `list/add/auth/logout`.
- The workspace has no `@opencode-ai/sdk` types.
- Dropping the inherited `mcp` merge (the option the inventory row allows) affects only the
  parent's own `OPENCODE_CONFIG_CONTENT` env var, not the user's config files, so it is not an A5
  switch. It would also drop servers the parent deliberately passed in. Not done.
- Result: no switch could be verified. Nothing was changed.

## Files

- MODIFIED `D:\projects\PtahCode\.claude-worktrees\mcp-connector-parity\libs\backend\cli-agent-runtime\src\lib\cli-agents\cli-adapters\cursor-cli.adapter.ts`:
  adds the local `CursorSettingSource` type (it mirrors the SDK) and sets `local.settingSources: []`
  in `agentOptions`, which `create` and `resume` share.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\mcp-connector-parity\libs\backend\cli-agent-runtime\src\lib\cli-agents\cli-adapters\cursor-cli.adapter.spec.ts`:
  adds a new test that `local.settingSources` is `[]` and that `mcpServers` keys are exactly
  `['ptah']`. The yolo create and resume expectations now include `settingSources: []`.
- Copilot and OpenCode adapters and specs: unchanged (unverified).

## Decisions

- Cursor: set `settingSources: []` explicitly rather than relying on the omitted default. The
  options were to leave it implicit or to set it explicitly. The evidence is the SDK parser above.
  Both behave the same today, and the explicit value pins it. This is reversible.

## Plan deviations

- None for the write set. The batch's `npm run verify` commands were replaced with focused checks
  under the coordinator's rules for this run. See Verification.

## Verification

Focused checks ran under `node scripts/verify.mjs --exec`. The full list is in
`batch-22-report.md` § Verification. For B21:

- Jest (cli-agent-runtime): `cursor-cli.adapter.spec.ts`, `copilot-sdk.adapter.spec.ts` and
  `opencode-cli.adapter.spec.ts` are part of a run that passed 10/10 suites and 465/465 tests.
  The first cursor-only run had 1 failure of 52, a resume expectation that needed
  `settingSources: []`. The spec was fixed and the test passed in the combined run.
- `npx tsc --noEmit` on `cli-agent-runtime` `tsconfig.lib.json` and `tsconfig.spec.json`: 0
  errors.
- `npx eslint` on the cursor adapter and its spec: 0 errors (existing warnings only).

## Acceptance

- A5 findings are recorded per provider: yes (above).
- Each verified switch has a spec asserting the argv or env: yes. Cursor's switch is an SDK
  option, and the new test asserts `local.settingSources === []` with `mcpServers` equal to
  `['ptah']`.
- The `ptah` injection is unchanged: yes. The existing copilot, cursor and opencode `ptah`
  tests pass unchanged.

## Out-of-scope observations

- Copilot can be checked again once the real Copilot CLI is installed locally
  (`copilot --help`; look for a flag that disables the built-in or user MCP config).

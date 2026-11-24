# Backend implementation — `TASK_2026_979_9e1f`, batch 9

**Tasks completed**: 9.1 gateway approval gate, 9.2 unattended exclusion, 9.3 capper detection.

**Files** (all under `D:\projects\PtahCode\.claude-worktrees\mcp-connector-parity\libs\backend\agent-sdk\src\lib\`):

- CREATED `permission\gateway-approval-gate.ts`. Adds `createGatewayApprovalGate(heldPermissionCallback, { isGatewayTool, next?, onError?, deadlineMs? })` with matcher `mcp__ptah__.*`, a 3600 s hook timeout and a deadline margin. Decisions are remembered by tool-use id, at most 32 (same as the cron gate).
  - The gate's own predicate is `name.startsWith('mcp__ptah__') && options.isGatewayTool(name)`. The port's `isGatewayTool` returns true for any name it does not know, including `Bash`, so the prefix check is needed. If the predicate throws, the name counts as a gateway tool and the error goes to `onError`.
  - The hook returns `{}` for names that are not gateway tools. For a gateway tool it runs the held callback and denies on a deny, a timeout (its own deadline aborts the prompt), a null or undefined result, a rejection, or a synchronous throw. It returns `{}` only on an explicit allow.
  - `canUseTool` sends non-gateway names to `next` (default: the held callback), so it can wrap the cron gate. A gateway name reuses the remembered decision, or asks the held callback.
- CREATED `permission\gateway-approval-gate.spec.ts` (17 tests). Covers the matcher; the three name cases (`zernio`, `zernio_ab12`, unknown `x__y`) asking in the hook; deny, no decision, rejection, synchronous throw and deadline all leading to deny; a throwing predicate prompting; `{}` for `ptah_cron_create` and host tools; non-ptah names never reaching the predicate; remembered decisions and their limit; delegation to `next`; abort; and N2c: a gateway gate wrapping the real cron gate asks the held callback exactly once for the cron tool and once for the gateway tool.
- MODIFIED `permission\index.ts`: exports `./gateway-approval-gate`.
- MODIFIED `sdk-permission-handler.ts`:
  - The constructor gets an optional last parameter, `@inject(PLATFORM_TOKENS.MCP_GATEWAY, { isOptional: true }) mcpGateway?: Pick<IMcpGateway, 'isGatewayTool'>`.
  - The unattended `mcp__ptah__` auto-allow now also requires `!this.isGatewayTool(toolName)`, so gateway tools take the out-of-policy branch.
  - The private `isGatewayTool` returns false when no gateway is bound. When the predicate throws, it logs a warning with an `Error` and returns true (fail-closed).
- MODIFIED `sdk-permission-handler.unattended.spec.ts`: the harness takes an optional `isGatewayTool`. New tests:
  - A gateway tool and an unknown ptah name are out of policy (denied at once with deny window 0).
  - A gateway tool gets the bounded prompt (one request, denied when the window ends).
  - `mcp__ptah__ptah_cron_list` and `mcp__ptah__ptah_agent_report` stay allowed with no prompt.
  - A throwing predicate leads to a deny.
- MODIFIED `helpers\compaction\tool-output-capper.ts`:
  - The constructor gets an optional fourth parameter, `isGatewayTool?: (name) => boolean`.
  - `static appliesTo(toolName, isGatewayTool?)` still caps every non-ptah `mcp__` tool. A `mcp__ptah__*` tool is capped only when the predicate is bound and returns true, or throws (fail-closed).
  - Without the predicate, behaviour is the same as today.
  - `cap()` passes `this.isGatewayTool`. The header doc is updated.
- MODIFIED `helpers\compaction\tool-output-capper.spec.ts`: `makeCapper` takes `isGatewayTool`. New tests:
  - A gateway result is capped when the predicate is bound.
  - The host tool `ptah_search_files` stays exempt, and the config is never read.
  - A throwing predicate caps.
  - Without a predicate, every ptah tool stays exempt.
  - Non-ptah names never reach the predicate.

**Stack observed**:

- tsyringe with `@inject(TOKEN, { isOptional: true })`, the pattern in the `sdk-permission-handler.ts` constructor.
- The `PLATFORM_TOKENS.MCP_GATEWAY` token is in `platform-core/src/di/tokens.ts:138`, and `IMcpGateway` is exported from `platform-core/src/index.ts:180`.
- The gate pattern follows `permission/cron-approval-gate.ts`.
- Degradation markers use the `reported` and `optional-capability` kinds from `tools/degradation-audit/check-degradation.ts:27-29`.

**Verification** (focused commands as the brief specified; logs in `.ptah/tmp/b9-*.log`):

- `npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath <spec>`:
  - `gateway-approval-gate.spec.ts`: 17 passed.
  - `cron-approval-gate.spec.ts` + `sdk-permission-handler.unattended.spec.ts`: passed (52 tests across those 2 suites in the first run).
  - `sdk-permission-handler.spec.ts` + `sdk-permission-handler.unattended.spec.ts`: 144 passed, 2 suites.
  - `tool-output-capper.spec.ts`: 20 passed. This run needed a CLI `--moduleNameMapper` override (`marked` pointed at the main checkout's `node_modules`, `vscode` at the worktree `__mocks__/vscode.ts`). The worktree has no `node_modules`, and `jest.preset.js` resolves `marked` relative to the worktree. This is an environment issue, not a code issue. Under `npm run verify` in the main checkout the preset path resolves normally.
- `npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.lib.json`: exit 0. The same for `tsconfig.spec.json`: exit 0.
- `npx eslint` on all 7 changed files: 0 errors. There is 1 warning that was there before: `sdk-permission-handler.ts` max-lines (1516 > 700).
- `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`: no agent-sdk entries. It reports 2 FAIL in `libs/backend/vscode-lm-tools`, which another executor is editing; none of those files are mine.
- I did not run `npm run verify -- --related` or `-t lint,typecheck` (the batch's verify commands): the brief limited me to focused checks. The coordinator should run them.

**Plan deviations**: none in behaviour. Two choices made from the source:

- The gate checks the `mcp__ptah__` prefix itself before asking the port, because the port's contract returns true for any unregistered name, `Bash` included.
- `canUseTool` keeps the held callback (not `next`) for a gateway name that has no remembered decision. That matches the cron gate, where `gate` is the fallback.

## Decisions

- Where the unattended predicate comes from:
  - Options: (a) optional constructor injection of `PLATFORM_TOKENS.MCP_GATEWAY`; (b) a setter wired later.
  - Chosen: (a), following the handler's existing optional-inject pattern.
  - Reversible: yes.
- Where the capper predicate comes from: an optional constructor argument (`(name) => boolean`), not the port. This keeps `appliesTo` static and pure.
  - Reversible: yes.

**Out-of-scope observations / follow-ups for Batch 10 (wiring)**:

- `libs/backend/agent-sdk/src/lib/di/register.ts:645` (not in my write set) must pass `c.isRegistered(PLATFORM_TOKENS.MCP_GATEWAY, true) ? (n) => c.resolve<IMcpGateway>(PLATFORM_TOKENS.MCP_GATEWAY).isGatewayTool(n) : undefined` as the 4th `ToolOutputCapper` argument, or gateway capping stays off.
- `SdkPermissionHandler` gets the gateway only if `MCP_GATEWAY` is registered before the handler singleton is first resolved. If the handler resolves first, the gateway-tool exclusion is quietly off in the unattended path. The server-side policy still applies. Batch 10 should confirm the registration order in Electron phase 2/3 (cli-agent-runtime) relative to the first handler resolve.
- `sdk-query-options-builder.ts` still has to build the gateway gate around `cronApprovalGate.canUseTool` and place its `hookMatcher` next to the cron matcher (plan `:1512-1517`). That file was not in my write set.

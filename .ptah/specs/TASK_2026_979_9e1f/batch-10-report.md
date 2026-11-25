# Backend implementation: `TASK_2026_979_9e1f`, batch 10

**Tasks completed**: 10.1 (`includeConnectors` threading and binding flags), 10.2 (gate
composition and one-shot hook), 10.3 (flag-tier suppression of served file servers).

## Files

- MODIFIED `libs/backend/agent-sdk/src/lib/internal-query/internal-query.types.ts`: adds
  `InternalQueryConfig.includeConnectors?: boolean`.
- MODIFIED `libs/backend/agent-sdk/src/lib/internal-query/internal-query.service.ts`: passes
  `includeConnectors` to `runner.runOneShot`.
- MODIFIED `libs/backend/agent-sdk/src/lib/internal-query/internal-query.service.spec.ts`: adds a
  forward test, and an assertion that the field is undefined when omitted.
- MODIFIED `libs/backend/agent-sdk/src/lib/helpers/sdk-query-runner.service.ts`:
  - `OneShotRunInput.includeConnectors?`.
  - Optional `@inject(PLATFORM_TOKENS.MCP_GATEWAY, { isOptional: true })` as the last ctor
    parameter.
  - The `internal-query` binding gets `includeConnectors: true` only when the input is `=== true`.
  - `buildOneShotHooks(cwd, includeConnectors)` prepends a `PreToolUse` matcher `mcp__ptah__.*`.
    Without the opt-in, that matcher denies any `isGatewayTool` name with the reason
    "connectors are not enabled for this run". It fails closed when the predicate throws, and
    reports the error through `onError`, which logs a warning.
  - The matcher comes from the exported factory `oneShotGatewayDenyHook` and the constants
    `ONE_SHOT_GATEWAY_HOOK_MATCHER` / `ONE_SHOT_CONNECTORS_DISABLED_MESSAGE`.
  - Suppression: `runOneShot` awaits `readServedFileServerNames` and passes the result to
    `capabilityFlagsFor` as its extra list. It does this only when a gateway is bound, the input
    opts in, MCP is running, `toolAccess !== 'none'` and `policy.ptahEnabled`.
- MODIFIED `libs/backend/agent-sdk/src/lib/helpers/sdk-query-runner.mcp-delivery.spec.ts`: new
  harness and 12 new tests covering the binding flags, the hook (deny / allow / throw / other
  servers), N1 and suppression (served list / not asked / throw).
- MODIFIED `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.ts`:
  - New exported `readServedFileServerNames(gateway, root, logger, tag)`, used by both builder
    and runner. It drops `ptah`. On an error it returns an empty list plus a warning, and it
    carries a `degradation-audit: reported` marker.
  - Optional `MCP_GATEWAY` inject as the last ctor parameter.
  - `createGatewayGate(heldPermissionCallback, cronApprovalGate.canUseTool)` builds
    `createGatewayApprovalGate(held, { next: cron.canUseTool, isGatewayTool, onError })`.
  - `canUseToolCallback = gatewayGate?.canUseTool ?? cronApprovalGate.canUseTool`.
  - `gatewayGate.hookMatcher` is placed directly before `cronApprovalGate.hookMatcher`.
  - Served file servers are appended to `capabilityFlagsFor`'s extra list. This happens only
    when a gateway is bound, `mcpServerRunning`, `cwd` is set and `policy.ptahEnabled`.
  - The session binding gets `gatewayApproval: true` next to `cronWriteApproval` (see Decisions).
- MODIFIED `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.capabilities.spec.ts`:
  the harness takes `gateway` and `ask` and returns `issue` and `logger`. 8 new tests:
  - Regression 1: ptah is kept with no overrides, and the binding carries `gatewayApproval`.
  - A cron tool through both gates is asked once (N2c).
  - A gateway tool is asked once.
  - The gateway matcher sits next to the cron matcher.
  - With no gateway, there is no matcher and no `gatewayApproval`.
  - The suppression list is set.
  - Ptah OFF does not query the gateway.
  - An error gives an empty list plus a warning.

## Stack observed

- tsyringe with explicit `@inject` tokens, and optional platform ports appended last. The pattern
  comes from `cron-scheduler/src/lib/job-runner.ts:118-119` and `sdk-permission-handler.ts:332`.
- Builder ctor specs are positional (`new ctor(...args)`), so the new parameter goes last.
- Hooks and the gate follow B9's `permission/gateway-approval-gate.ts` and
  `permission/cron-approval-gate.ts`.
- The degradation marker kinds come from `tools/degradation-audit/check-degradation.ts`:
  `optional-capability` | `reported`.

## Verification

- `npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath`
  over all 11 `helpers/sdk-query-*spec.ts`, `internal-query.service.spec.ts` and every
  `permission/*.spec.ts`: **21 suites, 527 tests passed**.
- `npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.lib.json`: exit 0.
  `tsconfig.spec.json`: exit 0.
- `npx eslint` on the 7 changed files: 0 errors, 2 warnings.
  - The builder `max-lines` warning was already there (that file was over 700 before this batch).
  - The second warning is also `max-lines`, on the runner. That warning came from this batch, and
    I fixed it by compacting the code. After the fix the runner is under 700 lines.
- `npx tsx tools/degradation-audit/check-degradation.ts`: TOTAL 0 unsuppressed sites.
- `npx tsx tools/di-lint/check-injects.ts`: exit 1. It finds 4 errors, all of the form
  "injects PLATFORM_TOKENS.MCP_GATEWAY but no register*.ts registers it":
  - builder and runner (this batch);
  - `sdk-permission-handler.ts:332` (B9, already in HEAD);
  - `vscode-lm-tools` `http-mcp-server.service.ts:407` (another executor).
  No `register*.ts` binds `MCP_GATEWAY` yet. The errors go away when the batch that registers the
  gateway lands. The pre-push hook runs di-lint, so the coordinator must not push until then.
- `npm run verify` was not run, as the brief requires: only focused checks.

## Decisions

- **`gatewayApproval` is set only when a gateway is bound** (`...(this.mcpGateway ? {...} : {})`).
  - Options: set it always (as the contract excerpt reads), or only when the gateway gate is
    actually installed.
  - Evidence: `McpCallerBinding.gatewayApproval` says it is "true only on a session credential
    whose host asks the user ... via the PreToolUse gateway approval gate". The gate needs
    `isGatewayTool`, so with no gateway bound no gate exists.
  - Setting it always also broke 3 exact-match binding assertions in
    `sdk-query-options-builder.spec.ts`, which is outside the write set.
  - On Electron, where the gateway is bound, the binding carries the flag, and the acceptance test
    asserts it.
  - Reversible: a one-line change.
- **Cron write tools are excluded from the gateway predicate.** The predicate is
  `!isCronMutatingTool(n) && gateway.isGatewayTool(n)`.
  - Reason: `isGatewayTool` is fail-closed. Before the HTTP server registers host tool names,
    every `mcp__ptah__*` name counts as a gateway tool, so a cron write would be asked by both
    hooks.
  - With the exclusion, a cron call is always asked once, by the cron gate. The N2c spec uses an
    always-true predicate to prove this.
- **No gateway bound → no gateway gate and no one-shot deny hook.** Such a host serves no gateway
  tool.
- **The one-shot deny hook is installed only without the opt-in.** With the opt-in the run is
  unattended by design, so there is nothing to ask.

## Plan deviations

- **N1 spec.** B3's `gateway-caller-policy` exists in no lib (grep found nothing), and agent-sdk
  cannot import cli-agent-runtime. So the N1 test asserts at the binding seam instead: with
  `PreToolUse` deleted, the no-opt-in binding is `kind: 'internal-query'` without
  `includeConnectors: true`, which the `IMcpGateway` caller-policy contract rejects. A
  server-side policy test belongs to the batch that owns `gateway-caller-policy`.

## Executor follow-ups (from B9)

- **(a) Not in write set.** `libs/backend/agent-sdk/src/lib/di/register.ts:642-656`: the
  `ToolOutputCapper` factory still passes 3 arguments. It must pass a gateway predicate as the 4th,
  for example:
  `c.isRegistered(PLATFORM_TOKENS.MCP_GATEWAY, true) ? (n) => c.resolve<IMcpGateway>(PLATFORM_TOKENS.MCP_GATEWAY).isGatewayTool(n) : undefined`.
  Until then, gateway capping stays off. The capper is not constructed in this batch's files.
- **(b) Not confirmable yet. Applies to this batch's classes too.**
  - No `register*.ts` binds `MCP_GATEWAY` anywhere (grep over `apps` and `libs`).
  - `SdkPermissionHandler`, `SdkQueryOptionsBuilder` and `SdkQueryRunner` all inject it as
    optional at construction.
  - The registering batch must bind `MCP_GATEWAY` before the first resolve of any of those three.
    Otherwise the instance captures `undefined`, which silently turns off:
    - the unattended exclusion;
    - the gateway gate and the `gatewayApproval` flag;
    - the one-shot deny hook and suppression.
  - The gateway's own policy still holds.
  - Recommend adding `MCP_GATEWAY` to `apps/ptah-electron/src/di/expected-resolvable.ts` in that
    batch.
- **(c) Done**, in `sdk-query-options-builder.ts` (see Files).

## Out-of-scope observations

- The di-lint errors above block the pre-push hook until the gateway is registered.
- My `prettier --write` glob briefly reformatted `internal-query-concurrency-gate.ts` and
  `network-failure.ts`, which are outside the write set. I restored both with `git checkout`;
  they were clean at HEAD.
- HEAD moved during the batch (`72b1db6`), so another session committed meanwhile. No files in
  this write set were affected.

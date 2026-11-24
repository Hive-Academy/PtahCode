# Code Style Review - TASK_2026_979_9e1f (Phase 1)

Reviewer: Claude subagent, same family as the implementers. Evidence is weaker than a cross-vendor review.
Scope: `git diff main...HEAD`, production files read in the hunks cited. Specs skimmed only. No build or test run.

## Summary

| Metric | Value |
| --- | --- |
| Overall score | 7/10 |
| Assessment | REVISE |
| Blocking | 0 |
| Serious | 3 |
| Moderate | 5 |
| Minor | 4 |

## Five style questions

1. **Six months out.** The caller-policy matrix has two hand-synced copies plus two scope literals. Add a caller kind or change a rule, and one copy will be missed. Fail-open vs fail-closed then depends on which copy is wrong. The `mcp__ptah__` prefix is also copied 8 times (S2).
2. **Misread.** `registerHostToolNames` / `isGatewayTool` are order-dependent. `isGatewayTool` is fail-closed until the HTTP server registers names (`mcp-gateway.interface.ts:88-97`). `status()` returns a hand-built session scope in `stream-transformer.ts:431-436` that must match the options builder's credential. A reader will not see that coupling. The unused `authSecretsService` (`chat-session.service.ts:459`) reads as a live dependency.
3. **Maintenance cost.** `protocol-dispatcher.ts` is now 5182 lines (+252). Gateway module state (`gatewayNamesByScope`, `rememberGatewayNames`, `:616-810`) is stuffed into it. Three OAuth/Smithery service graphs are built in 3 places (decision 25a).
4. **Inconsistency.** `job-runner.ts` takes `mcpGateway: IMcpGateway | null = null` while every other consumer takes `mcpGateway?:` (`stream-transformer.ts:606`, `sdk-query-options-builder`, `sdk-query-runner`, `http-mcp-server.service.ts:407`). The one-shot deny hook sits in `sdk-query-runner.service.ts:222` while its sibling gates sit in `permission/`.
5. **Different.** One pure `isGatewayCallerPermitted(Pick<McpCallerBinding,...>)` exported from platform-core, used by both sides and by the stream-transformer and builder. The gateway-bridge helpers move out of the dispatcher into their own file. Better because the matrix becomes one test, not two spec files that agree by accident.

## Blocking issues

None. Boundaries hold (see Pattern compliance).

## Serious issues

### S1 Caller-policy matrix duplicated (answers the review question: yes, share it)
- Files: `vscode-lm-tools/.../mcp-core/mcp-caller-policy.ts` (`isGatewayCallerPermitted`, +30 lines); `cli-agent-runtime/.../gateway/gateway-caller-policy.ts:22-47` (`isGatewayScopePermitted`).
- Problem: the same switch over `agent` / `session` / `internal-query` exists twice. The doc comment at `gateway-caller-policy.ts:6-8` says "keep the two in step". That is a manual sync with no test tying them together. `McpGatewayScope` is a structural subset of `McpCallerBinding`, so one function fits both.
- Related: the scope shape `{kind:'session', capability:'privileged', gatewayApproval:true}` is rebuilt by hand in `stream-transformer.ts:431-436`, and `{kind:'internal-query', ..., includeConnectors:true}` in `job-runner.ts` (`readGatewayUnavailable`) and in `sdk-query-runner`. Each is another place to drift.
- Tradeoff: the dispatcher copy is justified as an early skip (`mcp-caller-policy.ts` doc). That justifies calling the check, not owning a second copy.
- Recommendation: export one pure function from platform-core next to the port. Precedent: `INTERACTIVE_MCP_CREDENTIAL_MAX_AGE_MS` is a runtime value already exported from `mcp-caller-credentials.interface.ts:21`. Delete both copies. Move the two spec matrices into one platform-core spec. Add `gatewayScopeForSession()` / `...ForOneShot()` builders if the literals stay.

### S2 `mcp__ptah__` prefix copied again
- Files: new at `gateway-approval-gate.ts:42` and `mcp-gateway.service.ts:102`. Already at `sdk-permission-handler.ts:79`, `cron-tool-policy.ts:23`, `tool-output-capper.ts:63`. Literal at `sdk-query-runner.service.ts:217,234` and `cron-approval-gate.ts:37`.
- Problem: this diff makes the 4th and 5th named constant. Prefix, hook matcher and strip logic must agree with the CLI's naming for a gateway call to be gated. A mismatch silently skips the approval gate.
- Recommendation: one `PTAH_MCP_TOOL_PREFIX` constant, exported from platform-core with the port (or from agent-sdk, with the gateway importing nothing from it). Import it in the new code now; migrate the old copies in a follow-up.

### S3 Growth in files far over `max-lines` (700, warn) with no extraction
- `protocol-dispatcher.ts` 4930 to 5182 (+252 net; gateway bridge `:616-810` is self-contained, with its own module-level `WeakMap` state).
- `sdk-query-options-builder.ts` 2614 to 2705 (+91). `stream-transformer.ts` 1359 to 1429 (+70). `sdk-query-runner.service.ts` +105 to 1013. `http-server.handler.ts` 795 (+109).
- Problem: each added unit has one clear responsibility and no dependency on the host class. The new gateway code adds the most-copied shape: free functions plus module state inside a giant file.
- Recommendation:
  - Dispatcher: `mcp-core/gateway-tool-bridge.ts` (list, name cache, call).
  - Stream transformer: `readGatewayServers` to `helpers/gateway-server-status.ts`.
  - Options builder: `readServedFileServerNames` and `createGatewayGate` next to `permission/gateway-approval-gate.ts`. `sdk-query-runner.service.ts` imports a helper from the 2.7k-line builder today.
  - `oneShotGatewayDenyHook` to `permission/`.

## Moderate issues

- **M1 Dead ctor dependency.** `chat-session.service.ts:459` `authSecretsService` is now unused (its only reader, the Smithery/OAuth resolver code, was deleted). Accepted by decision 26, but the cost is a misleading DI edge plus a 16-spec positional-arg tangle. Require the named follow-up to carry a task ID and put a `@deprecated unused` JSDoc on the param now. Positional-arg specs should move to a builder in that follow-up.
- **M2 OAuth/Smithery graph built in 3 places.** `cli-agent-runtime/src/lib/di/register.ts:~590-625` builds a new `McpOAuthService`, `McpOAuthInstalledManifestStore` and `SmitheryInstalledManifestStore`, apart from the existing RPC handler and install-service construction (`register.ts:545-559` area). Separate single-flight refresh means a rotating refresh token can race (decision 25a). Bind the shared services as tokens and resolve them here.
- **M3 Port design.**
  - `IMcpGateway` mixes serving, status, host-name registration, file-name discovery and change events (`mcp-gateway.interface.ts:85-130`). Consumers use disjoint slices, hence `Pick<IMcpGateway,'status'>` in three places. Consider `IMcpGatewayStatus` / `IMcpGatewayTools` role ports, or keep one and standardise on `Pick<>` everywhere (job-runner takes the whole thing).
  - `registerHostToolNames` is temporal coupling on a port (mutating setup call). Prefer a constructor or provider input.
  - `status()` returns mutable `McpGatewayServerStatus[]` (`:114`) while `listTools` returns `readonly`.
- **M4 Type precision.** `McpGatewayCallResult` has `content: readonly unknown[]` and a `[field: string]: unknown` index signature (`:56-60`). The index signature voids checking of the named fields' neighbours. Type content as the MCP SDK's `CallToolResult['content']` item union, or at least `{type:string}` items. `job-runner.ts` `readUnavailableInitServers` hand-parses `msg as {...}` and `entry as {...}` although the SDK types `system/init` (the stream transformer reads `sdkMessage.mcp_servers` typed).
- **M5 Linked-worktree detection duplicated.** `harness-sync/.../workspace/linked-worktree.ts` adds async and sync twins of an `.git`-is-file test. Several siblings already answer the same question: `rpc-handlers/.../git-workspace-root.ts`, `vscode-core/.../git-probe-reader.ts`, `task-end-hook/.../main-root-resolver.ts`. The twins have a defensible reason (sync planner, no git spawn) but they diverge on a `.git` symlink and on bare/submodule layouts. At minimum cross-reference them in the doc comment (decision N3).

## Minor

- `job-runner.ts` ctor `mcpGateway: IMcpGateway | null = null` vs `?:` everywhere else.
- `ONE_SHOT_CONNECTORS_DISABLED_MESSAGE` and `ONE_SHOT_GATEWAY_HOOK_MATCHER` exported from a service file with no consumer outside it (`sdk-query-runner.service.ts:217-220`).
- `harness-sync/src/index.ts` exports only `isLinkedWorktreeRoot`; the planner's sync twin is internal. Fine, but name the pair in the comment.
- `registerMcpGateway` returns silently when auth secrets are missing (`di/register.ts:575`). Order-dependent on registration order and only covered by `expected-resolvable.ts` for Electron (decision 25e: no container smoke assertion).

## File-by-file

- `platform-core/.../mcp-gateway.interface.ts` 7/10: plain-JSON, `I*` prefix, `export type` in the barrel (index.ts:179-186), token is `Symbol.for` in the token object (`tokens.ts:137`). Loses points for M3/M4.
- `platform-core/.../mcp-caller-credentials.interface.ts` 8/10: the two new binding flags are documented.
- `gateway-caller-policy.ts` 7/10 and `mcp-caller-policy.ts` 7/10: exhaustive `never` switch in one and `default: false` in the other. The duplicate is S1.
- `protocol-dispatcher.ts` 5/10: S3.
- `sdk-query-options-builder.ts`, `stream-transformer.ts`, `sdk-query-runner.service.ts` 6/10: S3, S2.
- `cli-agent-runtime/src/lib/di/register.ts` 7/10: M2.
- `agent-sdk/src/lib/di/register.ts` 8/10: +18 lines, optional inject and `isRegistered`, a genuine sibling pattern (SDK_CODE_OUTLINER at the same site).
- `gateway/*.ts` (service 816, sources 543): not read in full. Sizes are over 700, so split along `mcp-gateway.service.ts` responsibilities is worth a look. Confidence on these is lower.
- `chat-session.service.ts` 7/10: M1. The 119-line removal is a clean retirement.

## Pattern compliance

| Rule | Status | Evidence |
| --- | --- | --- |
| New projects have scope and type tags | NOT_APPLICABLE | no new project; tags unchanged (`project.json` untouched) |
| No `eslint-disable` of module boundaries; none added | PASS | grep of added lines for disables/`as any`/`@ts-ignore`: none |
| agent-sdk reaches the gateway only through platform-core | PASS | `register.ts:23`, `stream-transformer.ts:33-35`; no `cli-agent-runtime` import in agent-sdk (only a comment, `harness-preflight.port.ts:4`) |
| agent-sdk does not import harness-sync | PASS | grep: none |
| vscode-lm-tools to harness-sync | PASS | pre-existing edge (`http-mcp-server.service.ts:60`, `ptah-mcp-slots.ts:107`); diff only extends it |
| Port in platform-core, impl in cli-agent-runtime, composition root binds | PASS | `cli-agent-runtime/di/register.ts:575`, `expected-resolvable.ts:147` |
| Optional injection for gateway consumers | PASS (one outlier) | `isOptional: true` x5; `job-runner.ts` uses `= null` |
| Token `Symbol.for` in token object | PASS | `tokens.ts:137` |
| Ports `I*`, kebab-case file with `.interface.ts` | PASS | `mcp-gateway.interface.ts` |
| Electron phase wiring and `expected-resolvable.ts` updated | PASS | `expected-resolvable.ts:145-147` |
| Contract runner for new Electron port | NOT_APPLICABLE | not a platform port with adapters |
| No new `as any` or `@ts-ignore` | PASS | grep of added lines |
| Single source for repeated policy/constants | FAIL | S1, S2 |
| File-size ceiling | FAIL (warn) | S3 |

## Maintenance debt

- Introduced: ~11.7k lines including specs. A second policy matrix, 5 more prefix constants, 3 files grown beyond 700 lines.
- Retired: 119 lines of per-session Smithery/OAuth override building in `ChatSessionService`. The connector path is now one place.
- Net: structure improves for connectors, regresses for policy and file size.

## Verdict

- Recommendation: REVISE (APPROVED once S1 and S3 are done, or recorded as a dated follow-up).
- Confidence: MEDIUM (gateway internals not read line-by-line).
- Key concern: the authoritative caller policy and the session-scope literals are duplicated by hand across three libs.
- A 10/10 version would: export one policy function from platform-core; move the dispatcher gateway bridge and the two agent-sdk helpers into their own files; define one prefix constant; share the OAuth/Smithery services via DI; type `McpGatewayCallResult.content`; drop or deprecate `authSecretsService` now.

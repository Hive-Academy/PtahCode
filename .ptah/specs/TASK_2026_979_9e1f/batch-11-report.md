# Batch 11 report: session status from the gateway (C6), plus the capper gateway predicate

## Files changed

All paths are under `libs/backend/agent-sdk/src/lib/`.

- `helpers/stream-transformer.ts`
  - Adds an optional `@inject(PLATFORM_TOKENS.MCP_GATEWAY, { isOptional: true }) mcpGateway?: Pick<IMcpGateway, 'status'>` as the last constructor parameter.
  - Adds a module helper, `readGatewayServers`. On init, the `servers` event is now the CLI entries followed by `gateway.status(scope)` entries. Each gateway entry is `{ name: server.key, status, source: 'ptah-gateway' }`.
  - The scope is `{ kind: 'session', capability: 'privileged', workspaceRoot: init.cwd, gatewayApproval: true }`. This matches the interactive credential that the options builder mints when a gateway is bound.
  - The helper returns no gateway entries when any of these holds:
    - no gateway is bound;
    - the init message has no `cwd`;
    - the session reports no `ptah` server.
  - If `status()` throws, the error is logged with `logger.warn` and the CLI entries still publish. The catch carries the marker `// degradation-audit: reported - ...`.
- `helpers/mcp-server-backoff.service.ts`: the init `servers` listener skips entries with `source === 'ptah-gateway'`. Such an entry neither starts a back-off nor clears one.
- `di/register.ts` (the extra item): the `SDK_TOOL_OUTPUT_CAPPER` factory resolves `PLATFORM_TOKENS.MCP_GATEWAY` as optional, using `c.isRegistered(token, true)` the same way as the outliner. It passes `(name) => gateway.isGatewayTool(name)` as the 4th constructor argument, or `undefined` when no gateway is bound. It also imports `type IMcpGateway`.
- `helpers/stream-transformer.spec.ts`
  - `makeHarness` takes an optional gateway.
  - A new describe block, `gateway server status (TASK_2026_979)`, has 5 tests:
    - the append, with the exact scope and the order after the CLI entries;
    - an unbound gateway leaves the output unchanged;
    - no `ptah` server means no append;
    - no `cwd` means no append;
    - when `status` throws, the CLI entries still publish and the warning is logged.
- `helpers/mcp-server-backoff.service.spec.ts`: 2 tests. A failed gateway entry creates no record and a connected one clears none. CLI entries in the same event are still tracked.
- `di/register.compaction-boundary-registry.smoke.spec.ts`: a new describe block resolves the capper through the real `registerSdkServices` container.
  - With `MCP_GATEWAY` bound, a gateway tool (`mcp__ptah__zernio__create_post`) passes `ToolOutputCapper.appliesTo` and is capped. Host tools stay exempt.
  - With no gateway bound, the predicate is `undefined` and the tool stays exempt.

## Checks run (focused, per CLAUDE.md lane rules)

- `npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath` on 4 specs: `stream-transformer.spec.ts`, `mcp-server-backoff.service.spec.ts`, `register.compaction-boundary-registry.smoke.spec.ts` and `tool-output-capper.spec.ts`.
  - Result: 4 suites passed, 175 of 175 tests passed (`.ptah/tmp/b11-jest.log`).
- `npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.lib.json`: exit 0, no errors.
- `npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.spec.json`: exit 0, no errors.
- `npx eslint` on the 6 changed files: 0 errors. There are 2 `max-lines` warnings, on `register.ts` and `stream-transformer.ts`. Both files were already over the limit before this batch.
- Not run:
  - `npm run verify` (`--related`, and `-t lint,typecheck`): the orchestrator runs the gate.
  - The di-lint and degradation-audit scripts: no npm script exposes them. The new catch carries the marker, and the new constructor parameter has an explicit `@inject`.
- Prettier: `prettier --check` already flags all 4 edited source files at `HEAD`, before this batch. I did not reformat whole files; lint-staged formats on commit.

## Deviations and decisions

- **Spec file outside the write set.** The batch write set does not list `di/register.compaction-boundary-registry.smoke.spec.ts`. I extended it for the capper proof, which the brief asks for ("add or extend a spec"), because it holds the only real-container harness.
- **Where `workspaceRoot` comes from.** `StreamTransformConfig` has no cwd, and its callers in `sdk-agent-adapter.ts` are outside the write set. I used `SDKSystemMessage.cwd`, a required field in the SDK typings, read from the init message itself.
- **Guard on the `ptah` server.** Gateway entries are appended only when the session reports a `ptah` server. Gateway tools reach a session only through that server, so without the guard, a session with Ptah's MCP off would show servers it cannot use. This guard is not in the contract excerpt. It can be undone by deleting one `if`.
- **Gateway `detail` is dropped.** `SessionMcpServerEntry` has no `detail` field, and the batch says "No UI change".
- **When the capper reads the gateway.** The gateway binding is read when the capper is first resolved, the same way as `SDK_CODE_OUTLINER`. No host registers `MCP_GATEWAY` yet; that is a later batch. That registration must happen before the capper is first resolved, or gateway tools stay uncapped for the process lifetime.

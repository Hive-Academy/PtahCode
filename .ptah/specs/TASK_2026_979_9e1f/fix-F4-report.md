# Fix-round F4: cron MCP warning on failure, redaction, agent-sdk gateway extraction

Write set: `libs/backend/agent-sdk` and `libs/backend/cron-scheduler` only. No commit. `batches.md` and `task.md` were not edited.

## Findings, fixes and tests

### Logic M8 (cron-scheduler `job-runner.ts`)

- **Failure path.** The stream loop now uses `try / catch / finally`. The catch calls `withFailureMcpWarning`. That method merges the gateway's unavailable servers, using the same dedup by name as the success path, and rethrows:
  - with nothing to warn about, the original error unchanged;
  - otherwise `new Error(message + warningLine, { cause: err })`.
- **Run status is unchanged.** `run()` still decides failed or skipped (`localCtl.signal.aborted`) exactly as before. `markFailed` now receives the message with the warning appended. The failure message is not capped at 500 (it never was). The warning line keeps its 300 cap.
- `withMcpWarning` was split into `mcpWarningLine` (shared) plus the 500 cap on the success base. The success output is identical.
- **Redaction.** New `redactMcpErrorText(text)` in `agent-sdk/src/lib/helpers/redact-mcp-url.ts`, exported from the helpers barrel and the lib barrel next to `redactMcpUrl`. It does four things:
  - Each URL in the text keeps only `scheme://host[:port]/path`. Userinfo is dropped, and any query or fragment becomes `?***redacted***`.
  - The value of credential headers is masked: `Authorization`, `Proxy-Authorization`, `Cookie`, `Set-Cookie` and `X-*-Key|Token|Secret`.
  - `Bearer` and `Basic` tokens are masked.
  - Credential assignments are masked (`token=`, `api_key:`, `client_secret=`, `password=` and similar).
  - It is applied to both detail sources: the CLI `system`/`init` `error` (`readUnavailableInitServers`) and the gateway `status().detail`.
- **Tests:**
  - `job-runner.spec.ts` gains 4 cases:
    - a failed run (`error_max_turns`) carries the warning and stays failed, with `cause` kept;
    - a failed run with every server connected keeps its own message;
    - an aborted run that throws stays `skipped/aborted`;
    - URL query, userinfo, header and token values are absent from the summary, and redacted URLs keep host and path.
  - `redact-mcp-url.spec.ts` gains 4 `redactMcpErrorText` cases.

### Style S3 (agent-sdk extraction, no behaviour change)

- `helpers/gateway-server-status.ts` (new) holds `readGatewayServers`, moved unchanged apart from the scope builder. It also holds the exported `withGatewayServers` (CLI entries followed by gateway entries), so the call site in `stream-transformer.ts` stays a single expression. The local `PTAH_MCP_SERVER_NAME = 'ptah'` copy is replaced by the `@ptah-extension/shared` constant, which has the same value.
- `helpers/gateway-session-wiring.ts` (new) holds three functions:
  - `readServedFileServerNames`, moved. It now takes `gateway | undefined` and `root | undefined` and returns `[]` for either, so each caller passes `undefined` instead of building a ternary. The conditions are the same.
  - `readOneShotServedFileServerNames`, the one-shot eligibility test (`includeConnectors && mcpServerRunning && toolAccess !== 'none' && ptahEnabled`), moved from the runner unchanged.
  - `createSessionGatewayGate`, which was the builder's private `createGatewayGate`. It is the same body, with the gateway and logger passed in.
  - The runner no longer imports a helper from the 2.7k-line options builder.
- `permission/one-shot-gateway-deny-hook.ts` (new) holds `oneShotGatewayDenyHook`, moved unchanged apart from the prefix helper, plus `oneShotGatewayDenyHookFor(gateway, includeConnectors, logger, tag)`. That second function is the logging wiring that was inline in `buildOneShotHooks`. The file is not added to `permission/index.ts`, because nothing outside the lib uses it.
- Sizes (`wc -l`):

| File | main | before F4 (HEAD) | now |
| --- | --- | --- | --- |
| `stream-transformer.ts` | 1359 | 1429 | 1370 |
| `sdk-query-options-builder.ts` | 2614 | 2705 | 2639 |
| `sdk-query-runner.service.ts` | 912 | 1013 | 945 |

- Tests: the existing host specs (`stream-transformer.spec.ts`, `sdk-query-options-builder*.spec.ts`, `sdk-query-runner*.spec.ts`, `gateway-approval-gate.spec.ts`) pass unchanged. The only exception is the import change in `sdk-query-runner.mcp-delivery.spec.ts`.

### Style S1/S2

- Hand-built scope literals now use the builders:
  - `sessionGatewayScope(cwd)` in `gateway-server-status.ts`;
  - `internalQueryGatewayScope(root, true)` in `job-runner.ts`;
  - `internalQueryGatewayScope(cwd, includeConnectors)` for the one-shot credential binding in `sdk-query-runner.service.ts`. It spreads `includeConnectors` only when true, as before; the spec "mints no includeConnectors" still passes.
- `gatewayScopeFromBinding` has no use inside this write set. Its literal site is `protocol-dispatcher.ts` (F3).
- Prefix:
  - `gateway-approval-gate.ts` drops its local `PTAH_MCP_TOOL_PREFIX` and imports it from `@ptah-extension/platform-core`.
  - The matcher is `` `${PTAH_MCP_TOOL_PREFIX}.*` ``, and the guard uses `hasPtahMcpToolPrefix`.
  - The one-shot hook uses the same matcher and helper.
- Pre-existing sites were left alone: `tool-output-capper.ts`, `cron-tool-policy.ts`, `sdk-permission-handler.ts`, `cron-approval-gate.ts` and `plan-lane-tool-policy.ts`.

### Minors

- `job-runner.ts`: `private readonly mcpGateway?: IMcpGateway`, matching the other consumers. The spec harness parameter is now optional too.
- `ONE_SHOT_GATEWAY_HOOK_MATCHER` and `ONE_SHOT_CONNECTORS_DISABLED_MESSAGE` are now module-private in `permission/one-shot-gateway-deny-hook.ts`. The spec asserts the literal values.

## Files

- CREATED `libs/backend/agent-sdk/src/lib/helpers/gateway-server-status.ts`
- CREATED `libs/backend/agent-sdk/src/lib/helpers/gateway-session-wiring.ts`
- CREATED `libs/backend/agent-sdk/src/lib/permission/one-shot-gateway-deny-hook.ts`
- MODIFIED `libs/backend/agent-sdk/src/lib/helpers/redact-mcp-url.ts` (+ `redact-mcp-url.spec.ts`)
- MODIFIED `libs/backend/agent-sdk/src/lib/helpers/index.ts`, `libs/backend/agent-sdk/src/index.ts` (export `redactMcpErrorText`)
- MODIFIED `libs/backend/agent-sdk/src/lib/helpers/stream-transformer.ts`
- MODIFIED `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.ts`
- MODIFIED `libs/backend/agent-sdk/src/lib/helpers/sdk-query-runner.service.ts` (+ `sdk-query-runner.mcp-delivery.spec.ts`)
- MODIFIED `libs/backend/agent-sdk/src/lib/permission/gateway-approval-gate.ts`
- MODIFIED `libs/backend/cron-scheduler/src/lib/job-runner.ts` (+ `job-runner.spec.ts`)

## Checks run (logs in `.ptah/tmp/f4-*.log`)

- `npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath` on 7 specs: `redact-mcp-url`, `sdk-query-runner.mcp-delivery`, `stream-transformer`, `sdk-query-options-builder.capabilities`, `sdk-query-options-builder`, `sdk-query-runner.service` and `gateway-approval-gate`. Result: 7 suites, 387 tests passed.
- `npx jest --config libs/backend/cron-scheduler/jest.config.ts ... job-runner.spec.ts cron-job.service.spec.ts`: 52 passed, 1 failed. The failure is the known `CronJobService > create > passes a 'session' creator through with its sessionId`, which also fails on main.
- `npx tsc --noEmit` on the agent-sdk `tsconfig.lib.json` and `tsconfig.spec.json`, and on the cron-scheduler `tsconfig.lib.json` and `tsconfig.spec.json`: all exit 0.
- `npx eslint` on the 14 changed or new files: 0 errors. There are 2 warnings, both pre-existing `max-lines` warnings (`sdk-query-options-builder.ts`, `stream-transformer.ts`).
- I did not run Nx, `npm run verify`, or di-lint; the coordinator owns those. The `@inject` decorators did not change. Only the `job-runner` parameter type moved from `| null = null` to `?:`.

## Plan deviations

- **Size target only partly met.** `stream-transformer.ts` is +11 over main: 2 import lines and 9 lines of constructor inject and call-site plumbing. `sdk-query-options-builder.ts` is +25, of which 7 are imports. `sdk-query-runner.service.ts` is +33, of which 5 are imports. What is left in the two big files is the irreducible plumbing:
  - the optional constructor inject;
  - gate creation and the `PreToolUse` spread;
  - the served-names call;
  - `gatewayApproval` on the credential;
  - threading `includeConnectors` and `servedFileServers` through the private methods;
  - the `OneShotRunInput.includeConnectors` field.
  Getting below that would mean moving pre-existing code, which is out of scope.
- **Redactor is self-contained.** I first reused the agent-sdk prose redactor `redactBudgetSecrets`, but it lives in `compaction/subagent-budget-monitor.ts`, which pulls in vscode-core and tsyringe at import time; the spec failed with "tsyringe requires a reflect polyfill". So `redactMcpErrorText` has its own small rule set in `redact-mcp-url.ts`, beside `redactMcpUrl`, with no new dependency.
- **Scope of the failure warning.** It covers failures while the stream is consumed: a thrown result subtype or a stream error. A rejection from `internalQuery.execute()` itself happens before any server is known and is rethrown as before, with no gateway read.

## Out-of-scope observations

- `stream-transformer.ts` is not Prettier-formatted on main either (`prettier --check` fails there). I hand-formatted my lines instead of reformatting the file. If lint-staged runs Prettier at commit time, the commit will reformat the whole file.
- Several working-tree changes in cli-agent-runtime, vscode-lm-tools, harness-sync and rpc-handlers belong to other executors. I did not touch them.

## Decisions

- **Failure warning goes in `error.message`, with `cause` set to the original.** The other option was a separate warning field on the run row. `markFailed(runId, error.message)` is the only failure text the run row gets, and it is the summary the review asks to warn in. Run status stays untouched. Reversible.
- **URL handling drops the whole query** instead of masking only known secret params, as `redactMcpUrl` does. The brief requires that no URL query reach the summary. Reversible.
- **New files are not added to the `permission/` or `helpers/` barrels**, except `redactMcpErrorText`, which cron-scheduler consumes through `@ptah-extension/agent-sdk`. Reversible.

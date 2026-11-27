## Changed files

- `libs/shared/src/lib/tool-guidance/tool-call-classify.ts` and `tool-call-classify.spec.ts` (moved from `scripts/agent-usage/tool-call-classify.ts` and `.spec.ts`, which were removed; `libs/shared/src/lib/tool-guidance/tool-substitutions.ts` and `tool-guidance.render.ts` were left untouched)
- `libs/shared/src/lib/types/agent-process.types.ts` (added `ToolCallSummary`, `ToolCallSummaryToolStats`, `ToolCallSummarySubstitutableNative`)
- `libs/shared/src/index.ts` (exported `./lib/tool-guidance/tool-call-classify`)
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/tool-call-summary.ts` and `tool-call-summary.spec.ts` (new pure accumulator: `createToolCallSummary`, `recordToolCall`, `recordToolResult`, `cloneToolCallSummary`)
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/tracked-agent.ts` (added optional `segmentsTruncated` and `toolCallSummary`)
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-output-buffer.service.ts` and `agent-output-buffer.service.spec.ts`
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts` (`readOutputForPersistence` returns `cli`, `model`, `startedAt`, `segmentsTruncated`, `toolCallSummary`)
- `libs/backend/cli-agent-runtime/src/lib/wiring/agent-events.ts` and `agent-events.spec.ts` (`persistCliSessionReference` passes header fields to `saveAgentOutput`)
- `libs/backend/agent-sdk/src/lib/session-metadata-store.ts` and `session-metadata-store.spec.ts` (extended `PersistedAgentOutput` and `saveAgentOutput`)
- `scripts/agent-usage/agent-output-blob.reader.ts` and `agent-output-blob.reader.spec.ts`
- `scripts/agent-usage/tool-call-share.ts` and `tool-call-share.spec.ts` (now imports `classifyToolCall` and `ToolCallSummary` from `@ptah-extension/shared`)
- `scripts/agent-usage/__fixtures__/agent-output.synthetic.json`
- `scripts/agent-usage/tsconfig.json`, `scripts/jest.config.ts`, `package.json` (`usage:tool-call-share` and Jest module mapping for `@ptah-extension/shared`)

## Collection point

- File and line: `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-output-buffer.service.ts:91-119` (`AgentOutputBuffer.appendSegment`) and `:259-286` (`updateToolCallSummary`).
- Proof that every vendor passes it: in `AgentProcessManager`, both `doSpawnSdk` (`agent-process-manager.service.ts:1675`) and `spawnFromSdkHandle` (`:1855`) converge on `trackSdkHandle` (`:1889`), which subscribes to `sdkHandle.onSegment` (`:2136`) and forwards every structured segment to `this.outputBuffer.appendSegment` (`:2161`). All structured adapters (`claude-cli.adapter.ts:369`, `codex-app-server-lane.adapter.ts:988`, `copilot-sdk.adapter.ts:307,592`, `cursor-cli.adapter.ts:638`, `opencode-cli.adapter.ts:882`, `pi-cli.adapter.ts:700`, `provider-session-lane-handle.ts:195,699`, `ptah-cli-registry.ts:970,1049,1743`) emit segments via `onSegment`.
- Behaviour at and after the 500-segment cap: `updateToolCallSummary` runs on line `:109` BEFORE the `tracked.accumulatedSegments.length < MAX_ACCUMULATED_SEGMENTS` (`500`) guard on line `:110`. Once the 500-segment persistence cap is reached, `else { tracked.segmentsTruncated = true; }` (`:114-116`) records truncation only when a segment is actually dropped (so an exact-500 run has `segmentsTruncated: false`), while `updateToolCallSummary` continues classifying every `tool-call`, `tool-result`, and `tool-result-error` segment into `tracked.toolCallSummary`. Failures inside `updateToolCallSummary` are caught (`:274-285`), logged once per `agentId` (`summaryErrorLogged`), and cleared on `discard` (`:256`) so buffering continues uninterrupted.

## Blob header

Final `PersistedAgentOutput` header shape (`libs/backend/agent-sdk/src/lib/session-metadata-store.ts:687-706`):

```ts
export interface PersistedAgentOutput {
  readonly agentId: string;
  readonly savedAt: number;
  readonly cli?: CliType;
  readonly model?: string;
  readonly startedAt?: string;
  readonly segmentsTruncated?: boolean;
  readonly toolCallSummary?: ToolCallSummary;
  readonly segments?: readonly CliOutputSegment[];
  readonly streamEvents?: readonly FlatStreamEventUnion[];
}
```

Callers and readers checked:
- `libs/backend/cli-agent-runtime/src/lib/wiring/agent-events.ts:882-905` (the sole production caller of `saveAgentOutput`): passes `cli`, `model` (`persistedOutput.model ?? info.observedModel ?? info.model` when set), `startedAt`, `segmentsTruncated`, and `toolCallSummary` from `AgentProcessManager.readOutputForPersistence` (`agent-process-manager.service.ts:3091-3129`) and `AgentProcessInfo`.
- `libs/backend/agent-sdk/src/lib/session-metadata-store.ts:2523-2605` (`saveAgentOutput`): writes optional header fields onto `PersistedAgentOutput` in both blob-store and sync `IStateStorage` branches; async `replaceJsonSequence` yields only tagged segment/event items.
- `libs/backend/agent-sdk/src/lib/session-metadata-store.ts:2587-2733` (`getAgentOutputPage` / `readRecordOutputPage`): projects only `segments`, `streamEvents`, and `savedAt`, ignoring extra header fields.
- `libs/backend/agent-sdk/src/lib/session-store-migrator.ts:224-243`: copies `PersistedAgentOutput` objects intact from legacy storage into session blobs.
- `libs/backend/rpc-handlers/src/lib/handlers/session-rpc.handlers.ts:1550-1575` (`session:cli-output-page`), `libs/backend/cli-agent-runtime/src/lib/cli-agents/messaging/lane-resumers/lane-last-model.ts:53-70` (via `register-agent-messaging.ts:198`), and `libs/frontend/chat/src/lib/services/chat-store/session-loader.service.ts:1745-1795`: consume `getAgentOutputPage` (`{ items, nextCursor, done }`) and ignore the blob header safely.
- `scripts/agent-usage/agent-output-blob.reader.ts` and `tool-call-share.ts`: read header `cli`, `model`, `startedAt`, `segmentsTruncated`, and `toolCallSummary` when present, falling back to segment counting and sibling metadata for legacy blobs. Coverage reports `lanesWithSummary` and counts `lanesTruncatedOrEmpty` only when `!row.hasSummary && row.truncated`.

## Verification

- `shared` Jest (`libs/shared/jest.config.ts` on `tool-call-classify.spec.ts`, `tool-substitutions.spec.ts`, `agent-process.types.spec.ts`, `index.zod-free.spec.ts`): 4 suites passed, 129 tests passed (`0` failures).
- `cli-agent-runtime` Jest (`libs/backend/cli-agent-runtime/jest.config.ts` on `tool-call-summary.spec.ts`, `agent-output-buffer.service.spec.ts`, `agent-process-manager.restore.spec.ts`, `agent-process-manager.service.spec.ts`, `agent-events.spec.ts`, `sdk-callbacks.spec.ts`): 6 suites passed, 480 tests passed (`0` failures).
- `agent-sdk` Jest (`libs/backend/agent-sdk/jest.config.ts` on `session-metadata-store.spec.ts`, `session-metadata-store.global-store.spec.ts`, `session-store-migrator.spec.ts`): 3 suites passed, 199 tests passed (`0` failures).
- `scripts` Jest (`scripts/jest.config.ts` on all 7 specs in `scripts/agent-usage/`): 7 suites passed, 74 tests passed (`0` failures).
- `tsc --noEmit -p`: exited `0` with zero errors for all 6 library/spec configs (`libs/shared/tsconfig.lib.json`, `libs/shared/tsconfig.spec.json`, `libs/backend/cli-agent-runtime/tsconfig.lib.json`, `libs/backend/cli-agent-runtime/tsconfig.spec.json`, `libs/backend/agent-sdk/tsconfig.lib.json`, `libs/backend/agent-sdk/tsconfig.spec.json`). `scripts/agent-usage/tsconfig.json` reported zero errors in `tool-call-share.ts`, `agent-output-blob.reader.ts`, and specs, while pre-existing `probe-plan-usage.ts` and transitive workspace files under `tsconfig.base.json` still fail `tsc` without `--transpile-only`.
- `ptah_get_diagnostics` on the 11 edited TypeScript source files: zero diagnostics in any requested file.
- `npx.cmd eslint` on all 19 changed/new `.ts` files: 0 errors, 0 warnings on added lines (8 pre-existing warnings in untouched parts of `session-metadata-store.ts`/`.spec.ts`, `agent-process-manager.service.ts`, and `agent-events.ts`/`.spec.ts`).
- `node scripts/check-home-paths.mjs` on all changed and new files: passed (exit `0`).
- CLI smoke check (`npx.cmd ts-node --project scripts/agent-usage/tsconfig.json -r tsconfig-paths/register scripts/agent-usage/tool-call-share.ts --since 1970-01-01T00:00:00Z --until 1970-01-01T00:00:01Z`): resolved `@ptah-extension/shared` and exited `1` with `No tool-call data in the requested window.`.

## Decisions

- **WeakMap for transient `toolCallId` pairing**: `tool-call-summary.ts` stores the pending `toolCallId -> { server, toolName, ordinal }` map in a module-scoped `WeakMap<ToolCallSummary, Map<string, PendingToolCall>>` instead of a field on `ToolCallSummary`. Alternatives were a non-enumerable property on the summary or wrapping `ToolCallSummary` in an accumulator struct. Evidence: `PersistedAgentOutput` writes `toolCallSummary` straight to JSON and specs check exact `ToolCallSummary` equality; `WeakMap` keeps `ToolCallSummary` a plain JSON-serializable object with zero extra keys. Reversible within `tool-call-summary.ts`.
- **Up-front `unknownOutcomes` tracking + `ordinal` for `callsBeforeFirstPtahSuccess`**: `recordToolCall` increments `unknownOutcomes` on call and `recordToolResult` decrements it on match while updating `callsBeforeFirstPtahSuccess = Math.min(..., entry.ordinal)` on the first Ptah success. Alternative was computing both only in a separate `finalize()` step. Evidence: `AgentOutputBuffer` calls only `recordToolCall`/`recordToolResult` and `readOutputForPersistence` reads a snapshot at exit (or mid-continuation). Reversible inside `tool-call-summary.ts`.
- **Per-path transforms in `scripts/jest.config.ts` and `tsconfig-paths/register` for `usage:tool-call-share`**: `scripts/tsconfig.json` enforces `noUncheckedIndexedAccess: true` without `paths`, which rejects unrelated files in `libs/shared` (such as `capability-id-codec.ts`) if mapped there. Mapping `@ptah-extension/shared` in `scripts/jest.config.ts` and pointing `scripts/agent-usage/` transforms at `scripts/agent-usage/tsconfig.json` (plus `libs/shared/tsconfig.spec.json` for `libs/shared`) and `usage:tool-call-share` at `scripts/agent-usage/tsconfig.json -r tsconfig-paths/register` keeps `scripts/` isolation intact while resolving `@ptah-extension/shared`. Reversible in `scripts/jest.config.ts`, `scripts/agent-usage/tsconfig.json`, and `package.json`.

## Not done

- None. Note: `scripts/agent-usage/tool-call-classify.ts` and `.spec.ts` were deleted after moving to `libs/shared/src/lib/tool-guidance/`; `tool-substitutions.ts` and `tool-guidance.render.ts` were left untouched.

# PR #1528 review fixes

## PRRT_kwDOPngTds69CWHO

**Fixed.** Replay eviction could leave a presentation update and result after removing the start. The projector ignored the orphan update. The replay collector now promotes the first retained complete presentation for that tool and turn into a start, reusing its event slot and payload. See `libs/backend/acp-runtime/src/lib/acp-replay-collector.ts:320`.

Regression: `libs/backend/acp-runtime/src/lib/acp-replay-collector.spec.ts:68` projects a completed Edit and its final patch after text-budget eviction and after event-count eviction with a truncation notice.

## PRRT_kwDOPngTds69CWHP

**Fixed.** Merging explicit ACP content with remembered diffs retained removed paths. An empty replacement also skipped publishing a new presentation. The mapper now replaces content-derived diffs for a supplied array and retains them when content is omitted. Once explicit content clears the diffs, stale location metadata cannot recreate them. See `libs/backend/acp-runtime/src/lib/acp-session-update-mapper.ts:149`, `:286`, and `:311`.

Regression: `libs/backend/acp-runtime/src/lib/acp-session-update-mapper.spec.ts:861` checks a smaller replacement, an omitted update, and an empty replacement delivered with completion.

## PRRT_kwDOPngTds69CWHQ

**Fixed.** Electron's file callback broadcasts refresh paths, while the native Codex projection previously put the completion patch only on the result. The FileChange renderer reads the card's input. The native projection now validates the completed changes, reuses the original start event identity, and publishes the changed presentation before the result. See `libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-events.ts:443` and `libs/backend/rpc-handlers/src/lib/chat/codex-host/codex-chat-event-callbacks.ts:121`.

Regression: `libs/backend/rpc-handlers/src/lib/chat/codex-host/codex-chat-native-contract.spec.ts:814` sends different start and final patches through the native chat stack and checks same-ID replacement, result order, and webview refresh broadcasts for both final paths.

## PRRT_kwDOPngTds69CWHR

**Fixed.** Replay now omits an oversized update's entire presentation. The projector applies complete presentations atomically, including clearing the input when a complete presentation supplies none. See `libs/backend/acp-runtime/src/lib/acp-replay-collector.ts:130` and `libs/backend/provider-session-contracts/src/lib/flat-stream-projector.ts:190`.

Regression: `libs/backend/acp-runtime/src/lib/acp-replay-collector.spec.ts:41` verifies that an oversized FileChange update leaves the previous Edit name and input together.

## Checks

Pre-fix runs of the ACP and native Codex commands reproduced all intended regression failures. The final focused Jest runs passed all 160 tests.

```powershell
npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/chat/codex-host/codex-chat-native-contract.spec.ts libs/backend/rpc-handlers/src/lib/chat/codex-host/codex-chat-event-callbacks.spec.ts
npx jest --config libs/backend/acp-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/acp-runtime/src/lib/acp-replay-collector.spec.ts libs/backend/acp-runtime/src/lib/acp-session-update-mapper.spec.ts
npx jest --config libs/backend/provider-session-contracts/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/provider-session-contracts/src/lib/flat-stream-projector.spec.ts
npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-events.spec.ts libs/backend/agent-sdk/src/lib/codex-app-server/codex-history-projector.spec.ts
```

In command order, 31, 47, 15, and 67 tests passed. Node emitted a Jest config module-loading warning. Jest loaded each config and executed the requested suites.

```powershell
npx eslint libs/backend/acp-runtime/src/lib/acp-replay-collector.ts libs/backend/acp-runtime/src/lib/acp-replay-collector.spec.ts libs/backend/acp-runtime/src/lib/acp-session-update-mapper.ts libs/backend/acp-runtime/src/lib/acp-session-update-mapper.spec.ts libs/backend/provider-session-contracts/src/lib/flat-stream-projector.ts libs/backend/rpc-handlers/src/lib/chat/codex-host/codex-chat-native-contract.spec.ts libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-events.ts
```

ESLint exited 0. It skipped the Nx module-boundary rule because the worktree lacked a cached project graph.

```powershell
npx tsc --noEmit --project apps/ptah-electron/tsconfig.app.json
npx tsc --noEmit --project apps/ptah-extension-webview/tsconfig.app.json
npx tsc --noEmit --project libs/backend/cli-engine/tsconfig.lib.json
npx tsc --noEmit --project libs/backend/platform-cli/tsconfig.lib.json
```

All four type checks exited 0 with no diagnostics.

## Decisions

- Replay reconstruction uses retained snapshots and the existing truncation notice. The event and text budgets still bound the replay.
- The Codex change uses the existing bounded completion payload and presentation validation. The existing file callback still owns refresh delivery.
- Ptah symbol reads and dependency checks were used. The dependency index reported partial coverage, so targeted native searches traced the source and host callers. Skill discovery found no invocable code-review skill for this fix.



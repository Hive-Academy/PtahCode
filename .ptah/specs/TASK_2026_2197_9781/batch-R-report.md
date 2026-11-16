# Batch R report

## Files changed

- libs/backend/agent-sdk/src/lib/sdk-agent-adapter.ts: captures the SDK compact boundary sample in the existing stream tap and passes it to SessionBudgetService.recordCompaction once from the boundary callback.
- libs/backend/agent-sdk/src/lib/sdk-agent-adapter.spec.ts: tests known and unknown windows, missing post counts, the native Anthropic default, and one recording per boundary.

## Value sources

- postCompactionContextTokens: compact_metadata.post_tokens on the same SDK compact_boundary message, read in sdk-agent-adapter.ts:1317-1322. The SDK declares this field in node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:3888-3892; the existing UI transformer reads it in message-transform/system-message.transformer.ts:121-134. Missing, negative, or nonfinite values become null.
- effectiveAutoCompactWindowTokens: CompactionConfigProvider.getConfig() plus resolveAutoCompactControl(...).effectiveWindow in sdk-agent-adapter.ts:1319-1330. Classification uses capacityRoute?.kind === 'native' at sdk-agent-adapter.ts:1194,1687,2178, matching the idle service distinction at helpers/compaction/idle/idle-compaction.service.ts:400-403. Unknown windows become null.

## Decisions

- The original boundary callback receives only a session ID, so the adapter's existing raw-message tap captures the completion sample first; the boundary callback consumes and clears it. No cached turn-end reading is used.
- Kept recordCompaction in its original callback so the transformer still controls once-per-boundary recording and its effective session ID.
- Used the existing resolveAutoCompactControl directly because the idle files are outside the write set and the call does not warrant another helper.
- The adapter already had another writer's interruptCurrentTurn signature edit before this work. That hunk was left intact.

## Checks

- npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-sdk/src/lib/sdk-agent-adapter.spec.ts: passed, 161 tests. Jest emitted a nonfatal module warning.
- npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.lib.json: passed.
- npx eslint libs/backend/agent-sdk/src/lib/sdk-agent-adapter.ts libs/backend/agent-sdk/src/lib/sdk-agent-adapter.spec.ts: passed with 0 errors; two warnings in existing adapter code (no-useless-assignment at 486, file length at 1047). Nx module-boundary rule skipped because no cached ProjectGraph was available.
- git diff --check -- libs/backend/agent-sdk/src/lib/sdk-agent-adapter.ts libs/backend/agent-sdk/src/lib/sdk-agent-adapter.spec.ts: passed.

## Not done

- No Nx, build, serve, dev, e2e, package, or workspace-wide target was run. No files outside the permitted write set were modified by this lane.

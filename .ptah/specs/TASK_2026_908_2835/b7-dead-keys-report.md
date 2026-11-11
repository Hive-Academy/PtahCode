## Changes

- Added `resolvedModel` to the persisted `ModelInfo` schema, preserving the SDK declaration's optional field on restore.
- Compared parsed persistable catalog shapes during revalidation; a live-only SDK field no longer causes a false changed result, while changed known fields still replace and persist full live rows.
- Added a pure key rule for loopback URLs, preserving registered fixed endpoints and rejecting ephemeral proxy ports. Restore skips dead keys; the next good persist removes old dead entries before the eight-entry eviction. Memory caching remains active.
- Added specs for resolved model restore, unknown live fields, changed resolved model/display name, ephemeral memory caching, fixed Ollama URLs, dead-key cleanup, and non-loopback persistence.
- Corrected a Jest `it.each` argument-shape error found by the single verification run; this final correction has not had a Jest rerun.

## Decisions

- Decision: compare loopback URL protocol, port, and path with `getAllAnthropicProviders()` registry base URLs, treating `localhost`, `127.0.0.1`, and `[::1]` as equivalent loopback spellings. Options: hardcode provider names/ports or use the registry. Evidence: the shared public export provides the registry; local entries declare Ollama `127.0.0.1:11434` and LM Studio `localhost:1234/v1`. Reversible: yes.
- Decision: skip dead-key restore without writing and clean old dead entries only during a later good persist. Options: repair on read or defer cleanup. Evidence: the task requires one store write and no extra read-path write. Reversible: yes.

## Verification

- Formatted both assigned files with `npx prettier --write libs/backend/agent-sdk/src/lib/helpers/sdk-model-service.ts libs/backend/agent-sdk/src/lib/helpers/sdk-model-service.spec.ts`, including after the final spec correction.
- Scoped `ptah_get_diagnostics` after edits returned unavailable twice: TypeScript checking exceeded the tool's 45-second limit.
- Exact single foreground run: `npm run verify -- -p @ptah-extension/agent-sdk`, from the worktree root, output filtered to its last 60 lines. Exit code 1.
- Target counts: lint/typecheck 2 succeeded, 0 failed; test 0 succeeded, 1 failed. Jest: 225 suites passed, 2 failed, 2 skipped; 5686 tests passed, 1 failed, 5 skipped. The first failed suite was this file's `it.each` TypeScript error, corrected afterward. The second was `subagent-budget-monitor.spec.ts` line 3087, where a timer-count assertion received 2 instead of 0; that file is outside this write set.
- Last result lines: `NX 1 task: 0 succeeded, 1 failed`; `nx run @ptah-extension/agent-sdk:test`; `[verify 2026-11-09T23:31:50.251Z] lock released after 419.6s, exit code 1`.

## Extra reads

- `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts` `ModelInfo` declaration.
- `libs/shared/src/index.ts`, providers index, provider registry accessor, provider base URL helper, and fixed local provider entries. The Ptah symbol search returned zero hits, so native free-text search was used.
- Verifier-named Jest terminal output under `C:\Users\dev\.nx\d60e02896ae18ad9\cache\terminalOutputs\2132221905034870188` to identify the failure.

## Open items

- The corrected spec requires a Jest rerun by the coordinator; this lane's exact one-run verification limit is exhausted.
- The unrelated `subagent-budget-monitor.spec.ts` timer assertion needs its owner to investigate.

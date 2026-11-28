# Prompt-trim follow-up review fixes

Paths below are relative to `libs/backend/agent-sdk/src/lib/helpers`.

- `sdk-query-options-builder.ts:2536` skips memory recall and workspace symbol search when the initial query starts with `/` after leading whitespace.
- `sdk-query-options-builder.spec.ts:1734` sends a synthetic turn and a subagent turn ahead of the first top-level user turn in both prompt modes. The test checks that only the top-level turn receives context and that its attachment and the follow-up survive. At `:1778`, the spec checks that `/compact` and its whitespace-prefixed variant skip both searches and pass through on the original stream.
- `session-lifecycle/session-query-executor.accounts.spec.ts:1092` checks that the named launch receives the builder's wrapper by identity. The test intercepts the final launch after admission to isolate the executor handoff.
- `session-lifecycle/session-query-executor.input-channel-failure.spec.ts:280` and `:299` check that resume `streamInput` and the fresh query invocation respectively receive the builder's wrapper by identity.

## Verification

```text
npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.spec.ts libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-query-executor.accounts.spec.ts libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-query-executor.input-channel-failure.spec.ts
```

Exit 0. Three suites passed, 267 tests passed, zero snapshots. Jest reported 15.373 s. Node warned that `jest.config.ts` failed to load as an ES module, and Jest completed the run.

```text
npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.lib.json
```

Exit 0 with no output.

```text
npx eslint libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.spec.ts libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-query-executor.accounts.spec.ts libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-query-executor.input-channel-failure.spec.ts libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.ts
```

Exit 0 with zero errors and one `max-lines` warning at `sdk-query-options-builder.ts:1179:1` (1,898 counted lines, limit 700).

The CLI exposed no native skill discovery mechanism for this task. I used Ptah source reads and searches, native edits, and the requested focused verification commands.

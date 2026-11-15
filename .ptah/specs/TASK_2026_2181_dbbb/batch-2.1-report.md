## Changes

- `agent-spawn-dedupe.ts:1`: bounded, 120 s after settlement SHA-256 keyed in-memory replay map; explicit key, force bypass, failure eviction, and async timing context.
- `agent-spawn-args.schema.ts:111`: validate optional `idempotencyKey` (1–128 characters).
- `protocol-dispatcher.ts:744,1162-1372`: insert a single-flight reservation before the first awaited gate lookup, use transport session or workspace scope, replay the original agent ID, reuse settled gate value for both success and formatted errors, and log spawn timing in a `finally` block. Removed task text from the invoked log.
- `agent-spawn-limit-gate.ts:36,111-169`: cut wait budget to 1,000 ms and expose nonawaiting `peekLimits()`.
- `agent-namespace.builder.ts:14,366,612`: measure namespace role/skill resolution and supply its duration to the single dispatcher timing line.

## Tests added

- `agent-spawn-dedupe.spec.ts:1`: concurrent and settled replay, TTL expiry, explicit keys, force, and failure eviction.
- `protocol-dispatcher.spec.ts:4386`: concurrent replay, no post-spawn limit lookup for auto-detect, and timing lines on success and failure.
- Existing `agent-spawn-limit-gate.spec.ts:294` assertion changed from 4,000 ms to 1,000 ms because the requested policy budget changed. No assertion was deleted.

## Check results

- `npx tsc --noEmit --project libs/backend/vscode-lm-tools/tsconfig.lib.json`: passed; `.ptah/tmp/b21-tsc-lib.log` ends empty.
- `npx tsc --noEmit --project libs/backend/vscode-lm-tools/tsconfig.spec.json`: passed; `.ptah/tmp/b21-tsc-spec.log` ends empty.
- `npx eslint <seven changed files>`: exit 0; `.ptah/tmp/b21-eslint.log` ends `78 problems (0 errors, 78 warnings)` (dispatcher pre-existing warnings dominate).
- Requested Jest command: two suites passed, dispatcher suite failed to load before tests because Jest could not resolve `marked` from `tool-output-reducers`. `.ptah/tmp/b21-jest.log` ends `Test Suites: 1 failed, 2 passed, 3 total` and `Tests: 29 passed, 29 total`.
- `ptah_get_diagnostics` was unavailable after its 45-second timeout; native TypeScript checks passed.

## Extra reads

- Beyond specified ranges: dispatcher imports and dependency interface for safe insertion and workspace root; dispatcher spec lines 3970–4130 for existing spawn test setup; gate full interface and existing budget assertion; namespace builder imports and closing lines for timing placement; no other source files.

## Decisions

- Use transport-derived `_callerSessionId` when present and the first known workspace root otherwise; fall back to process cwd when no workspace is registered. Body identity is ignored. Reversible.
- Keep the map per `PtahAPI` instance so independent API instances cannot replay one another's result. In a host the API instance is long-lived. Reversible.
- Explicit keys take precedence even with `force`; `force` bypasses only derived keys. Reversible.

## Open issues



- Dispatcher integration specs remain unverified due to the missing `marked` package in the local Jest resolver.
- A concurrent writer expanded the replay response at `protocol-dispatcher.ts:1269-1272` after my edit; I did not alter those added lines. The response is longer than the requested one short replay line.





# Backend review fixes, round 2

## Item 1: two-key recovery

- Changed `libs/backend/rpc-handlers/src/lib/handlers/agent-config/cli-lane-defaults-config.ts` to snapshot both raw settings, restore both after either write rejects, and read back both. Unverified recovery throws an aggregate error.
- Changed `libs/backend/rpc-handlers/src/lib/handlers/agent-rpc.handlers.ts` to log the aggregate error and return a specific safe RPC error.
- Added set/reset mutation-before-rejection coverage for both keys and a failed-recovery case in `agent-rpc.handlers.set-config.spec.ts`.

## Item 2: OpenCode inherited config

- Changed `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/opencode-cli.adapter.ts` to parse inherited inline config through one helper, merge Ptah into inherited MCP entries, and add `permission: allow` only for yolo. Invalid inherited JSON or MCP objects are logged and refuse spawn.
- Added inherited config preservation in a plan run and malformed inherited config rejection in `opencode-cli.adapter.spec.ts`.

## Item 3: final policy resolution

- Changed `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-lane-policy-resolver.ts` to apply request fields before validating the final pair. Parent plan and resume branches retain their behavior.
- Added an explicit override of a stale saved pair and a contributing stale-field rejection in `cli-lane-policy-resolver.spec.ts`.

## Verification

- `npm run verify -- -t test -p @ptah-extension/rpc-handlers -- --testPathPatterns=agent-rpc.handlers.set-config.spec.ts`: passed, including the final recovery-failure test (1 task succeeded).
- `npm run verify -- -t test -p @ptah-extension/cli-agent-runtime -- --testPathPatterns="opencode-cli.adapter.spec.ts|cli-lane-policy-resolver.spec.ts"`: passed (1 task succeeded).
- `npm run verify -- -t lint,typecheck -p @ptah-extension/cli-agent-runtime,@ptah-extension/rpc-handlers`: passed (4 tasks succeeded).
- `ptah_get_diagnostics` initially found an OpenCode TypeScript narrowing error, which was fixed. Subsequent diagnostics timed out under concurrent workspace load; the scoped typecheck command passed.

## Decisions

- Recovery failure is based on both write results and exact raw read-back of both keys. This preserves absence and distinguishes a failed write with successful restoration from an unverified state. Reversible.

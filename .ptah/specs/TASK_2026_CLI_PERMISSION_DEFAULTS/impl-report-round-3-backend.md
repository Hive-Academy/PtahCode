# Backend review fixes, round 3

## Change

- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/opencode-cli.adapter.ts`: malformed inherited `OPENCODE_CONFIG_CONTENT` now produces a fixed-message Logger error, never the raw parser error or config value. The adapter validates present inherited config before every spawn. It constructs an inline override only for MCP or yolo; valid no-MCP plan runs inherit the original environment unchanged.

## Tests

- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/opencode-cli.adapter.spec.ts`: added a sentinel-secret assertion over serialized Logger arguments, a malformed no-MCP plan refusal, and a valid no-MCP plan inheritance check.

## Commands and results

- `ptah_get_diagnostics` scoped to the adapter and spec: clean, zero errors.
- `npm run verify -- -t test -p @ptah-extension/cli-agent-runtime -- --testPathPatterns=opencode-cli.adapter.spec.ts`: passed, 1 task succeeded.
- `npm run verify -- -t lint,typecheck -p @ptah-extension/cli-agent-runtime`: passed, 2 tasks succeeded.

## Decisions

- Validation runs for every spawn, including paths that do not need an override. The fixed diagnostic excludes parser details because those may quote inherited secrets. This is reversible.

## Round 3b

### Change

- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-lane-policy-resolver.ts`: an unsupported final pair now reaches `validateLaneSpawnPolicy`, yielding a typed `UNSUPPORTED_LANE_POLICY` refusal with the correct field. The resolver prefixes its reason with the source of the rejected field: spawn request, saved default, or parent plan cap. Combination refusals identify both field sources. Explicit supported requests still override stale saved fields; resume and parent caps retain their behavior.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-lane-policy-resolver.spec.ts`: added typed refusal and source assertions for explicit network denial, a contributing saved permission, a saved pair combination, and the parent plan cap. The existing built-in selection and resume tests remain passing. Built-in selection cannot yield an unsupported selected field: the shared pair helper omits unsupported built-in candidates.

### Commands and results

- `ptah_get_diagnostics` scoped to resolver and spec: timed out with both files unchecked under concurrent load; subsequent project typecheck passed.
- `npm run verify -- -t test -p @ptah-extension/cli-agent-runtime -- --testPathPatterns="ptah-cli-registry|cli-lane-policy-resolver"`: passed, 1 task succeeded, 0 failed.
- `npm run verify -- -t test -p @ptah-extension/cli-agent-runtime`: passed, 1 task succeeded, 0 failed.
- `npm run verify -- -t lint,typecheck -p @ptah-extension/cli-agent-runtime`: passed, 2 tasks succeeded, 0 failed.

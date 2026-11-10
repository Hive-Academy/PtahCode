## Changed files
- `libs/shared/src/lib/providers/entries/anthropic-api-lane-entry.ts`, provider registry/index, and focused provider spec: lane-only direct Claude definition and reserved ID.
- `libs/shared/src/lib/types/ptah-cli.types.ts` and `libs/shared/src/lib/types/rpc/rpc-agents.types.ts`: typed credential source and optional create key.
- `libs/backend/cli-agent-runtime/src/lib/ptah-cli/ptah-cli-registry.ts`, credential-source helper, focused helper spec and focused registry spec: explicit lane resolution, shared secret lookup, per-instance override and spawn environment.
- `libs/backend/rpc-handlers/src/lib/handlers/ptah-cli-rpc.handlers.ts`: parse and forward create/update source; resolve lane models. Concurrent auth RPC edits belong to lane A.

## Contract for the frontend
- Lane provider ID `anthropic-api`, display name `Claude API`.
- Create payload `{ name: string; providerId: 'anthropic-api'; apiKey?: string; credentialSource?: 'instance' | 'shared-connection' }`. For the shared key, send `credentialSource: 'shared-connection'` without `apiKey`. For an override, send `credentialSource: 'instance'` and `apiKey`; absent source means instance. Update accepts the same credential source and optional key.
- List and create summaries expose `hasApiKey`, `hasStoredKey`, and `status`; for shared source these reflect the direct Anthropic secret slot at read time. `PtahCliSummary.credentialSource` reports `instance` or `shared-connection` in list/create results (legacy configs report `instance`).
- Model tiers and static catalog are reused from `CLAUDE_CLI_PROVIDER_ENTRY` (`claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`).

## ANTHROPIC_PROVIDERS audit
The `anthropic-api` entry is deliberately outside `ANTHROPIC_PROVIDERS` and `getAllAnthropicProviders`. `anthropic` stays virtual. Main-agent selectors, auth status/schema, routing, and connection rows use those existing main-provider lists, so the lane-only ID is not offered there. `isBuiltInProviderId` reserves `anthropic-api` against custom entries. CLI create/list/spawn/profile/test and CLI listModels resolve the lane explicitly. Existing main-provider lookup remains unchanged. `PtahCliRegistry.getAvailableProviders()` still returns the main-provider list; no call sites use it as the CLI picker. The frontend picker uses connection rows, where its lane change must supply `anthropic-api` explicitly.

## Env isolation findings
The shared key is fetched via injected `IAuthSecretsService.getCredential('apiKey')` at spawn/profile/test time; no additional dependency or DI binding is required. The direct lane builds a fresh `AuthEnv` with `ANTHROPIC_BASE_URL=https://api.anthropic.com` and `ANTHROPIC_API_KEY`, never `ANTHROPIC_AUTH_TOKEN`. `buildSafeEnv` copies platform variables and the supplied AuthEnv, not ambient `process.env.ANTHROPIC_API_KEY`; the `claude-cli` native-auth branch returns empty AuthEnv. `process.env` is not mutated by these edits. The focused registry spec captures successful spawn query options after key rotation and asserts the supplied environment, model tier, ambient `process.env`, and logger arguments. It also checks that a subscription profile has no API-key/base-URL auth env. The test does not launch an external Claude process.

## Verification
`npm run verify -- -p shared,cli-agent-runtime,rpc-handlers`: lint/typecheck 6/6 tasks passed; test 0/3 tasks passed. Shared Jest: 148 suites and 4,213 tests passed, 1 suite failed to compile because `anthropic-api-lane-entry.spec.ts:25` passed an optional tier ID to `Set.has`; fixed afterward. CLI runtime Jest: 92 suites and 1,308 tests passed, 86 suites failed due missing `node_modules/marked/lib/marked.umd.js` mapping. RPC handlers Jest: 194 suites and 5,527 tests passed, 46 suites failed due the same `marked` mapping and lane A's `process.env.ANTHROPIC_API_KEY` TS4111 in its auth spec. The `node_modules` junction was added after that run.

`npm run verify -- -t test -p cli-agent-runtime -- --testPathPatterns=ptah-cli-registry-anthropic-api`: 1/1 Nx task passed after final focused test edits (0 failed). `git diff --check` passed for lane B paths. Scoped `ptah_get_diagnostics` on registry, focused registry spec and shared provider spec reported 0 errors and 0 warnings. The full verify was not repeated.

## Decisions
The shared secret slot is the existing `apiKey` credential on the already injected `IAuthSecretsService`. Shared-source create never writes an instance secret. The direct lane is isolated from main-agent provider registration.

## Open points
The full test targets remain red from the earlier run; shared spec type error has been fixed, and the `marked` junction is now present. Lane A owns the auth RPC spec TS4111. Frontend lane owns sending the new source field. A repeated full test run would be needed to report all three project targets green.





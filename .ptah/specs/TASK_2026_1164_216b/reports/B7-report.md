# B7 report

## Files changed

Added `libs/backend/auth-providers-tokens/src/lib/usage-profile-roots.port.ts`, `libs/backend/auth-providers/src/lib/accounts/usage-profile-roots.adapter.ts`, and `libs/backend/auth-providers/src/lib/accounts/usage-profile-roots.adapter.spec.ts`. Updated auth-providers-tokens `tokens.ts` and `index.ts`, auth-providers `di/register.ts` and `index.ts`. Existing `di/tokens.ts` re-exports the token object, so no edit was required there.

## New exported names

`ClaudeUsageProfileRoots`, `UsageProfileRootsAdapter`, `AUTH_PROVIDERS_TOKENS.SDK_CLAUDE_USAGE_PROFILE_ROOTS`.

## Verification (command + result)

`npm run verify -- -t lint,typecheck -p @ptah-extension/auth-providers-tokens,@ptah-extension/auth-providers | Select-Object -Last 40`: PASS, 3/3 Nx tasks succeeded, exit code 0.

`npm run verify -- -t test -p @ptah-extension/auth-providers -- --testPathPatterns=usage-profile-roots`: PASS, 1/1 Nx task succeeded, exit code 0.

Scoped `ptah_get_diagnostics` was unavailable because its TypeScript compiler check continued past the 45-second tool limit; the required project typecheck passed.

## Tests added

`usage-profile-roots.adapter.spec.ts`: canonical roots and minimal fields, removal reflected in listing, port has no agent-sdk import.

## Out-of-set edits

None.

## Extra reads

Read `provider-account.store.ts` lines 1-55 and 56-116 to confirm the stored-account shape and `list()` signature in addition to the batch's targeted lines 188-190 and 328-346. No user data files were read.

## Decisions

The store's existing `list()` query excludes removed profiles and returns its persisted canonical route. The adapter projects only ID and route. The DI factory returns an empty list when the host has no account storage. This follows the existing optional account-service registration pattern and is reversible.

## Open problems

None.

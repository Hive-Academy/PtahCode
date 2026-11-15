# Batch c3a report

## Design

The existing Claude SDK reader remains first. When it reports no open session for a native route, PlanUsageService calls a read-only OAuth usage reader through the existing PlanUsageReader port. The reader reads the Claude OAuth access token and expiry from the default home directory, checks the local OAuth account identity, then makes one GET request with the beta and Accept headers, redirect rejection, and a 5 second abort timeout. It never refreshes or writes credentials. HTTP 401/403 returns unavailable without retry. Named routes and non-account owners do not use this source.

The OAuth payload is validated with Zod. Each malformed window is dropped independently. The reader feeds valid windows into the existing Claude mapping so five-hour, weekly, and model keys and provider-api percentage/reset semantics are identical to the live source. No exhaustion flag is invented from a percentage. The source label is provider-api. Empty or invalid payloads return an unavailable reading with a typed reason.

## Changed files

- libs/backend/auth-providers/src/lib/quota/readers/claude-oauth-plan-usage.reader.ts:13 - credential and payload schemas; :52 - read-only source, owner guard, request and mapping.
- libs/backend/auth-providers/src/lib/quota/plan-usage.service.ts:179 - live-first fallback registration.
- libs/backend/auth-providers/src/lib/quota/readers/claude-oauth-plan-usage.reader.spec.ts:29 - fixture tests for full, malformed, missing, expired, mismatched, 401, invalid JSON, and timeout cases.

## Owner proof

The live reader uses accountInfo email plus organization to produce the account owner key. The endpoint has no identity field. The OAuth reader reconstructs that exact key from the local Claude oauthAccount emailAddress and organizationName and compares it to the requested account owner before calling HTTP. Missing or mismatched metadata yields account-unverified and no windows. This ties the reading to Claude's default local OAuth account metadata; it does not cryptographically bind the access token to that metadata. A future provider identity endpoint would strengthen this proof.

## Checks

- npx tsc --noEmit --project libs/backend/auth-providers/tsconfig.lib.json - passed (before final source label edit, which was covered by spec typecheck).
- npx tsc --noEmit --project libs/backend/auth-providers/tsconfig.spec.json - passed.
- npx jest --config libs/backend/auth-providers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/auth-providers/src/lib/quota/readers/claude-oauth-plan-usage.reader.spec.ts libs/backend/auth-providers/src/lib/quota/readers/claude-plan-usage.reader.spec.ts - 12 tests passed.
- npx jest --config libs/backend/auth-providers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/auth-providers/src/lib/quota/readers/claude-oauth-plan-usage.reader.spec.ts - 6 tests passed after the absent-file fixture was added.
- npx eslint libs/backend/auth-providers/src/lib/quota/readers/claude-oauth-plan-usage.reader.ts libs/backend/auth-providers/src/lib/quota/readers/claude-oauth-plan-usage.reader.spec.ts libs/backend/auth-providers/src/lib/quota/plan-usage.service.ts - 0 errors, 1 pre-existing warning in plan-usage.service.ts; Nx graph rule skipped because no cached graph.

## Open points

No endpoint or real credential file was used. The local Claude account metadata is the available owner proof; a token/account identity assertion from Anthropic would remove the remaining mismatch risk. No new DI service was registered, so composition guards did not change.

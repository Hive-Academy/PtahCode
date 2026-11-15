# Claude OAuth plan usage fixes

Changed files: `libs/backend/auth-providers/src/lib/quota/plan-usage.service.ts`, `libs/backend/auth-providers/src/lib/quota/plan-usage.service.spec.ts`, `libs/backend/auth-providers/src/lib/quota/readers/claude-oauth-plan-usage.reader.ts`, `libs/backend/auth-providers/src/lib/quota/readers/claude-oauth-plan-usage.reader.spec.ts`.

1. The OAuth fallback checks the flight abort signal before recording failures in both the result and catch paths. Cancelled reads do not start cooldowns; a fresh request retries OAuth.
2. A present non-array `limits` field and incomplete `weekly_scoped` entries leave `windowSetEstablished` false while preserving valid windows.
3. Credential and usage response account/organization UUID fields are compared with local account metadata when present. A mismatch returns `account-unverified` with no windows and `sourceInvalid`, preventing owner caching and cooldown. The data has no guaranteed token-to-account identity field, so absent UUIDs cannot establish a stronger binding. No extra endpoint was called.

Checks (final source):

- PASS: `npx jest --config libs/backend/auth-providers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/auth-providers/src/lib/quota/plan-usage.service.spec.ts libs/backend/auth-providers/src/lib/quota/readers/claude-oauth-plan-usage.reader.spec.ts` (77 tests).
- PASS: `npx tsc --noEmit --project libs/backend/auth-providers/tsconfig.lib.json`
- PASS: `npx tsc --noEmit --project libs/backend/auth-providers/tsconfig.spec.json`
- PASS: `npx tsc --noEmit --project libs/backend/vscode-lm-tools/tsconfig.lib.json`
- PASS: `npx eslint libs/backend/auth-providers/src/lib/quota/plan-usage.service.ts libs/backend/auth-providers/src/lib/quota/plan-usage.service.spec.ts libs/backend/auth-providers/src/lib/quota/readers/claude-oauth-plan-usage.reader.ts libs/backend/auth-providers/src/lib/quota/readers/claude-oauth-plan-usage.reader.spec.ts` (0 errors; 1 pre-existing unused `_error` warning).

Skill discovery was available, but returned no locally installed matching backend skill.

Coordinator follow-up: a `sourceInvalid` OAuth result now also starts the owner cooldown, so an identity mismatch does not call the usage endpoint on each snapshot. The service spec was updated. Re-run: jest 77/77 PASS, tsc lib PASS, tsc vscode-lm-tools PASS, eslint 0 errors.

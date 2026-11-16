## Part A files

libs/backend/auth-providers/src/lib/accounts/claude-account-status.ts
libs/backend/auth-providers/src/lib/accounts/claude-route-certifier.ts
libs/backend/auth-providers/src/lib/accounts/provider-account-actions.service.ts
libs/backend/auth-providers/src/lib/accounts/claude-account-status.spec.ts
libs/backend/auth-providers/src/lib/accounts/claude-route-certifier.spec.ts
libs/backend/auth-providers/src/lib/accounts/provider-account-actions.service.spec.ts
libs/backend/auth-providers/src/lib/accounts/claude-ambient-login-status.spec.ts

## Part B files

libs/backend/auth-providers/src/lib/accounts/claude-account-email.ts
libs/backend/auth-providers/src/lib/accounts/claude-account-email.spec.ts
libs/backend/auth-providers/src/lib/accounts/claude-account-command.ts
libs/backend/auth-providers/src/lib/accounts/provider-account-actions.service.ts
libs/backend/auth-providers/src/lib/accounts/provider-account-actions.service.spec.ts
libs/backend/rpc-handlers/src/lib/handlers/provider-account-rpc.handlers.ts
libs/backend/rpc-handlers/src/lib/handlers/provider-account-rpc.handlers.spec.ts
libs/backend/rpc-handlers/src/lib/handlers/provider-account-rpc.schema.ts
libs/shared/src/lib/types/rpc/rpc-provider-accounts.types.ts
libs/shared/src/lib/types/rpc/rpc-provider-accounts.spec.ts
libs/shared/src/lib/types/rpc.types.ts
libs/frontend/core/src/lib/services/provider-accounts-state.service.ts
libs/frontend/chat/src/lib/settings/providers/accounts/account-email-reveal.component.ts
libs/frontend/chat/src/lib/settings/providers/accounts/account-email-reveal.component.spec.ts
libs/frontend/chat/src/lib/settings/providers/accounts/account-detail-view.component.ts
libs/frontend/chat/src/lib/settings/providers/accounts/account-detail-view.component.spec.ts

## Decisions

- Use one bounded second status probe when the first status has an email and no organization. Options: delay, re-probe, or persist the incomplete reference. The existing gated status command and coverage checks support a re-probe; this is reversible.
- Carry an opaque email-only reference and an organization-presence flag in parsed status. Options: raw email, opaque hash, or no migration path. The status type forbids raw values, and the hash permits certification of a previously stored empty-organization reference; this is reversible.
- Use the current status reference in the certified launch. The SDK runner and session query executor compare the child's email/organization hash with `launch.identityReference`; the full reference is required when the organization appears. The resulting owner key is also the full reference.
- Part B: Read the email only in an explicit, route-guarded `claude auth status --json` probe under `reserveStatus` and the active operation gate. Options were storing the email, reading an ungated child, or reusing the account command and lease. The latter preserves the privacy rule and existing route, timeout, child-close, and coverage checks. `ClaudeAccountStatus` still contains no raw email.
- Part B: Require a signed-in Claude profile, matching config directory, and matching full or email-only opaque identity before returning the email. The email-only case supports Part A's legacy early sign-ins; a different identity or route returns a typed refusal.
- Part B: Add the RPC method to the shared provider-account tuple and registry, strict Zod params schema, and handler. The Electron RPC surface consumes that tuple, so its manifest and guard specs derive the new method without a separate registration edit. The handler returns fixed result codes and never raw error text.
- Part B: Keep the revealed value in the Angular component signal. The account detail sign-in section shows a mask by default, and a profile change or hide clears it. A request token discards a late response after a profile change. This uses the existing `ClaudeRpcService` bridge.

## Checks run

- `npx jest --config libs/backend/auth-providers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/auth-providers/src/lib/accounts/claude-account-status.spec.ts libs/backend/auth-providers/src/lib/accounts/claude-route-certifier.spec.ts libs/backend/auth-providers/src/lib/accounts/provider-account-actions.service.spec.ts` — failed before tests ran: mapped `node_modules/marked/lib/marked.umd.js` is missing in this worktree.
- `npx tsc --noEmit --project libs/backend/auth-providers/tsconfig.lib.json` — passed after fixing nullable launch reference.
- `npx tsc --noEmit --project libs/backend/auth-providers/tsconfig.spec.json` — passed after updating the ambient status fixture.
- `npx eslint libs/backend/auth-providers/src/lib/accounts/claude-account-status.ts libs/backend/auth-providers/src/lib/accounts/claude-route-certifier.ts libs/backend/auth-providers/src/lib/accounts/provider-account-actions.service.ts libs/backend/auth-providers/src/lib/accounts/claude-account-status.spec.ts libs/backend/auth-providers/src/lib/accounts/claude-route-certifier.spec.ts libs/backend/auth-providers/src/lib/accounts/provider-account-actions.service.spec.ts libs/backend/auth-providers/src/lib/accounts/claude-ambient-login-status.spec.ts` — passed; module boundary rule skipped because no cached ProjectGraph was available.
- `ptah_get_diagnostics` scoped to the three changed source files — unavailable after a 45 second timeout; direct TypeScript checks above completed.

- `npx jest --config libs/backend/auth-providers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/auth-providers/src/lib/accounts/claude-account-email.spec.ts libs/backend/auth-providers/src/lib/accounts/provider-account-actions.service.spec.ts` - failed before tests for the same missing `marked.umd.js` mapping.
- `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/handlers/provider-account-rpc.handlers.spec.ts` - passed, 86 tests.
- `npx jest --config libs/shared/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/shared/src/lib/types/rpc/rpc-provider-accounts.spec.ts` - passed, 14 tests.
- `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat/src/lib/settings/providers/accounts/account-email-reveal.component.spec.ts libs/frontend/chat/src/lib/settings/providers/accounts/account-detail-view.component.spec.ts` - passed, 41 tests.
- `npx jest --config libs/frontend/core/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/core/src/lib/services/provider-accounts-state.service.spec.ts` - passed, 38 tests.
- `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json` - passed.
- `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.spec.json` - passed.
- `npx tsc --noEmit --project libs/shared/tsconfig.lib.json` - passed.
- `npx tsc --noEmit --project libs/shared/tsconfig.spec.json` - passed.
- `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json` - passed.
- `npx tsc --noEmit --project libs/frontend/core/tsconfig.lib.json` - passed.
- `npx tsc --noEmit --project libs/frontend/chat/tsconfig.spec.json` - failed on pre-existing errors in `libs/frontend/core/src/testing/mock-rpc-service.ts` and BigInt target errors in shared worker protocol files; no changed file was reported.
- `npx tsc --noEmit --project libs/frontend/core/tsconfig.spec.json` - failed on the same pre-existing errors.
- `npx eslint libs/backend/auth-providers/src/lib/accounts/claude-account-email.ts libs/backend/auth-providers/src/lib/accounts/claude-account-email.spec.ts libs/backend/auth-providers/src/lib/accounts/claude-account-command.ts libs/backend/auth-providers/src/lib/accounts/provider-account-actions.service.ts libs/backend/auth-providers/src/lib/accounts/provider-account-actions.service.spec.ts libs/backend/rpc-handlers/src/lib/handlers/provider-account-rpc.handlers.ts libs/backend/rpc-handlers/src/lib/handlers/provider-account-rpc.handlers.spec.ts libs/backend/rpc-handlers/src/lib/handlers/provider-account-rpc.schema.ts libs/shared/src/lib/types/rpc/rpc-provider-accounts.types.ts libs/shared/src/lib/types/rpc/rpc-provider-accounts.spec.ts libs/shared/src/lib/types/rpc.types.ts libs/frontend/core/src/lib/services/provider-accounts-state.service.ts libs/frontend/chat/src/lib/settings/providers/accounts/account-email-reveal.component.ts libs/frontend/chat/src/lib/settings/providers/accounts/account-email-reveal.component.spec.ts libs/frontend/chat/src/lib/settings/providers/accounts/account-detail-view.component.ts libs/frontend/chat/src/lib/settings/providers/accounts/account-detail-view.component.spec.ts` - passed with no errors; pre-existing warnings in `rpc.types.ts`, and Nx boundary rule skipped for no cached ProjectGraph.

## Not done / risks

- The auth provider Jest suites could not execute because the worktree's `marked` mapper references a missing artifact. The new auth tests compile, but the coordinator must execute them in a working test environment.
- Frontend chat and core spec TypeScript project checks remain red from unrelated existing errors. Focused Jest suites passed.
- The Angular UI was not visually inspected in a running renderer because the task prohibits build, serve, dev, and e2e commands. Component tests verified the rendered mask, button state, hide behavior, and fixed error message.
- The host listed no skill-loading tool, so the named Angular skill could not be loaded.


# Lane brief: fix round 1 for B7b and B8-B10 (kind: implement)

Working directory: the task worktree for branch `feat/setup-stack-skills`. Do not use any other
checkout. Do not commit, push, or stage. Leave files unstaged.

## Objective

Fix four defects that the coordinator found. Make the smallest change that fixes each.

### Fix 1 (frontend): failing test on Back during a pending launch

`npm run verify -- -t test -p @ptah-extension/onboarding` gives 1 failure of 604 tests:

`TeamBuilderStartPage > cancels a pending launch on Back and shows no error`
(`libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts:170`):
`expect(page.starting()).toBe(false)` receives `true`.

This test exists on `main`, so the B8-B10 change broke it. Cause to confirm: in `launchChat()` of
`team-builder-start.page.ts` the `HarnessChatLaunchCancelledError` branch returns without a stage
reset, and `back()` leaves stage at `launching`. After Back, the page must not be `starting`, must
show no error, and must keep the attachment (the spec expects `attachments.files()` length 1 and
a navigation to `['/onboarding']`). Fix the page logic, not the spec. Do not weaken the spec. Read
`back()` and `launchChat()` fully before you change them. Keep the stale-request guards.

### Fix 2 (backend): log every failure in the install loop

File `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts`,
method `registerInstallSkillsWithConsent`. The `catch (error)` of the per-skill loop turns an
error into a `failure` result without a log (only the hash-mismatch path logs). Add one
`this.logger.error(message, error)` call there. `error` is `unknown`: pass a real `Error`
(`error instanceof Error ? error : new Error(String(error))`). Do not log secrets or full file
content. Do not change the result shape. Add or adjust one spec in
`libs/backend/rpc-handlers/src/lib/handlers/setup-rpc-skill-install.spec.ts` that proves that the
logger got an `Error` when a later skill throws.

### Fix 3 (backend): registration spec lists 5 methods too few

`libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.spec.ts`, test
`registers all setup RPC methods` (about line 346), fails. The handler now also registers:
`wizard:get-project-guidance`, `wizard:install-skills-with-consent`,
`wizard:preview-skills-for-consent`, `wizard:recommend-skills`, `wizard:search-skills`.
Add them to the expected list. The spec is part of this task diff, so this is our fix.

### Fix 4 (backend): `registerSharedRpcHandlers` resolves Logger at registration time

`libs/backend/rpc-handlers/src/lib/register-shared-rpc-handlers.ts:91` calls
`registerSkillServices(container, container.resolve<Logger>(TOKENS.LOGGER))`.
Three tests of `libs/backend/rpc-handlers/src/lib/register-shared-rpc-handlers.spec.ts` fail with
"Attempted to resolve unregistered dependency token: Symbol(Logger)". They passed on `main`.
Do not weaken them. Remove the eager Logger resolve: change `registerSkillServices`
(`libs/backend/rpc-handlers/src/lib/di/register.ts`) so that it takes no Logger argument (the four
services get their Logger by constructor injection when they resolve), drop its two info logs,
and update the call in `register-shared-rpc-handlers.ts` (remove the `Logger` and `TOKENS` imports
only if nothing else uses them). Update the string assertion in
`apps/ptah-electron/src/di/surface-composition.spec.ts:89`, which expects the old call text. Keep
the change minimal. Then run the DI guards that you can with the scoped command and name those you
could not run: `apps/ptah-electron/src/di/container.smoke.spec.ts`,
`apps/ptah-electron/src/di/rpc-surface.spec.ts`, `apps/ptah-electron/src/di/surface-composition.spec.ts`,
`libs/backend/cli-engine/src/lib/rpc/rpc-surface.spec.ts`. The Electron project is
`ptah-electron`; the CLI project is `@ptah-extension/cli-engine` (check names in `project.json`).

## Write set (nothing else)

- `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.spec.ts`
- `libs/backend/rpc-handlers/src/lib/register-shared-rpc-handlers.ts`
- `libs/backend/rpc-handlers/src/lib/di/register.ts`
- `apps/ptah-electron/src/di/surface-composition.spec.ts` (line 89 only)
- `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.ts`
- `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.html` (only if needed)
- `libs/frontend/onboarding/src/lib/proposal/team-builder-skill.store.ts` (only if needed)
- `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts` (add cases only)
- `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts`
- `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc-skill-install.spec.ts`

Nothing else under `libs/frontend/**`. Nothing in `apps/ptah-extension-webview/**`. Not
`tools/ui-class-audit/baseline.json`. Do not touch `libs/backend/harness-sync/**`.

## Rules for code

Standalone OnPush components, signals, `ClaudeRpcService` only, no `[innerHTML]`, no `any`, no
`@ts-ignore`, no `as unknown as X`. Use the injected `Logger` in libs, never `console.*`. Do not
swallow errors.

## Verify (scoped only)

1. `npm run verify -- -t test -p @ptah-extension/onboarding 2>&1 | tail -40`
2. `npm run verify -- -t test -p @ptah-extension/rpc-handlers 2>&1 | tail -40`

Confirm that each header says "Running target test for 1 projects". If Nx fails with
`spawn EPERM`, run the focused spec by Jest directly and say so in your report:
`npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts`
and the same for the rpc-handlers spec. Report the real result. Do not claim a pass that you did
not see. If you change a `.html` template, also run
`npm run verify -- -t typecheck-templates -p ptah-extension-webview`.

## Mandatory rules

- Work only in the task worktree. Never touch the main checkout.
- Verification is scoped only. No workspace-wide checks. No `build`, `serve`, `dev`, `e2e` or
  `package` target.
- Never run `git checkout -- <path>`, `git restore`, `git reset`, `git stash`, `git clean`,
  commit, push, force push or history rewrite. Report an unexpected change; do not revert it.
- No personal data or home paths with a user name in files or in the report.
- Electron first.

## Deliverable

`.ptah/specs/TASK_2026_1162_56c1/B7b-B8-fix1-report.md`: what you changed per file (one line
each), the cause of Fix 1, the real test results (command, N tests, pass or fail).

## Reply format

One short message: done or blocked, files changed, test results.

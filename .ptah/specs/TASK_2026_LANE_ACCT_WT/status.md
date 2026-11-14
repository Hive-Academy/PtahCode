# Lane account worktree root fix

## Changed files
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/git-main-checkout-root.ts`: shared, no-git-process linked-worktree main checkout resolver; walks up from the scoped directory.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-user-mcp-servers.ts`: uses the shared resolver, preserving Codex trust behavior.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts`: reads the scoped selection first and retries at the main checkout only for revision -1.
- `libs/backend/auth-providers-tokens/src/lib/provider-account-admission.port.ts`: adds optional selection revision to the reader port.
- `libs/backend/auth-providers/src/lib/accounts/provider-account.service.ts`: passes through the stored profile and revision.
- `libs/backend/auth-providers/src/lib/di/register.ts`: no-storage reader reports revision -1.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.account-binding.spec.ts`: covers fallback, explicit null worktree row, single regular-root read, and failure on fallback read.
- `libs/backend/auth-providers/src/lib/accounts/provider-account.store.spec.ts` and `libs/backend/auth-providers/src/lib/di/register.spec.ts`: cover returned revisions.

## Design decisions
- A scoped worktree row wins whenever `revision` is not -1, including an explicit null profile.
- Both read failures are caught by the existing `unavailable-storage` refusal path. No ambient retry occurs.
- Windows case/separator-insensitive key matching was skipped: existing keys are exact strings, so safe matching would need a store-level lookup rule or migration rather than normalizing only one read.
- The worktree's `node_modules` was linked as a local junction to the parent checkout's installed dependencies so focused Jest could resolve its `marked` module mapping. It is untracked and contains no edited dependency files.

## Checks and results
- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.account-binding.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-user-mcp-servers.spec.ts` — PASS, 2 suites, 104 tests (`.ptah/tmp/lane-runtime-jest-pass.log`).
- `npx jest --config libs/backend/auth-providers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/auth-providers/src/lib/accounts/provider-account.store.spec.ts libs/backend/auth-providers/src/lib/di/register.spec.ts` — initial run: store spec passed; register spec exposed missing revision in no-storage stub, then fixed. Store spec had 98 passing tests (`.ptah/tmp/lane-auth-jest.log`).
- `npx jest --config libs/backend/auth-providers/jest.config.ts --runInBand --coverage=false --no-cache --runTestsByPath libs/backend/auth-providers/src/lib/di/register.spec.ts` — PASS, 1 suite, 7 tests (`.ptah/tmp/lane-auth-register-jest-final.log`). Cache disabled after a rerun used stale transformed source.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json` — PASS.
- `npx tsc --noEmit --project libs/backend/auth-providers/tsconfig.lib.json` — PASS.
- `npx tsc --noEmit --project libs/backend/auth-providers-tokens/tsconfig.lib.json` — PASS. Logs: `.ptah/tmp/lane-tsc-*.log`.
- `npx eslint` on all nine changed TypeScript files — PASS, 0 errors, 8 warnings (`.ptah/tmp/lane-eslint.log`). Warnings are existing long-file, unused-symbol, assertion, and no-cached-ProjectGraph notices.
- `git diff --check` — PASS after removing trailing blank line.

## Tooling note
- The Ptah workspace analysis tool was discovered but did not return before timeout; native `rg` and direct file reads were used. No invokable skill catalog was available in this lane, so no skill was loaded.

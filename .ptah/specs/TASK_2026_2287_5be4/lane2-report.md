# Lane 2 — named Claude account discovery

## Files changed

- `libs/backend/cli-agent-runtime/src/lib/cli-agents/limits/plan-owner-read.ts` adds a stored-directory read plan for a Claude account without a session.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/limits/plan-limit-owner-discovery.service.ts` injects the optional usage-profile port and discovers stored accounts.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/limits/plan-owner-read.accounts.spec.ts` covers stored-directory targets, the account-only guard, and session precedence.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/limits/plan-limit-owner-discovery.service.spec.ts` covers multiple accounts, malformed references, absent and empty ports, deduplication, and ambient isolation.
- `.ptah/specs/TASK_2026_2287_5be4/lane2-report.md` records the implementation and verification.

## Call chain

1. The dashboard RPC `provider:getPlanLimits` delegates to `snapshot` in `libs/backend/rpc-handlers/src/lib/handlers/provider-rpc.handlers.ts:270`.
2. `libs/backend/rpc-handlers/src/lib/services/plan-limits-snapshot.service.ts:265` calls `discoverTargets`. `libs/backend/cli-agent-runtime/src/lib/cli-agents/limits/plan-limit-owner-discovery.service.ts:284` runs the named-account source, which derives the owner and calls `entryFor` at line 494.
3. `libs/backend/cli-agent-runtime/src/lib/cli-agents/limits/plan-owner-read.ts:152` builds the read target with a copied usage directory. The snapshot service passes `entry.target` to `readOwner` at line 289 and `PlanUsageService.getOwnerSnapshot` at line 322.
4. `libs/backend/auth-providers/src/lib/quota/plan-usage.service.ts:269` retains the usage directory. `libs/backend/auth-providers/src/lib/quota/readers/claude-plan-usage.reader.ts:219` returns `no-open-session` before the ambient probe, and `plan-usage.service.ts:214` calls the OAuth usage reader.
5. `libs/backend/auth-providers/src/lib/quota/readers/claude-oauth-plan-usage.reader.ts:94` selects the stored config directory. The reader checks the account key at line 123 and maps the provider's five-hour and weekly windows at line 156.

## PlanOwnerOrigin consumers

- `libs/backend/cli-agent-runtime/src/index.ts:50` re-exports the union. The discovery service is its only production consumer in the two reviewed projects. It carries the origin in `DiscoveredPlanOwner` and passes it through the selected-provider, ledger-only, read, and known-entry paths.
- The discovery and owner-read specs compare origins by equality.
- `libs/backend/rpc-handlers/src/lib/services/plan-limits-snapshot.service.ts:282` handles `DiscoveredPlanOwner` by `kind`. Its spec and `libs/backend/rpc-handlers/src/lib/handlers/provider-rpc.handlers.spec.ts:345` compare the origin only to `selected-provider`. No exhaustive origin switch or map requires a change.
- `libs/backend/cli-agent-runtime/src/lib/di/register.ts:388` registers discovery with `useClass`. The token is registered at `libs/backend/auth-providers/src/lib/di/register.ts:194`. The two direct constructors are in the updated specs. The discovery harness supplies the new optional argument for the new scenarios, and the named-session harness continues to omit it.

## Commands and results

- Initial focused Jest run failed with 238 passing and 3 failing tests across 9 suites. The three new assertions were corrected to account for the implicit selected-provider entry and the discovery array's `discoveryIncomplete` property. Log at `.ptah/tmp/lane2-jest-initial.log`.
- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath <all nine limits specs>` passed with 241 tests and 9 suites. Log at `.ptah/tmp/lane2-jest.log`. Node emitted a module-loading warning for the Jest config.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json` passed with exit 0. Log at `.ptah/tmp/lane2-tsc-lib.log`.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.spec.json` passed with exit 0. Log at `.ptah/tmp/lane2-tsc-spec.log`.
- `npx eslint <the four changed TypeScript files above>` passed with exit 0 and no output. Log at `.ptah/tmp/lane2-eslint.log`.
- `git diff --check` passed for the four changed source and spec files.
- Independent code-logic review by a Claude reviewer, separate from the Codex implementation, returned **APPROVED**. It checked ordering, DI, canonical owner construction, ambient isolation, and requested test coverage.

## Decisions

- Used `quotaOwnerRefFromKey`, the same helper called by `ProviderOwnerResolver.ownerForClaudeAccount` for a verified account. `claudeOwnerKeyFromIdentityReference` validates the stored digest before construction.
- Kept first-entry deduplication and placed stored named accounts immediately before session discovery. The selected provider stays first. Entries from stored accounts join the existing named-entry WeakSet so they cannot vouch for an ambient account with no email.
- Used the supplied task worktree and branch. Ptah's reverse dependency graph was still building during impact inspection, so `rg` was used to check references and constructor sites. The requested scoped TypeScript commands provide diagnostics.
- This CLI exposed no native skill loader. Read the repository's orchestration and agent-lanes skill files through the filesystem and applied their lane and review guidance.

## Not done

The review raised three non-blocking follow-ups: dedicated tests for a failing profile port and an ambient account sharing a stored owner key, and investigation of profile-name display. The lookup uses the existing bounded error handling and selected-provider precedence. Card labels use the resolver's generic Claude account label. Live dashboard and OAuth calls were outside this backend lane's verification scope.

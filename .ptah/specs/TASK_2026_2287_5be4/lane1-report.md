# Lane 1 — stored Claude profile usage

## Files changed

| Path | Change |
| --- | --- |
| `libs/backend/auth-providers-tokens/src/lib/usage-profile-roots.port.ts` | Added the signed-in-account projection to the existing port. |
| `libs/backend/auth-providers/src/lib/accounts/usage-profile-roots.adapter.ts` | Projects canonical directories and opaque references from signed-in rows with a reference. |
| `libs/backend/auth-providers/src/lib/accounts/usage-profile-roots.adapter.spec.ts` | Covers excluded states and missing, null and empty references. |
| `libs/backend/auth-providers/src/lib/di/register.ts` | Supplies the empty projection when SQLite is unavailable. |
| `libs/backend/agent-sdk/src/lib/session-stats/usage-source-registry.spec.ts` | Implements the added method in the existing port mock. |
| `libs/backend/auth-providers/src/lib/quota/provider-owner.resolver.ts` | Validates the stored digest and derives the existing Claude account owner key. |
| `libs/backend/auth-providers/src/lib/quota/provider-owner.accounts.spec.ts` | Compares stored and live owner derivation and rejects malformed digests. |
| `libs/backend/auth-providers/src/lib/quota/index.ts` | Exports the owner helper and usage directory through the existing public barrel chain. |
| `libs/backend/auth-providers/src/lib/quota/readers/plan-usage-reader.types.ts` | Adds the usage directory type and optional owner target property. |
| `libs/backend/auth-providers/src/lib/quota/readers/claude-oauth-plan-usage.reader.ts` | Uses the stored directory for OAuth after checking for a named route. |
| `libs/backend/auth-providers/src/lib/quota/readers/claude-oauth-plan-usage.reader.spec.ts` | Covers exact file paths with an unrelated config environment, owner mismatch before fetch, empty directories and named-route precedence. |
| `libs/backend/auth-providers/src/lib/quota/readers/claude-plan-usage.reader.ts` | Returns `no-open-session` before the ambient probe for stored usage targets. |
| `libs/backend/auth-providers/src/lib/quota/readers/claude-plan-usage.reader.spec.ts` | Asserts `no-open-session` and zero calls to the live probe. |
| `libs/backend/auth-providers/src/lib/quota/plan-usage.service.ts` | Snapshots the usage directory and keys its flights by owner and profile. |
| `libs/backend/auth-providers/src/lib/quota/plan-usage.service.spec.ts` | Covers the OAuth fallback with a copied directory and a separate same-owner flight. |
| `libs/backend/auth-providers/src/lib/quota/plan-usage.accounts.spec.ts` | Updates the stale sessionless named-route assertion for the predecessor's OAuth fallback and checks both live probes remain unused. |
| `.ptah/specs/TASK_2026_2287_5be4/lane1-report.md` | Records the implementation, verification and public contracts. |

Verification logs are under `.ptah/tmp/lane1-*.log`. Additional reads outside the task's focus files and sources listed above were limited to these files and search matches:

- `libs/backend/auth-providers/src/index.ts`, `libs/backend/auth-providers-tokens/src/index.ts`, `libs/backend/agent-sdk/src/index.ts` and `tsconfig.base.json` for public exports and aliases.
- `libs/backend/agent-sdk/src/lib/helpers/claude-identity-reference.ts` for the digest formula.
- `libs/backend/auth-providers-tokens/src/lib/tokens.ts`, `libs/backend/agent-sdk/src/lib/session-stats/usage-source-registry.ts` and `libs/backend/cli-engine/src/lib/container.ts` for port consumers and DI token search matches.
- `.claude/skills/orchestration/SKILL.md`, `.claude/skills/orchestration/packs/software.md`, `.claude/skills/orchestration/phases/implement.md`, `.claude/skills/agent-lanes/SKILL.md` and `.claude/skills/skill-creator/references/prompt-authoring-rubric.md` for the lane and review workflow.

## Exported names for the next lane

From `@ptah-extension/auth-providers`:

```ts
export interface ClaudeUsageDirectory {
  readonly kind: 'stored-profile-usage';
  readonly profileId: string;
  readonly canonicalConfigDir: string;
}

// Existing type export, with this new member on PlanOwnerTarget
readonly claudeUsageDir?: ClaudeUsageDirectory;

export function claudeOwnerKeyFromIdentityReference(ref: string): string | null;
```

From `@ptah-extension/auth-providers-tokens`, the existing `ClaudeUsageProfileRoots` type has this new method:

```ts
listSignedInAccounts(): Promise<readonly {
  profileId: string;
  canonicalConfigDir: string;
  identityReference: string;
}[]>;
```

Resolve the port with `AUTH_PROVIDERS_TOKENS.SDK_CLAUDE_USAGE_PROFILE_ROOTS` from the same package.

## Commands and results

- Initial quota and adapter Jest run exited 1 with 587 passing and 2 failing tests. One new test assumed separate flights implied separate settled results. The existing named-route test expected the old behavior of skipping OAuth when no session was open. Both assertions were updated before the final run.
- `npx jest --config libs/backend/auth-providers/jest.config.ts --runInBand --coverage=false --runTestsByPath <all 23 quota specs> libs/backend/auth-providers/src/lib/accounts/usage-profile-roots.adapter.spec.ts` exited 0. All 24 suites and 589 tests passed.
- `npx tsc --noEmit --project libs/backend/auth-providers/tsconfig.lib.json` exited 0.
- `npx tsc --noEmit --project libs/backend/auth-providers-tokens/tsconfig.lib.json` exited 0.
- `npx tsc --noEmit --project libs/backend/auth-providers/tsconfig.spec.json` exited 0.
- `npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-sdk/src/lib/session-stats/usage-source-registry.spec.ts` exited 0. One suite and one test passed.
- `npx eslint <16 changed TypeScript files listed above>` exited 0 with three existing warnings. The two non-null assertions and unused catch parameter were already present. ESLint skipped the Nx module-boundary rule because no cached project graph was available.
- `git diff --check` exited 0 for the affected libraries and Agent SDK spec.
- An independent Antigravity reviewer approved the inline diff with no blocking findings. The first attempt could not read files because headless mode denied command permissions. The resubmitted review used the diff directly and ran no checks.

## Decisions

- Used the supplied `fix/claude-named-account-usage` worktree to retain the predecessor changes.
- The stored-profile flight key includes the owner key and profile ID. The settled cache still uses the owner key. The concurrency test uses the same owner in both calls to isolate flight identity from owner identity.
- The concurrency test verifies separate reader calls and the stored profile result. The same-owner cache can return the newer settled reading to an earlier flight, as before.
- The adapter checks reference presence. The owner helper validates the lowercase SHA-256 format.
- A named route takes precedence when both directory carriers are supplied. The stored profile follows the same empty-directory rejection and credential identity verification as the named route.
- Ptah AST inspection succeeded for the service. The Ptah dependent graph was still indexing, so repository-wide `rg` matches for `listActiveRoots` and the port type established the mock and implementation scope. The requested serial Jest, TypeScript and ESLint commands provide verification.

## Not done

- Steps 7–8 and dashboard discovery integration belong to the next lane.

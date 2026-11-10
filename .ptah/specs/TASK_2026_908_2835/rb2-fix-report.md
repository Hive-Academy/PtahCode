## Changes

- `libs/backend/auth-providers/src/lib/provider-models.service.ts`: Added `resolveEffectiveTiers` as the single tier-selection rule, including filtered-catalog exemptions, lazy catalog/derivation reads, suffix normalization, and process-wide one-time replacement logging. `applyPersistedTiers` now delegates to it; its comment describes the new selection rule.
- `libs/backend/auth-providers/src/lib/auth/provider-auth-resolver.ts`: Delegated lane tier selection to the shared method and removed its local rule and exemption ids.
- `libs/backend/auth-providers/src/lib/auth/workspace-provider-profile-resolver.ts`: Delegated workspace snapshot tier selection to the shared method while preserving snapshot env writes.
- `libs/backend/auth-providers/src/lib/provider-models.service.spec.ts`: Added cases for unknown/known catalogs, suffix comparison, replacement, missing derivation, exemption, user override, and one-time logging. Updated the foreground env assertion for a missing static id.
- `libs/backend/auth-providers/src/lib/auth/provider-auth-resolver.spec.ts`: Extended the partial service mock with the real shared method; existing lane assertions continue to cover delegation.
- `libs/backend/auth-providers/src/lib/auth/workspace-provider-profile-resolver.spec.ts`: Updated the workspace profile assertion for a missing static id.

## Mocks updated

- `libs/backend/auth-providers/src/lib/auth/provider-auth-resolver.spec.ts`: Added `resolveEffectiveTiers` to the mock surface, using the production method.
- `libs/backend/auth-providers/src/lib/auth/draft-verification.service.spec.ts`: Added `resolveEffectiveTiers` to the partial service mock, using the production method.
- Other `getLiveDerivedTiers` spec occurrences use a real service or do not invoke these resolvers, so they needed no mock change.

## Decisions

- The exemption list lives beside the shared rule in `ProviderModelsService`, matching the previously implemented resolver behavior. This is reversible.
- The resolver harness calls the production method on its partial mock to keep the spec's catalog fixtures and avoid duplicating the rule. This is reversible.

## Not verified

- No tests, Nx targets, build, lint, typecheck, or diagnostics ran, as instructed. Prettier ran on edited files; `git diff --check` found no whitespace errors.

## Open points

- None.

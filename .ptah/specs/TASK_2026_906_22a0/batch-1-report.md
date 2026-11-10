# Batch 1 and 1b report

## Files changed

- `libs/shared/src/lib/types/rpc/rpc-git-window.types.ts` — strict bounded Zod schemas, scope/candidate and RPC result types, and named push types. The host assigns the accepted scope sequence.
- `libs/shared/src/lib/types/rpc/rpc-git-window.types.spec.ts` — valid and malformed payload coverage, including unknown keys, length/array limits, version and sequence.
- `libs/shared/src/lib/types/rpc.types.ts` — public re-export plus all six typed RPC registry and runtime manifest entries. The shared index already exports this module, so no index edit was necessary.
- `libs/backend/platform-core/src/interfaces/git-window-host.interface.ts` — Electron Git host port and unbound response contract.
- `libs/backend/platform-core/src/di/tokens.ts` — `PLATFORM_TOKENS.GIT_WINDOW_HOST` using `Symbol.for`.
- `libs/backend/platform-core/src/index.ts` — public port export.

## Verification

Ptah diagnostics: zero errors, zero warnings (clean coverage). `npm run verify -- -p @ptah-extension/shared,@ptah-extension/platform-core` selected exactly the two named projects. Initial run found a local-import lint error in the new spec; corrected to a relative import. On rerun, all four scoped lint/typecheck tasks passed. Shared tests passed. Platform-core tests failed in two existing `session-driver-lock` specs on Windows (`TypeError: This handle type cannot be sent` and a failed `acquire` expectation); 57 platform-core suites and 1043 tests passed. The rerun exited 1 because of those two failures. The test log contains no Git-window failure. The command output did not print a separate literal "2 projects" header; its start line and phase lines name both projects.

## Decisions

- Follow the plan's exact `gitWindow:open` result, with `not-ready` on unbound platforms; options were adding P1's `desktop-only` reason or using the plan's single reason. The approved Contracts table specifies only `not-ready`; this is reversible.
- Export the schemas through the existing `rpc.types.ts` wildcard already re-exported by `libs/shared/src/index.ts`; options were adding a duplicate direct export to the index or using the existing barrel. Existing Display contract precedent supports the latter; reversible.

## Deviations

No contract deviation. The planned shared index file needed no source edit because the public export chain already covers the new module. Verification failure details above.

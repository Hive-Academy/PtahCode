## Changes

- `libs/backend/codex-runtime/src/lib/codex-account-usage.types.ts`: expose the optional, top-level `ordinaryUsageAllowed` flag.
- `libs/backend/codex-runtime/src/lib/codex-account-usage-client.ts`: validate and preserve the provider gate flag from the rate-limit response.
- `libs/backend/codex-runtime/src/lib/codex-account-usage-client.spec.ts`: cover allowed, denied, absent, and malformed gate values.
- `libs/backend/auth-providers/src/lib/quota/readers/codex-plan-usage.reader.ts`: map a denied gate to its named window or owner evidence; keep a bucket flag from exhausting a window below 100% on its own.
- `libs/backend/auth-providers/src/lib/quota/readers/codex-plan-usage.reader.spec.ts`: cover allowed, denied, absent, named-window and owner-evidence behavior.
- `libs/backend/auth-providers/src/lib/quota/readers/plan-usage-reader.types.ts`: carry provider owner evidence through a reader result.
- `libs/backend/auth-providers/src/lib/quota/plan-usage.service.ts`: record provider owner evidence in the ledger.
- `libs/backend/auth-providers/src/lib/quota/plan-usage.service.spec.ts`: verify denied gate evidence reaches the owner snapshot.
- `libs/backend/auth-providers/src/lib/quota/readers/opencode-go-plan-usage.reader.ts` and its spec: inspected; existing HTTP 403 mapping already returns `no-usage-source`, so no edit was needed.

## Decisions

- Decision: read `ordinaryUsageAllowed` at the response root. Options: root or bucket. Evidence: the existing `account/rateLimits/read` Zod protocol schema defines it at the root; client tests pass for all three optional states. A malformed value fails protocol validation and cannot produce limit evidence.
- Decision: when a denied gate names `primary`, `secondary`, or `weekly`, exhaust that matching window. When it names no window, record owner evidence. Options: mark every window or use owner evidence. Evidence: the reader and service specs cover a 7% named weekly window and a 7% unnamed owner gate; a bucket reached flag alone at 7% leaves exhaustion absent.
- Decision: retain OpenCode's existing 403 behavior. Options: change code or verify existing mapping. Evidence: the reader returns `noPlan()` on HTTP 403, and its targeted Jest spec passed.
- Ptah symbol search returned an empty index, so file discovery fell back to `rg`. No matching quota/backend skill was available in the local skill list.

## Checks

- `npx jest --config libs/backend/auth-providers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/auth-providers/src/lib/quota/readers/codex-plan-usage.reader.spec.ts libs/backend/auth-providers/src/lib/quota/readers/opencode-go-plan-usage.reader.spec.ts libs/backend/auth-providers/src/lib/quota/plan-usage.service.spec.ts`: PASS, 3 suites and 84 tests.
- `npx jest --config libs/backend/codex-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/codex-runtime/src/lib/codex-account-usage-client.spec.ts`: PASS, 1 suite and 34 tests.
- `npx tsc --noEmit --project libs/backend/auth-providers/tsconfig.lib.json`: PASS, 0 errors.
- `npx tsc --noEmit --project libs/backend/codex-runtime/tsconfig.lib.json`: PASS, 0 errors.
- `npx eslint libs/backend/codex-runtime/src/lib/codex-account-usage.types.ts libs/backend/codex-runtime/src/lib/codex-account-usage-client.ts libs/backend/codex-runtime/src/lib/codex-account-usage-client.spec.ts libs/backend/auth-providers/src/lib/quota/readers/plan-usage-reader.types.ts libs/backend/auth-providers/src/lib/quota/plan-usage.service.ts libs/backend/auth-providers/src/lib/quota/readers/codex-plan-usage.reader.ts libs/backend/auth-providers/src/lib/quota/readers/codex-plan-usage.reader.spec.ts`: PASS, 0 errors, 1 pre-existing unused-variable warning; Nx boundary rule skipped because its project graph was unavailable.
- `npx eslint libs/backend/auth-providers/src/lib/quota/plan-usage.service.spec.ts`: PASS, 0 errors and 0 lint warnings; Nx boundary rule skipped because its project graph was unavailable.
- `git diff --check`: PASS.

## Open points

- None for this batch. The OpenCode 403 fix was already present in this worktree before this lane's edits.

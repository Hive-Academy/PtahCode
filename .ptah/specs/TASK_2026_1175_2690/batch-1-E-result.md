# Batch E result

## Causes and fixes

- `content-generation.service.spec.ts`: fixture. Plugin skill tests used a retired type, which has no current tool policy. Use `code-logic-reviewer` for known-policy cases and a neutral slug for unrelated cases.
- `user-layer-agent-scope.spec.ts`: fixture. Use neutral agent slugs for workspace isolation.
- `user-layer-rebase-origins.spec.ts`: fixture. Use a neutral slug for rebase and history.
- `user-layer-activation-sequence.spec.ts`: fixture. Use a neutral slug for activation.
- `wizard-agent-origin.store.spec.ts`: fixture. Use a neutral slug for origin hashing.
- `invocable-plugin-skills.spec.ts`: fixture. Use `code-logic-reviewer` for known-policy cases.
- `user-layer-reap.spec.ts`, deleted-upstream E8: fixture. Use a neutral slug for reap.
- `skills-synthesis-rpc.handlers.spec.ts`, AGENT rebase: fixture. Use a neutral slug. Retired-role read-only guards remain tested elsewhere.
- `user-layer-mirror.service.ts`: regression. Batch C skipped every retired slug, including user-authored agents. The seed and mirror guards now skip only retired agents with a valid Ptah origin sidecar. `user-layer-mirror.service.spec.ts` marks Ptah-origin fixtures and proves a user-authored agent with the same slug mirrors.

## Files changed

- Agent generation specs: `content-generation.service.spec.ts`, `invocable-plugin-skills.spec.ts`, `wizard-agent-origin.store.spec.ts`, `user-layer-agent-scope.spec.ts`, `user-layer-rebase-origins.spec.ts`, `user-layer-activation-sequence.spec.ts`, `user-layer-reap.spec.ts`, `user-layer-mirror.service.spec.ts`.
- Agent generation source: `user-layer-mirror.service.ts`.
- RPC handlers spec: `skills-synthesis-rpc.handlers.spec.ts`.

## Retired slug lines

Counts use `git show HEAD:<file>` before and the worktree after. Existing Batch A-D changes are included where present. Values are before -> after.

| File | Lines |
|---|---:|
| content-generation.service.spec.ts | 10 -> 0 |
| invocable-plugin-skills.spec.ts | 5 -> 0 |
| wizard-agent-origin.store.spec.ts | 29 -> 0 |
| user-layer-agent-scope.spec.ts | 10 -> 0 |
| user-layer-rebase-origins.spec.ts | 8 -> 0 |
| user-layer-activation-sequence.spec.ts | 2 -> 0 |
| user-layer-reap.spec.ts | 6 -> 0 |
| user-layer-mirror.service.spec.ts | 0 -> 4 |
| user-layer-mirror.service.ts | 1 -> 1 |
| skills-synthesis-rpc.handlers.spec.ts | 37 -> 30 |

The changed files have 73 fewer retired-slug lines than HEAD. The intentional retirement test adds two lines relative to the Batch E starting point. The read-only census failed before counting because Node `spawnSync('git')` returned no status or stderr. The changed test fixtures remove more than the eight lines needed to bring test count 944 under 936; no other census bucket was changed by Batch E. The census limit is not directly verified in this sandbox.

## Checks

- Agent generation focused Jest, first run: exit 1. The two plugin-skill cases still used an unknown type; fixed. The two symlink tests failed with local Windows `EPERM`, as expected. The other changed specs passed.
- Agent generation plugin-skill Jest rerun: exit 0, 103 tests.
- Agent generation mirror Jest: exit 0, 39 tests.
- RPC handlers focused Jest: exit 0, 158 tests.
- Agent generation `tsc --noEmit --project tsconfig.spec.json`: exit 0, including the final source fix.
- RPC handlers `tsc --noEmit --project tsconfig.spec.json`: exit 0.
- ESLint on all ten changed files: exit 0, 0 errors, 77 warnings.
- Read-only role census: exit 1, `git ls-files failed: undefined`.
- Skill discovery: Ptah search returned no invocable matching testing skill; no skill was loaded.

## Open issues

- Full census needs a rerun where Node can spawn Git.
- Two symlink reap tests need Windows symlink permission or CI to run.

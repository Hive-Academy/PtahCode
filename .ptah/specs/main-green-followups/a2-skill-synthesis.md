# Skill synthesis main green follow-up

## Root cause and verdict

**Test expectation was wrong.** The legacy NULL-root adoption assertion in `libs/backend/skill-synthesis/src/lib/skill-task-grade.store.spec.ts:154` (introduced by `b880203e6`) expected the raw `root` from `process.cwd()`. On Windows that is `D:\...`, while the store persists the canonical `d:\...` via `normalizeWorkspaceRoot` at `skill-task-grade.store.ts:136`. That store behavior follows the public `platform-core/src/utils/normalize-workspace-root.ts:33-39` contract, introduced by `9d838ba5a`. The baseline full-project verify failed only this assertion; its separate uppercase drive-letter matching test passed.

## Fix

Import `normalizeWorkspaceRoot` from the public `@ptah-extension/platform-core` entry point in the spec and compare the persisted root with `normalizeWorkspaceRoot(root)`. This preserves the full equality assertion, works with the host path semantics on Windows and Linux, and leaves product code unchanged.

## Files changed

- `libs/backend/skill-synthesis/src/lib/skill-task-grade.store.spec.ts`: canonical expected workspace root.
- `.ptah/specs/main-green-followups/a2-skill-synthesis.md`: investigation and verification report.

## Verification

- Baseline `PTAH_VERIFY_SLOTS=1 PTAH_VERIFY_MIN_FREE_GB=8 npm run verify -- -p skill-synthesis`: lint and typecheck succeeded; test failed with 1 failed / 635 passed (36 suites, only `skill-task-grade.store.spec.ts` failed).
- Final `PTAH_VERIFY_SLOTS=1 PTAH_VERIFY_MIN_FREE_GB=8 npm run verify -- -p skill-synthesis`: `NX 2 tasks: 2 succeeded` (lint, typecheck); `NX 1 task: 1 succeeded` (test); `lock released after 95.8s, exit code 0`.
- `git diff --check -- libs/backend/skill-synthesis`: passed.

## Decisions

- Reused the shared public path normalizer already used by the store. No new normalizer, baseline change, or test skip.
- No locally installed matching skill was found through Ptah skill discovery; repository guidance and source history were used.

## Anything not done

- None.


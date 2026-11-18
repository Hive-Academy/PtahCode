## Finding A

Cause: the session branch removed scratch in the `finally` of the deadline race. A timeout therefore removed the runner's working directory while the runner was still pending.

Change: `libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-ranking.service.ts:144` creates scratch and starts the runner through `Promise.resolve().then(...)`; `:170` attaches cleanup to runner settlement, inside the promise passed to the existing deadline helper.

- Normal resolution: cleanup completes before the session result is accepted and `rank()` returns.
- Runner rejection before the deadline: cleanup completes before the existing session-failure fallback returns.
- Deadline while the runner is pending: `rank()` returns heuristic results at 15 seconds without waiting for the runner; scratch stays intact. Later resolution or rejection removes scratch exactly once and cannot update the returned ranking.
- Synchronous runner throw: the promise callback converts it into rejection, triggering the same cleanup.
- Scratch creation failure: the existing catch logs and retains heuristic order; no directory exists to remove.
- Cleanup rejection: the real cleanup catch retains its `degradation-audit: reported` comment and injected Logger debug call. The race observes the full promise chain, including late rejection; no detached, unhandled promise or `void` is introduced.

Evidence: `skill-ranking.service.spec.ts:227` adds fake-timer cases for late resolution and rejection, asserting return at the deadline, no removal yet, then exactly one removal after settlement. The existing normal-path cases now assert removal before return (`:78`). Both new parameterized cases failed against unchanged production code because `rm` had already been called once at the deadline.

## Finding B

Cause: `reason` is a single item-level explanation, not an explanation indexed by candidate. The schema in `skill-ranking.schema.ts:12` preserves that reason with the model order; its default is a relevance explanation. The decision caller asks for the best skill and puts the selected candidate first (`libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.ts:108`); the session prompt also ranks by relevance. There is no explanation for a later candidate that deduplication selects.

Change: `libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.ts:280` includes `reason` only when `best === ordered[0]` and the reason exists. Selection, ordering and `rankedBy` are unchanged. When deduplication skips the first choice, the replacement has no reason property; when the first choice is free, its reason is preserved.

Evidence: the existing deduplication integration test now asserts both paths and retained `rankedBy` (`skill-recommendation.service.spec.ts:493`). Against unchanged production code, the new no-reason assertion failed with received value `"Best match"`. Existing first-choice integration coverage remains green.

## Checks

Regression proof used the requested two-spec Jest command before production edits: `Test Suites: 2 failed, 2 total`; `Tests: 3 failed, 55 passed, 58 total`; `EXIT_CODE=1`. Failures were exactly the two new timeout cases and the extended deduplication assertion. An initial proof attempt exposed a test callback inference error, which was corrected with an explicit `() => void` annotation before the conclusive run.

Final check commands (run from the specified worktree; output was tailed and exit codes printed explicitly):

```text
npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-ranking.service.spec.ts libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.spec.ts
Test Suites: 2 passed, 2 total
Tests:       58 passed, 58 total
EXIT_CODE=0

npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json
EXIT_CODE=0

npx eslint libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-ranking.service.ts libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.ts libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-ranking.service.spec.ts libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.spec.ts
EXIT_CODE=0
```

TypeScript and ESLint emitted no diagnostics. Jest emitted a Node warning about loading the TypeScript config as ESM, then passed both suites. No prohibited targets or workspace-wide checks were run.

Additional verification: `git diff --check` returned exit 0 with no output. Scoped Ptah diagnostics for the two changed services returned `Unavailable`: its TypeScript check was still running after 45 seconds. This is not claimed as a pass; the required native TypeScript command above independently passed.

```text
npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts
degradation-audit: TOTAL 220 unsuppressed site(s)
EXIT_CODE=0

npx prettier --check libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-ranking.service.ts libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.ts libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-ranking.service.spec.ts libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.spec.ts .ptah/specs/TASK_2026_2272_4859/review-thread-fix-report.md
All matched files use Prettier code style!
EXIT_CODE=0
```

The degradation audit stayed within its baseline and exited 0; its output also noted existing missing scan directories under `libs/web`. No baseline files were modified.

## Changed files

- `libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-ranking.service.ts`
- `libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-ranking.service.spec.ts`
- `libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.ts`
- `libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.spec.ts`
- `.ptah/specs/TASK_2026_2272_4859/review-thread-fix-report.md`

## Decisions

Work is restricted to the two services, their adjacent specs, and this report. Initial git status was clean. No changes by another writer were observed.

Cleanup on the ordinary success path finishes before `rank()` returns, preserving existing spec expectations. The decision-model branch and `withDeadline` are unchanged. The session runner is not cancelled by this fix; a runner that never settles necessarily retains its scratch directory.

The reason is interpreted as describing the model's first choice. The default generic explanation also follows the same first-choice-only rule, avoiding an unsupported attribution to a replacement candidate.

No public signatures, dependency injection registrations, RPC contracts or host adapters changed. Both Electron and CLI continue to use the same host-neutral backend code. Runtime host builds were outside the authorized check scope.

Native CLI skill discovery/loading was unavailable (no skill loader or matching skill catalog was exposed). Filesystem fallback inspected the local skill catalog; `humanize-library` explicitly excludes bug fixes and was not applied. No UI/design skill applies to these backend fixes. Ptah workspace analysis, spec search, AST inspection and dependency analysis were used. The dependency graph was partial; targeted native reads/searches supplemented it. No network lookup was needed.

Prettier formatted existing unformatted sections of the recommendation spec to satisfy the required whole-file formatting check. No other files were formatted. Git operations were read-only.

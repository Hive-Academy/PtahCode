The degradation audit now exits 0. Lane-routing has 0 sites (baseline 0). Rpc-handlers has 1 site (baseline 1).

Site lines below refer to the original branch source, before this fix. The verbose scan found all six sites in these two projects.

| Site | Cause | Change |
| --- | --- | --- |
| `libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.ts:35` | Marker on a timeout callback, not a flagged catch. | Removed the orphaned marker. |
| `libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.ts:45` | Marker on an ordinary unavailable-model branch. | Removed the orphaned marker. Kept the debug log. |
| `libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.ts:132` | Marker on an ordinary invalid-answer branch. | Removed the orphaned marker. Kept the debug log. |
| `libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-ranking.service.ts:109` | Marker on schema validation, not a flagged catch. | Removed the orphaned marker. Kept validation and logging. |
| `libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-ranking.service.ts:179` | Scratch cleanup rejection returned undefined without reporting. | Added an injected Logger debug call and a reported marker at the start of the catch handler body. Cleanup still resolves without blocking ranking. The marker is now at line 180. |
| `libs/backend/rpc-handlers/src/lib/handlers/agent-rpc.handlers.ts:1934` | Existing catch-return-sentinel site; baseline 1. | No change. This file is absent from `git diff --name-only main...HEAD`. |

Read the audit header before editing. Markers require a known kind and a reason. They must attach to a flagged catch through adjacent comments, leading body comments, or comments above the statement containing a promise catch. Normal validation and timeout branches need no suppression.

Only the two ranking service source files changed. Ranking and fallback behavior stays the same. Cleanup failure now emits a debug log. Audit code and baseline files were not edited. No git writes were performed. The existing change to `.ptah/specs/TASK_2026_2272_4859/test-report.md` was not touched; its SHA256 stayed `14A2A9CFAA160038118F5CCD090EDBE706B392BFA1CDDBE09C0A0E27751C60E6`.

Checks and real results:

1. Before the fix: `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts --verbose > .ptah/tmp/degr-lane.log 2>&1`
   Result: `libs/backend/lane-routing: 3 FAIL (baseline 0)`; `libs/backend/rpc-handlers: 3 FAIL (baseline 1)`. Exit 1. Filtered the log with `Select-String -Path .ptah/tmp/degr-lane.log -Pattern 'lane-routing|rpc-handlers' -Context 0,3` to list all six sites.
2. After the fix: `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts > .ptah/tmp/degr-lane-after.log 2>&1`
   Result: `libs/backend/rpc-handlers: 1 ok (baseline 1)`; `degradation-audit: TOTAL 220 unsuppressed site(s)`; `EXIT_CODE=0`. Exit 0. Lane-routing has no remaining sites and is omitted from the totals because it has no explicit baseline entry; its default baseline is 0.
3. `npx jest --config libs/backend/lane-routing/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.spec.ts`
   Result: `Test Suites: 1 passed, 1 total`; `Tests: 13 passed, 13 total`. Exit 0. Log: `.ptah/tmp/degr-lane-jest.log`.
4. `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-ranking.service.spec.ts`
   Result: `Test Suites: 1 passed, 1 total`; `Tests: 18 passed, 18 total`. Exit 0. Log: `.ptah/tmp/degr-rpc-jest.log`.
5. `npx tsc --noEmit --project libs/backend/lane-routing/tsconfig.lib.json`
   Result: no compiler output; `EXIT_CODE=0`. Exit 0. Log: `.ptah/tmp/degr-lane-tsc.log`.
6. `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json`
   Result: no compiler output; `EXIT_CODE=0`. Exit 0. Log: `.ptah/tmp/degr-rpc-tsc.log`.
7. `npx eslint libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.ts libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-ranking.service.ts`
   Result: no lint output; `EXIT_CODE=0`. Exit 0. Log: `.ptah/tmp/degr-eslint.log`.
8. `npx prettier --check libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.ts libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-ranking.service.ts`
   Result: `All matched files use Prettier code style!`; `EXIT_CODE=0`. Exit 0. Log: `.ptah/tmp/degr-prettier.log`.
9. `git diff --check -- libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.ts libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-ranking.service.ts`
   Result: no output; `EXIT_CODE=0`. Exit 0.

Confirmed both Jest config files and both library tsconfig files before running checks. Heavy checks ran one at a time. No verify, Nx, build, serve, e2e, or install command ran.

Tool note: used Ptah workspace analysis and dependent checks. The dependency graph was partial; native reads and `rg` supplied the source evidence. CLI skill discovery was unavailable; no matching audit-marker skill was available in the local skill catalog. No requirements remain unmet.

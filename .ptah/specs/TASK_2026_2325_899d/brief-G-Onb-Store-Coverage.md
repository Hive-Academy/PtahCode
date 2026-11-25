# Lane brief — G-Onb-Store-Coverage (W9, TASK_2026_2325_899d)

Read first: TF/lane-brief-common.md (short, binding).
TF = /home/amun/ptah-extension/.claude-worktrees/skill-judge/.ptah/specs/TASK_2026_2325_899d
FO = libs/frontend/onboarding/src/lib/
Load the `angular-frontend-patterns` skill before you write code (signals, computed, OnPush).

## Objective
Extend the onboarding skill store and the coverage strip for the judged skills step:
1. MODIFY `FO proposal/stack-skill.store.ts` (plan line 177 and the 3.7 rows that name it):
   immutable `analysisPair` and `judge` result, canonical `selectedCandidateIds`, R16 item rows and
   the residual-pool "Other candidates" predicate, F28 hidden-candidate counts, F29/R17 mutual
   exclusion between consent and draft (both orders, `installBlockedReason`), F30 open draft row
   pinned across filter changes, R18 dirty-draft guards and `submitted` snapshot, duplicate Create
   and stale Preview guards, manual draft opener for any detected item (TD 3.8).
2. C5 (D35): add a read-only `createdSkillSlugs` signal (slugs created by Create in this run) so
   the preview can warn before a second Create with an equal slug.
3. MODIFY `FO proposal/stack-coverage{.ts,.spec.ts}` and
   `FO proposal/stack-coverage-strip.component{.ts,.html,.spec.ts}`: judged coverage status words
   (design-spec 3.6), F23 measured 2-line strip (R22: at most two lines of chips by default, rest
   collapsed and reachable), parity GAP 27-29 (plan line 205).
Keep every current state, count and action reachable (R22 changes density, not content). Keep the
unjudged team-builder path working: existing callers of the store must still compile.

## Write files (only these 6)
M: FO proposal/stack-skill.store.ts, FO proposal/stack-coverage.ts, .spec.ts,
FO proposal/stack-coverage-strip.component.ts, .html, .spec.ts.
Do not edit any other file (other lanes own the build row, preview, banner and rail). If a
consumer needs a change, report it.

## Read set (line ranges only)
- TF/implementation-plan.md lines 175-206 (section 9), 474-558 (3.6; parts that name the strip /
  F23), 559-582 (3.7 matrix rows that name `stack-skill.store.ts` or the strip). Never read the
  plan in full.
- TF/decisions.md lines 40-105 (R13-R23). TF/design-spec.md sections 3.2-3.6 (lines 77-112) and
  section 14 (line 238 to end). TF/prototype/README.md. NEVER open TF/prototype/index.html.
- libs/shared/src/lib/types/rpc/rpc-skill-judge.types.ts (SkillJudgeResult, verdicts, ModelPair).
- The current store and strip files, and their direct consumers (search for `StackSkillStore`
  usages; read only, do not edit).

## Checks (focused only)
- `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath <stack-coverage.spec.ts and stack-coverage-strip.component.spec.ts paths>`
  and any existing store spec, if one exists.
- `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json`
- `npx eslint <changed files>`
Never run `npm run verify`, `nx`, build, serve, dev or e2e. Never commit or push.
Other lanes edit other onboarding files at the same time: a tsc error in a file you do not own is
not yours; report it.

## Acceptance
- Store API for the later groups is listed in the report (signal and method names with types),
  so G-Onb-Rail, G-Onb-Review and G-Onb-Pages briefs can use it.
- Specs cover the coverage words, the 2-line strip with "show all", GAP 27-29.
- No `any`. Immutable state updates.

**Deliverable**: TF/batch-G-Onb-Store-Coverage-report.md (skeleton first, then fill; sections per
lane-brief-common.md). Reply `WROTE: <absolute path>` plus one headline line.

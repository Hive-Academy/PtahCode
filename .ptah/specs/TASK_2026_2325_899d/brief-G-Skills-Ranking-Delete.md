# Lane brief — G-Skills-Ranking-Delete (W9, TASK_2026_2325_899d)

Read first: TF/lane-brief-common.md (short, binding). Do not read implementation-plan.md.
TF = /home/amun/ptah-extension/.claude-worktrees/skill-judge/.ptah/specs/TASK_2026_2325_899d

## Objective
Remove the legacy skill ranking service. `SkillJudgeService` replaced it (W6-W8). After this
batch no file in the repository imports or names `SkillRankingService`,
`SKILL_RANKING_SERVICE` or the `skill-ranking.*` files.

Keep `LANE_ROUTING_TOKENS.SKILL_RANKING_CALLER` and the lane-routing
`skill-ranking-caller*` files: they are a different, live service (the judge uses them).

## Write files (RH = libs/backend/rpc-handlers/src/)
- D: RH lib/skills-sh/services/skill-ranking.types.ts, skill-ranking.schema.ts,
  skill-ranking.service.ts, skill-ranking.service.spec.ts (use `rm`; no git commands)
- M (remove only the legacy token, registration and exports; touch nothing else):
  RH lib/skills-sh/services/index.ts, RH lib/di/tokens.ts, RH lib/di/register.ts, RH index.ts
- If W8 left a reference in `RH lib/handlers/setup-rpc.handlers.ts` or
  `apps/ptah-electron/src/di/expected-resolvable.ts`, do NOT edit it: report it.

## Checks (lane only)
- `grep -rn "SkillRankingService\|SKILL_RANKING_SERVICE\|skill-ranking\.\(service\|schema\|types\)" libs apps --include=*.ts`
  returns nothing.
- `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json` (zero errors)
- `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.spec.ts libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-judge.service.spec.ts libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.spec.ts`
- `npx eslint <modified files>`
Never `npm run verify` or `nx`. Never commit, push or run git commands that change state.

**Deliverable**: TF/batch-G-Skills-Ranking-Delete-report.md (skeleton first): files removed,
lines removed, check results.
Reply: `WROTE: <absolute path>` plus one headline line.

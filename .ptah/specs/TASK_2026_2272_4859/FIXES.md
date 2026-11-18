# FIXES

Exit status: 0 for `npm run verify -- -t lint,typecheck -p lane-routing,rpc-handlers,shared`.
Tests did not run.

| ID | Change |
| --- | --- |
| S1 | Ran prettier on the changed files. |
| S2 | `SkillRankingCallerService`: removed `@injectable()` and `@inject()`. The factory in `lane-routing` `di/register.ts` stays. `SkillRankingService` keeps its decorators. It is now registered with `useClass` (singleton) in `rpc-handlers/src/lib/di/register.ts`. |
| S3 | Renamed `SkillRankingRequest` to `SkillRankingCallerItem` and `SkillRankingResult` to `SkillRankingCallerResult` in `lane-routing`, including `index.ts`. |
| F2 | `skill-ranking.service.ts` creates a scratch directory with `mkdtemp(join(tmpdir(), 'ptah-skill-rank-'))`. It removes the directory in `finally`. |
| F1 | `maxTurns` changed from 1 to 2. |
| M1/F8 | Removed local `DECISION_TIMEOUT_MS`. The service uses `DECISION_REQUEST_TIMEOUT_MS`. |
| M1 (extra) | Added an export of `DECISION_REQUEST_TIMEOUT_MS` to `lane-routing/src/index.ts`. The barrel did not export it before. |
| M2 | Deleted `skills-sh/di/register.ts`. Registration is now inline in `registerSkillServices`. |
| M3 | The catch block in the caller service now calls `logger.debug`. |
| M6 | Moved the `degradation-audit: reported` comment into the catch block in `skill-recommendation.service.ts`. |
| F4 | The schema requires `order.length >= 1`. Each entry must be an allowed label. The first entry was already checked by the same label rule. |
| F5 | Added debug logs at fallback points in both services. |
| F7 | Removed the workspace path from the request text. The `workspaceRoot` parameter is removed from `rankSkillCandidates` because it is now unused. |

## Notes

- The tooling touched `lane-routing/src/index.ts` and `rpc-handlers/src/lib/di/register.ts`. These files are outside the listed scope. The renames and the registration required it.
- `skill-ranking.service.ts` still uses `.catch(() => undefined)` for the scratch directory removal. It is best effort.

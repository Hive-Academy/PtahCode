# Code Style Review — skill ranking

Reviewer: code-style-reviewer. Worktree: `feat/skill-ranking-decision-model`.

## Verdict: NEEDS_REVISION (fail)

## Score: 68 / 100

Direction of imports is correct. Boundaries are correct. Lint passes. The problems are
naming collisions, dead code, dead decorators, duplicated constants and formatting.

## Verification

- `npm run verify -- -t lint -p lane-routing,rpc-handlers,shared`: exit 0, 3 of 3 tasks succeeded
  (cache hit).
- `npx prettier --check` on the changed files: **6 files fail** (see S1).

## Checks of the six key patterns

| # | Pattern | Result |
| --- | --- | --- |
| 1 | `@injectable()` and tsyringe injection | Partly. Decorators exist but the factories bypass them (S2). |
| 2 | Naming | Fails. Two different `SkillRankingRequest` and `SkillRankingResult` types (S3). |
| 3 | File location | Mostly good. Extra `skills-sh/di/` folder is not needed (M2). |
| 4 | Import direction | Good. `rpc-handlers` imports `lane-routing` through its barrel only. No reverse edge. |
| 5 | Error handling and logs | Partly. Caller swallows errors with no log (M3). |
| 6 | Zod usage | Partly. Dead schemas and duplicated JSON schema (S4). |

## Findings

### Serious

**S1 — formatting** · type: pattern
`lane-routing/.../skill-ranking-caller.service.ts`, `rpc-handlers/.../skill-ranking.service.ts`,
`skill-ranking.schema.ts`, `skill-ranking.types.ts`, `skills-sh/di/register.ts`,
`skill-recommendation.service.ts` fail `prettier --check`.
`skill-ranking.service.ts:143-144,176-200` and `skill-ranking.schema.ts:256-262` hold lines over
100 characters and packed object literals.
Fix: run `npx prettier --write` on the six files.

**S2 — dead decorators on factory-built services** · type: pattern
`skill-ranking-caller.service.ts:21-28` and `skill-ranking.service.ts:164-172` use
`@injectable()` and `@inject(...)`. Both classes are built with `new` in a factory
(`lane-routing/src/lib/di/register.ts:81-89`, `skills-sh/di/register.ts:15-27`).
tsyringe never reads the decorators, so they mislead the reader. The sibling
`ChildSettingRouterService` in `lane-routing` is factory-built and has no decorators.
Also `isOptional: true` in `skill-ranking.service.ts:168,170` has no effect, because the factory
passes `undefined` itself.
Fix: choose one. For `lane-routing` remove the decorators and follow `ChildSettingRouterService`.
For `rpc-handlers` use `container.register(SKILL_RANKING_SERVICE, { useClass: SkillRankingService })`
like `SKILL_RECOMMENDATION_SERVICE` and keep the decorators.

**S3 — same names, different shapes** · type: naming
`lane-routing/.../skill-ranking-caller.types.ts:11-26` exports `SkillRankingRequest` (flat, with
`key`) and `SkillRankingResult` (`{ items: Record<key,{order}> }`). `rpc-handlers/.../skill-ranking.types.ts:20-21`
exports types with the same names and a different shape (`items` record, `rankedBy`, `workspaceRoot`).
`skill-ranking.service.ts:199-200` bridges them with an ad hoc spread. A reader cannot tell which
type a function uses.
Fix: rename the `lane-routing` types to `SkillRankingCallerItem` and `SkillRankingCallerResult`
(the file name already says "caller").

**S4 — Zod schemas: dead code and duplication** · type: pattern
- `skill-ranking.types.ts:3-21`: `skillRankingRequestSchema` and `skillRankingResultSchema` have no
  importer (grep shows only the file itself). Only `skillRankingMethodSchema` is used, through its
  inferred type. Remove the two schemas or use them to validate the input at the service boundary.
- `skill-ranking.schema.ts:250-265`: `skillRankingJsonSchema` is a hand-written JSON schema that
  duplicates `skillRankingItemSchema`. The workspace uses Zod 4 (`zod` 4.6.5), which has
  `z.toJSONSchema`. A second copy can drift.
- The limit `140` appears three times (`schema.ts:242,260`, `types.ts:17`). Use one constant.
- `skillRankingItemSchema(...)` is rebuilt for each item inside the loop (`skill-ranking.service.ts:189`).
  This is acceptable for size, but the label set is the only variable. Keep it, but name the
  factory `createSkillRankingItemSchema` to match factory naming.

### Minor

**M1 — duplicated timeout constants and double deadline** · type: pattern
`skill-ranking.service.ts:146-148` defines `DECISION_TIMEOUT_MS = 3_000`. `lane-routing`
already owns `DECISION_REQUEST_TIMEOUT_MS = 3000` (`routing-constants.ts:117`), and the caller
service already races its own deadline (`skill-ranking-caller.service.ts:37-43`). The service
adds a second `withDeadline` around the same call. The session path also passes
`timeoutMs: SESSION_TIMEOUT_MS` to the runner and wraps it again with the same value (line 211,219).
Fix: remove the local 3 s constant and the outer wrapper for the decision path. For the session
path keep one deadline. Move `withDeadline` to a shared util if another file needs it.

**M2 — split DI registration** · type: structure
New folder `skills-sh/di/register.ts` holds one function that `lib/di/register.ts:30` calls from
`registerSkillServices`. The other skill services register inline in that function. Also line 26
registers a second alias (`SkillRankingService` class token via `useToken`); no consumer resolves
the class token.
Fix: register inline in `registerSkillServices` and delete the `skills-sh/di/` folder and the alias.

**M3 — silent catch in the caller** · type: pattern
`skill-ranking-caller.service.ts:128-130` swallows every error with no log, while the class holds
a `LaneRoutingLogger`. The service layer logs at `debug` (`skill-ranking.service.ts:203,223`).
The audit comment is correct, but a `debug` log gives the same trace for both layers.
Fix: `this.logger.debug(...)` in the catch, as in the service.

**M4 — long closures with mixed duties** · type: structure
- `rankSkillCandidates` is 105 lines. Question building (lines 53-75), caller timeout capping
  (78-91) and answer mapping (102-124) are separate steps inside one closure `rank`.
  Fix: extract `buildQuestions(items)`, `boundCallerTimeout(opened)` and `toRankingResult(items, outcome)`.
- `SkillRankingService.rank` defines the closures `pending` and `accept` that mutate the local
  `items` object. The two model passes (lines 196-205, 207-225) repeat one shape.
  Fix: extract one private method `runPass(method, produce)`.

**M5 — integration code in `recommendAnalysis`** · type: structure
`skill-recommendation.service.ts:158-186` adds a 30-line block (build request, call ranker, catch,
reorder) to an already long method. It also mutates results after sort
(`skills.forEach(... skill.rank = ...)`, line 218) and rebuilds string labels from indexes with
`Number(label)` (line ~181). `workspaceRoot` is optional, and a missing value silently skips
ranking.
Fix: extract private `rankCandidates(collected, detectedItems, workspaceRoot)` that returns the
ranking or `undefined`. Build the `rank` field in the object literal that is pushed.

**M6 — import order and comment placement** · type: pattern
`skill-recommendation.service.ts:22-24` adds imports after the type-only block, with a relative
`../../di/tokens` import placed between two local imports. The
`degradation-audit: reported` comment (line 168) sits above a `let`, not above the `catch` it
describes. The audit tool and readers look for it at the swallow site.
Fix: group imports; move the comment inside the `catch`.

## What is good

- Import direction: `rpc-handlers` -> `lane-routing` barrel only; the new exports are in
  `lane-routing/src/index.ts`.
- New tokens follow `Symbol.for('<Lib><Name>')` and the existing doc-comment style
  (`lane-routing/src/lib/di/tokens.ts:13-15`, `rpc-handlers/src/lib/di/tokens.ts:20-21`).
- Optional ports resolved with `isRegistered(token, true)` and explained in a comment.
- Error style: `catch (error: unknown)` with `String(error)`, matching house style.
- Per-item validation so one bad item does not discard others.

## Decisions

- Treated formatting as a finding because the repository runs Prettier in lint-staged. Reversible.
- Did not edit source (role rule).

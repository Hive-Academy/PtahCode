# G-Skills-Judge report

## Files changed

All four source files are under `libs/backend/rpc-handlers/src/lib/skills-sh/services/`.

- `skill-judge.types.ts` defines the local request and item inputs using the shared RPC contracts and the strict Setup snapshot type.
- `skill-judge.schema.ts` defines the envelope-only provider schema and local Zod parsers.
- `skill-judge.service.ts` implements the two stages, candidate assessments, per-item validation, and semantic Build grouping.
- `skill-judge.service.spec.ts` exercises the real harness runner and stream processor with a fake SDK query service and Decision caller.

## Plan items

- Lines 42–47 and 112–118. Kept stack order and candidate identities, recorded deprecated rejections before dispatch, passed the original RPC entry and evidence to Decision, and retained accepted Install verdicts and candidate rejection reasons.
- Lines 119–129 and 385–412. Sent all unresolved items through the run's strict Setup snapshot, with no tools or MCP, and bounded the run by the remaining RPC budget. Recorded the pair at the actual SDK submission and credited it only on a successful terminal with valid answers. Preserved Decision verdicts on Normal failure.
- Lines 419–440. Allowed malformed item fields through the transport envelope. Validated recognized IDs and outcomes independently, ignored malformed rejection entries, and sent reasonless or invalid Decision answers to Normal.
- Lines 441–450. Grouped shared Build refs by normalized ref, slug and description. Kept conflicting definitions and unreferenced outcomes distinct. Added the named backend regressions and the Normal-side pair matrix coverage.

## Checks

Commands ran sequentially with the repository verify lock through `node scripts/verify.mjs --exec`.

- `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-judge.service.spec.ts` passed all 19 tests. The first run surfaced a TypeScript narrowing issue in the skipped Decision result, which was fixed before the passing runs.
- `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json` reported only the two expected TS2739 integration errors. Both are missing `judge` and `analysisPair` at `handlers/setup-rpc.handlers.ts:647` and `skills-sh/services/skill-recommendation.service.ts:304`.
- `npx eslint` with the four changed paths passed.
- Scoped `ptah_get_diagnostics` timed out with all four files unchecked. The scoped native typecheck provided the compiler result.

## Decisions

- Take a strict Setup snapshot and pre-coalescing item IDs from the recommendation caller. Resolving again in the judge would let one request use two different settings snapshots, and assigning IDs after search would conflate duplicate detections. The existing runner accepts a resolved snapshot. The caller/service boundary can be changed together if their ownership changes.
- Keep Normal execution in the isolated scratch directory used by the previous ranker. Running from the workspace would give the SDK a different working directory even with tools disabled. The runner owns SDK cancellation through its timeout and the judge owns the outer deadline and result acceptance. If the outer deadline wins after the runner starts, the stage result returns immediately and the runner reports the cancellation when it settles. The scratch location can change independently of the public result.
- Treat distinct case-preserving consent keys with the same canonical candidate ID as ambiguous. Selecting either one automatically would associate a verdict with an indeterminate consent key. Exact duplicate candidates share one canonical record. This can be relaxed if the registry guarantees that differently cased consent keys refer to the same install target.
- Treat an SDK stream without a terminal result as a provider failure, consistent with the harness runner's failure broadcast. A successful terminal with malformed or missing output instead receives `invalid-output`. The service result exposes fixed failure categories and the runner's broadcasts supply the corresponding safe messages.

## Open items

- G-Skills-Rec-And-DI owns registration and exports. Bind `SKILL_JUDGE_SERVICE` to the injectable `SkillJudgeService`. Its constructor takes required `TOKENS.LOGGER`, optional `LANE_ROUTING_TOKENS.SKILL_RANKING_CALLER`, and optional `HARNESS_TOKENS.LLM_RUNNER`, in that order. Inject the new token into the recommendation service and call `judge({ workspaceRoot, rpcEntry, resolved, items })`. Each input item carries `itemId`, the original `item`, `registry`, optional `registryFailure`, and its `SkillShEntry[]` candidates. Export the service and request types alongside the token as needed.
- Recommendation/RPC integration owns strict Setup resolution before registry search, mapping failures to `SETUP_MODEL_INVALID`, assigning stable item IDs before term coalescing, and mapping `judge.counts` to the legacy `rankedBy` field (`decision-model` if any Decision verdict, otherwise `session-model` if any Normal verdict, otherwise `heuristic`). Pass the saved `analysisPair` independently.
- Independent review, the visible failure banner/badge assertion, and the cross-project integration checks remain with the coordinating session and their assigned lanes.

## Extra reads

- Read the plan's C1 amendment for precedence. It applies to the settings manager. Checked `task-description.md` for judge acceptance criteria and `CLAUDE.md` for the focused lane checks and shared verify lock.
- Checked `skill-recommendation.service.ts` and the consent-key expression in `analyze-skills.page.ts` for candidate identity and the legacy result boundary.
- Checked `rpc-setup.types.ts`, `rpc-agents.types.ts`, and the shared public entry point for stack and candidate types. Checked `workspace-llm-resolver.port.ts`, `internal-query-queue-timeout.error.ts`, and the lane-routing and agent SDK public entry points for the Setup snapshot, timeout error, and caller types.
- Checked `harness-llm-runner.service.spec.ts`, `skill-draft-generation.service.spec.ts`, `sdk-stream-processor.ts`, and the SDK message export in `claude-sdk.types.ts` for the production stream fixture. Checked `package.json` and ESLint config for local validation and lint conventions.
- Ptah AST outlined the ranker, runner and draft service before reading their implementation. Host skill discovery was unavailable. The supplied worktree was used for this lane's edits and checks.

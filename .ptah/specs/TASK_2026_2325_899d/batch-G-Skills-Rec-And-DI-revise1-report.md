# G-Skills-Rec-And-DI deadline regression revision

TASK_2026_2325_899d · `@ptah-extension/rpc-handlers`

## Cause

The deadline test already used Jest fake timers, but the real judge awaited native filesystem I/O at `libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-judge.service.ts:565`. Fake time could pass the Normal cap at RPC entry +65 s while `mkdtemp` was still pending. The timeout at lines 597–608 then won, and the abort/remaining-budget guard at line 567 prevented the runner from reaching `execute` when the I/O finally returned. Whether the native operation finished in the few event-loop turns between fake timers depended on real I/O scheduling. The recommendation service, judge, and ranking caller all use the same `Date.now()` clock domain.

## Fix and files changed

- `libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.spec.ts` controls the clock from a fixed epoch using modern Jest timers. This covers global `Date.now()`, `setTimeout`, and `performance.now()`. Scoped spies return resolved promises for scratch creation and cleanup, and teardown restores the spies and timers.
- The real `SkillRecommendationService`, `SkillJudgeService`, and `HarnessLlmRunner` still run through Normal's SDK `execute` boundary. The test checks one execution, at least 30 s remaining at execution and at queued provider submission, and the timestamp captured when the recommendation promise resolves. It continues to check the search outcomes, Normal cancellation and attribution, and disposal of the late stream.
- `skill-judge.service.ts:565,591` identify the I/O boundary controlled by the test. The guard and timeout at lines 567 and 597–608 are appropriate for production slow I/O. No production edit is needed.

## Plan items

- `implementation-plan.md:141` and the G-Skills-Rec-And-DI brief specify 30 items, 2 s pre-search, search cut off at +26 s, 500 ms assembly, and 3 s Decision. Normal reaches the SDK boundary at +29.5 s with 35.5 s remaining and submits after the 5 s queue with 30.5 s remaining. The test checks that the recommendation settles by +70 s on the same clock.

## Checks

- `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.spec.ts` passed three times against the final revision, with 39 tests passing on each run.
- The requested `npx jest --config libs/backend/rpc-handlers/jest.config.ts --coverage=false --maxWorkers=2 --runTestsByPath` run with the recommendation, judge, wizard generation RPC, and harness LLM runner specs passed all four suites and all 202 tests against the final revision.
- `npx eslint libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.spec.ts` exited 0 with no output.
- Scoped `ptah_get_diagnostics` returned unavailable because its TypeScript compiler had not completed within 45 s. The cache retry also returned unavailable.
- The preliminary revision also passed these checks. The final revision added the provider-submission budget assertion and retained the final count of SDK executions. Node emitted an ES-module loading warning for the Jest config without affecting the runs.

## Decisions

| Decision | Options considered | Evidence | Reversible |
| --- | --- | --- | --- |
| Control the filesystem boundary in the deadline test | Scoped promise-backed spies, real filesystem waits, production clock changes | The filesystem await was the nondeterministic boundary. D28 accepts the shared `Date.now()` clock, and waiting for wall-clock I/O would retain the dependency. | Yes |
| Retain the 3 s Decision stage double | Use the existing clock-controlled stage double or exercise the real ranking caller | The real ranking caller treats its 3 s request deadline as expired when remaining time reaches zero. The stage double preserves the plan's full 3 s successful Decision scenario and its four matched verdicts. The real caller's timing primitives are compatible with the same Jest clock. | Yes |
| Measure settlement at promise fulfillment | Read the clock from the settlement callback or after the final timer advance | The callback records actual virtual elapsed time and the assertion fails immediately if settlement is still pending at +70 s. | Yes |

## Open items

No production changes or fixes in other groups are required for this regression.

## Extra reads

- `skill-judge.service.ts` Normal dispatch and scratch handling, and `skill-judge.service.spec.ts` for existing filesystem setup.
- `libs/backend/lane-routing/src/lib/decision-model/` ranking caller, its spec, and Decision caller boundary. Also inspected the lane-routing public exports, routing constants, and fixed-request dispatch.
- `libs/backend/rpc-handlers/src/lib/harness/ai/harness-llm-runner.service.ts` for the SDK execute, provider-submission, and timer boundaries.
- `libs/backend/rpc-handlers/src/lib/handlers/file-view-rpc.handlers.spec.ts` for the isolated Jest filesystem spy convention, and `libs/backend/rpc-handlers/jest.config.ts` for the Jest transform.
- `decisions.md` D28 and targeted ranges and matches from `implementation-plan.md`. No prototype access.
- `.claude/skills/orchestration/SKILL.md` for lane workflow. `ptah_search_files` found no `AGENTS.md`, and a native `rg --files` fallback found none. An initial `ptah_ast_analyze` lookup for the ranking caller in the rpc-handlers directory returned ENOENT. `ptah_search_files` found the lane-routing file and its AST lookup succeeded.

# Batch R2+R3 report

## Changes

- Deleted `cli-tier-model-policy.ts` and its spec, and `cli-tier-catalog.service.ts` and its spec: withdrawn tier map.
- Reverted only the earlier tier catalog token and DI registration in `di/tokens.ts` and `di/register.ts`; both diffs are empty.
- Kept `CliModelInfo.isFallback` and Cursor curated flags; expanded Cursor adapter assertions for live and fallback rows.
- `cli-model-list.service.ts` now passes Cursor and OpenCode row provenance through; updated its spec for live and fallback Cursor rows, live OpenCode rows, and unchanged Codex/Copilot behavior.
- `agent-process-manager.service.ts`, `tracked-agent.ts`, and new `lane-model-log.ts` plus spec record bounded requested fields and emit one terminal model outcome per completion stamp using runtime telemetry evidence.

## Consumers of listForClassification

- `lane-model-listing.adapter.ts` maps row `isFallback` to `fallback` or `reported` provenance; no assumption that Cursor/OpenCode rows are always fallback.
- `skills-synthesis-rpc.handlers.ts` uses provider-reported entries for classification; it benefits from live rows and has no all-fallback assumption.
- Tests for both consumers mock the method; no other production consumer in `libs/` or `apps/`.

## Actual model evidence

- Cursor: SDK system or settled run model id in completed turn telemetry.
- OpenCode: observed `providerID/modelID` from stream events in completed turn telemetry.
- Codex: app-server event evidence model id in completed turn telemetry.
- Copilot: stream usage model id in completed turn telemetry.
- Claude: no reported model id found in its adapter segments; `unobserved`.
- Antigravity: `event.result.model` in stream telemetry. Pi: its telemetry may fall back to `options.model`, so the manager excludes Pi from actual-model capture. Grok and Claude: no reliable observed model id found. Placeholder `*/unknown` and `*/multi-model` are excluded. Selection and request never fill `actualModel`.

## Decisions

- Kept request > setting > native default resolution intact. Existing environment tests cover this precedence.
- Kept selected model and source only on the in-memory tracked lane; no public RPC or shared type changes.
- A terminal line is emitted once per completion stamp, including stop and timeout, through the shared completion signal path.

## Verification

`npm run verify -- -p @ptah-extension/cli-agent-runtime,@ptah-extension/rpc-handlers` ran once in foreground. Exit 1 after 573 seconds. Lint and typecheck: 4/4 tasks passed. Tests: cli-agent-runtime 93 suites passed, 87 failed; rpc-handlers 112 suites passed, 129 failed. The failures include an external in-progress `lane-routing/phase-plan.ts` import of missing `isSystemCliLane` from `candidate.types.ts` and the worktree Jest mapper referencing absent `node_modules/marked/lib/marked.umd.js` (present in root node_modules). These paths are outside this batch write set; no dependency install or rerun was performed.

## Extra files read

`implementation-plan.md`, `lane-model-listing.adapter.ts`, `skills-synthesis-rpc.handlers.ts`, `opencode-cli.adapter.ts`, `cursor-cli.adapter.ts`, `copilot-sdk.adapter.ts`, `claude-cli.adapter.ts`, `codex-lane-events.ts`, `pi-cli.adapter.ts`, `antigravity-cli.adapter.ts`, `grok-cli.adapter.ts`, `agent-turn-usage.types.ts`, `agent-spawn-environment.service.spec.ts`, and `.claude/skills/nestjs-backend-patterns/SKILL.md`.

## Round 2 (review fixes)

- Finding 3: Documented at the `spawnFromSdkHandle` tracking call that Ptah CLI lanes resolve the model through provider tier mapping; the model log covers system CLI lanes from `doSpawnSdk`.
- Findings 6 and 10: Moved telemetry evidence filtering and completion-stamp deduplication into `observedModelFrom` and `takeOutcomeLog` in `lane-model-log.ts`. Reported IDs are trimmed and cut to 128 characters; unavailable, empty, placeholder and Pi IDs are skipped. Pure helper tests cover every skip rule, selected/requested independence, and a later turn. Added one manager-level wiring test using the existing fake SDK handle; its local execution depends on the worktree Jest mapper for `marked`.
- Finding 11: OpenCode rows count as reported only for `provider/model` shaped IDs; notice text and ids without a slash are fallback. The service spec covers all three cases.
- Extra files read this round: `code-logic-review.md`, `agent-process-manager.service.spec.ts`, `cli-adapter.interface.ts`, and `libs/shared/src/lib/types/agent-turn-usage.types.ts` (read only).
- Verification: `npm run verify -- -p @ptah-extension/cli-agent-runtime,@ptah-extension/rpc-handlers` ran once in the foreground. Exit 1 after the scoped lint/typecheck and test phases. Lint and typecheck passed 4/4 tasks. Tests: cli-agent-runtime 93 passed, 87 failed; rpc-handlers 112 passed, 129 failed. Every failure block in the Nx terminal output had the known `Could not locate module marked mapped as ... node_modules/marked/lib/marked.umd.js` worktree error (174 FAIL/marked matches for cli-agent-runtime; 258 for rpc-handlers). `lane-model-log.spec.ts` and `cli-model-list.service.spec.ts` were among the passed suites; neither appears in the failure blocks. The new manager-level test is in `agent-process-manager.service.spec.ts`, which did not run locally because that suite hit the `marked` mapper error; CI must execute it.



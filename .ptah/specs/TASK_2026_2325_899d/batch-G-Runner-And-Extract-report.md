# G-Runner-And-Extract

## Files changed

All six files are under `libs/backend/rpc-handlers/src/lib/`.

- `harness/ai/harness-llm-runner.service.ts` and its spec.
- `handlers/settings-rpc.handlers.ts` and its spec.
- `skills-sh/services/skill-json-extract.ts` and its spec.

## Plan items

- Lines 99–108 and 398. The runner accepts a resolved workspace snapshot and publishes the configured pair. The synchronous SDK `onProviderSubmit` hook records the effective attempted pair. The used pair requires an SDK success terminal and successful runner completion.
- Lines 103–106 and 398. The runner forwards the SDK's raw result text and terminal. It emits safe completion messages and warning categories for provider failures, pre-submit errors, typed queue expiry, and runner deadlines. A deadline can occur with or without an attempted pair.
- Lines 107 and 434–436. The project-local extractor prefers a fenced JSON object, then scans for the first balanced object while respecting quoted braces and escapes. The judge owns envelope and per-item validation.
- Lines 75 and 266. Both Setup keys are denied by `settings:set`, which preserves the dedicated atomic write path. The spec exercises both keys through the registered RPC.

## Checks

- `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath <three assigned specs>` passed all 64 tests. The first run exposed an outdated resolver mock missing `resolveSetup`. The final run passed after updating the mock to the current port.
- `npx eslint <six assigned source and spec files>` passed.
- `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json` reported zero errors in the six assigned files. It exited with code 2 on the two pre-existing errors listed below.
- The three native checks ran under `node scripts/verify.mjs --exec`. Scoped `ptah_get_diagnostics` returned unavailable twice because the compiler check exceeded the tool's 45-second window.

## Decisions

- The runner retains the original exception for backend callers and uses fixed safe messages for lifecycle events. A new runner-specific error would change the caller contract and obscure the existing typed SDK queue error. The choice is reversible.
- A stream with no terminal produces a failure completion and returns its SDK output shape with the terminal omitted. The installed stream contract and the lane's success rule require an explicit success terminal. The choice is reversible.
- Fenced JSON takes priority over an earlier object in prose. For unfenced text the first brace-balanced span is authoritative, matching line 107. Envelope validation remains with the judge. The parser strategy is reversible.

## Open items

- G-Skills-Judge owns envelope and per-item validation and caller-level handling of the outer deadline race.
- `handlers/setup-rpc.handlers.ts:647` and `skills-sh/services/skill-recommendation.service.ts:304` each report TS2739 for missing `judge` and `analysisPair` on `WizardRecommendAnalysisSkillsResult`. The later owner groups must wire those fields. The previously noted auth-providers diagnostic did not appear in this run.
- The coordinator owns independent review and the project and host verification gates.
- This CLI lane had no skill-discovery tool available. The supplied batch brief governed implementation and checks.

## Extra reads

- Root `CLAUDE.md` and task carrier status for lane and worktree rules.
- Agent SDK public exports, `auth/workspace-llm-resolver.port.ts`, `internal-query/internal-query.types.ts`, `internal-query/internal-query.service.ts`, `errors/internal-query-queue-timeout.error.ts`, and `stream-processing/sdk-stream-processor{.types,}.ts` for the input contracts.
- Agent SDK `message-transform/result-message.transformer.ts`, `sdk-message-transformer.ts`, and `types/sdk-types/claude-sdk.types.ts`, plus the RPC handlers' `harness/streaming/harness-stream-broadcaster.service.ts`, to check terminal event handling.
- Shared `rpc-skill-judge.types.ts` and the operation tag in `rpc-harness.types.ts`, platform-core `file-settings-keys.ts`, and the vscode-core logger warning signature.
- Existing harness suggestion, document generation, skill generation, and subagent design caller snippets to check their output and callback use.
- Focused configuration and verification searches in `tsconfig.base.json`, `jest.preset.js`, `libs/backend/rpc-handlers/jest.config.ts`, and the root scripts.

# B7 report

## RPC wiring

- `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts`: `wizard:recommend-skills` parses project analysis, reads declared dependencies from the workspace root `package.json` (dependencies, devDependencies, optionalDependencies), and calls `SkillRecommendationService.recommend` with `SkillsShApiClient.search`.
- `wizard:search-skills` calls `SkillsShApiClient.search`.
- `wizard:get-project-guidance` passes parsed analysis to `ProjectGuidanceService.getGuidance` and returns facts plus `ownerDecisionPrompt`.

## Consent preview

- `wizard:preview-skills-for-consent` stages each `owner/repo/skill`, lists files, identifies script file extensions, reports `hasScripts`, and computes the same content hash used by install via `SkillConsentService`.
- `wizard:install-skills-with-consent` refuses a supplied consent hash that differs from newly staged content, before calling `skillsSh:install`. Existing stored consent can still authorize a matching script package when no new record is supplied.
- Limitation: `skillsSh:install` fetches again after the staged hash check, so a remote package change between staging and that separate fetch is not covered by this check.

## Analysis input path — Phase 3 requirement

- The setup wizard already calls `wizard:deep-analyze` and `wizard:load-analysis` from `libs/frontend/setup-wizard/src/lib/services/wizard-rpc.service.ts`. `wizard-analysis-state.ts` keeps the multi-phase result in frontend state.
- `wizard:recommend-skills` receives workspace dependencies directly from `package.json`, so backend has the tech stack without frontend analysis. Frontend must call this method to show recommended skills based on detected tech stack.
- Team builder integration: must call `wizard:recommend-skills` and `wizard:get-project-guidance` with workspace analysis (from `wizard:deep-analyze`/`wizard:load-analysis` if available), showing recommendations and guidance facts first, with free-text search as an additional option. This is Phase 3 responsibility (not Phase 5 gap).

## Contracts and guards

- `libs/shared/src/lib/types/rpc.types.ts` adds preview request/response, guidance analysis input, and guidance owner prompt.
- `setup-rpc.schema.ts` validates guidance analysis and preview skill IDs.
- The RPC allowlist guard and Electron RPC surface guard include the preview method. `libs/backend/vscode-core/src/di/surface-composition.spec.ts` does not exist in this checkout.

## Tests and verification

- Handler tests cover recommendation dependency forwarding with an `@nestjs/core` fixture, empty search, guidance delegation, preview hash/file output, and hash mismatch refusal. Existing service tests cover positive/negative skill matches and guidance facts.
- Requested command: `npm run verify -- -p @ptah-extension/rpc-handlers,@ptah-extension/agent-generation,@ptah-extension/shared,@ptah-extension/cli-engine -t lint,typecheck,test`.
- Header confirmed all four projects and both phases: `verify lint,typecheck (...) then verify test (...)`.
- Final result: pending at report writing; see terminal output for classification.

## Skill discovery

- Ptah skill search returned no local matching backend skill. The offered external skills were not installed or invocable in this CLI.

## Verification outcome and classification

- Full requested verify command completed with exit 1. Lint/typecheck phase: 6 succeeded, 2 failed (`rpc-handlers` and `cli-engine` typecheck). Both failures pointed to B7 analysis framework typing in `setup-rpc.handlers.ts`; the handler now calls `normalizeAgentOutput` before invoking the services.
- Full test phase: 1 succeeded, 3 failed. `rpc-handlers` included a B7 fixture path error (`libs/package.json`) and an old constructor call with seven rather than eight arguments; both are fixed. Its remaining widespread suite failures are from a missing worktree `node_modules/marked/lib/marked.umd.js` Jest mapping. `cli-engine` has the same `marked` mapping failure. `agent-generation` has two Windows symlink EPERM failures in `user-layer-reap.spec.ts`, unrelated to B7.
- After those fixes, direct Jest run of `setup-rpc-skill-install.spec.ts`, `setup-rpc-skills-stubs.spec.ts`, and `skill-services.spec.ts`: 3 suites passed, 16 tests passed.
- Ptah scoped diagnostics could not finish within its 45-second window and returned unavailable twice. Project typecheck follow-up is in progress.
- `libs/backend/cli-engine/src/lib/rpc/rpc-surface.spec.ts` also asserts the shared host serves the new skill methods and preview endpoint.

## Follow-up verification

- `npx nx typecheck @ptah-extension/rpc-handlers --parallel=1`: passed after normalization fix.
- `npx nx typecheck @ptah-extension/cli-engine --parallel=1`: passed after normalization fix.
- The full requested verification command was run before these fixes and remains recorded as failed for the reasons above. A second full run was not needed to classify the unchanged `marked` and Windows symlink test environment failures.
- Preview test includes a staged `run.sh` and verifies it appears in both the file list and detected script files. The updated install/preview spec passed again: 5 tests.

# PR #1335 CI and review fixes

## CI failures

- **ui-class-audit:** Replaced raw DaisyUI button, input, and textarea classes with `PtahButtonDirective`, `PtahInputDirective`, and `PtahTextareaDirective` in `analyze-done.page.ts:42`, `analyze-skills.page.ts:48`, and `project-skill-draft.component.ts:16-21`. Direct audit run reported zero tokens over baseline. No baseline or allowlist changes.
- **chat-ui spec:** Changed the expected route to `analyze/skills` in `generation-workflow-launcher.service.spec.ts:50`.
- **Done e2e:** Updated `onboarding-generate-visual.e2e.spec.ts:238-256` to assert the current Done page contract: selected project skills, guidance status, and next-step actions. The retired agent outcome assertions were removed. Added a skill-selection RPC fixture for this scenario.
- **Team builder e2e:** Updated both headings in `onboarding-proposal-visual.e2e.spec.ts:149,211` to the extracted review component's `Review skills` heading.
- **Other harness references:** Searched onboarding scenarios for retired `analyze/agents` and `analyze/generate` routes; none remain. Added a default `wizard:recommend-analysis-skills` response in `onboarding-analyze.fixtures.ts:156` for routes that load the skills page. Existing generation-run-state fixture methods remain used by guidance/generation scenarios.

## CodeRabbit threads

- `PRRT_kwDOPngTds63vFhZ` **fixed** — `analysis-storage.service.ts:699` verifies the loaded manifest still has the requested run ID.
- `PRRT_kwDOPngTds63vFhc` **fixed** — `stack-summary.extractor.ts:41` applies the 30-item combined cap after deduplication. Covered by a 28+2 unique item spec.
- `PRRT_kwDOPngTds63vFhg` **fixed** — `stack-summary.extractor.ts:66` accepts observed pattern headings only; the `Pattern Comparison` section is excluded.
- `PRRT_kwDOPngTds63vFhi` **fixed** — `stack-summary.extractor.ts:82` keeps multiword legacy names while removing trailing version text and parenthesized evidence. Covered by a spec.
- `PRRT_kwDOPngTds63vFhl` **fixed** — `skill-recommendation.service.ts:98` compares complete normalized catalog names and IDs. Covered by a multiword name spec.
- `PRRT_kwDOPngTds63vFho` **fixed** — `analyze-skills.page.ts:107-117` restores a saved analysis from the matching resumable generation checkpoint's analysis directory when the route has a run ID. Covered by a page spec. The retired generation stage itself is not resumed by the new skills flow.
- `PRRT_kwDOPngTds63vFhs` **fixed** — `analysis-step.store.ts:135-158` returns `superseded` for stale loads, and `analyze-workspace.page.ts:421` / `analyze-skills.page.ts:121` ignore them.
- `PRRT_kwDOPngTds63vFhu` **fixed** — `analyze-done.page.ts:76` filters available candidates by selected slugs in selected mode.
- `PRRT_kwDOPngTds63vFhz` **fixed** — `analyze-skills.page.ts:119-126` binds load errors to the workspace and route identity that initiated the request.
- `PRRT_kwDOPngTds63vFh4` **fixed** — `analyze-skills.page.ts:136` gives the recommendation RPC 75 seconds to cover the eight batches of eight-second searches.

## Earlier logic review

- **M1:** Already fixed before this pass: the missing-analysis message is set after reset; existing no-analysis spec passes.
- **m1:** Already fixed before this pass: malformed phase blocks are skipped, retaining valid items from the other phase; existing spec passes.
- **m2:** Already fixed before this pass: one-character terms are unmatched and two-character terms require full tokens; existing specs pass.
- **m4:** Already fixed before this pass: project-skill-draft resets on `kind:name` identity, not object reference.
- **Raw search error:** Already fixed before this pass: `searchFailures.reason` is a fixed `Search failed` or `Search timed out` string.

## Changed files

`libs/backend/agent-generation/src/lib/services/analysis-storage.service.ts`, `libs/backend/agent-generation/src/lib/services/wizard/stack-summary.extractor.ts`, `libs/backend/agent-generation/src/lib/services/wizard/stack-summary.extractor.spec.ts`, `libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.ts`, `libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.spec.ts`, `libs/frontend/chat-ui/src/lib/services/generation-workflow-launcher.service.spec.ts`, `libs/frontend/onboarding/src/lib/analyze/analysis-step.store.ts`, `libs/frontend/onboarding/src/lib/analyze/analysis-step.store.spec.ts`, `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts`, `libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.ts`, `libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.spec.ts`, `libs/frontend/onboarding/src/lib/analyze/analyze-done.page.ts`, `libs/frontend/onboarding/src/lib/analyze/analyze-done.page.spec.ts`, `libs/frontend/onboarding/src/lib/analyze/project-skill-draft.component.ts`, `libs/frontend/webview-e2e-harness/src/lib/scenarios/onboarding/onboarding-analyze.fixtures.ts`, `libs/frontend/webview-e2e-harness/src/lib/scenarios/onboarding/onboarding-generate-visual.e2e.spec.ts`, `libs/frontend/webview-e2e-harness/src/lib/scenarios/onboarding/onboarding-proposal-visual.e2e.spec.ts`.

## Checks and limits

- `npx ts-node --transpile-only tools/ui-class-audit/check-ui-classes.ts`: passed, zero tokens over baseline.
- `npx eslint <changed files>`: passed with 42 existing style warnings, zero errors.
- `npx tsc --noEmit --project` for onboarding, agent-generation, and rpc-handlers library configs: passed.
- Focused Jest: agent-generation extractor 7/7, rpc-handlers recommendation 5/5, onboarding 5/5 and focused skills-page 3/3 passed.
- Focused chat-ui Jest: could not start due to sandbox `esbuild spawn EPERM`; the changed expectation was not verified by Jest.
- Webview e2e harness `tsconfig.spec.json`: fails on unrelated existing `import.meta` module configuration and existing settings spec type errors. No errors were reported in changed onboarding files.
- Playwright was not run, as directed. The Done and team builder screenshots will change; visual snapshot baselines need coordinator review/update from real captures. No PNGs were generated.

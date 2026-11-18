## Root causes

1. **Incomplete registry entries reached recommendations.** `libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.ts:123` now validates entries; the previous loop accepted typed search results without runtime validation or nonblank checks. The renderer displays those fields directly. The separate CLI-output parser also explicitly creates empty descriptions (`libs/backend/rpc-handlers/src/lib/handlers/skills-sh-rpc.handlers.ts:894`), but Analyze uses the API client, not that parser. No fabricated description or content is substituted.
2. **Matching was collection, not selection.** The previous `recommendAnalysis` loop put every token match into a map keyed only by source/id. Different Angular/Playwright skills all survived. `skill-recommendation.service.ts:133` now selects one highest-install-score candidate per normalized technology, with stable id/source/name tie-breaking, then deduplicates installation identities and names globally.
3. **Versioned structured names broke both query and matching.** Structured extraction preserves names (`libs/backend/agent-generation/src/lib/services/wizard/stack-summary.extractor.ts:50`), unlike the legacy fallback. The saved profile supplied by the task has `Nx 24.0.0` at line 107. Previously the search received that literal string, while matching reduced it to `nx2400`, which cannot match an `nx` token. `skill-recommendation.service.ts:51,104,120` now removes trailing versions for query and matching. Nx's two-character token is supported; no kind gate exists. The extractor bounds summaries to 30 items, and the recommendation cap is 30 technologies. There is no global result cap; 40 earlier Angular registry hits cannot evict Nx (covered by test).
4. **The primary action excluded empty selection.** `libs/frontend/onboarding/src/lib/proposal/stack-skill-review.component.html:194` previously disabled the primary button for zero selected skills even though `libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.ts:166` already supports continuing without selection. The existing ghost Skip action means the exact reported “only re-run” display cannot be fully reproduced from this snapshot. The primary action is now visible and enabled after loading, including errors/empty results, and says Continue without skills. Re-run is an always-visible secondary action (`analyze-skills.page.ts:47`).

## Changes

| File | What changed | Acceptance criterion |
| --- | --- | --- |
| libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.ts | Zod validation of complete installable entries on both recommendation paths; normalize versioned technology names; deduplicate needs before cap; deterministic best candidate per need and global identity/name deduplication | A1, A2, A3, A5 |
| libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.spec.ts | Invalid-field, Angular/Playwright competition and tie order, cross-query duplicate, versioned Nx and earlier-hit-cap regression cases | A1, A2, A3, A5 |
| libs/frontend/onboarding/src/lib/proposal/stack-skill-review.component.html | Enable primary action with zero selected skills and label it Continue without skills | A4 |
| libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.ts | Keep re-run visible as a ghost secondary action | A4 |
| libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.spec.ts | Render real templates; verify primary button and guidance navigation for empty/error/deselected states, and selected preview/consent/install navigation; isolate wizard service dependency | A4, A5 |

## Checks run

- `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.spec.ts` — PASS, 1 suite / 13 tests. `.ptah/tmp/backend-jest.log`.
- `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.spec.ts` — initial attempt failed before tests: root Jest mapping points to missing worktree-local node_modules/marked. After mocking the unrelated setup-wizard service barrel, PASS, 1 suite / 7 tests, using the real page/review templates. `.ptah/tmp/frontend-jest.log`.
- `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json` — PASS, exit 0, 0 diagnostics (`.ptah/tmp/backend-tsc.log`).
- `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.spec.json` — PASS, exit 0, 0 diagnostics (`.ptah/tmp/backend-spec-tsc.log`).
- `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json` — PASS, exit 0, 0 diagnostics (`.ptah/tmp/frontend-tsc.log`).
- `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.spec.json` — FAIL, exit 2, 12 diagnostics in untouched files: ready/onboarding-ready-host.guard.spec.ts:14 (argument count), shell/onboarding-workspace.store.spec.ts:87 (never callable), and 10 BigInt target diagnostics in shared capability-id-codec.ts, attention-identity.ts and worker-protocol pairing-code.ts. No diagnostics name a changed file (`.ptah/tmp/frontend-spec-tsc.log`).
- `npx eslint libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.ts libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.spec.ts libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.ts libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.spec.ts libs/frontend/onboarding/src/lib/proposal/stack-skill-review.component.html` — PASS, exit 0, 0 errors / 10 accessibility-modifier warnings on existing page members. Nx module-boundary rule skipped because no cached project graph exists (`.ptah/tmp/eslint.log`).
- `git diff --check` — PASS.
- Ptah diagnostics — unavailable: tool's TypeScript check exceeded 45 seconds; native focused tsc is the fallback.

## Decisions

- **Validation:** drop incomplete catalog entries instead of inventing descriptions or downloading every skill's content. Evidence: renderer requires descriptive entries and consent already fetches/verifies content before installation. The install source plus skill id is the registry contract; recommendation does not certify downloaded content. Reversible.
- **Best means install score:** retain the existing logarithmic install-count score and exact technology-token matching; resolve ties by id, source, then name. Alternatives were new heuristic relevance scoring or multiple choices per technology. Stable, minimal and reversible.
- **Normalization:** remove trailing numeric versions consistently for all technologies rather than special-case Nx. Keep original stack name in evidence and detected items. Registry availability is not established by a live request: deterministic stubbed Nx response verifies the code defect and the fix. No fallback Nx skill is fabricated. Reversible.
- **Shared review component:** allow its existing continue output for empty selection; Analyze already routes that to guidance. Preserve consent for selected skills and existing Skip action. Reversible.
- **Skills/tool fallback:** CLI-native skill discovery/loading is unavailable. Read local angular-frontend-patterns and ui-ux-designer SKILL.md instead. Initial Ptah AST/dependents attempts returned missing-argument errors for filePath. Retrying with file produced a successful AST parse (0 error nodes), while dependents reported its graph still building; targeted native reads/searches were the fallback. No new design is introduced; button hierarchy follows the existing neighboring onboarding UI.

## Extra reads

- `plugins/ptah-angular/skills/angular-frontend-patterns/SKILL.md` and `plugins/ptah-core/skills/ui-ux-designer/SKILL.md` — mandatory skill guidance fallback.
- `libs/backend/rpc-handlers/jest.config.ts` and `libs/frontend/onboarding/jest.config.ts` — necessary focused test configuration. No unrelated production source was read.
- `D:/projects/ptah-extension/.ptah/analysis/ptah-extension/01-project-profile.md:107` — read-only verification of the Nx example explicitly referenced in the task.
- Directory/file listings, git status/diff, dependency existence and process status were inspected; no files outside this worktree were modified.

## Not done / open points

- Frontend spec-project TypeScript check is not green due to the 12 diagnostics above. Unrelated files were not edited.

- Browser screenshot verification is unavailable: Ptah reports no connected browser session, and starting build/serve/dev/e2e is explicitly prohibited. Real Angular templates were rendered in Jest; no claim of browser visual quality is made. Compare in Electron against the existing onboarding button hierarchy: primary Continue/Review and ghost Re-run/Skip.
- No live registry request was needed; Nx registry availability remains external. Failed or empty searches retain the forward path.
- No host/IPC/DI changes; Electron renderer and shared backend remain compatible with CLI composition. No commits or prohibited verification targets run.




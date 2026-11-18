# Review fixes: TASK_2026_2260_f6dc

All findings were confirmed against the existing uncommitted code before editing. All eight are fixed within the permitted source/spec scope. The original changes to the shared review template and Team Builder page/spec are retained. No shared RPC, host composition, IPC, provider CLI, or CLI-engine changes were needed. `fix-report.md` was read only and was not rewritten.

## Findings and proof

Paths below use these abbreviations:

- **B**: `libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.ts`
- **BS**: the adjacent `skill-recommendation.service.spec.ts`
- **A**: `libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.ts`
- **AS**: the adjacent `analyze-skills.page.spec.ts`

| Finding | Status | Change and evidence | Regression spec |
| --- | --- | --- | --- |
| F1 | fixed | B:133 validates identity and required metadata without rejecting blank descriptions. B:146 supplies factual `source - installs` display text. B:155 prefers described matching candidates before install ranking, with undescribed candidates retained as fallbacks. B:135 and B:223 debug-log invalid rows through the injected Logger. Description absence never alone creates an unmatched item. | BS:36 tests 50 rows with descriptions on only the first eight, and 50 entirely blank descriptions; the actual match is at row 10. BS:49 proves described preference and debug logging. BS:68 still rejects blank names/sources/skill IDs. |
| F2 | fixed | B:56 removes version tokens and parenthesized annotations and takes the primary term of composites. B:80 and B:90 normalize C++ to cpp for queries and candidate token matching. Original names remain evidence. | BS:13 table covers Node.js 24.x, Angular ~22.2, TypeScript 6.0.3 (exact pin), Python 3.12rc1, C++ 20, Astro 7 + Starlight, ESLint composite, better-sqlite3 composite, Slack composite, D3, Vue 3, Nx 24.0.0 and Tailwind CSS 3.4. Each asserts both query and returned match. |
| F3 | fixed | B:100 deduplicates needs with dependencyKeyword(technologyName(name)); registry query and candidate matching use this same key. | BS:28 expects exactly one query and one skill for Nx 24.0.0 plus @nx/angular. |
| F4 | fixed | B:167 appends the covered item's original name to the chosen recommendation's evidence when every matching candidate is already used. This uses the existing response contract. Free candidates are still preferred when available. | BS:102 corrects the silent-drop expectation with evidence Angular, Playwright. BS:112 checks Angular/Angular SSR shared coverage in both item orders. BS:124 retains next-free-candidate behavior. |
| F5 | fixed | A:150 invalidates the manual-search generation and clears searching/searchError before starting a rerun. Late manual responses cannot repopulate results or leave the spinner stuck. | AS:43 starts a deferred manual search, reruns recommendations, then resolves the stale response; searching stays false and stale results are ignored. |
| F6 | fixed | A:75 adds private writable/read-only public leaving state; A:220 guards before tab creation and releases the guard in finally. A:50 binds review busy state and A:47 disables rerun during navigation. | AS:63 defers navigation, invokes Continue twice, and proves one tab, one navigation, a disabled primary button, and guard release. |
| F7 | fixed | A:47 disables rerun without a completed analysis; A:77 derives availability from the loaded run. A:48 and A:138 announce selection reset after a successful rerun. This chooses the review's explicit-message option instead of changing selection semantics. | AS:148 verifies the no-analysis rerun button is disabled. AS:83 verifies the visible reset announcement after rerun. |
| F8 | fixed | B:41 explicitly validates and retains id, slug, sourceType, url and installUrl. Both service paths use this schema. Trimming required identity fields remains intentional. | BS:59 returns a fully populated registry entry through recommendAnalysis and recommend and asserts exact field preservation. |

## Checks

Only focused checks were used, one heavy process at a time. No npm install, Nx commands, npm run verify, builds, servers, e2e, packaging, or git mutation commands were run.

1. `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.spec.ts libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-services.spec.ts`
   - Initial run: PASS, 2 suites / 41 tests. Final run after adding both-order coverage and changing the fallback separator: PASS, exit 0, 2 suites / 43 tests.
2. `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.spec.ts libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts`
   - Initial run: PASS, 2 suites / 25 tests. Final run after making the new notice signal read-only: PASS, exit 0, 2 suites / 25 tests.
3. `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json`
   - PASS, exit 0.
4. `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.spec.json`
   - FAIL, exit 1; 12 diagnostics, all outside changed files: onboarding-ready-host.guard.spec.ts:14 (expected 3 arguments, got 2), onboarding-workspace.store.spec.ts:87 (never is not callable), capability-id-codec.ts:289/290, attention-identity.ts:20/22/24 (five diagnostics), pairing-code.ts:55/57/61 (BigInt literals below ES2020). These match the pre-existing errors recorded in the original fix report. No diagnostic points to the changed files.
5. `npx eslint libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.ts libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.spec.ts libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.ts libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.spec.ts libs/frontend/onboarding/src/lib/proposal/stack-skill-review.component.html libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.ts libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts`
   - PASS, exit 0; 0 errors, 36 explicit-member-accessibility warnings (existing page style, including three newly exposed read-only/derived signals).
6. `git diff --check`
   - PASS, exit 0; only Git CRLF-to-LF informational warnings.

## Tool/skill and visual evidence

CLI-native skill discovery/loading is unavailable in this lane. The local `plugins/ptah-angular/skills/angular-frontend-patterns/SKILL.md` and `plugins/ptah-core/skills/ui-ux-designer/SKILL.md` were read as the fallback. This is a behavior correction within the existing wizard design, not a new design/prototype phase.

Ptah AST analysis succeeded for the backend service with zero parse errors. Ptah dependents returned the two callers/export/DI/spec consumers, with explicitly partial graph coverage. Native focused source reads and TypeScript/Jest checks supplied the remaining evidence. The user's exact focused-check restrictions take precedence over the general template-verify command.

Ptah browser status reported no connected session. A screenshot attempt captured an empty browser page, not the running renderer. No Electron visual-quality claim is made: comparison against the existing onboarding reference (primary Continue, ghost rerun, disabled busy action) remains unverified in a real browser. Real Angular templates and button interactions were rendered in Jest. No server was started because the task prohibits it.

## Open risks / limits

- Frontend project-wide spec typing remains blocked by the 12 unrelated diagnostics above.
- Live Electron/browser visual inspection remains outstanding; the task permits no app launch targets. No standalone HTML artifact was created.
- Registry fixtures reproduce the documented API enrichment limit; no live network availability claim is made.
- Candidate assignment remains greedy by detected-item order. This fix records shared coverage rather than introducing a global optimizer, as permitted for F4. Composite stack names use a sensible primary term; secondary composite technologies are not expanded into new needs.
- Rerun still resets selection to fresh recommendations, now with an explicit visible announcement.

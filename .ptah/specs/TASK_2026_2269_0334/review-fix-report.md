# Review fixes - TASK_2026_2269_0334

All eight findings accepted and corrected within the authorized write set. No backend or RPC changes. Coordinator alert tone corrections remain intact.

Code paths below are relative to `libs/frontend/onboarding/src/lib/`.

| Finding | Status | Correction location | Regression evidence |
| --- | --- | --- | --- |
| F1 | Fixed | `proposal/stack-coverage.ts:20` | `stack-coverage.spec.ts`: matches comma names before prefixes, with trimmed case-insensitive names. Checks `Jest, Vitest` against `Jest`, and `Angular Material` against `Angular`; coverage uses the complete detected-name dictionary, and raw-text fallback remains. |
| F2 | Fixed | `proposal/stack-skill.store.ts:91`; `proposal/stack-skill-review.component.ts` totalSkills | `analyze-skills.page.spec.ts`: keeps selected search cards visible and removable after a new search and Clear in bar layout. Selected entries are retained in the search result union; names and cards remain available and counts include selected keys. The test suppresses the rail list by exercising its bar branch and deselects using the retained card. |
| F3 | Fixed | `proposal/stack-skill-review.component.html:94`; `stack-skill-review.component.ts:71`; both hosts' loadError state | `team-builder-skill-review.component.spec.ts`: renders action failures once without a destructive retry and types load errors separately. `analyze-skills.page.spec.ts`: preview failure clears previewing and preserves selection. No display-text comparisons select error actions. |
| F4 | Fixed | `analyze/analyze-skills.page.ts:377` | `analyze-skills.page.spec.ts`: closes consent and returns focus on navigation; successful installation followed by navigate(false) returns to review with selection intact. |
| F5 | Fixed | `analyze/analyze-skills.page.ts:361` | `analyze-skills.page.spec.ts`: parameterized cancel, partial install, thrown install, and navigation tests verify focus returns to the primary and selection survives. |
| F6 | Fixed | `proposal/team-builder-start.page.ts` launchStatus; `team-builder-start.page.html` launch status binding | `team-builder-start.page.spec.ts`: renders launching chat as one clean status string, with exact trimmed textContent. Copy lives in a computed so formatting cannot split the literal. |
| F7 | Fixed | `proposal/skill-selection-rail.component.html:12`; `stack-skill-review.component.html:111`; `stack-coverage-strip.component.html:35`; review activeItemName | Rail spec verifies selection and stack coverage share one polite region and say stack items. Review spec verifies registry placeholder. Coverage strip spec distinguishes same-name items with different kinds. Filter keys are kind:name; card highlights and visible filter messages retain plain names. |
| F8 | Fixed | `proposal/stack-skill.store.ts:14`; both hosts and their specs | `analyze-skills.page.spec.ts`: exposes read-only store signals with methods as the only public writers. All 18 writable signals are private; public signals use asReadonly. Both hosts, aliases and template event bindings call methods. Source search across libs found no additional StackSkillStore consumers outside this write set. |

## Files changed in this revision

- `proposal/stack-coverage.ts`, `stack-coverage.spec.ts`
- `proposal/stack-skill.store.ts`
- `proposal/stack-skill-review.component.ts`, `.html`
- `proposal/stack-coverage-strip.component.html`, `.spec.ts`
- `proposal/skill-selection-rail.component.html`, `.spec.ts`
- `proposal/team-builder-start.page.ts`, `.html`, `.spec.ts`
- `proposal/team-builder-skill-review.component.spec.ts`
- `analyze/analyze-skills.page.ts`, `.spec.ts`

Prettier was applied to all task files in the write set; already formatted files were unchanged. UTF-8 decoding, absence of BOM, files under 700 lines, mojibake and multiline template string literal audits passed. User-facing ellipses use U+2026; launch text remains one literal after formatting. Alert tones were checked against the UI component's PtahAlertTone union; warning/error are valid. Existing field, button, skeleton and state-panel inputs were inspected against their UI definitions.

## Checks

Commands run from the supplied worktree, with one native heavy check at a time in the final verification pass:

```powershell
npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.spec.ts libs/frontend/onboarding/src/lib/proposal/skill-pick-card.component.spec.ts libs/frontend/onboarding/src/lib/proposal/skill-selection-rail.component.spec.ts libs/frontend/onboarding/src/lib/proposal/stack-coverage.spec.ts libs/frontend/onboarding/src/lib/proposal/stack-coverage-strip.component.spec.ts libs/frontend/onboarding/src/lib/proposal/team-builder-skill-consent.component.spec.ts libs/frontend/onboarding/src/lib/proposal/team-builder-skill-review.component.spec.ts libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts libs/frontend/onboarding/src/lib/proposal/unmatched-stack-list.component.spec.ts
npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json
npx eslint <all changed/new task .ts, .html and .css files>
npx prettier --write <all changed/new task .ts, .html and .css files>
```

The file arrays are the union of `git diff --name-only -- libs/frontend/onboarding/src/lib` and `git ls-files --others --exclude-standard -- libs/frontend/onboarding/src/lib`, filtered to those extensions. This includes all Batch A/B task files, not just this revision.

| Check | Final result | Log |
| --- | --- | --- |
| Jest | Exit 0; 9 suites, 88 tests passed (55.24 s) | `.ptah/tmp/review-fix-jest.log` |
| TypeScript | Exit 0; no diagnostics | `.ptah/tmp/review-fix-tsc.log` |
| ESLint | Exit 0; 0 errors, 2 ignored CSS-file warnings | `.ptah/tmp/review-fix-eslint.log` |
| Prettier | Exit 0 | `.ptah/tmp/review-fix-prettier.log` |

Earlier iterations exposed the team host's writable-signal aliases and an ineffective bar test setup; both were corrected before the final passing run. PowerShell wrapped Jest stderr as NativeCommandError text, while the actual Jest process exit code was 0 and its test summary was successful.

## Decisions

- Retain selected search entries in the existing results list rather than introduce another UI group. This uses the existing cards at every width and preserves their accessible removal controls. Reversible.
- Use explicit loadError and backOnLoadError inputs rather than comparing error copy. Hosts decide whether retry or Back applies. Reversible.
- Use kind:name for filter identity, and derive the plain name for display and highlighting. Reversible.

## Not done

- Electron screenshot/geometry verification: no active browser session was available (`ptah_browser_status`: Connected No); lane instructions forbid starting build/serve/dev/e2e/package. No rendered visual-quality claim is made. Coordinator must verify Electron layout against the approved prototype.
- Angular template gate remains coordinator-owned; this lane did not run npm run verify or Nx. Jest compiled the affected templates and input values were checked against source.
- Host skill discovery/loading is unavailable in this lane; the role's named frontend/design skills could not be loaded. Repository guidance and approved task inputs were used directly.
- Scoped ptah_get_diagnostics was attempted twice and returned unavailable after 45 seconds, with checks continuing in the background. Native tsc is the reliable typecheck evidence below; no clean Ptah diagnostics claim is made.

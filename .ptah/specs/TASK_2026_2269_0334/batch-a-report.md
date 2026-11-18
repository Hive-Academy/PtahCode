# Batch A report

Created the four presentational components, pure coverage/evidence/count helpers, and focused behaviour specs. Existing source files were not edited. Batch B can import directly from the new proposal files; no barrel changes were made.

## Files created

Under `libs/frontend/onboarding/src/lib/proposal/`:

- `stack-coverage.ts`, `stack-coverage.spec.ts`
- `skill-pick-card.component.ts`, `.html`, `.spec.ts`
- `stack-coverage-strip.component.ts`, `.html`, `.spec.ts`
- `skill-selection-rail.component.ts`, `.html`, `.spec.ts`
- `unmatched-stack-list.component.ts`, `.html`, `.spec.ts`

## Public APIs

All components are standalone, OnPush, and use signal inputs and outputs. Inputs below are optional with the listed default unless marked required. No component injects an RPC, store, or router; the existing draft child retains its existing behaviour.

| Export / selector | Inputs | Outputs | Exported types |
| --- | --- | --- | --- |
| `SkillPickCardComponent` / `ptah-skill-pick-card` | `skill: SkillShEntry` required; `coveredItems: string[] = []`; `rawEvidence: string \| null = null`; `selected = false`; `highlightItem: string \| null = null`; `disabled = false` | `toggled: void` | None |
| `StackCoverageStripComponent` / `ptah-stack-coverage-strip` | `items: StackCoverageItem[] = []`; `activeItem: string \| null = null`; `loading = false` | `filterChanged: string \| null` | Imports `StackCoverageItem` from `./stack-coverage` |
| `SkillSelectionRailComponent` / `ptah-skill-selection-rail` | `selected: SelectedSkillItem[] = []`; `total = 0`; `coveredCount = 0`; `stackCount = 0`; `busy = false`; `loading = false`; `previewing = false`; `previewScriptCount: number \| null = null`; `layout: 'rail' \| 'bar' = 'rail'` | `primary: void`; `skip: void`; `removed: string` (canonical key) | `SelectedSkillItem { key: string; name: string }` |
| `UnmatchedStackListComponent` / `ptah-unmatched-stack-list` | `items: StackSummaryItem[] = []`; `searching = false` | `searchRequested: string` (item name) | None |

The rail output is **`primary`**, per the batch instruction overriding the design table's `continueRequested`. Batch B must reset `previewScriptCount` to null whenever selection changes; the presentational rail does not retain preview state. Place the rail in the shell's grid area and choose `layout` according to its container width. Rail mode limits its height to `100dvh - 3rem`, keeps header/footer outside the only scrolling region (selected list), and remains sticky at `top-6`. Bar mode is sticky at the bottom and uses `ptah-form-actions`.

| Pure export in `stack-coverage.ts` | Signature / shape |
| --- | --- |
| `StackCoverageItem` | `{ name: string; kind: StackSummaryItem['kind']; evidence: string; state: 'covered' \| 'available' \| 'none' \| 'failed'; selectedCount: number; totalCount: number }` |
| `buildStackCoverage` | `(detected: readonly StackSummaryItem[], unmatched: readonly StackSummaryItem[], failures: readonly { item: string; reason: string }[], recommendations: readonly SkillRecommendation[], selectedIds: ReadonlySet<string>): StackCoverageItem[]` |
| `splitStackEvidence` | `(evidence: string, detected: readonly StackSummaryItem[]): { coveredItems: string[]; rawEvidence: string \| null }` |
| `formatInstallCount` | `(installs: number): string` |

Coverage uses the canonical selection key `${source}/${skillId}`. One skill can cover multiple stack items; repeated recommendations do not inflate counts. Installed skills count normally. Evidence matches exact comma-separated names, case-insensitively, and preserves detected spelling. When nothing matches, raw text is retained. The formatter returns `12.4k` for 12400 and `New` for zero.

## Checks

All three permitted lane checks passed. Logs are under `.ptah/tmp/batch-a-*.log`.

| Command | Result |
| --- | --- |
| `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/onboarding/src/lib/proposal/stack-coverage.spec.ts libs/frontend/onboarding/src/lib/proposal/skill-pick-card.component.spec.ts libs/frontend/onboarding/src/lib/proposal/stack-coverage-strip.component.spec.ts libs/frontend/onboarding/src/lib/proposal/skill-selection-rail.component.spec.ts libs/frontend/onboarding/src/lib/proposal/unmatched-stack-list.component.spec.ts` | PASS: 5/5 suites, 26/26 tests, 0 snapshots, 53.783 s. Command wrapper exit 0; Jest summary confirms all tests passed. Log: `batch-a-jest.log`. |
| `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json` | PASS: exit 0, no diagnostics. Log: `batch-a-tsc.log`. |
| `npx eslint libs/frontend/onboarding/src/lib/proposal/stack-coverage.ts libs/frontend/onboarding/src/lib/proposal/stack-coverage.spec.ts libs/frontend/onboarding/src/lib/proposal/skill-pick-card.component.ts libs/frontend/onboarding/src/lib/proposal/skill-pick-card.component.html libs/frontend/onboarding/src/lib/proposal/skill-pick-card.component.spec.ts libs/frontend/onboarding/src/lib/proposal/stack-coverage-strip.component.ts libs/frontend/onboarding/src/lib/proposal/stack-coverage-strip.component.html libs/frontend/onboarding/src/lib/proposal/stack-coverage-strip.component.spec.ts libs/frontend/onboarding/src/lib/proposal/skill-selection-rail.component.ts libs/frontend/onboarding/src/lib/proposal/skill-selection-rail.component.html libs/frontend/onboarding/src/lib/proposal/skill-selection-rail.component.spec.ts libs/frontend/onboarding/src/lib/proposal/unmatched-stack-list.component.ts libs/frontend/onboarding/src/lib/proposal/unmatched-stack-list.component.html libs/frontend/onboarding/src/lib/proposal/unmatched-stack-list.component.spec.ts` | PASS: exit 0, no reported lint violations. Nx warned 10 times that no cached project graph exists and the module-boundary rule was skipped. Log: `batch-a-eslint.log`. |

The required scoped `ptah_get_diagnostics` call was made for all five new production TypeScript files after edits. It returned **Unavailable**, with all five unchecked: its compiler job exceeded the 45-second response window and continued in the background. This is not a clean diagnostics result. The explicit native `tsc` check above completed successfully and is the compiler evidence for this batch.

TestBed tests exercised the real templates, output events, checkbox accessibility, install-count/fallback text, installed and disabled cards, evidence chips, filtering/pressed state, skeleton loading, rail labels and busy states, both layouts, every script helper variation, and the real framework/pattern draft children. Pure tests cover multi-item evidence, unmatched and failed items, installed recommendations and duplicate counts.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Failure state takes precedence over coverage state, while retaining counts | Failure first; covered first | Design states failed searches must show the need glyph, including a rerun retaining old recommendations | Yes |
| Include unmatched items absent from detected, preserving detected order and deduplicating by kind/name | Detected only; union | Both input arrays are normative; all no-match items must remain visible | Yes |
| Deduplicate recommendations by canonical skill key for counts | Count rows; count distinct skills | Selection is a set of canonical keys; several-item evidence must not duplicate skills | Yes |
| Use native HTTPS marketing anchors with `_blank`, `noopener noreferrer`, and stopped propagation | Native anchor; injected service | Presentational-only contract; Electron `window-guards.ts` handles new windows through `openExternalSafely` | Yes |
| Use theme tokens and Tailwind classes without new CSS | Additional CSS; existing utility classes | Required layouts and states fit existing controls/utilities; shell owns container breakpoints in Batch B | Yes |
| Export evidence helper as `splitStackEvidence`, count helper as `formatInstallCount`, and selected-row interface as `SelectedSkillItem` | Other names | Spec names only `buildStackCoverage`/`StackCoverageItem`; explicit descriptive exports support Batch B | Yes |

## Extra reads

Beyond the task's design spec, prototype, parity inventory, existing review TS/HTML, and draft component:

- Root `CLAUDE.md`; task `task.md` (read only).
- UI controls: `badge/badge.directive.ts`, `badge/badge.types.ts`, `badge/status.component.ts`, `button/button.directive.ts`, `form-controls/checkbox.directive.ts`, `foundation/skeleton.component.ts`, `foundation/alert.component.ts`, `patterns/form-actions/form-actions.component.ts`.
- UI public export barrels: `ui/src/index.ts`, `foundation/index.ts`, `patterns/index.ts`.
- Shared contracts: `rpc.types.ts` recommendation declaration, `rpc/rpc-agents.types.ts` skill declaration, `rpc/rpc-setup.types.ts` stack declarations.
- Sibling conventions: `proposal/team-builder-skill-review.component.spec.ts`, `analyze/analyze-done.page.ts`.
- `apps/ptah-electron/src/windows/window-guards.ts` external-link guard.
- `libs/frontend/onboarding/jest.config.ts`.
- Workspace file discovery and targeted text searches for external-link handling and relevant exports.

## Not done

- Batch B page/store integration, responsive container routing, and public barrel changes are outside this batch.
- Real Electron screenshots and dark/light runtime parity remain for the coordinator after integration. No Electron host was started; the lane prohibits build/serve/e2e and existing files cannot be rewired in this batch. Behaviour tests render the actual components, but do not establish visual parity.
- Skill discovery/loading is unavailable: no host skill catalogue or skill read/load tool is exposed. `angular-frontend-patterns` and `ui-ux-designer` could not be loaded. Implementation follows the explicit batch/framework rules and existing source; no missing skill instructions were reconstructed.
- Coordinator must run renderer template verification; this lane is explicitly prohibited from `npm run verify`.

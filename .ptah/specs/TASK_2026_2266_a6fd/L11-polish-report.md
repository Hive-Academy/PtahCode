# L11 providers lanes polish

Implemented all eight requested changes. No commits, pushes, stashes or reverts were performed.

## Findings

1. `libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.component.html:301`: use the template `place` context to show row effort only when a value is saved. `hasEffort` remains unchanged. The Model / Effort fact is now present at every detail tier (`:455`), retaining the unset editor, effort aria-label and `lanes-effort-na`. `lanes-table.component.ts:246` and `:303` now allow detail popovers whenever that lane is expanded; both previous guards restricted them to collapsed tables.
2. `lanes-table.component.css:221`: detail model/effort values and triggers wrap instead of clipping or ellipsizing. Other facts already allow wrapping.
3. `lane-row-identity.component.ts:109` and `:144`: compact rows omit the version/provider subtitle and allow the full lane name to wrap. Version and provider facts remain in expanded detail; the row version testid is preserved.
4. `lane-row-identity.component.ts:95`: omit the artificial nonbreaking-space subtitle and center identities without a secondary line.
5. `lanes-table.component.css:238`: position the row action group at the Status cell edge with reserved space for the menu. Its right edge no longer depends on status text width; recovery actions remain available.
6. `libs/frontend/chat/src/lib/settings/providers/provider-connection-card.component.ts:143`: render the provenance separator inside the following usage segment, only when both segments exist. This also prevents a separator being stranded after CLI subscription when usage wraps onto the next line. Zero usage remains meaningful and visible.
7. `lanes-table-detail.component.css:8`: give wide capabilities intrinsic width for all five chips; `:83` uses facts/actions followed by a full-width capabilities row from 785 to 1400 pixels. The compact tier retains stacked zones.
8. `lanes-table.component.css:79`: widen the compact Order column to 3rem and remove the special reduced first-header padding, giving Order the same padding as adjacent cells.

Paths in findings 2-5 and 7-8 are under `libs/frontend/chat/src/lib/settings/ptah-ai/`.

## Changed files

Production:
- `libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.component.html`
- `libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.component.css`
- `libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.component.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table-detail.component.css`
- `libs/frontend/chat/src/lib/settings/ptah-ai/lane-row-identity.component.ts`
- `libs/frontend/chat/src/lib/settings/providers/provider-connection-card.component.ts`

Specs:
- `libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.visual.component.spec.ts`
- `libs/frontend/chat/src/lib/settings/providers/provider-connection-card.component.spec.ts`

Task-local deliverables (needed for reproducible visual inspection):
- `.ptah/specs/TASK_2026_2266_a6fd/L11-layout-1824.html`
- `.ptah/specs/TASK_2026_2266_a6fd/L11-layout-1168.html`
- `.ptah/specs/TASK_2026_2266_a6fd/L11-layout-784.html`
- `.ptah/specs/TASK_2026_2266_a6fd/L11-layout-review.html`
- `.ptah/specs/TASK_2026_2266_a6fd/L11-polish-report.md`

Existing untracked task material was left untouched. No protected shared UI primitives or baseline files changed.

## Checks

- Jest: **4 suites passed, 104 tests passed**. Used `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath` with lanes-table.component.spec.ts, lanes-table.visual.component.spec.ts, lanes-table-detail.component.spec.ts and provider-connection-card.component.spec.ts.
- TypeScript: `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json` exited **0**, no diagnostics.
- ESLint: final scoped run on changed TypeScript and HTML exited **0**, no output. An earlier run also included CSS: those two files were ignored because ESLint has no matching CSS configuration. Two newly introduced spec warnings were corrected before the final run.
- Prettier: `npx prettier --write` completed for all eight changed source/spec files.
- UI class audit: scanned **1447 files**; raw spacing total **618 blocked tokens across 39 files; 0 token counts over baseline**. Audit exited **0**; baseline was not updated.
- No verify, Nx, build, serve or e2e commands ran.

## Assertions updated

- Moved the old unset-effort expectation from the row to expanded detail because the brief explicitly moves that editor. Added assertions that it is absent in rows and actually opens the effort popover for system and instance lanes in both wide and collapsed tables. Existing saved-effort editor tests remain intact.
- Replaced the reserved-empty-subtitle assertion with absence of an empty subtitle, as required for vertical centering.
- Changed the detail-default assertion to require Model / Effort at every tier, retaining Permission and Network expectations for collapsed detail.
- Added compact subtitle absence/full name/detail version checks and a connection separator test covering unknown usage and zero usage.

## Visual evidence and limits

Loaded the local UI/UX designer and Angular frontend pattern SKILL.md files through filesystem discovery; this Codex session exposes no dedicated skill-loading command. Applied the existing component/token system and the brief's already-defined design scope.

Used Ptah AST inspection and dependency lookup. The dependency index had no entry for this worktree file, so native `rg` located its consumers. Scoped Ptah diagnostics timed out after 45 seconds; the successful focused TypeScript command above supplies compiler evidence instead.

Captured actual Angular unit-fixture DOM for wide and compact modes using temporary capture instrumentation, removed that instrumentation, and combined the DOM with existing fixture theme styles and current component styles. Opened the in-worktree file URLs with `ptah_browser_navigate` and inspected `ptah_browser_screenshot` results. The review HTML sets iframe viewports to 1824, 1168 and 784, independently of the browser tool's fixed outer viewport.

Compared against the iter9 instance-detail reference: checked complete model/effort values, full compact names without version subtitles, centered identities with no subtitle, matching menu positions, separated Order/Lane headers, two-row medium detail, and five capability chips on one wide row. Fixtures use representative Antigravity, Claude and Synthetic Lane rows, not the full application dataset.

**Not performed:** live Electron screenshots or a full application visual gate. Starting the app/build/serve/e2e is outside this lane's permitted commands. Fixture theme/icon styling is approximate; live dark/light Electron review and catalog/capability popover visual confirmation remain for the parent session. Existing popover hooks and accessibility labels were preserved; unit tests cover editor operation.

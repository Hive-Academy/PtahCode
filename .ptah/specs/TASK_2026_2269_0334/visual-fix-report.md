# Skills page visual fixes

Status: implementation and permitted checks completed. Fresh Electron visual verification awaits the coordinator's rebuild and capture. Paths below are relative to the worktree; `proposal/` abbreviates `libs/frontend/onboarding/src/lib/proposal/`.

## V1 — Desktop rail
Cause: both pre-fix queries required a 1100px container (`proposal/stack-skill-review.component.css:30`, `proposal/skill-selection-rail.component.css:31`). The shell caps its column at 1120px including 40px horizontal padding (`libs/frontend/onboarding/src/lib/shell/onboarding-shell.component.ts:39`). The retained capture measurement `.ptah/tmp/skills-shots/layout-dark-1280.json:2` records an actual 1080px container and a hidden rail title.

Changed both thresholds to 960px (`proposal/stack-skill-review.component.css:32`, `proposal/skill-selection-rail.component.css:61`), including the action-wrapper variant (`proposal/skill-selection-rail.component.html:72`). Desktop uses a 256px rail, 24px column gap, 16px padding and two card columns. The 1440px container rule retains a 320px rail and three card columns, with 24px padding. The shell was not changed.

Checks: final Jest 4 suites / 53 tests passed; library typecheck passed. Capture assertions now require the selection title visible and the rail bounding box to the right of the card grid at 1280px (`.ptah/tmp/skills-shots/skills.shot.ts:95`). Those geometry assertions await rebuilt Electron.

## V2 — Compact pinned bar
Causes: the selection frame used translucent `--glass-fill-raised` (pre-fix `proposal/skill-selection-rail.component.html:3`), retained rail spacing/progress in bar mode, and inherited rail-oriented action layout. The height measurement used the whole scroll container without accounting for the rail's starting offset.

Changes:

- Opaque existing `--surface-1` background (`proposal/skill-selection-rail.component.css:5`). Its definition mixes opaque theme base colors (`apps/ptah-extension-webview/src/styles.css:169`); no new colors.
- Two-column first row with counts left and Skip + primary right; two full-width helper notes below; hidden progress/title/list; 12px vertical padding. Footer uses `display: contents` only in bar mode (`proposal/skill-selection-rail.component.css:18-59`). The desktop query restores the rail.
- The host owns sticky positioning; nested `ptah-form-actions` no longer adds an independent sticky surface (`proposal/skill-selection-rail.component.html:65`). One primary and one event-handler set remain.
- Rail max-height uses the actual host top and the lesser of scroller/viewport bottom, with resize and passive scroll updates and cleanup (`proposal/skill-selection-rail.component.ts:53-81`). Only the selected list scrolls inside the rail.
- Reserved 140px below cards in bar mode, zero for the desktop rail (`proposal/stack-skill-review.component.css:24`). Narrow section gaps use 16px; search heading/form gap uses 8px (`proposal/stack-skill-review.component.html:104`).

Expected bar height with two normal notes: approximately 106px = 40px actions + 4px gap + 36px notes + 24px vertical padding + 2px border. With one note, approximately 86px. The old 900px search bottom is around y=600; the tighter section/search gaps save about 20px. A 106px bar ending around y=692 starts around y=586. These are estimates, not new rendered measurements.

Checks: capture helper resets/verifies shell scrollTop=0, requires bar height <=140px, bar top >= search field bottom, and hidden progress at 900px. It checks selected and zero-selection cases. Every primary screenshot now has a hard, retried assertion that its whole button rectangle fits inside the viewport (`skills.shot.ts:95-134`). The rail spec preserves footer/list separation, verifies one primary, and expects no nested sticky owner. Jest: 53 passed. Actual geometry remains unverified until recapture.

## V3 — Stack coverage
Decision: fixture defect, not product matching defect. RPC returns `WizardRecommendAnalysisSkillsResult` (`libs/shared/src/lib/types/rpc.types.ts:1572`; result fields at `libs/shared/src/lib/types/rpc/rpc-setup.types.ts:233`). The backend emits `evidence: item.name` and appends `, ${item.name}` for shared recommendations (`libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.ts:147`, `:172`). Approved decision D4 specifies matching comma-separated detected names.

The fixture supplied sentences. `splitStackEvidence` deliberately requires complete names; its existing spec rejects `Angular tooling` (`proposal/stack-coverage.spec.ts:38`). Changed fixture evidence to `Angular` and `TypeScript` (`skills.shot.ts:18-19`). Product parser and its specs remain intact.

Check: `openAnalysis` requires both chips to announce coverage by one selected skill, and the header to read `2 of 3 stack items covered` (`skills.shot.ts:89-92`). Capture script typecheck passed. Existing empty-case assertions still require all three detected and all three unmatched items. After-each safety assertions still prohibit calls to `wizard:install-skills-with-consent` and `wizard:deep-analyze`. Browser assertions await recapture.

## V4 — Design parity
Causes: the coverage header lacked its covered/total summary; the recommendation heading lacked a count badge; warning/failure/reset alerts were siblings outside the coverage panel (pre-fix `proposal/stack-skill-review.component.html:51-97`).

Added the computed covered count and right-aligned `X of Y stack items covered`, hidden during loading (`proposal/stack-coverage-strip.component.ts:28`, `.html:5-12`). Its counting matches the selection panel, including retained selections when a later search failed. Added the existing `PtahBadgeDirective` recommendation count (`proposal/stack-skill-review.component.html:197-202`). It reflects all recommendations while filtering narrows visible cards.

Projected existing warning, search-failure and dismissible reset messages inside the coverage panel. One reusable template preserves these messages when no stack panel exists (`proposal/stack-skill-review.component.html:43-101`, `proposal/stack-coverage-strip.component.html:102`).

Checks: strip specs cover count/loading. Review spec verifies selection-driven counts, badge, message placement, reset dismissal and no-panel fallback (`proposal/team-builder-skill-review.component.spec.ts:147`). Search-results ordering now compares stable heading IDs because the heading includes its badge. No tests removed. Final Jest: 53 passed.

Left intentionally: app chrome, workspace header, shell padding, wallpaper and theme presentation; shell is read-only. Fixture has two skills/three stack items instead of prototype sample nine/eight. Existing card styling, installed/source metadata, filtering, unmatched actions, guidance/owner decisions, N1 focus handling, selection reset semantics and consent remain intact. No new design concept or RPC contract.

## Checks
One heavy check at a time, from the requested worktree:

1. `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/onboarding/src/lib/proposal/skill-selection-rail.component.spec.ts libs/frontend/onboarding/src/lib/proposal/stack-coverage-strip.component.spec.ts libs/frontend/onboarding/src/lib/proposal/team-builder-skill-review.component.spec.ts libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.spec.ts > .ptah/tmp/visual-fix-jest.log 2>&1` — **PASS: 4 suites, 53 tests, 0 failures**, 15.22s. Initial run: 52 passed / 1 failed due to the heading text including its new badge; corrected and rerun. Final log: `.ptah/tmp/visual-fix-jest.log`.
2. `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json` — **PASS**, exit 0, no diagnostics.
3. `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.spec.json` — **FAIL**, exit 1, **12 diagnostics outside changed files**. `ready/onboarding-ready-host.guard.spec.ts:14` supplies two arguments instead of three (TS2554); `shell/onboarding-workspace.store.spec.ts:87` calls a value typed never (TS2349). Ten TS2737 BigInt/ES2016-target diagnostics: `libs/shared/src/lib/types/capability-id-codec.ts:289-290` (2), `libs/shared/src/lib/types/messages/attention-identity.ts:20,22,24` (5), `libs/worker-protocol/src/lib/pairing-code.ts:55,57,61` (3). All left untouched.
4. `npx eslint libs/frontend/onboarding/src/lib/proposal/stack-skill-review.component.ts libs/frontend/onboarding/src/lib/proposal/stack-skill-review.component.html libs/frontend/onboarding/src/lib/proposal/stack-skill-review.component.css libs/frontend/onboarding/src/lib/proposal/skill-selection-rail.component.ts libs/frontend/onboarding/src/lib/proposal/skill-selection-rail.component.html libs/frontend/onboarding/src/lib/proposal/skill-selection-rail.component.css libs/frontend/onboarding/src/lib/proposal/skill-selection-rail.component.spec.ts libs/frontend/onboarding/src/lib/proposal/stack-coverage-strip.component.ts libs/frontend/onboarding/src/lib/proposal/stack-coverage-strip.component.html libs/frontend/onboarding/src/lib/proposal/stack-coverage-strip.component.spec.ts libs/frontend/onboarding/src/lib/proposal/team-builder-skill-review.component.spec.ts .ptah/tmp/skills-shots/skills.shot.ts` — **PASS**, exit 0, **0 errors / 2 warnings**. Both CSS files have no matching ESLint configuration; TS/templates/script reported no issues.
5. `npx tsc --noEmit --project .ptah/tmp/skills-shots/tsconfig.json` — **PASS**, exit 0, no diagnostics.

## Decisions
1. **960px container threshold:** separates both supplied effective widths (about 1008px / 721px) and the retained actual 1080px container measurement. The old 1040px layout cap minus 32px padding explains the coordinator's 1008px inner-content measurement.
2. **Expected 1280x720 geometry:** analysis container about 1080px, consistent with its retained measurement/shell ceiling; even the coordinator's roughly 1008px effective width exceeds 960px. At 1080px the new grid has 1048px after padding: 768px main + 24px gap + 256px rail, with two approximately 376px cards. At 1008px: 696px main, two approximately 340px cards.
3. **Expected 900x700 geometry:** the 721px inner-content measurement implies about 753px outer container after 32px padding. Either interpretation is below 960px; bar layout and two card columns remain, approximately 336.5-352.5px per card. Expected bar height approximately 106px, below the 140px capture limit. These are predictions for coordinator verification.
4. **Team builder remains a bar at 1280px:** its existing outer card is capped at 760px and padded (`proposal/team-builder-start.page.html:2`). Preserved D3 container behavior. Desktop rail assertions apply to analysis; every primary capture still checks viewport bounds.
5. **D10 sizing:** use actual remaining vertical space, selected-list overflow, one sticky bar owner, and opaque existing theme tokens. No shell edits.
6. **V3 is a fixture correction:** retained exact name matching and shared contract.
7. **Visual evidence:** inspected supplied dark 1280/900 Electron JPGs and approved prototype PNGs against design-spec. No fresh rendering was authorized. New assertions are the next Electron gate, not a completed visual pass.
8. **Skills/tools:** read local `plugins/ptah-core/skills/ui-ux-designer/SKILL.md` and `plugins/ptah-angular/skills/angular-frontend-patterns/SKILL.md`. CLI skill invocation is unavailable, so instructions were read directly. Ptah AST inspection worked; dependents lookup reported graph building, so native `rg`/PowerShell reads supplied remaining source evidence.

## Not done
Coordinator must rebuild the renderer and run the Electron capture. No Playwright capture, build, template-verify command, install or git write was run. Gate images were inspected but not overwritten. Spec typecheck remains blocked by the 12 unrelated diagnostics above. Fresh rendered console behavior and viewport geometry have not been observed. No changes outside the allowed write set were made or reverted.

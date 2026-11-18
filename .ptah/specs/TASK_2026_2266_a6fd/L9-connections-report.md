# L9 Connections

Implemented 6a and 6b within the four assigned component/spec files:

- `libs/frontend/chat/src/lib/settings/providers/providers-settings.component.ts`: the catalog count is now a native button containing the shared badge, opening `NativePopoverComponent` with provider names in a list. Preserves `catalog-hint` on the trigger and `catalog-hint-text` on the list, adds `aria-expanded`, `aria-haspopup`, and an associated dialog ID. Shared popover handles Escape and focus restoration. Loading/error hints remain visible. Existing configured-count ID and catalog modal opener remain.
- `libs/frontend/chat/src/lib/settings/providers/providers-settings.component.spec.ts`: updates count/list assertions, verifies expanded state, Escape closure, shared grid and provider names.
- `libs/frontend/chat/src/lib/settings/providers/provider-connection-card.component.ts`: keeps each component within its existing wide `ptahCardGrid` column (`min-w-0`), allows narrow card controls to wrap, replaces single-line usage truncation with two-line wrapping. After-render measurements and ResizeObserver update the full usage title only on actual overflow, including on the full-card details trigger.
- `libs/frontend/chat/src/lib/settings/providers/provider-connection-card.component.spec.ts`: verifies two-line wrapping and overflow-dependent titles, including titles clearing once content fits.

The list already used `ptahCardGrid variant="wide"`; retained and verified it. All existing IDs, test IDs and aria labels remain. No UI library, ptah-ai, consumer assignments, e2e or baseline files were edited. Templates remain inline; changes are localized and remaining diff expansion is required Prettier formatting.

## Checks

- Requested focused Jest command: PASS, 2 suites, 146 tests (`L9-jest.txt`).
- Requested chat TypeScript command: PASS, exit 0 (including final run) (`L9-tsc.txt`).
- Requested ESLint on all four changed files: PASS, exit 0, zero errors; existing `max-lines` warning on ProvidersSettingsComponent (including final run) (`L9-eslint.txt`).
- Requested Prettier write on all four changed files: PASS.
- UI class audit: PASS, exit 0; both blocked classes (898 total) and raw spacing (627 total) had zero counts above baseline (`L9-ui-audit.txt`). No baseline updates. Final audit also PASS.
- `git diff --check` on assigned files: PASS.

## Browser evidence

Navigated to the in-workspace file URL for `L9-layout-evidence.html` with Ptah browser and inspected screenshots. The fixture uses captured Angular component DOM (`L9-card-dom.html`, `L9-providers-dom.html`), generated Tailwind utilities and actual shared tokens/card/button/badge CSS. Final small wrapper/host changes are reflected in the fixture. The static shell supplies theme colors and makes the captured popover visible; this is layout evidence, not a running Electron renderer. Compared against the requested badge/list behavior and two-line usage layout; no separate design image was supplied for this lane.

Measured content widths 552/1000/352px: grid columns respectively 504px / 470px+470px / 304px; no grid horizontal overflow. At normal widths the complete usage text occupies two lines (32px) with scrollHeight equal to clientHeight. At 352px, controls wrap below the text, allowing the usage to fit fully in two lines. Jest verifies the genuinely overflowing case and title removal afterward. Screenshot inspection confirms full consumer names rather than a single-line ellipsis.

Live Electron recapture remains for integration; no build/serve/e2e/Nx/verify command was run. No commit or push.

## E2E follow-up for coordinator

`apps/ptah-electron-e2e/src/docs-videos/_harness/video-fixtures.ts:85` uses `catalog-hint-text` in `waitForSettledSettings()` and waits for the old loading text to disappear. This is a harness rather than a `.spec.ts`; no e2e spec directly matched the old hint selectors/text. The list now exists only while its popover is open, so the harness should wait on ready `catalog-hint` badge or explicitly open the popover. This file is outside lane ownership and was not edited. Parent progress report attempted once and rejected with `parent-inbox-full`; not retried.

## Tooling

Read repository UI/UX Designer and Angular Frontend Patterns SKILL.md instructions directly; this CLI exposes no skill loading mechanism. Ptah dependents had no usable result; used targeted native source/rg inspection. Scoped Ptah diagnostics exceeded its 45-second TypeScript window; used the requested tsc and ESLint checks. Ptah browser navigation, screenshot and evaluation worked.

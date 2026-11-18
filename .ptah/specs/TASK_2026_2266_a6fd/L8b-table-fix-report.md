# L8b table fix report

## Cause and changes

At the 784px Electron viewport the table pane is 358px wide. The prior collapsed Status allocation was 13rem (208px); Order, Enabled and the expander consumed another 124px, leaving only 26px for Lane. That forced the name to zero width and let the Lane header touch Status.

Changed only these owned source files under `libs/frontend/chat/src/lib/settings/ptah-ai/`:

- `lanes-table.component.css`: Status is 8rem (128px) in collapsed mode, leaving 106px for Lane. Compact recovery controls and menu keep status/actions beside one another. Added spacing between status and actions. Wide column rules remain as received.
- `lanes-table.component.html`: passes collapsed mode into Status; collapsed Install guide text becomes Install with the full accessible name retained; projected Edit/reset actions use `ptahButton variant="outline" size="sm"`. Delete retains ghost/danger styling and its position.
- `lanes-table-status.component.ts`: collapsed recovery statuses use Missing and Key, with full original labels on title; other status labels are unchanged.
- `lane-row-identity.component.ts`: removes obsolete uninstalled-only collapsed layout overrides so the CLI agent badge remains on the reserved secondary line after Install guide moved into Status.
- `lanes-table.visual.component.spec.ts`: Chromium-backed layout assertion over real Angular DOM/source styles verifies name width >24px, non-overlapping header text, 49px rows, inline status/actions inside their cell, and scrollWidth == clientWidth at 358px. Also checks projected Edit outline/sm and Delete danger tone.

Existing IDs, data-testids and aria-labels are preserved. No UI-library files, detail component files, e2e files, or RPC values changed by this lane.

## Checks

- Required four Jest suites: PASS, 4 suites / 68 tests (`L8b-jest.log`).
- `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json`: PASS, exit 0 (`L8b-tsc.log`, empty on success).
- `npx eslint` on all five changed files: PASS, exit 0; CSS has one ignored-file warning, no errors (`L8b-eslint.log`).
- Prettier write: PASS for all five changed source files (`L8b-prettier-final.log`, `L8b-prettier-identity.log`).
- `npx ts-node --transpile-only tools/ui-class-audit/check-ui-classes.ts`: PASS, exit 0; both blocked/raw-spacing categories show 0 token counts over baseline (`L8b-ui-class-audit.log`). No baseline update.
- Targeted `git diff --check`: PASS.

## Rendered evidence

Inspected the supplied iter7 784px regression screenshot and previous gate/1419 784px screenshot. Verified restored icon/name/secondary badge layout against the previous compact table, separate header labels, and inline status recovery/menu placement. Angular DOM fixture: `L8b-layout-evidence.html`; collapsed measurements: `L8b-layout-evidence.html.json`; screenshot: `screens/L8b-collapsed.png`.

At 784px viewport / 358px pane, Lane is 106px, all names have visible width, rows are 49px, and scrollWidth/clientWidth are both 358px. Fixture wide measurements at 1168/1824 viewports (742/1398px pane assumption): all rows 49px; scrollWidth equals clientWidth (`L8b-wide-measurements.json`, `screens/L8b-wide-1168.png`, `screens/L8b-wide-1824.png`). Wide fixture DOM is reused from L8 evidence. Fixture styles include component CSS, tokens/button/status CSS and a utility subset; these are layout checks, not fresh Electron acceptance shots or full theme fidelity.

Ptah browser navigation to the in-workspace file URL succeeded. Its screenshot call stalled and was terminated; native Playwright screenshot capture and local image inspection supplied the visual fallback. No build, serve, e2e, Nx, npm verify, commit or push was run.

## Outstanding requirement / other owner

All capabilities, Info, CLI settings, credentials and Edit tiers are defined in `lanes-table-detail.component.html`, explicitly outside this lane's ownership. They still use ghost/sm and require their owner to change them to outline/sm. This lane completes projected Edit/reset only. Two parent reports requesting that follow-up were rejected with `parent-inbox-full`; no message was delivered. Live Electron shots at 784/1168/1824 still need parent recapture.

## Tooling

CLI-native skill loading was unavailable. Discovered and read repository Angular Frontend Patterns and UI/UX Designer skills via filesystem fallback. Ptah AST/dependent tooling was consulted. Ptah diagnostics timed out after 45 seconds; the requested native TypeScript command is the verification fallback. No external facts were needed.

# Prototype: Setup model option and skills judge review (TASK_2026_2325_899d)

Static, single-file interactive prototype. Fixture data is invented for layout; skill names are not real registry entries. The prototype chrome (theme, width, state and fixture chips at the top) is not part of the product.

## How to open

Open `index.html` in any browser. Add `?shot=1` to hide nothing but fix the layout for captures (used for all screenshots; see capture notes below).

URL parameters and the exact values the script accepts (unknown `surface`/`state` values fall back to the default, `skills` / `judged`; an unknown `seed` is ignored):

| Parameter | Accepted values |
| --- | --- |
| `surface` | `settings`, `analyze`, `skills` |
| `state` for `settings` | `view`, `deeplink` |
| `state` for `analyze` | `idle`, `failure`, `analysisfail`, `wsfail` |
| `state` for `skills` | `loading`, `judged`, `partial`, `nojudge`, `regfail`, `both`, `empty`, `loaderror` |
| `theme` | `dark`, `light` |
| `w` | `narrow` (420), `mid` (720), `wide` (1100), `xwide` (1440), `full` (default, fits the window) |
| `seed` | `unset`, `set`, `stale` (stale model), `provonly`, `modelonly`, `signedout`, `noprov` (provider missing from list) |
| `gen` | `ok`, `fail`, `empty`, `nomodel` |
| `create` | `ok`, `fail` |
| `inst` | `ok`, `previewerr`, `partial`, `navfail` |
| `sout` | `results`, `none`, `error` |
| `railMode` | `rail`, `bar` |
| `shot` | `1` (capture layout) |

Working capture URL: `index.html?shot=1&surface=skills&state=judged&theme=light&seed=stale` (a stored invalid pair; pressing Re-run shows the blocked-run error).

The page also exposes `window.PT` (`S`, `render`, `openDraft`, `model`, `seedPair`, `startInstall`, `PROV`) used by the capture helper.

## What was rendered and checked

Rendered in a headless browser (Playwright Chromium, full-page PNG), NOT in Electron. Electron rendering was not done.

Re-capture everything with `node prototype/capture.mjs` (needs Playwright and its Chromium; it opens `file://` URLs with `?shot=1` and prints each PNG height). Viewport is 1100x1000 for normal shots, 420 wide for `*-narrow-*`, 1440x1000 for `skills-judged-wide-dark.png`. All 24 files were re-captured in revision 3 (none stale). Approximations: `skills-rerun-reset-light.png` (reset notice trigger) and `settings-stale-picker-light.png` (open picker) use the nearest URL state; `skills-rerun-blocked-stale-light.png` shows the blocked-run page that loads directly with the stale seed (no Re-run button to press); `skills-build-editor-dark.png` shows the Edit mode of the draft.

Measured full-page heights (judged state): 1100 wide = 1848 px (was 3270 at 900 wide, with the 190 px prototype chrome included, so about 1650 px of product UI); 1440 wide = 1820 px. The 1600 px target was NOT met at 1100 when the chrome is counted; it is met only for the product area (about 1650, close). Only the three judged shots plus `skills-build-preview-dark.png` were inspected visually; nothing covers content there.

- analyze-default-dark.png
- analyze-stale-light.png
- settings-signin-deeplink-dark.png
- settings-stale-picker-light.png
- settings-unset-dark.png
- skills-both-failed-narrow-dark.png
- skills-build-editor-dark.png
- skills-build-preview-dark.png
- skills-empty-light.png
- skills-install-consent-dark.png
- skills-judged-dark.png
- skills-judged-light.png
- skills-judged-narrow-light.png
- skills-judged-rxjs-filter-light.png
- skills-judged-wide-dark.png
- skills-loading-dark.png
- skills-nojudge-confirm-replace-light.png
- skills-nojudge-draft-nomodel-light.png
- skills-nojudge-item-search-light.png
- skills-nojudge-light.png
- skills-partial-dark.png
- skills-regfail-dark.png
- skills-rerun-blocked-stale-light.png
- skills-rerun-reset-light.png

## Visible controls versus workflows exercised

| Visible controls (present in the render) | Workflows exercised (clicked or driven in the browser) |
| --- | --- |
| Setup model row, picker, sign-in step, Undo | Setup commit and Undo; sign-in step |
| Re-run skill search and re-run notice | Draft from "Not judged" with Create disabled for the name `!!!` |
| Install consent, partial install, guidance nav failure | Per-item search with results and a selection kept in the rail |
| Search none and search error outcomes | RxJS chip filter showing the shared Install card |
| Generation fails / empty, create fails | Rendering of each state shown in the screenshot list above |
| Narrow-width layout | |

Visible but NOT exercised this round: re-run notice flow end to end; install consent, partial and nav-failure progression; search none and error; generation fails and empty; create fails; narrow-width interactions; keyboard traversal; forced-colors; Electron rendering.

## Rule provenance and proposal ledger

Requirements (navigation, invalid-pair behavior, one approval per skill with scripts) are not proposals; only their specific controls and copy are.

| Rule | Tag | Source |
| --- | --- | --- |
| Setup model option in Settings and Analyze; skills judge review with Install / Build / No skill needed | `user-requested` | task request (`context.md`) |
| Existing components (badges, chips, cards) reused; consent is a reduced depiction of the existing dialog | `project-rule` | `docs/design-system/`, theme config, `stack-skill-consent.component.ts` |
| Electron first; renderer in `apps/ptah-extension-webview` | `project-rule` | repository `CLAUDE.md` |
| Invalid Setup pair blocks a request, previous result kept, recovery action by cause (R13) | requirement | `decisions.md` R13 |
| Navigation to Settings and back | requirement | task request |
| Setup row placement in Settings | `lane-proposed` | this prototype |
| Atomic save of provider and model, Undo | `lane-proposed` | this prototype |
| Sign-in step inside the model picker | `lane-proposed` | this prototype |
| Verdict layout and count rules (sections, filters, counts) | `lane-proposed` | this prototype |
| Custom widths (420 / 720 / 1100 / 1440 / fit window) | `lane-proposed` | this prototype |
| R22 full-width dense layout (intent: user-requested, D11; compact cards, expand per card, one-line banner, two-line chip strip, 3-column Build grid, exact numbers and labels: lane-proposed) | `user-requested` / `lane-proposed` | `decisions.md` D11, R22 |
| R23 "Preview draft" action, read preview with Edit toggle, no-write note (intent: user-requested, D11; labels and fixture SKILL.md: lane-proposed) | `user-requested` / `lane-proposed` | `decisions.md` D11, R23 |
| Confirm before replacing an edited draft | `lane-proposed` | this prototype |
| Run-pill layout (one badge per stage when pairs differ) | `lane-proposed` | this prototype |
| Rail Install disabled with a reason while a draft is open | `lane-proposed` | this prototype |
| Rail-or-bar variant of the selection footer | `lane-proposed` | this prototype |
| Stack items section and outage per-item search | `lane-proposed` | this prototype |
| Retained-selection wording, placeholder copy, status glyph shapes | `lane-proposed` | this prototype |
| WCAG 2.2 AA working criterion (contrast not audited) | `lane-proposed` | this prototype |

## Lane-introduced constraints

Setup placement; atomic save and Undo; sign-in step in the picker; verdict layout and count rules; custom widths; confirm-before-replacement; run-pill layout; rail Install disabled during a draft; rail-or-bar variant; stack items section and outage search; retained-selection wording; placeholder copy; status glyph shapes; WCAG 2.2 AA as working criterion. These need Gate 1.7 acceptance before implementation.

## Deviations from handoff notes

- Stored-pair seeds live in the prototype chrome, not the product.
- The draft token check and focus restore (oid) are prototype-only behaviour.
- An install covering several items uses `angular-signals-guide` as the example.
- No outline badge tone is claimed as project API.
- An additional screenshot, `skills-nojudge-light.png`, exists that the notes did not list; it is kept and listed.
- The earlier note planned an optional `skills-nojudge-dark.png`; it was not captured.
- The `&&!empty` patch in `renderSkills` was applied by the coordinator before these captures.

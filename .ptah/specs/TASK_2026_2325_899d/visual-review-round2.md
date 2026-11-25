# Electron visual re-check for D45

## Setup

- Rebuilt the Electron dev bundle at assigned HEAD `aa7fe624f`. The verify lock held `ptah-electron:build-dev` from 16:59:52 to 17:00:27 UTC and `ptah-electron:copy-renderer-dev` from 17:00:35 to 17:03:19 UTC. Both commands exited 0.
- Ran Playwright `_electron` through the existing `launchPtah` and `UiDriver` helpers, with a fresh isolated home, profile, database and sample workspace per theme. The native client area was 1100 × 982. Playwright set the Electron renderer to 1100 × 1000 CSS px at device pixel ratio 1. Both capture runs exited 0. [Runner](../../tmp/visual/runner/round2.ts) · [Electron log](../../tmp/visual/round2-d45-electron.log)
- The invalid fixture used a stale Setup model. The valid fixture supplied an explicit Anthropic model pair, and the interrupted fixture supplied a paused run through `wizard:get-resumable-run`. Judged Skills used the saved-analysis fixture with eight Install cards, three Build proposals and one simulated registry timeout.

## Verdict

**APPROVED** for D45 and the requested Skills regression spot-check.

The pre-fix crop showed a gold Start button in both states. The fresh captures reserve gold for actions with valid Setup. The blocked buttons use the muted Glass treatment and retain the visible recovery hint. This follows the action hierarchy in the approved PNGs. The stale prototype uses muted ochre, while the Electron themes use neutral disabled fills. [Pre-fix crop](../../tmp/visual/analyze-actions.jpg) · [Approved default dark](prototype/screenshots/analyze-default-dark.png) · [Approved stale light](prototype/screenshots/analyze-stale-light.png) · [Fresh action crops](../../tmp/visual/round2-action-comparison.png)

## Checks

All rows use a 1100 × 1000 Electron renderer. An empty string in the disabled column is the present native boolean attribute. A dash in the contrast column indicates a valid, enabled action.

| Action | Theme | Setup | Computed background color | Computed background image | Computed label color | `disabled` attribute | Blocked label contrast | Result |
| --- | --- | --- | --- | --- | --- | --- | ---: | --- |
| Start analysis | `ptah-glass` | Stale / invalid | `oklch(0.213025 0.008461 264.379 / 0.5)` | `none` | `oklch(0.960871 0.001327 106.424 / 0.4)` | Present (`""`) | 3.536:1 | Pass |
| Start analysis | `ptah-glass` | Valid | `rgba(0, 0, 0, 0)` | `linear-gradient(rgb(246, 214, 117), rgb(217, 169, 40))` | `rgb(27, 20, 3)` | Absent | — | Pass |
| Start analysis | `ptah-glass-light` | Stale / invalid | `oklch(0.970089 0.013878 304.14 / 0.5)` | `none` | `oklch(0.235744 0.054482 289.464 / 0.4)` | Present (`""`) | 2.432:1 | Pass |
| Start analysis | `ptah-glass-light` | Valid | `rgba(0, 0, 0, 0)` | `linear-gradient(rgb(246, 214, 117), rgb(223, 172, 51))` | `rgb(36, 26, 2)` | Absent | — | Pass |
| Continue previous run | `ptah-glass` | Stale / invalid | `oklch(0.213025 0.008461 264.379 / 0.5)` | `none` | `oklch(0.960871 0.001327 106.424 / 0.4)` | Present (`""`) | 3.536:1 | Pass |
| Continue previous run | `ptah-glass` | Valid | `rgba(0, 0, 0, 0)` | `linear-gradient(rgb(246, 214, 117), rgb(217, 169, 40))` | `rgb(27, 20, 3)` | Absent | — | Pass |
| Continue previous run | `ptah-glass-light` | Stale / invalid | `oklch(0.970089 0.013878 304.14 / 0.5)` | `none` | `oklch(0.235744 0.054482 289.464 / 0.4)` | Present (`""`) | 2.423:1 | Pass |
| Continue previous run | `ptah-glass-light` | Valid | `rgba(0, 0, 0, 0)` | `linear-gradient(rgb(246, 214, 117), rgb(223, 172, 51))` | `rgb(36, 26, 2)` | Absent | — | Pass |

The native `disabled` property agreed with the attribute in every row. Only the four valid states had `btn-primary`. The blocked contrast values are the strongest rendered sRGB glyph samples against their background at the same coordinates, captured again with the label fill transparent. This accounts for Glass compositing and approximates a fully covered stroke. At the 95th percentile of changed label pixels, Start measured 3.499:1 dark and 2.407:1 light. Continue measured 3.504:1 dark and 2.402:1 light. [Contrast calculation](../../tmp/visual/runner/round2-contrast.py)

| Skills check | Theme | Result | Measurement |
| --- | --- | --- | --- |
| Install grid | Dark | Pass | Four 232.5 px columns with eight Install cards. Four card headers are visible in the first row. |
| Collapsed details | Dark | Pass | Method details and all eight Install details measured 0 px. Each was `hidden` with computed `display: none` and `aria-expanded="false"` on its toggle. |

The Skills measurements match the [round 1 fix report](batch-fix-visual-1-report.md).

## Defects

None.

## Screenshots

| View | Dark | Light |
| --- | --- | --- |
| Start · stale / invalid Setup | [PNG](../../tmp/visual/shots/round2/analyze-blocked-dark-1100.png) | [PNG](../../tmp/visual/shots/round2/analyze-blocked-light-1100.png) |
| Start · valid Setup | [PNG](../../tmp/visual/shots/round2/analyze-valid-dark-1100.png) | [PNG](../../tmp/visual/shots/round2/analyze-valid-light-1100.png) |
| Continue · stale / invalid Setup | [PNG](../../tmp/visual/shots/round2/continue-blocked-dark-1100.png) | [PNG](../../tmp/visual/shots/round2/continue-blocked-light-1100.png) |
| Continue · valid Setup | [PNG](../../tmp/visual/shots/round2/continue-valid-dark-1100.png) | [PNG](../../tmp/visual/shots/round2/continue-valid-light-1100.png) |
| Judged Skills | [PNG](../../tmp/visual/shots/round2/skills-judged-dark-1100.png) | Outside scope |

## Not checked

Other hosts, viewport sizes, light Skills, live model calls, actual start or resume execution, other invalid Setup causes, and a full accessibility audit. The console logged errors in the fixture-backed update dialog, delivery store and saved-analysis discovery card. Those surfaces were outside this re-check. Skill loading was unavailable in this lane. The review used the supplied fixtures and PNG references.

The scratch runner bundled and executed successfully in both themes. `ptah_get_diagnostics` hit its 1024 MB limit on the scratch TypeScript runner. The two Python helpers passed its syntax check.

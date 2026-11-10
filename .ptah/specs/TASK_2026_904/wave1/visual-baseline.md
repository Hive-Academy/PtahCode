# Wave 1 Electron visual baseline

Status: stability revision queued for recapture. The first no-update comparison failed on live data outside the requested controls. Existing pre-edit Electron dist; fixed viewport: 1600 x 1000 CSS pixels.

| State | Route | Theme | Glass | Snapshot file | Captured | Compare 1 changed px | Compare 2 changed px |
| --- | --- | --- | --- | --- | --- | --- | --- |
| analyze-ready | `/onboarding/analyze` | dark | on | `visual/snapshots/analyze-ready-dark-glass.png` | Yes | 0 | Pending |
| analyze-ready | `/onboarding/analyze` | dark | off | `visual/snapshots/analyze-ready-dark-solid.png` | Yes | 0 | Pending |
| analyze-ready | `/onboarding/analyze` | light | on | `visual/snapshots/analyze-ready-light-glass.png` | Yes | 0 | Pending |
| analyze-ready | `/onboarding/analyze` | light | off | `visual/snapshots/analyze-ready-light-solid.png` | Yes | 0 | Pending |
| ready-workspace | `/onboarding/ready` | dark | on | `visual/snapshots/ready-workspace-dark-glass.png` | Yes | 0 | Pending |
| ready-workspace | `/onboarding/ready` | light | on | `visual/snapshots/ready-workspace-light-glass.png` | Yes | 0 | Pending |
| chat-rail-expanded | `/chat` | dark | on | `visual/snapshots/chat-rail-expanded-dark-glass.png` | Yes | 0 | Pending |
| chat-rail-expanded | `/chat` | light | on | `visual/snapshots/chat-rail-expanded-light-glass.png` | Yes | 0 | Pending |
| chat-rail-hover | `/chat` | dark | on | `visual/snapshots/chat-rail-hover-dark-glass.png` | Yes | 0 | Pending |
| chat-rail-hover | `/chat` | light | on | `visual/snapshots/chat-rail-hover-light-glass.png` | Yes | 0 | Pending |
| chat-rail-focus | `/chat` | dark | on | `visual/snapshots/chat-rail-focus-dark-glass.png` | Yes | 0 | Pending |
| chat-rail-focus | `/chat` | light | on | `visual/snapshots/chat-rail-focus-light-glass.png` | Yes | 0 | Pending |
| chat-rail-collapsed | `/chat` | dark | on | `visual/snapshots/chat-rail-collapsed-dark-glass.png` | Yes | 0 | Pending |
| chat-rail-collapsed | `/chat` | light | on | `visual/snapshots/chat-rail-collapsed-light-glass.png` | Yes | 0 | Pending |
| machines-add-before | `/machines` | dark | on | `visual/snapshots/machines-add-before-dark-glass.png` | Yes | 0 | Pending |
| machines-add-before | `/machines` | light | on | `visual/snapshots/machines-add-before-light-glass.png` | Yes | 0 | Pending |
| review-settings-before | `/review-runs` | dark | on | `visual/snapshots/review-settings-before-dark-glass.png` | Yes | 0 | Pending |
| review-settings-before | `/review-runs` | light | on | `visual/snapshots/review-settings-before-light-glass.png` | Yes | 0 | Pending |

## Skipped states

| State | Reason |
| --- | --- |
| Analyze disabled controls | Ready branch has an enabled Start analysis action; interrupted branch has enabled Continue previous run and Start fresh actions. No disabled state is exposed. |
| Resume banner visible | Only rendered when resume.items().length > 0; isolated profile has no resumable run. |
| Generation model picker focused/error | Picker is reached after analysis; component has no error branch. |

## Masks

The timestamped session title within the canvas rail is masked. No source control is masked. The ready workspace shot crops to the workspace header; chat shots crop to the canvas rail; review settings crops to the dialog.

## Re-run commands

Run from worktree root sequentially under machine lock:

```powershell
node scripts/verify.mjs --exec --task wave1-visual -- npx playwright test --config=apps/ptah-electron-e2e/visual-parity.config.ts --update-snapshots
node scripts/verify.mjs --exec --task wave1-visual -- npx playwright test --config=apps/ptah-electron-e2e/visual-parity.config.ts
```

## Evidence

Initial recapture passed 3/3 tests in 5.4 minutes after a 45.7-minute lock wait. The first comparison failed: ready workspace light differed by 71,288 pixels due to changing CLI status, chat expanded dark by 1,290 pixels due to timestamped session titles and a model label, and review settings dark by 330 pixels due to its refresh time. A revised 18-state recapture is queued.

## Decisions

- Use the existing pre-edit Electron and renderer dist for all captures and comparisons. No rebuild after component source edits began.
- Use a fixed sample repository path, 1600 x 1000 viewport, loaded fonts, disabled animation and caret, and a parked pointer except for hover. Drive the focused rail icon by keyboard so `:focus-visible` is rendered.
- Use `{arg}{ext}` in the snapshot template and compare with `maxDiffPixels: 0`, `threshold: 0`. Keep source controls unmasked.
- Skip project typecheck/lint here per parent instruction; parent will run combined verification.


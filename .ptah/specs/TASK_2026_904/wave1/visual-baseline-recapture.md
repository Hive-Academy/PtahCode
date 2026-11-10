# Wave 1 visual baseline recapture (resume session)

Status: done. Electron only, viewport 1600 x 1000, `maxDiffPixels: 0`, `threshold: 0`.

Baseline source: pre-edit `dist/apps/{ptah-electron,ptah-extension-webview}` copied from the first
worktree (file counts equal: 1902 / 1844). Snapshots: `visual/snapshots/*.png` (18 files, 4.8 MB,
git-ignored, not committed per D7).

| Run | Dist | Command | Result |
| --- | ---- | ------- | ------ |
| 1 capture | pre-edit | `playwright test --config=apps/ptah-electron-e2e/visual-parity.config.ts --update-snapshots` | 3 of 3 passed, 18 PNG written |
| 2 determinism | pre-edit | same, no update | onboarding 6 states 0 px. Machines 2 states 0 px. Review dark 0 px. Review light 23 px. Chat rail stopped at the dark focus step |
| 3 baseline fix | pre-edit | `-g "consumer surfaces" --update-snapshots=changed`, then the same without update | passed, then 4 consumer states 0 px |

All runs went through `npm run verify -- --exec --task <name> -- <command>` (verify lock).

## Unstable points found (gate, not product)

- **Review settings, light, 23 px.** The parked pointer (1590, 990) was on the drawer scrollbar
  corner. The spec now parks the pointer on the backdrop (300, 990) for this state. Run 3 recaptured
  the two review states and confirmed 0 px.
- **Chat rail focus step.** In 2 of 5 runs the app showed the Settings view while the test did the
  keyboard round trip, so the rail was not on screen. This occurred once on the pre-edit dist and
  once on the post-edit dist, so the task diff is not the cause. The step passed in the other
  runs. The cause in the app is not known. Follow-up: make the harness hold the chat view.

## Skipped states

Unchanged from `visual-baseline.md` (analyze disabled controls, resume banner, model picker focus/error).

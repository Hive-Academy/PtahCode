# Screenshots

Taken in the Electron dev app (`npm run electron:launch -- --remote-debugging-port=9334`),
dev profile, workspace `ws-claude`, viewport 1500x950, themes `ptah-glass` (dark) and
`ptah-glass-light` (light). Driven over CDP with `../cdp-shot.mjs` and the helpers in `../cdp/`.

Card states are real sessions, not DOM edits:
- Running: a Haiku session streaming a long story (`cdp/run-prompt.js`).
- Background: sessions whose turn ended with a background `sleep 600` / Monitor wait.
- Done: finished sessions.

| File | Build | Density | Theme |
| --- | --- | --- | --- |
| before-dense-dark.png | main (dist from main checkout) | dense (default) | dark |
| before-dense-light.png | main | dense | light |
| before-comfortable-dark.png | main | comfortable | dark |
| after-dense-dark.png | this branch (dist built from the worktree) | dense (default) | dark |
| after-dense-light.png | this branch | dense | light |
| after-comfortable-dark.png | this branch | comfortable | dark |
| after-dense-dark-loaded.png | this branch (development renderer) | dense, fully loaded, Running | dark |
| after-dense-dark-loaded-background.png | this branch (development renderer) | dense, fully loaded, Background | dark |

## Fully loaded dense card

The two `loaded` shots prove the worst case of a busy session. `cdp/load-cards.js` sets the
inputs of a real Running or Background card through the Angular dev API (`window.ng`):
a long title, 5 lanes (2 CLI), linked task `TASK_2026_894_0e20`, 3 agents, 9% context,
todos 4/7 and a diff of +3829 −10. The template, CSS, layout and card state are the real ones.
The Running and Background states came from `cdp/run-prompt.js` and `cdp/bg-prompt.js`. The
app shows the Background state only on the active session, so each state has its own shot.

Measured in both states (rail 1500x950):

- card 56px, meta row 22px, one row (meta width 235px equals its scroll width, no overflow)
- chips: `+5` · `4/7` · `TASK…` · `3 ag` · `2 CLI` · `9%` · `+3.8k −10`
- only the task id truncates (it shrinks first); every other chip shows its full text
- the diff stats stay at the row end and stay visible

Dense labels are short: `3 ag` (title and aria-label "3 agents"), `9%` ("9% context used"),
and diffs of 1000 or more lines as `3.8k` (title "Uncommitted changes (+3829 −10)").

Measured card heights (`cdp/state.js`): before dense 96px / comfortable 176px,
after dense 56px / comfortable 128px, for Running, Background and Done cards.
The background session for the after set came from `cdp/bg-prompt.js`.

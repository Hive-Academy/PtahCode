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

Measured card heights (`cdp/state.js`): before dense 96px / comfortable 176px,
after dense 56px / comfortable 128px, for Running, Background and Done cards.
The background session for the after set came from `cdp/bg-prompt.js`.

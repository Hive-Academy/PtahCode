# Context: axe contrast on err-solid-text

Side task of TASK_2026_1168_7335. CI job `electron-e2e (shard 2/4)` fails in
`conflict-and-history-axe.spec.ts:55` with color-contrast on `.err-solid-text`.

## Failure text (run 43615832015)
- dark: fg #e8e6e1 on bg #dc2626 = 3.87:1
- light: fg #4d0218 on bg #fe1c55 = 4.12:1

## Root cause
Commit 39c5e28bc moved the Abort button to `ptahButton variant="danger"`.
`ptah-button.css` rule `.btn[data-ptah-button].btn-error:is(.btn,#ptah-button)` paints
`--ptah-btn-danger-fg` (= `oklch(var(--erc))`) with id-level specificity, so the
`[data-theme] .err-solid-text` ink in `styles.css` never applies.

## Fix
Set `--ptah-btn-danger-fg` and new `--ptah-btn-danger-shade` per anubis theme in `styles.css`.
Hover and active fills move toward the shade (default `oklch(var(--bc))`, as before).

| Theme | rest | hover | active |
|---|---|---|---|
| anubis (before) | 3.87 | 3.30 | 2.91 |
| anubis (after) | 4.83 | 6.10 | 7.38 |
| anubis-light (before) | 4.12 | 3.52 | 3.09 |
| anubis-light (after) | 4.86 | 5.69 | 6.42 |

## Verification
- `status-badge-contrast.spec.ts`: 89 passed.
- `npm run verify -- -p @ptah-extension/ui,ptah-extension-webview`: lint errors only in files not changed here
  (pre-existing); webview test run had 867 passed and 1 failed (my new wiring test, fixed after).
- Reviews: review-codex.md, review-antigravity.md (both approve).
- Electron screenshots and the e2e spec were not run locally (they need a build); CI is the proof.

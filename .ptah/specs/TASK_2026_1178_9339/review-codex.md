# Review verdict: approve

## Finding

1. **P3 — The contrast tests do not verify the button's token wiring.** `apps/ptah-extension-webview/src/app/status-badge-contrast.spec.ts:187-205` reads the two theme values and hard-codes the 90% and 82% mixes. It does not inspect the hover/active declarations in `libs/frontend/ui/src/lib/tokens/ptah-tokens.css:132-140` or the foreground declarations in `libs/frontend/ui/src/lib/button/ptah-button.css:275-291`. Those tests would still pass if the button stopped using `--ptah-btn-danger-fg` or the fills stopped using `--ptah-btn-danger-shade`. Removing either theme declaration **does** fail the new contrast tests because `blockProperty` throws (`status-badge-contrast.spec.ts:103-114`); removing the library's shade declaration fails the token-presence test (`libs/frontend/ui/src/lib/tokens/ptah-tokens.spec.ts:85,182-185`). This is a coverage gap, not a current contrast failure.

## Evidence for verdict

- **Cascade:** `apps/ptah-extension-webview/src/styles.css:16-17` imports the token and button CSS before the theme rules at `:2417-2431`. `[data-theme]` in `ptah-tokens.css:8-9` and `[data-theme='anubis']` / `[data-theme='anubis-light']` each have specificity `(0,1,0)`, so the later theme values win. The `:root` branch also has specificity `(0,1,0)`. Glass rules at `styles.css:3309-3363` do not redeclare either danger token; their `.btn-error` color rule loses to the ID-level button selector at `ptah-button.css:275-291`.
- **Other consumers and themes:** The danger tokens are used by the button's rest, hover, active, and busy spinner rules (`ptah-button.css:275-291,386-387`). Other `.btn-error` users include confirmation and outline buttons, plus glass rules; the new foreground affects `ptahButton` danger buttons in the two anubis themes. Other themes retain the old `oklch(var(--erc))` foreground and `oklch(var(--bc))` hover/active mix target through the default shade token (`ptah-tokens.css:128-142`).
- **Recomputed contrast:** With Node, `culori/require`, the theme error colors in `apps/ptah-extension-webview/tailwind.config.js:216,290`, and the CSS ink/shade values, rest / hover / active are **4.829 / 6.103 / 7.378:1** for anubis and **4.864 / 5.689 / 6.423:1** for anubis-light. All clear 4.5:1.

Ptah workspace analysis did not return, so I used `git diff`, targeted file reads, `rg`, and Node. The available `ui-ux-designer` skill was inspected; its design workflow does not apply to this source review. No rendered UI was checked because this review made no UI artifact and build/serve/e2e were excluded.
